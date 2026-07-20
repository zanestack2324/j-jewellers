const db = require('./_db');

const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const origin = req.headers.origin || '';
  const allowedOrigin = isAllowedOrigin(origin) ? (origin || 'https://jjeweller.com') : 'https://jjeweller.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
