const db = require('./_db');

const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];
const rateLimitStore = {};
function isRateLimited(key) {
  const now = Date.now();
  if (!rateLimitStore[key]) rateLimitStore[key] = [];
  rateLimitStore[key] = rateLimitStore[key].filter(t => now - t < 60000);
  if (rateLimitStore[key].length >= 5) return true;
  rateLimitStore[key].push(now);
  return false;
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  if (origin && origin.endsWith('.vercel.app')) return true;
  return false;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').trim().substring(0, 500);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : 'https://jjeweller.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { type, email, name, subject, message, orderNumber } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      type: sanitize(type || 'contact'),
      email: sanitize(email),
      name: sanitize(name || ''),
      subject: sanitize(subject || ''),
      message: sanitize(message || ''),
      orderNumber: sanitize(orderNumber || ''),
      timestamp: new Date().toISOString(),
      read: false
    };

    const store = await db.getContacts();
    store.submissions.unshift(entry);
    if (store.submissions.length > 500) {
      store.submissions = store.submissions.slice(0, 500);
    }
    await db.saveContacts(store);

    return res.status(200).json({
      success: true,
      message: 'Your message has been received. We will get back to you within 24 hours.',
      referenceId: entry.id
    });
  } catch (err) {
    console.error('Contact form error:', err.message);
    return res.status(500).json({ error: 'Failed to process your message' });
  }
};
