const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const productStore = await db.getProducts();
  const products = productStore.products || [];

  const inventory = products.map(p => ({
    id: p.id,
    sku: 'JJ-' + String(p.id).padStart(3, '0'),
    name: p.name || 'Unnamed',
    category: p.category || 'Uncategorized',
    stock: p.stock || 0,
    reserved: 0,
    available: p.stock || 0,
    lowStockThreshold: 5,
    status: (p.stock || 0) === 0 ? 'out_of_stock' : (p.stock || 0) <= 5 ? 'low_stock' : 'in_stock'
  }));

  if (req.method === 'GET') {
    const { status } = req.query;
    let results = inventory;
    if (status) results = inventory.filter(i => i.status === status);
    return res.status(200).json({
      items: results,
      summary: {
        totalProducts: inventory.length,
        totalStock: inventory.reduce((s, i) => s + i.stock, 0),
        totalAvailable: inventory.reduce((s, i) => s + i.available, 0),
        totalReserved: inventory.reduce((s, i) => s + i.reserved, 0),
        lowStock: inventory.filter(i => i.available <= i.lowStockThreshold).length,
        outOfStock: inventory.filter(i => i.available === 0).length
      }
    });
  }

  if (req.method === 'PUT') {
    const { id, stock, lowStockThreshold } = req.body || {};
    const product = products.find(p => p.id === Number(id));
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (stock !== undefined) {
      product.stock = parseInt(stock, 10) || 0;
    }
    await db.saveProducts(productStore);
    const item = inventory.find(i => i.id === Number(id));
    if (item) {
      if (stock !== undefined) { item.stock = product.stock; item.available = product.stock; }
      if (lowStockThreshold !== undefined) item.lowStockThreshold = parseInt(lowStockThreshold, 10) || 5;
      item.status = item.available === 0 ? 'out_of_stock' : item.available <= item.lowStockThreshold ? 'low_stock' : 'in_stock';
    }
    return res.status(200).json(item);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
