const db = require('./_db');

const ALLOWED_ORIGIN = 'https://jjeweller.com';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const store = await db.getProducts();
  const { products } = store;

  const { id, category } = req.query;
  let results = products;

  if (id) {
    const product = products.find(p => p.id === Number(id));
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.status(200).json(product);
  }

  if (category && category !== 'all') {
    results = products.filter(p => p.category === category);
  }

  return res.status(200).json(results);
};
