const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ALLOWED_ORIGIN = 'https://j-jewellers.vercel.app';
const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 10;
const MAX_ITEM_NAME_LEN = 200;
const MIN_PRICE_PENCE = 100;
const MAX_PRICE_PENCE = 500000;

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').trim().substring(0, MAX_ITEM_NAME_LEN);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.startsWith(ALLOWED_ORIGIN)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: 'Too many items' });
    }

    const line_items = [];
    for (const item of items) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;

      const qty = parseInt(item.qty, 10);
      const price = parseFloat(item.price);

      if (isNaN(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) continue;
      if (isNaN(price) || Math.round(price * 100) < MIN_PRICE_PENCE || Math.round(price * 100) > MAX_PRICE_PENCE) continue;

      const imgPath = typeof item.img === 'string' ? item.img.replace(/[^a-zA-Z0-9\/\.\-\_]/g, '') : '';

      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: sanitize(item.name),
            images: imgPath ? [ALLOWED_ORIGIN + '/' + imgPath.replace(/^\//, '')] : [],
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: qty,
      });
    }

    if (!line_items.length) {
      return res.status(400).json({ error: 'No valid items' });
    }

    const totalPence = line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    if (totalPence > MAX_PRICE_PENCE * MAX_ITEMS) {
      return res.status(400).json({ error: 'Order total too large' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: ALLOWED_ORIGIN + '/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: ALLOWED_ORIGIN + '/?canceled=1',
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'IN', 'AE', 'SA', 'PK', 'BD', 'LK', 'SG', 'MY', 'NZ', 'IE', 'ZA'],
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Payment processing failed' });
  }
};
