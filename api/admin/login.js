const { authenticate, login, setCors } = require('./_auth');

const loginAttempts = {};
function isRateLimited(ip) {
  const now = Date.now();
  if (!loginAttempts[ip]) loginAttempts[ip] = [];
  loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < 60000);
  if (loginAttempts[ip].length >= 5) return true;
  loginAttempts[ip].push(now);
  return false;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const { username, password, action } = body;

  if (action === 'check') {
    const session = authenticate(req);
    return res.status(200).json({ success: !!session });
  }
  if (action === 'logout') return res.status(200).json({ success: true });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 1 minute.' });
  }

  const token = login(username, password);
  if (token) return res.status(200).json({ success: true, token });
  return res.status(401).json({ error: 'Invalid credentials' });
};

module.exports.config = {
  api: { bodyParser: true }
};
