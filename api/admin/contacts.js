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
  try { store = await db.getContacts(); } catch (e) { return res.status(500).json({ error: 'Failed to load contacts' }); }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const s = store.submissions.find(s => s.id === id);
      if (!s) return res.status(404).json({ error: 'Submission not found' });
      return res.status(200).json(s);
    }
    let results = store.submissions || [];
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json(results);
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    if (!data.id) return res.status(400).json({ error: 'ID required' });
    const sub = (store.submissions || []).find(s => s.id === data.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (data.read !== undefined) sub.read = !!data.read;
    if (data.replied !== undefined) sub.replied = !!data.replied;
    if (data.notes !== undefined) sub.notes = sanitize(data.notes, 1000);
    try { await db.saveContacts(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(200).json({ success: true, submission: sub });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const idx = (store.submissions || []).findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    store.submissions.splice(idx, 1);
    try { await db.saveContacts(store); } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
