const { authenticate, setCors } = require('./_auth');
const db = require('../_db');
const royalmail = require('../_royalmail');

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const shipping = await db.getShipping();
      const orders = await db.getOrders();
      const orderList = orders.orders || [];
      const synced = orderList.filter(o => o.clickDropOrderId).length;
      const failed = orderList.filter(o => o.clickDropStatus === 'failed').length;
      const pending = orderList.filter(o => o.status === 'paid' && !o.clickDropOrderId && !o.clickDropStatus).length;

      return res.status(200).json({
        ...shipping,
        clickDrop: {
          configured: royalmail.isConfigured(),
          synced,
          failed,
          pending,
        },
      });
    } catch (err) {
      return res.status(200).json({ zones: [], countryToZone: {}, allowedCountries: [], clickDrop: { configured: false, synced: 0, failed: 0, pending: 0 } });
    }
  }

  if (req.method === 'POST') {
    const { action, orderId } = req.body || {};

    if (action === 'sync' && orderId) {
      if (!royalmail.isConfigured()) {
        return res.status(400).json({ error: 'Royal Mail API key not configured' });
      }
      try {
        const orders = await db.getOrders();
        const order = (orders.orders || []).find(o => o.id === orderId);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.shippingAddress || !order.shippingAddress.line1) {
          return res.status(400).json({ error: 'Order has no shipping address' });
        }

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
        order.clickDropError = '';
        await db.saveOrders(orders);

        return res.status(200).json({ success: true, clickDropOrderId: order.clickDropOrderId });
      } catch (err) {
        try {
          const orders = await db.getOrders();
          const order = (orders.orders || []).find(o => o.id === orderId);
          if (order) {
            order.clickDropStatus = 'failed';
            order.clickDropError = err.message;
            await db.saveOrders(orders);
          }
        } catch {}
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'syncAll') {
      if (!royalmail.isConfigured()) {
        return res.status(400).json({ error: 'Royal Mail API key not configured' });
      }
      try {
        const orders = await db.getOrders();
        const orderList = orders.orders || [];
        const toSync = orderList.filter(o => o.status === 'paid' && !o.clickDropOrderId && o.shippingAddress && o.shippingAddress.line1);
        let synced = 0, failed = 0;

        for (const order of toSync) {
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
            order.clickDropError = '';
            synced++;
          } catch (err) {
            order.clickDropStatus = 'failed';
            order.clickDropError = err.message;
            failed++;
          }
        }

        await db.saveOrders(orders);
        return res.status(200).json({ success: true, synced, failed, total: toSync.length });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
