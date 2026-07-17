const crypto = require('crypto');

// Rate limiter (in-memory, per function instance)
const rateLimitStore = {};
function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  if (!rateLimitStore[key]) rateLimitStore[key] = [];
  rateLimitStore[key] = rateLimitStore[key].filter(t => now - t < windowMs);
  if (rateLimitStore[key].length >= maxRequests) return false;
  rateLimitStore[key].push(now);
  return true;
}

// Input sanitization
function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;\\]/g, '').trim().substring(0, maxLen || 500);
}

function sanitizeObject(obj, maxDepth) {
  if (!obj || typeof obj !== 'object') return obj;
  if (maxDepth === undefined) maxDepth = 3;
  if (maxDepth <= 0) return {};
  const clean = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    const val = obj[key];
    if (typeof val === 'string') clean[key] = sanitizeString(val, 2000);
    else if (typeof val === 'number' && isFinite(val)) clean[key] = val;
    else if (typeof val === 'boolean') clean[key] = val;
    else if (typeof val === 'object' && val !== null) clean[key] = sanitizeObject(val, maxDepth - 1);
  }
  return clean;
}

// Validate email
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Generate request signature for idempotency
function signRequest(data, secret) {
  return crypto.createHmac('sha256', secret || 'default').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

// Get client IP
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// Security headers middleware
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

// CORS with strict origin checking
function setStrictCors(res, origin, allowedOrigins) {
  const isAllowed = origin && allowedOrigins.some(o => origin === o);
  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : 'https://jjeweller.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Reject oversized bodies
function checkBodySize(req, maxSizeBytes) {
  const bodyStr = JSON.stringify(req.body || {});
  return bodyStr.length <= (maxSizeBytes || 1048576);
}

// Honeypot check (bots fill hidden fields)
function checkHoneypot(req) {
  if (req.body && (req.body.website || req.body.fax || req.body._hp)) return false;
  return true;
}

// Timing-safe string comparison
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {
  rateLimit,
  sanitizeString,
  sanitizeObject,
  isValidEmail,
  signRequest,
  getClientIP,
  setSecurityHeaders,
  setStrictCors,
  checkBodySize,
  checkHoneypot,
  safeCompare
};
