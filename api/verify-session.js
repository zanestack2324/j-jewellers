const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin.startsWith(ALLOWED_ORIGINS[i])) return true;
  }
  return false;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowedOrigin = isAllowedOrigin(origin) ? (origin || 'https://jjeweller.com') : 'https://jjeweller.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.query;
  if (!session_id || typeof session_id !== 'string' || !session_id.startsWith('cs_')) {
    return res.status(400).json({ valid: false, error: 'Invalid session ID format' });
  }

  if (session_id.length > 100) {
    return res.status(400).json({ valid: false, error: 'Session ID too long' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent']
    });

    if (session.payment_status === 'paid') {
      return res.status(200).json({
        valid: true,
        status: 'paid',
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email || null
      });
    }

    return res.status(200).json({
      valid: false,
      status: session.payment_status || session.status,
      error: 'Payment not completed'
    });
  } catch (err) {
    console.error('Session verification error:', err.message);
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(404).json({ valid: false, error: 'Session not found' });
    }
    return res.status(500).json({ valid: false, error: 'Verification failed' });
  }
};
