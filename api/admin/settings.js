const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

const DEFAULT_SETTINGS = {
  store: {
    name: 'J JEWELLERS',
    tagline: 'Look Boujee On A Budget',
    email: 'info@jjewellers.co.uk',
    phone: '',
    currency: 'GBP',
    language: 'English',
    timezone: 'Europe/London'
  },
  notifications: {
    orderConfirmation: true,
    newCustomer: true,
    lowStockAlert: true,
    newReview: true,
    weeklyReport: true
  },
  security: {
    twoFactorAuth: false,
    loginAttempts: 5,
    sessionTimeout: 24,
    ipWhitelist: ''
  },
  integrations: {
    stripe: !!process.env.STRIPE_SECRET_KEY,
    stripeKey: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not set',
    analytics: false
  },
  payment: {
    currency: 'GBP',
    taxRate: 20,
    taxName: 'VAT',
    shippingTaxable: true
  },
  staff: [
    { id: 1, name: 'Admin', email: 'admin@jjewellers.co.uk', role: 'superadmin', status: 'active', lastLogin: new Date().toISOString() }
  ],
  staffNextId: 1
};

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { section } = req.query;
    const saved = await db.getSettings();
    const settings = saved || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!settings.staff) settings.staff = DEFAULT_SETTINGS.staff;
    if (!settings.staffNextId) settings.staffNextId = 1;

    if (section === 'staff') return res.status(200).json(settings.staff);
    if (section) return res.status(200).json(settings[section] || settings);
    return res.status(200).json({
      storeName: settings.store.name,
      supportEmail: settings.store.email,
      phone: settings.store.phone || '',
      ...settings.store,
      notifications: settings.notifications,
      security: settings.security,
      integrations: settings.integrations,
      payment: settings.payment
    });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const saved = await db.getSettings();
    const settings = saved || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!settings.staff) settings.staff = DEFAULT_SETTINGS.staff;
    if (!settings.staffNextId) settings.staffNextId = 1;

    if (data.section && data.value) {
      const allowedSections = ['store', 'notifications', 'security', 'payment'];
      if (!allowedSections.includes(data.section)) {
        return res.status(400).json({ error: 'Invalid section' });
      }
      settings[data.section] = { ...settings[data.section], ...data.value };
      await db.saveSettings(settings);
      return res.status(200).json({ success: true, ...settings[data.section] });
    }
    if (data.storeName !== undefined || data.supportEmail !== undefined || data.phone !== undefined) {
      if (data.storeName !== undefined) settings.store.name = data.storeName;
      if (data.supportEmail !== undefined) settings.store.email = data.supportEmail;
      if (data.phone !== undefined) settings.store.phone = data.phone;
      await db.saveSettings(settings);
      return res.status(200).json({ success: true, storeName: settings.store.name, supportEmail: settings.store.email, phone: settings.store.phone || '' });
    }
    return res.status(400).json({ error: 'Invalid settings data' });
  }

  if (req.method === 'POST') {
    if (req.query.section === 'staff') {
      const data = req.body || {};
      const saved = await db.getSettings();
      const settings = saved || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      if (!settings.staff) settings.staff = DEFAULT_SETTINGS.staff;
      if (!settings.staffNextId) settings.staffNextId = 1;

      settings.staffNextId++;
      const staff = {
        id: settings.staffNextId,
        name: data.name || 'New Staff',
        email: data.email || 'staff@jjewellers.co.uk',
        role: data.role || 'staff',
        status: 'active',
        lastLogin: ''
      };
      settings.staff.push(staff);
      await db.saveSettings(settings);
      return res.status(201).json(staff);
    }
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (req.method === 'DELETE') {
    if (req.query.section === 'staff' && req.query.id) {
      const saved = await db.getSettings();
      const settings = saved || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      if (!settings.staff) settings.staff = DEFAULT_SETTINGS.staff;

      const idx = settings.staff.findIndex(s => s.id == req.query.id);
      if (idx === -1) return res.status(404).json({ error: 'Staff not found' });
      settings.staff.splice(idx, 1);
      await db.saveSettings(settings);
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid request' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
