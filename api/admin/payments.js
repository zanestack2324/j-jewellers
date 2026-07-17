const { authenticate, setCors, ALLOWED_ORIGIN } = require('./_auth');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [balance, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 10 }).catch(() => ({ data: [] }))
    ]);

    const paymentIntents = [];
    if (charges.data) {
      for (const charge of charges.data) {
        paymentIntents.push({
          id: charge.id,
          amount: charge.amount / 100,
          currency: charge.currency,
          status: charge.status,
          paid: charge.paid,
          refunded: charge.refunded,
          email: charge.billing_details?.email || 'N/A',
          created: new Date(charge.created * 1000).toISOString(),
          description: charge.description || ''
        });
      }
    }

    return res.status(200).json({
      balance: {
        available: balance.available.reduce((s, b) => s + b.amount, 0) / 100,
        pending: balance.pending.reduce((s, b) => s + b.amount, 0) / 100,
        currency: balance.available[0]?.currency || 'gbp'
      },
      recentPayments: paymentIntents,
      stripeConfigured: true
    });
  } catch (err) {
    console.error('Payments API error:', err.message);
    return res.status(500).json({
      balance: { available: 0, pending: 0, currency: 'gbp' },
      recentPayments: [],
      stripeConfigured: false,
      error: 'Failed to load payments'
    });
  }
};
