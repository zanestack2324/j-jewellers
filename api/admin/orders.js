const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  let store;
  try {
    store = await db.getOrders();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load orders' });
  }
  let { orders, nextId } = store;

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const order = orders.find(o => o.id === id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.status(200).json(order);
    }
    return res.status(200).json(orders);
  }

  if (req.method === 'PUT') {
    const { id, status } = req.body || {};
    const order = orders.find(o => o.id === id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (status && VALID_STATUSES.includes(status)) order.status = status;
    try {
      await db.saveOrders(store);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save order' });
    }
    return res.status(200).json(order);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ error: 'Items required' });
    }
    const total = parseFloat(data.total);
    if (isNaN(total) || total <= 0) {
      return res.status(400).json({ error: 'Invalid total' });
    }
    nextId++;
    const newOrder = {
      id: 'JJ-' + String(nextId).padStart(5, '0'),
      customer: (typeof data.customer === 'string' ? data.customer : '').replace(/[<>"'`;\\]/g, '').trim().substring(0, 200) || 'Guest',
      email: data.email || 'guest@example.com',
      items: data.items,
      total: total,
      status: 'pending',
      payment: data.payment || 'unpaid',
      date: new Date().toISOString(),
      shipping: data.shipping || { address: '', method: 'Standard' }
    };
    orders.unshift(newOrder);
    store.nextId = nextId;
    try {
      await db.saveOrders(store);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save order' });
    }
    return res.status(201).json(newOrder);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
