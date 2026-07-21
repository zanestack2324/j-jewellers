const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./_db');

const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (origin === ALLOWED_ORIGINS[i]) return true;
  }
  if (origin && origin.endsWith('.vercel.app')) return true;
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
      // Try to update the order if webhook hasn't processed yet
      try {
        const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;
        if (orderId) {
          const store = await db.getOrders({ forceRefresh: true });
          const order = store.orders.find(o => o.id === orderId);
          if (order && order.status === 'pending') {
            // Webhook hasn't updated yet — update from here
            order.status = 'paid';
            order.stripePaymentId = session.payment_intent?.id || session.payment_intent || '';
            order.stripeSessionId = session.id;
            order.paidAt = new Date().toISOString();
            if (session.customer_details?.name) order.customerName = session.customer_details.name;
            if (session.customer_details?.email) order.customerEmail = session.customer_details.email;
            if (session.customer_details?.phone) order.customerPhone = session.customer_details.phone;
            if (session.customer_details?.address) {
              const a = session.customer_details.address;
              order.shippingAddress = {
                line1: a.line1 || '', line2: a.line2 || '', city: a.city || '',
                state: a.state || '', postalCode: a.postal_code || '', country: a.country || 'GB',
                countryCode: a.country || 'GB',
              };
              order.shippingAddressText = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
            } else if (session.shipping_details?.address) {
              const a = session.shipping_details.address;
              order.shippingAddress = {
                line1: a.line1 || '', line2: a.line2 || '', city: a.city || '',
                state: a.state || '', postalCode: a.postal_code || '', country: a.country || 'GB',
                countryCode: a.country || 'GB',
              };
              order.shippingAddressText = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
              if (session.shipping_details.name) order.customerName = session.shipping_details.name;
            }
            if (session.amount_total) order.total = session.amount_total / 100;
            if (session.shipping_cost?.amount_total) {
              order.shippingCost = session.shipping_cost.amount_total / 100;
              order.subtotal = order.total - order.shippingCost;
            }
            await db.saveOrders(store);
            console.log('Order #' + orderId + ' updated via verify-session fallback');
          }
        }
      } catch (fallbackErr) {
        console.error('verify-session fallback update failed:', fallbackErr.message);
      }

      return res.status(200).json({
        valid: true,
        status: 'paid',
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email || null,
        orderId: session.metadata?.orderId || null,
        customerName: session.customer_details?.name || null,
        shippingAddress: session.customer_details?.address || null,
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
