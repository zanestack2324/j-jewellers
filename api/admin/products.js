const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const store = await db.getProducts();
  let { products, nextId } = store;

  if (req.method === 'GET') {
    const { id, category } = req.query;
    if (id) {
      const product = products.find(p => p.id === Number(id));
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.status(200).json(product);
    }
    let results = products;
    if (category && category !== 'all') results = products.filter(p => p.category === category);
    return res.status(200).json(results);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    const product = {
      id: nextId,
      name: data.name || 'New Product',
      category: data.category || 'Uncategorized',
      price: parseFloat(data.price) || 0,
      image: data.image || '',
      badge: data.badge || '',
      status: data.status || 'active',
      stock: parseInt(data.stock) || 0,
      sales: 0,
      description: data.description || ''
    };
    products.push(product);
    store.nextId = nextId + 1;
    await db.saveProducts(store);
    return res.status(201).json({ success: true, product });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const product = products.find(p => p.id == data.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (data.name !== undefined) product.name = data.name;
    if (data.price !== undefined) { const p = parseFloat(data.price); product.price = isNaN(p) ? 0 : p; }
    if (data.category !== undefined) product.category = data.category;
    if (data.stock !== undefined) { const s = parseInt(data.stock, 10); product.stock = isNaN(s) ? 0 : s; }
    if (data.status !== undefined) product.status = data.status;
    if (data.badge !== undefined) product.badge = data.badge;
    if (data.description !== undefined) product.description = data.description;
    if (data.image !== undefined) product.image = data.image;
    await db.saveProducts(store);
    return res.status(200).json({ success: true, product });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = products.findIndex(p => p.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    products.splice(idx, 1);
    await db.saveProducts(store);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
