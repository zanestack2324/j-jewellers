const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 5000000;

function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  return false;
}

const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.start > 60000) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > 15;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigin = isAllowedOrigin(origin) ? (origin ? origin.split('/')[0] + '//' + origin.split('/')[2] : 'https://jjeweller.com') : 'https://jjeweller.com';

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
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { items, customer_email, shipping_fee, shipping_country } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;
      const qty = parseInt(item.qty, 10);
      const price = parseFloat(item.price);
      if (isNaN(qty) || qty < 1 || qty > 10) continue;
      if (isNaN(price) || Math.round(price * 100) < MIN_AMOUNT || Math.round(price * 100) > MAX_AMOUNT) continue;

      const itemTotal = Math.round(price * 100) * qty;
      totalAmount += itemTotal;
      validatedItems.push({
        name: item.name.replace(/[<>&"']/g, '').trim().substring(0, 200),
        quantity: qty,
        amount: itemTotal
      });
    }

    if (!validatedItems.length) {
      return res.status(400).json({ error: 'No valid items' });
    }

    let shippingPence = 0;
    if (typeof shipping_fee === 'number' && shipping_fee > 0) {
      shippingPence = Math.round(shipping_fee * 100);
      totalAmount += shippingPence;
    }

    if (totalAmount > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Order total too large' });
    }

    const meta = {
      store: 'J Jewellers',
      items: JSON.stringify(validatedItems.map(v => ({ name: v.name, qty: v.quantity })))
    };
    if (shippingPence > 0) {
      meta.shipping_fee = String(shippingPence);
      meta.shipping_country = shipping_country || '';
    }

    const piParams = {
      amount: totalAmount,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: meta,
      receipt_email: customer_email || undefined
    };

    if (shipping_country) {
      piParams.shipping = {
        name: 'Shipping',
        address: { country: shipping_country, line1: 'N/A' }
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amount: totalAmount
    });
  } catch (err) {
    console.error('Payment intent error:', err.message);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
};
