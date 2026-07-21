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
        console.log('checkout.session.completed:', session.id);

        const orderId = session.metadata && session.metadata.orderId ? parseInt(session.metadata.orderId) : null;

        if (!orderId) {
          console.error('No orderId in session metadata, attempting session lookup');
          // Try to find order by session ID
          const store = await db.getOrders();
          const order = store.orders.find(o => o.stripeSessionId === session.id);
          if (order) {
            await finalizeOrder(order, session, store);
          } else {
            console.error('Could not find order for session ' + session.id);
          }
          break;
        }

        const store = await db.getOrders();
        const order = store.orders.find(o => o.id === orderId);
        if (!order) {
          console.error('Order #' + orderId + ' not found in database');
          break;
        }

        await finalizeOrder(order, session, store);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        console.log('payment_intent.succeeded:', pi.id);

        const piOrderId = pi.metadata && pi.metadata.orderId ? parseInt(pi.metadata.orderId) : null;
        if (piOrderId) {
          const store = await db.getOrders();
          const order = store.orders.find(o => o.id === piOrderId);
          if (order && order.status === 'pending') {
            order.status = 'paid';
            order.stripePaymentId = pi.id;
            order.paidAt = new Date().toISOString();
            if (pi.receipt_email) order.customerEmail = order.customerEmail || pi.receipt_email;
            if (pi.shipping?.name) order.customerName = order.customerName === 'Pending' ? pi.shipping.name : order.customerName;
            if (pi.amount) order.total = pi.amount / 100;
            await db.saveOrders(store);
            console.log('Order #' + piOrderId + ' updated via payment_intent.succeeded');
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.log('payment_intent.payment_failed:', pi.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Error processing webhook event:', err.message, err.stack);
  }

  return res.status(200).json({ received: true });
};

async function finalizeOrder(order, session, store) {
  // Update order with payment details
  order.status = 'paid';
  order.stripePaymentId = session.payment_intent || '';
  order.stripeSessionId = session.id;
  order.paidAt = new Date().toISOString();

  // Pull customer details from Stripe
  if (session.customer_details) {
    if (session.customer_details.name) order.customerName = session.customer_details.name;
    if (session.customer_details.email) order.customerEmail = session.customer_details.email;
    if (session.customer_details.phone) order.customerPhone = session.customer_details.phone;
  }

  // Pull shipping address from Stripe
  if (session.customer_details && session.customer_details.address) {
    const a = session.customer_details.address;
    order.shippingAddress = {
      line1: a.line1 || '',
      line2: a.line2 || '',
      city: a.city || '',
      state: a.state || '',
      postalCode: a.postal_code || '',
      country: a.country || 'GB',
      countryCode: a.country || 'GB',
    };
    order.shippingAddressText = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
  } else if (session.shipping_details && session.shipping_details.address) {
    const a = session.shipping_details.address;
    order.shippingAddress = {
      line1: a.line1 || '',
      line2: a.line2 || '',
      city: a.city || '',
      state: a.state || '',
      postalCode: a.postal_code || '',
      country: a.country || 'GB',
      countryCode: a.country || 'GB',
    };
    order.shippingAddressText = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ');
    if (session.shipping_details.name) order.customerName = session.shipping_details.name;
  }

  // Calculate total from Stripe
  if (session.amount_total) {
    order.total = session.amount_total / 100;
  }
  if (session.shipping_cost && session.shipping_cost.amount_total) {
    order.shippingCost = session.shipping_cost.amount_total / 100;
    order.subtotal = order.total - order.shippingCost;
  }

  await db.saveOrders(store);
  console.log('Order #' + order.id + ' marked as paid');

  // Send confirmation email
  try {
    await sendOrderConfirmation(order);
  } catch (emailErr) {
    console.error('Email failed for order #' + order.id + ':', emailErr.message);
  }

  // Create Royal Mail Click & Drop order
  if (royalmail.isConfigured()) {
    try {
      const rmResult = await royalmail.createOrder({
        id: order.id,
        items: order.items || [],
        customerName: order.customerName || '',
        customerEmail: order.customerEmail || '',
        customerPhone: order.customerPhone || '',
        shippingAddress: order.shippingAddress || {},
      });
      order.clickDropOrderId = rmResult && rmResult[0] ? rmResult[0].id : null;
      order.clickDropStatus = 'created';
      order.clickDropSyncedAt = new Date().toISOString();
      await db.saveOrders(store);
      console.log('Click & Drop order created for order #' + order.id);
    } catch (rmErr) {
      console.error('Click & Drop sync failed for order #' + order.id + ':', rmErr.message);
      order.clickDropStatus = 'failed';
      order.clickDropError = rmErr.message;
      await db.saveOrders(store);
    }
  }

  // Also save/update customer record
  try {
    await saveCustomerRecord(order);
  } catch (custErr) {
    console.error('Customer save failed for order #' + order.id + ':', custErr.message);
  }
}

async function sendOrderConfirmation(order) {
  const customerEmail = order.customerEmail;
  if (!customerEmail) {
    console.log('No email for order #' + order.id + ', skipping email');
    return;
  }

  // Use Stripe invoice/receipt email if available
  // Also try to send via any configured email service
  const emailService = process.env.EMAIL_SERVICE || '';
  const apiKey = process.env.EMAIL_API_KEY || '';

  if (emailService === 'resend' && apiKey) {
    // Send via Resend API
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'J Jewellers <orders@jjeweller.com>',
        to: [customerEmail],
        subject: 'Order Confirmation - Order #' + order.id,
        html: buildEmailHTML(order),
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('Resend API error: ' + errText);
    }
    console.log('Confirmation email sent via Resend for order #' + order.id);
  } else if (emailService === 'sendgrid' && apiKey) {
    // Send via SendGrid API
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: customerEmail }] }],
        from: { email: process.env.EMAIL_FROM || 'orders@jjeweller.com', name: 'J Jewellers' },
        subject: 'Order Confirmation - Order #' + order.id,
        content: [{ type: 'text/html', value: buildEmailHTML(order) }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('SendGrid API error: ' + errText);
    }
    console.log('Confirmation email sent via SendGrid for order #' + order.id);
  } else {
    console.log('No email service configured (set EMAIL_SERVICE and EMAIL_API_KEY in Vercel). Order #' + order.id + ' email skipped.');
  }
}

