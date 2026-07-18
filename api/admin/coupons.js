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
  try { store = await db.getCoupons(); } catch (e) { return res.status(500).json({ error: 'Failed to load coupons' }); }
  let { coupons, nextId } = store;

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const c = coupons.find(c => c.id === Number(id));
      if (!c) return res.status(404).json({ error: 'Coupon not found' });
      return res.status(200).json(c);
    }
    return res.status(200).json(coupons);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    const code = (data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return res.status(400).json({ error: 'Coupon code is required' });
    if (coupons.some(c => c.code === code)) return res.status(400).json({ error: 'Coupon code already exists' });
    const coupon = {
      id: nextId,
      code: code,
      type: ['percentage', 'fixed'].includes(data.type) ? data.type : 'percentage',
      value: parseFloat(data.value) || 0,
      minOrder: parseFloat(data.minOrder) || 0,
      maxUses: parseInt(data.maxUses) || 0,
      usedCount: 0,
      active: data.active !== false,
      expiresAt: data.expiresAt || '',
      createdAt: new Date().toISOString()
    };
    coupons.push(coupon);
    store.nextId = nextId + 1;
    try { await db.saveCoupons(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(201).json({ success: true, coupon });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const coupon = coupons.find(c => c.id === data.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    if (data.code !== undefined) coupon.code = sanitize(data.code, 50).toUpperCase();
    if (data.type !== undefined) coupon.type = ['percentage', 'fixed'].includes(data.type) ? data.type : coupon.type;
    if (data.value !== undefined) coupon.value = parseFloat(data.value) || 0;
    if (data.minOrder !== undefined) coupon.minOrder = parseFloat(data.minOrder) || 0;
    if (data.maxUses !== undefined) coupon.maxUses = parseInt(data.maxUses) || 0;
    if (data.active !== undefined) coupon.active = !!data.active;
    if (data.expiresAt !== undefined) coupon.expiresAt = data.expiresAt;
    try { await db.saveCoupons(store); } catch (e) { return res.status(500).json({ error: 'Save failed' }); }
    return res.status(200).json({ success: true, coupon });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = coupons.findIndex(c => c.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Coupon not found' });
    coupons.splice(idx, 1);
    try { await db.saveCoupons(store); } catch (e) { return res.status(500).json({ error: 'Delete failed' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
