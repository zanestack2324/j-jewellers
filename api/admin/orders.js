const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, max || 500);
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