function buildEmailHTML(order) {
  const items = (order.items || []).map(item => {
    const variant = item.variant ? ' (' + item.variant + ')' : '';
    return '<tr><td style="padding:10px;border-bottom:1px solid #eee;">' + item.name + variant + '</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">' + item.qty + '</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">\u00A3' + (item.price * item.qty).toFixed(2) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">' +
    '<div style="text-align:center;padding:20px 0;border-bottom:3px solid #0D8B8B;"><h1 style="color:#0D8B8B;margin:0;">J JEWELLERS</h1><p style="color:#888;margin:5px 0 0;">Order Confirmation</p></div>' +
    '<div style="padding:20px 0;"><p>Hi ' + (order.customerName || 'Customer') + ',</p><p>Thank you for your order! Here are your order details:</p>' +
    '<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0;"><p><strong>Order Number:</strong> #' + order.id + '</p><p><strong>Date:</strong> ' + new Date(order.createdAt).toLocaleDateString('en-GB') + '</p></div>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr style="background:#0D8B8B;color:white;"><th style="padding:10px;text-align:left;">Item</th><th style="padding:10px;text-align:center;">Qty</th><th style="padding:10px;text-align:right;">Price</th></tr></thead><tbody>' + items + '</tbody></table>' +
    '<div style="text-align:right;padding:10px 0;"><p>Subtotal: \u00A3' + (order.subtotal || 0).toFixed(2) + '</p><p>Shipping: \u00A3' + (order.shippingCost || 0).toFixed(2) + '</p><p style="font-size:1.2em;font-weight:bold;color:#0D8B8B;">Total: \u00A3' + (order.total || 0).toFixed(2) + '</p></div>' +
    (order.shippingAddressText ? '<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0;"><p><strong>Shipping Address:</strong></p><p>' + order.shippingAddressText + '</p></div>' : (order.shippingAddress && typeof order.shippingAddress === 'object' ? '<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0;"><p><strong>Shipping Address:</strong></p><p>' + [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.postalCode, order.shippingAddress.country].filter(Boolean).join(', ') + '</p></div>' : '')) +
    '<p style="color:#888;font-size:0.9em;margin-top:30px;">If you have any questions, please contact us at support@jjeweller.com</p>' +
    '<div style="text-align:center;padding:20px 0;border-top:1px solid #eee;color:#888;font-size:0.8em;"><p>&copy; ' + new Date().getFullYear() + ' J Jewellers. All rights reserved.</p></div></div></body></html>';
}

async function saveCustomerRecord(order) {
  if (!order.customerEmail && !order.customerName) return;
  const store = await db.getCustomers();
  if (!store.customers) store.customers = [];

  // Find existing customer by email
  let customer = store.customers.find(c => c.email === order.customerEmail && order.customerEmail);

  if (!customer) {
    customer = {
      id: store.nextId,
      name: order.customerName || 'Unknown',
      email: order.customerEmail || '',
      phone: order.customerPhone || '',
      address: order.shippingAddress || '',
      totalOrders: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
    };
    store.customers.push(customer);
    store.nextId = (store.nextId || 1) + 1;
  }

  customer.totalOrders = (customer.totalOrders || 0) + 1;
  customer.totalSpent = (customer.totalSpent || 0) + (order.total || 0);
  customer.lastOrderAt = new Date().toISOString();
  if (order.customerName) customer.name = order.customerName;
  if (order.shippingAddressText) customer.address = order.shippingAddressText;
  else if (order.shippingAddress && typeof order.shippingAddress === 'object') {
    customer.address = [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.postalCode, order.shippingAddress.country].filter(Boolean).join(', ');
  }

  await db.saveCustomers(store);
}

module.exports.config = {
  api: {
    bodyParser: false
  }
};
