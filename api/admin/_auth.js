const crypto = require('crypto');
const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  return false;
}

const ADMIN_USER = 'admin';
const getPass = () => {
  if (!process.env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD not set');
  return process.env.ADMIN_PASSWORD || '';
};
const TOKEN_VALIDITY = 24 * 60 * 60 * 1000;

function generateToken(username) {
  const payload = { username, iat: Date.now(), exp: Date.now() + TOKEN_VALIDITY };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = crypto.createHmac('sha256', getPass()).update(encoded).digest('hex');
  return sig + '.' + encoded;
}

function authenticate(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    const check = crypto.createHmac('sha256', getPass()).update(parts[1]).digest('hex');
    if (check.length !== parts[0].length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(check), Buffer.from(parts[0]))) return null;
    return { username: payload.username, loginTime: payload.iat, expiresAt: payload.exp };
  } catch { return null; }
}

function login(username, password) {
  if (username !== ADMIN_USER) { crypto.randomBytes(32); return null; }
  if (!password || !getPass()) return null;
  if (Buffer.byteLength(password) !== Buffer.byteLength(getPass())) { crypto.randomBytes(32); return null; }
  if (!crypto.timingSafeEqual(Buffer.from(password), Buffer.from(getPass()))) return null;
  return generateToken(username);
}

function setCors(res, origin) {
  var allowed = isAllowedOrigin(origin) ? (origin || 'https://jjeweller.com') : 'https://jjeweller.com';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

module.exports = { authenticate, login, setCors, isAllowedOrigin, ALLOWED_ORIGIN: 'https://jjeweller.com' };
