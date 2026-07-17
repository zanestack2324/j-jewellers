const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, max || 200);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const store = await db.getCustomers();
  let { customers, nextId } = store;

  if (req.method === 'GET') {
    const { id, search } = req.query;
    if (id) {
      const customer = customers.find(c => c.id === Number(id));
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      return res.status(200).json(customer);
    }
    let results = customers;
    if (search) {
      const q = search.toLowerCase();
      results = customers.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    return res.status(200).json(results);
  }

  if (req.method === 'PUT') {
    const { id, name, email, status } = req.body || {};
    const customer = customers.find(c => c.id === Number(id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (name) customer.name = sanitize(name);
    if (email && isValidEmail(email)) customer.email = email;
    if (status && ['active', 'inactive', 'blocked'].includes(status)) customer.status = status;
    await db.saveCustomers(store);
    return res.status(200).json(customer);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
