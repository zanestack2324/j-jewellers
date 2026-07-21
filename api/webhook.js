const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./_db');
const royalmail = require('./_royalmail');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Stripe webhook endpoint.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let rawBody;
  try {
    rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  } catch (err) {
    console.error('Failed to read request body');
    return res.status(400).json({ error: 'Bad request body' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Payment succeeded:', session.id);
        if (session.metadata && session.metadata.orderId) {
          try {
            const orders = await db.getOrders();
            const order = orders.submissions ? orders.submissions.find(o => o.id === session.metadata.orderId) : null;
            if (order) {
              order.status = 'paid';
              order.stripeSessionId = session.id;
              order.paidAt = new Date().toISOString();
              await db.saveOrders(orders);

              if (royalmail.isConfigured()) {
                try {
                  const rmResult = await royalmail.createOrder({
                    id: order.id,
                    items: order.items || [],
                    customerName: order.customerName || session.customer_details?.name || '',
                    customerEmail: order.customerEmail || session.customer_details?.email || '',
                    customerPhone: order.customerPhone || '',
                    shippingAddress: order.shippingAddress || {},
                  });
                  order.clickDropOrderId = rmResult && rmResult[0] ? rmResult[0].id : null;
                  order.clickDropStatus = 'created';
                  order.clickDropSyncedAt = new Date().toISOString();
                  await db.saveOrders(orders);
                  console.log('Click & Drop order created for order #' + order.id);
                } catch (rmErr) {
                  console.error('Click & Drop sync failed for order #' + order.id + ':', rmErr.message);
                  order.clickDropStatus = 'failed';
                  order.clickDropError = rmErr.message;
                  await db.saveOrders(orders);
                }
              }
            }
          } catch (e) { console.error('Failed to update order status'); }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        console.log('Payment failed:', event.data.object.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Error processing webhook event');
  }

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
