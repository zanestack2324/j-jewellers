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
  try { store = await db.getCustomers(); } catch (e) { return res.status(500).json({ error: 'Failed to load customers' }); }
  let { customers, nextId } = store;

  if (req.method === 'GET') {
    const { id, search } = req.query;
    if (id) {
      const c = customers.find(c => c.id === Number(id));
      if (!c) return res.status(404).json({ error: 'Customer not found' });
      return res.status(200).json(c);
    }
    let results = customers;
    if (search) {
      const q = search.toLowerCase();
      results = customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }
    return res.status(200).json(results);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    const customer = {
      id: nextId,
      name: sanitize(data.name) || 'Unknown',
      email: sanitize(data.email, 200) || '',
      phone: sanitize(data.phone, 30) || '',
      address: sanitize(data.address, 500) || '',
      city: sanitize(data.city, 100) || '',
      postcode: sanitize(data.postcode, 20) || '',
      notes: sanitize(data.notes, 500) || '',
      totalOrders: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString()
    };
    customers.push(customer);
    store.nextId = nextId + 1;
    try { await db.saveCustomers(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(201).json({ success: true, customer });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const customer = customers.find(c => c.id === data.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (data.name !== undefined) customer.name = sanitize(data.name);
    if (data.email !== undefined) customer.email = sanitize(data.email, 200);
    if (data.phone !== undefined) customer.phone = sanitize(data.phone, 30);
    if (data.address !== undefined) customer.address = sanitize(data.address, 500);
    if (data.city !== undefined) customer.city = sanitize(data.city, 100);
    if (data.postcode !== undefined) customer.postcode = sanitize(data.postcode, 20);
    if (data.notes !== undefined) customer.notes = sanitize(data.notes, 500);
    try { await db.saveCustomers(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(200).json({ success: true, customer });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = customers.findIndex(c => c.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
    customers.splice(idx, 1);
    try { await db.saveCustomers(store); } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
