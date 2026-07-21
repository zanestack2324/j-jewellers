const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./_db');

const SITE_URL = 'https://jjeweller.com';
const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];
const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 10;
const MAX_ITEM_NAME_LEN = 200;
const MIN_PRICE_PENCE = 30;
const MAX_PRICE_PENCE = 500000;

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

let shippingData = null;
let shippingDataTime = 0;
async function loadShippingData() {
  if (!shippingData || Date.now() - shippingDataTime > 300000) {
    shippingData = await db.getShipping();
    shippingDataTime = Date.now();
  }
  return shippingData;
}

function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket ? req.socket.remoteAddress : 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT_MAX;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').trim().substring(0, MAX_ITEM_NAME_LEN);
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  if (origin && origin.endsWith('.vercel.app')) return true;
  return false;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigin = isAllowedOrigin(origin) ? (origin ? origin.split('/')[0] + '//' + origin.split('/')[2] : SITE_URL) : SITE_URL;

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = getClientIP(req);
  if (isRateLimited(clientIP)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { items, customer_email, email: emailAlt } = req.body;
    const customerEmail = customer_email || emailAlt || '';

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: 'Too many items' });
    }

    const line_items = [];
    const validatedItems = [];
    for (const item of items) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;

      const qty = parseInt(item.qty, 10) || 1;
      const price = parseFloat(item.price);

      if (isNaN(price) || Math.round(price * 100) < MIN_PRICE_PENCE || Math.round(price * 100) > MAX_PRICE_PENCE) continue;

      const imgPath = typeof item.img === 'string' ? item.img.replace(/[^a-zA-Z0-9\/\.\-\_]/g, '') : '';

      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: sanitize(item.name),
            images: imgPath ? [SITE_URL + '/' + imgPath.replace(/^\//, '')] : [],
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: qty,
      });

      validatedItems.push({
        name: sanitize(item.name),
        price: price,
        qty: qty,
        img: item.img || '',
        variant: item.variant || '',
      });
    }

    if (!line_items.length) {
      return res.status(400).json({ error: 'No valid items' });
    }

    const totalPence = line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    if (totalPence > MAX_PRICE_PENCE * MAX_ITEMS) {
      return res.status(400).json({ error: 'Order total too large' });
    }

    // Create pending order in database BEFORE Stripe session
    const store = await db.getOrders();
    const orderId = store.nextId;
    store.nextId = orderId + 1;

    const subtotal = totalPence / 100;
    const order = {
      id: orderId,
      customerName: 'Pending',
      customerEmail: customerEmail || '',
      customerPhone: '',
      shippingAddress: '',
      items: validatedItems,
      subtotal: subtotal,
      shippingCost: 0,
      discount: 0,
      total: subtotal,
      status: 'pending',
      stripePaymentId: '',
      stripeSessionId: '',
      trackingNumber: '',
      notes: '',
      createdAt: new Date().toISOString(),
    };

    store.orders.push(order);
    await db.saveOrders(store);

    console.log('Created pending order #' + orderId);

    const uiMode = req.body.ui_mode === 'embedded' ? 'embedded' : 'hosted';

    const shipping = await loadShippingData();
    const shippingOptions = shipping.zones.map(function(zone) {
      var parts = (zone.deliveryEstimate || '5-7').match(/(\d+)/g) || ['5','7'];
      var minDays = parseInt(parts[0]) || 5;
      var maxDays = parts.length > 1 ? parseInt(parts[1]) || minDays + 2 : minDays + 2;
      return {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: Math.round(zone.rate * 100),
            currency: 'gbp',
          },
          display_name: zone.name + ' - \u00A3' + zone.rate.toFixed(2),
          delivery_estimate: {
            minimum: { unit: 'business_day', value: minDays },
            maximum: { unit: 'business_day', value: maxDays },
          },
        },
      };
    });

    const sessionParams = {
      mode: 'payment',
      line_items,
      ui_mode: uiMode,
      shipping_address_collection: {
        allowed_countries: shipping.allowedCountries || ['GB'],
      },
      shipping_options: shippingOptions,
      invoice_creation: {
        enabled: true,
      },
      metadata: {
        orderId: String(orderId),
        store: 'J Jewellers',
        itemCount: String(validatedItems.length),
      },
    };

    if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    if (uiMode === 'embedded') {
      sessionParams.return_url = SITE_URL + '/?session_id={CHECKOUT_SESSION_ID}';
      sessionParams.redirect_on_completion = 'always';
    }

    if (uiMode === 'hosted') {
      sessionParams.success_url = SITE_URL + '/?session_id={CHECKOUT_SESSION_ID}';
      sessionParams.cancel_url = SITE_URL + '/?canceled=1';
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Update order with session ID
    const orderIdx = store.orders.findIndex(o => o.id === orderId);
    if (orderIdx !== -1) {
      store.orders[orderIdx].stripeSessionId = session.id;
      await db.saveOrders(store);
    }

    console.log('Stripe session created for order #' + orderId + ': ' + session.id);

    if (uiMode === 'embedded') {
      return res.status(200).json({ clientSecret: session.client_secret, orderId: orderId });
    }

    return res.status(200).json({ url: session.url, orderId: orderId });
  } catch (err) {
    console.error('Stripe checkout error:', err.message, err.type || '', err.statusCode || '');
    var msg = 'Payment processing failed';
    if (err.type === 'StripeAuthenticationError') msg = 'Payment configuration error. Please contact support.';
    else if (err.type === 'StripeInvalidRequestError') msg = 'Invalid payment request. Please try again.';
    else if (err.statusCode === 402) msg = 'Payment method declined. Please try another.';
    return res.status(500).json({ error: msg });
  }
};
