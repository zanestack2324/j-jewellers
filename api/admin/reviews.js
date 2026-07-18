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
  try { store = await db.getReviews(); } catch (e) { return res.status(500).json({ error: 'Failed to load reviews' }); }
  let { reviews, nextId } = store;

  if (req.method === 'GET') {
    const { id, status } = req.query;
    if (id) {
      const r = reviews.find(r => r.id === Number(id));
      if (!r) return res.status(404).json({ error: 'Review not found' });
      return res.status(200).json(r);
    }
    let results = reviews;
    if (status && status !== 'all') results = reviews.filter(r => r.status === status);
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json(results);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    const review = {
      id: nextId,
      customerName: sanitize(data.customerName, 200) || 'Anonymous',
      customerEmail: sanitize(data.customerEmail, 200) || '',
      productName: sanitize(data.productName, 200) || '',
      productId: parseInt(data.productId) || 0,
      rating: Math.min(5, Math.max(1, parseInt(data.rating) || 5)),
      title: sanitize(data.title, 200) || '',
      body: sanitize(data.body, 2000) || '',
      status: ['pending', 'approved', 'rejected'].includes(data.status) ? data.status : 'pending',
      createdAt: new Date().toISOString()
    };
    reviews.push(review);
    store.nextId = nextId + 1;
    try { await db.saveReviews(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(201).json({ success: true, review });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const review = reviews.find(r => r.id === data.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (data.status !== undefined && ['pending', 'approved', 'rejected'].includes(data.status)) review.status = data.status;
    if (data.rating !== undefined) review.rating = Math.min(5, Math.max(1, parseInt(data.rating) || 5));
    if (data.title !== undefined) review.title = sanitize(data.title, 200);
    if (data.body !== undefined) review.body = sanitize(data.body, 2000);
    try { await db.saveReviews(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(200).json({ success: true, review });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = reviews.findIndex(r => r.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Review not found' });
    reviews.splice(idx, 1);
    try { await db.saveReviews(store); } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
