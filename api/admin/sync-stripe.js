const { authenticate, setCors } = require('./_auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const store = await db.getOrders({ forceRefresh: true });
    const existingSessionIds = new Set(store.orders.map(o => o.stripeSessionId).filter(Boolean));
    const existingPaymentIds = new Set(store.orders.map(o => o.stripePaymentId).filter(Boolean));

    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const s of sessions.data) {
      if (s.payment_status !== 'paid') { skipped++; continue; }
      if (existingSessionIds.has(s.id)) { skipped++; continue; }

      const piId = s.payment_intent || '';
      if (piId && existingPaymentIds.has(piId)) { skipped++; continue; }

      try {
        const orderId = store.nextId;
        store.nextId = orderId + 1;

        const address = s.customer_details?.address || s.shipping_details?.address || {};
        const shippingAddress = {
          line1: address.line1 || '',
          line2: address.line2 || '',
          city: address.city || '',
          state: address.state || '',
          postalCode: address.postal_code || '',
          country: address.country || 'GB',
          countryCode: address.country || 'GB',
        };

        const order = {
          id: orderId,
          customerName: s.customer_details?.name || s.shipping_details?.name || 'Stripe Customer',
          customerEmail: s.customer_details?.email || '',
          customerPhone: s.customer_details?.phone || '',
          shippingAddress: shippingAddress,
          shippingAddressText: [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', '),
          items: [],
          subtotal: s.amount_subtotal ? s.amount_subtotal / 100 : 0,
          shippingCost: s.shipping_cost?.amount_total ? s.shipping_cost.amount_total / 100 : 0,
          discount: 0,
          total: s.amount_total ? s.amount_total / 100 : 0,
          status: 'paid',
          stripePaymentId: piId,
          stripeSessionId: s.id,
          paidAt: new Date(s.created * 1000).toISOString(),
          trackingNumber: '',
          notes: 'Synced from Stripe',
          createdAt: new Date(s.created * 1000).toISOString(),
        };

        store.orders.push(order);
        synced++;
      } catch (err) {
        console.error('Failed to sync session ' + s.id + ':', err.message);
        errors++;
      }
    }

    await db.saveOrders(store);

    return res.status(200).json({
      success: true,
      synced: synced,
      skipped: skipped,
      errors: errors,
      totalSessions: sessions.data.length,
      totalOrders: store.orders.length
    });
  } catch (err) {
    console.error('Stripe sync error:', err.message);
    return res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
};
