const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

function sanitize(str, max) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, max || 200);
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const store = await db.getCoupons();
  let { coupons, nextId } = store;

  if (req.method === 'GET') {
    return res.status(200).json(coupons);
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    nextId++;
    const coupon = {
      id: nextId,
      code: sanitize(data.code, 50).toUpperCase() || 'NEWCOUPON',
      type: ['percentage', 'fixed'].includes(data.type) ? data.type : 'percentage',
      value: parseFloat(data.value) || 0,
      minOrder: parseFloat(data.minOrder) || 0,
      maxUses: parseInt(data.maxUses) || 100,
      used: 0,
      expiry: data.expiry || '2026-12-31',
      status: ['active', 'inactive'].includes(data.status) ? data.status : 'active',
      description: sanitize(data.description) || ''
    };
    coupons.push(coupon);
    store.nextId = nextId;
    await db.saveCoupons(store);
    return res.status(201).json(coupon);
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const coupon = coupons.find(c => c.id === Number(data.id));
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    if (data.code !== undefined) coupon.code = sanitize(data.code, 50).toUpperCase();
    if (data.type !== undefined && ['percentage', 'fixed'].includes(data.type)) coupon.type = data.type;
    if (data.value !== undefined) coupon.value = parseFloat(data.value);
    if (data.minOrder !== undefined) coupon.minOrder = parseFloat(data.minOrder);
    if (data.maxUses !== undefined) coupon.maxUses = parseInt(data.maxUses);
    if (data.expiry !== undefined) coupon.expiry = data.expiry;
    if (data.status !== undefined && ['active', 'inactive'].includes(data.status)) coupon.status = data.status;
    if (data.description !== undefined) coupon.description = sanitize(data.description);
    await db.saveCoupons(store);
    return res.status(200).json(coupon);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const idx = coupons.findIndex(c => c.id === Number(id));
    if (idx === -1) return res.status(404).json({ error: 'Coupon not found' });
    coupons.splice(idx, 1);
    await db.saveCoupons(store);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
