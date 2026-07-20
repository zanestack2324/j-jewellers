const { authenticate, setCors } = require('./_auth');
const db = require('../_db');
const github = require('../_github');

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, max || 500);
}

function sanitizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.filter(v => v && typeof v === 'object').map(v => ({
    color: sanitize(v.color || '', 50),
    colorHex: sanitize(v.colorHex || '', 7),
    image: v.image || '',
    stock: parseInt(v.stock) || 0,
    price: parseFloat(v.price) || 0,
    sku: sanitize(v.sku || '', 100)
  }));
}

async function syncToGitHub(store) {
  if (!github.isConfigured()) return;
  try {
    const content = JSON.stringify(store, null, 2);
    const existing = await github.getFile('data/products.json');
    await github.createOrUpdateFile(
      'data/products.json',
      content,
      'Update products data via admin panel',
      existing ? existing.sha : null
    );
  } catch (err) {
    console.error('GitHub sync failed:', err.message);
  }
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  let store;
  try {
    store = await db.getProducts();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load products' });
  }
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
      name: sanitize(data.name) || 'New Product',
      category: sanitize(data.category, 100) || 'Uncategorized',
      price: parseFloat(data.price) || 0,
      image: data.image || '',
      badge: sanitize(data.badge, 50) || '',
      status: ['active', 'draft', 'out-of-stock'].includes(data.status) ? data.status : 'active',
      stock: parseInt(data.stock) || 0,
      sales: 0,
      description: sanitize(data.description) || '',
      variants: sanitizeVariants(data.variants)
    };
    products.push(product);
    store.nextId = nextId + 1;
    try {
      await db.saveProducts(store);
      syncToGitHub(store);
    } catch (e) {
      return res.status(500).json({ error: 'Save failed' });
    }
    return res.status(201).json({ success: true, product });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const product = products.find(p => p.id === data.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (data.name !== undefined) product.name = sanitize(data.name);
    if (data.price !== undefined) { const p = parseFloat(data.price); product.price = isNaN(p) ? 0 : p; }
    if (data.category !== undefined) product.category = sanitize(data.category, 100);
    if (data.stock !== undefined) { const s = parseInt(data.stock, 10); product.stock = isNaN(s) ? 0 : s; }
    if (data.status !== undefined && ['active', 'draft', 'out-of-stock'].includes(data.status)) product.status = data.status;
    if (data.badge !== undefined) product.badge = sanitize(data.badge, 50);
    if (data.description !== undefined) product.description = sanitize(data.description);
    if (data.image !== undefined) product.image = data.image;
    if (data.variants !== undefined) product.variants = sanitizeVariants(data.variants);
    try {
      await db.saveProducts(store);
      syncToGitHub(store);
    } catch (e) {
      return res.status(500).json({ error: 'Save failed' });
    }
    return res.status(200).json({ success: true, product });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = products.findIndex(p => p.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    const deleted = products.splice(idx, 1)[0];
    try {
      await db.saveProducts(store);
      syncToGitHub(store);
      if (deleted && deleted.image && github.isConfigured() && deleted.image.startsWith('uploads/')) {
        const existing = await github.getFile(deleted.image);
        if (existing) {
          github.deleteFile(deleted.image, existing.sha, 'Delete product image: ' + deleted.name).catch(() => {});
        }
      }
    } catch (e) {
      return res.status(500).json({ error: 'Delete failed' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = {
  api: {
    bodyParser: { sizeLimit: '10mb' }
  }
};
