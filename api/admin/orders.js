const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, max || 500);
}

async function syncPendingOrdersFromStripe(orders) {
  if (!stripe) return;
  const pending = orders.filter(o => o.status === 'pending' && (o.stripeSessionId || o.stripePaymentId)).slice(0, 10);
  if (!pending.length) return;

  let changed = false;
  for (const order of pending) {
    try {
      let session = null;
      if (order.stripeSessionId) {
        session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      } else if (order.stripePaymentId) {
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentId);
        if (pi && pi.metadata?.orderId) {
          session = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
          session = session?.data?.[0] || null;
        }
      }

      if (!session || session.payment_status !== 'paid') continue;

      order.status = 'paid';
      if (session.payment_intent) order.stripePaymentId = session.payment_intent;
      order.paidAt = new Date(session.created * 1000).toISOString();

      if (session.customer_details?.name && order.customerName === 'Pending') order.customerName = session.customer_details.name;
      if (session.customer_details?.email) order.customerEmail = order.customerEmail || session.customer_details.email;
      if (session.customer_details?.phone) order.customerPhone = order.customerPhone || session.customer_details.phone;

      const addr = session.customer_details?.address || session.shipping_details?.address;
      if (addr) {
        order.shippingAddress = {
          line1: addr.line1 || '', line2: addr.line2 || '',
          city: addr.city || '', state: addr.state || '',
          postalCode: addr.postal_code || '', country: addr.country || 'GB',
          countryCode: addr.country || 'GB',
        };
        order.shippingAddressText = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', ');
      }

      if (session.amount_total) order.total = session.amount_total / 100;
      if (session.amount_subtotal) order.subtotal = session.amount_subtotal / 100;
      if (session.shipping_cost?.amount_total) order.shippingCost = session.shipping_cost.amount_total / 100;

      changed = true;
      console.log('Auto-synced order #' + order.id + ' from Stripe session');
    } catch (err) {
      console.error('Auto-sync failed for order #' + order.id + ':', err.message);
    }
  }

  return changed;
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  let store;
  try { store = await db.getOrders(); } catch (e) { return res.status(500).json({ error: 'Failed to load orders' }); }
  let { orders, nextId } = store;

  if (req.method === 'GET') {
    const { id, status, search } = req.query;
    if (id) {
      const o = orders.find(o => o.id === Number(id));
      if (!o) return res.status(404).json({ error: 'Order not found' });
      return res.status(200).json(o);
    }

    const changed = await syncPendingOrdersFromStripe(orders);
    if (changed) {
      try { await db.saveOrders(store); } catch (e) { console.error('Failed to save synced orders:', e.message); }
    }

    let results = orders;
    if (status && status !== 'all') results = orders.filter(o => o.status === status);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(o =>
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerEmail || '').toLowerCase().includes(q) ||
        (o.id || '').toString().includes(q) ||
        (o.stripePaymentId || '').toLowerCase().includes(q)
      );
    }
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json(results);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    const order = {
      id: nextId,
      customerName: sanitize(data.customerName, 200) || 'Unknown',
      customerEmail: sanitize(data.customerEmail, 200) || '',
      customerPhone: sanitize(data.customerPhone, 30) || '',
      shippingAddress: sanitize(data.shippingAddress, 500) || '',
      items: data.items || [],
      subtotal: parseFloat(data.subtotal) || 0,
      shippingCost: parseFloat(data.shippingCost) || 0,
      discount: parseFloat(data.discount) || 0,
      total: parseFloat(data.total) || 0,
      status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'].includes(data.status) ? data.status : 'pending',
      stripePaymentId: sanitize(data.stripePaymentId, 200) || '',
      trackingNumber: sanitize(data.trackingNumber, 200) || '',
      notes: sanitize(data.notes, 500) || '',
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    store.nextId = nextId + 1;
    try { await db.saveOrders(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(201).json({ success: true, order });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const order = orders.find(o => o.id === data.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (data.customerName !== undefined) order.customerName = sanitize(data.customerName, 200);
    if (data.customerEmail !== undefined) order.customerEmail = sanitize(data.customerEmail, 200);
    if (data.customerPhone !== undefined) order.customerPhone = sanitize(data.customerPhone, 30);
    if (data.shippingAddress !== undefined) order.shippingAddress = sanitize(data.shippingAddress, 500);
    if (data.items !== undefined) order.items = data.items;
    if (data.subtotal !== undefined) order.subtotal = parseFloat(data.subtotal) || 0;
    if (data.shippingCost !== undefined) order.shippingCost = parseFloat(data.shippingCost) || 0;
    if (data.discount !== undefined) order.discount = parseFloat(data.discount) || 0;
    if (data.total !== undefined) order.total = parseFloat(data.total) || 0;
    if (data.status !== undefined && ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'].includes(data.status)) order.status = data.status;
    if (data.trackingNumber !== undefined) order.trackingNumber = sanitize(data.trackingNumber, 200);
    if (data.notes !== undefined) order.notes = sanitize(data.notes, 500);
    try { await db.saveOrders(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(200).json({ success: true, order });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = orders.findIndex(o => o.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Order not found' });
    orders.splice(idx, 1);
    try { await db.saveOrders(store); } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { api: { bodyParser: { sizeLimit: '5mb' } } };
