const { authenticate, setCors } = require('./_auth');
const db = require('../_db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const startTime = Date.now();

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [balances, orderStore, productStore, customerStore] = await Promise.all([
      stripe.balance.retrieve().catch(() => ({ available: [], pending: [] })),
      db.getOrders(),
      db.getProducts(),
      db.getCustomers()
    ]);

    const available = balances.available.reduce((sum, b) => sum + b.amount, 0) / 100;
    const pending = balances.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
    const orders = orderStore.orders || [];
    const products = productStore.products || [];
    const customers = customerStore.customers || [];

    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);

    const recentActivity = orders.slice(0, 5).map(o => ({
      type: 'order',
      message: o.customer + ' placed order ' + o.id + ' (\u00A3' + (o.total || 0).toFixed(2) + ')',
      time: o.date || new Date().toISOString()
    }));

    if (!recentActivity.length) {
      recentActivity.push({ type: 'system', message: 'Admin portal initialized', time: new Date().toISOString() });
    }

    return res.status(200).json({
      overview: {
        totalSales: totalRevenue,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        totalCustomers: customers.length,
        activeCustomers: customers.filter(c => c.status === 'active').length,
        totalProducts: products.length,
        conversionRate: 0,
        averageOrderValue: orders.length ? Math.round(totalRevenue / orders.length * 100) / 100 : 0
      },
      revenue: {
        today: 0,
        thisWeek: 0,
        thisMonth: pending,
        lastMonth: 0,
        available: available,
        pending: pending
      },
      recentActivity: recentActivity,
      stripeBalance: {
        available: available,
        pending: pending,
        currency: balances.available[0]?.currency || 'gbp'
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    return res.status(500).json({
      overview: { totalSales: 0, totalOrders: 0, pendingOrders: 0, totalCustomers: 0, activeCustomers: 0, totalProducts: 0, conversionRate: 0, averageOrderValue: 0 },
      revenue: { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0, available: 0, pending: 0 },
      recentActivity: [{ type: 'system', message: 'Dashboard loaded in offline mode', time: new Date().toISOString() }],
      stripeBalance: { available: 0, pending: 0, currency: 'gbp' },
      uptime: Math.floor((Date.now() - startTime) / 1000),
      serverTime: new Date().toISOString()
    });
  }
};
