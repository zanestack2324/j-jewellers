const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const store = await db.getReviews();
  let { reviews, nextId } = store;

  if (req.method === 'GET') {
    const { status } = req.query;
    let results = reviews;
    if (status) results = reviews.filter(r => r.status === status);
    return res.status(200).json(results);
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const review = reviews.find(r => r.id === Number(data.id));
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (data.status !== undefined && ['pending', 'approved', 'rejected'].includes(data.status)) review.status = data.status;
    await db.saveReviews(store);
    return res.status(200).json(review);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = reviews.findIndex(r => r.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Review not found' });
    reviews.splice(idx, 1);
    await db.saveReviews(store);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
