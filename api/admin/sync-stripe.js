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
    const store = await db.getOrders();
    const existingBySessionId = {};
    const existingByPaymentId = {};
    for (const o of store.orders) {
      if (o.stripeSessionId) existingBySessionId[o.stripeSessionId] = o;
      if (o.stripePaymentId) existingByPaymentId[o.stripePaymentId] = o;
    }

    let updated = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;

    const sessions = await stripe.checkout.sessions.list({ limit: 100 });

    for (const s of sessions.data) {
      if (s.payment_status !== 'paid') { skipped++; continue; }

      const piId = s.payment_intent || '';

      // Check if order already exists
      let existingOrder = existingBySessionId[s.id];
      if (!existingOrder && piId) existingOrder = existingByPaymentId[piId];

      if (existingOrder) {
        // UPDATE existing order with correct Stripe data
        try {
          const needsUpdate = existingOrder.status === 'pending' ||
            (existingOrder.total || 0) !== (s.amount_total ? s.amount_total / 100 : existingOrder.total);

          if (needsUpdate) {
            existingOrder.status = 'paid';
            if (piId) existingOrder.stripePaymentId = piId;
            existingOrder.stripeSessionId = s.id;
            existingOrder.paidAt = new Date(s.created * 1000).toISOString();

            if (s.customer_details?.name) existingOrder.customerName = s.customer_details.name;
            if (s.customer_details?.email) existingOrder.customerEmail = s.customer_details.email || existingOrder.customerEmail;
            if (s.customer_details?.phone) existingOrder.customerPhone = s.customer_details.phone || existingOrder.customerPhone;

            const addr = s.customer_details?.address || s.shipping_details?.address;
            if (addr) {
              existingOrder.shippingAddress = {
                line1: addr.line1 || '', line2: addr.line2 || '',
                city: addr.city || '', state: addr.state || '',
                postalCode: addr.postal_code || '', country: addr.country || 'GB',
                countryCode: addr.country || 'GB',
              };
              existingOrder.shippingAddressText = [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', ');
            }

            if (s.amount_total) existingOrder.total = s.amount_total / 100;
            if (s.amount_subtotal) existingOrder.subtotal = s.amount_subtotal / 100;
            if (s.shipping_cost?.amount_total) existingOrder.shippingCost = s.shipping_cost.amount_total / 100;

            updated++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error('Failed to update order for session ' + s.id + ':', err.message);
          errors++;
        }
      } else {
        // CREATE new order from Stripe data
        try {
          const orderId = store.nextId;
          store.nextId = orderId + 1;

          const addr = s.customer_details?.address || s.shipping_details?.address || {};
          const shippingAddress = {
            line1: addr.line1 || '', line2: addr.line2 || '',
            city: addr.city || '', state: addr.state || '',
            postalCode: addr.postal_code || '', country: addr.country || 'GB',
            countryCode: addr.country || 'GB',
          };

          const order = {
            id: orderId,
            customerName: s.customer_details?.name || s.shipping_details?.name || 'Stripe Customer',
            customerEmail: s.customer_details?.email || '',
            customerPhone: s.customer_details?.phone || '',
            shippingAddress: shippingAddress,
            shippingAddressText: [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', '),
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
          existingBySessionId[s.id] = order;
          if (piId) existingByPaymentId[piId] = order;
          created++;
        } catch (err) {
          console.error('Failed to create order for session ' + s.id + ':', err.message);
          errors++;
        }
      }
    }

    await db.saveOrders(store);

    return res.status(200).json({
      success: true,
      updated: updated,
      created: created,
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
