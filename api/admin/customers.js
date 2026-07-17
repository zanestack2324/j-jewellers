const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res);
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
    if (name) customer.name = name;
    if (email) customer.email = email;
    if (status) customer.status = status;
    await db.saveCustomers(store);
    return res.status(200).json(customer);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
