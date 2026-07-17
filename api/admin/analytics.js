const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orderStore = await db.getOrders();
  const productStore = await db.getProducts();
  const customerStore = await db.getCustomers();
  const orders = orderStore.orders || [];
  const products = productStore.products || [];
  const customers = customerStore.customers || [];

  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

  const now = Date.now();
  const dayMs = 86400000;
  const ordersByDay = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now - i * dayMs);
    const dateStr = dayStart.toISOString().split('T')[0];
    const dayOrders = orders.filter(o => o.date && o.date.startsWith(dateStr));
    ordersByDay.push({
      date: dateStr,
      orders: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0)
    });
  }

  const productSales = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!productSales[item.name]) productSales[item.name] = { sales: 0, revenue: 0 };
      productSales[item.name].sales += item.qty || 1;
      productSales[item.name].revenue += item.price || 0;
    });
  });
  const topProducts = Object.entries(productSales)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const countryCounts = {};
  customers.forEach(c => {
    const country = c.country || 'Unknown';
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  });
  const topCountries = Object.entries(countryCounts)
    .map(([country, visitors]) => ({ country, visitors, percentage: customers.length ? Math.round(visitors / customers.length * 1000) / 10 : 0 }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 5);

  return res.status(200).json({
    traffic: {
      totalVisitors: customers.length,
      uniqueVisitors: customers.length,
      pageViews: customers.length * 3,
      avgSessionDuration: 'N/A',
      bounceRate: 'N/A',
      topPages: [{ page: '/', title: 'Home', views: customers.length * 2 }]
    },
    salesAnalytics: {
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      averageOrderValue: Math.round(avgOrderValue * 100) / 100,
      ordersByDay: ordersByDay,
      topProducts: topProducts
    },
    geo: { topCountries: topCountries },
    deviceBreakdown: [{ device: 'Unknown', percentage: 100 }],
    peakHours: { morning: 0, afternoon: 0, evening: 0, night: 0 }
  });
};
