const CLICK_DROP_BASE = 'https://api.parcel.royalmail.com/api/v1';

function getApiKey() {
  return process.env.ROYAL_MAIL_API_KEY || '';
}

function isConfigured() {
  return !!getApiKey();
}

async function clickDropRequest(method, path, body) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Royal Mail API key not configured');

  const opts = {
    method,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(CLICK_DROP_BASE + path, opts);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!resp.ok) {
    const msg = data.message || data.error || resp.statusText || 'Royal Mail API error';
    throw new Error(msg + ' (' + resp.status + ')');
  }
  return data;
}

async function createOrder(order) {
  const items = order.items || [];
  const products = items.map(function(item) {
    return {
      name: item.name || 'Item',
      SKU: item.sku || '',
      quantity: item.qty || 1,
      unitValue: item.price || 0,
      unitWeightInGrams: item.weightGrams || 100,
      customsDescription: item.name || 'Jewellery',
      customsCode: item.customsCode || '7113',
      originCountryCode: 'GBR',
    };
  });

  const totalWeight = items.reduce(function(sum, item) {
    return sum + (item.weightGrams || 100) * (item.qty || 1);
  }, 0);

  const recipient = order.shippingAddress || {};

  const rmOrder = {
    recipient: {
      address: {
        recipientName: recipient.name || order.customerName || 'Customer',
        addressLine1: recipient.line1 || recipient.address || '',
        addressLine2: recipient.line2 || '',
        city: recipient.city || recipient.town || '',
        county: recipient.county || recipient.state || '',
        postcode: recipient.postalCode || recipient.postcode || '',
        countryCode: recipient.countryCode || mapCountryToCode(recipient.country) || 'GB',
      },
      email: order.customerEmail || '',
      phone: order.customerPhone || '',
    },
    sender: {
      address: {
        recipientName: 'J Jewellers',
        addressLine1: 'United Kingdom',
        countryCode: 'GB',
      },
    },
    orderReference: 'JJ-' + (order.id || Date.now()),
    parcels: [{
      weightInGrams: totalWeight || 200,
      packageFormatIdentifier: 'Parcel',
      contents: products,
    }],
  };

  return clickDropRequest('POST', '/Orders', [rmOrder]);
}

async function getOrderStatus(orderReference) {
  try {
    const data = await clickDropRequest('GET', '/Orders?orderReference=' + encodeURIComponent(orderReference));
    return data;
  } catch {
    return null;
  }
}

async function getLabels(orderId) {
  return clickDropRequest('GET', '/Orders/' + orderId + '/labels');
}

function mapCountryToCode(country) {
  if (!country) return 'GB';
  var c = country.toUpperCase().trim();
  var map = {
    'UNITED KINGDOM': 'GB', 'UK': 'GB', 'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB', 'SCOTLAND': 'GB', 'WALES': 'GB',
    'UNITED STATES': 'US', 'USA': 'US', 'UNITED STATES OF AMERICA': 'US',
    'CANADA': 'CA', 'AUSTRALIA': 'AU', 'NEW ZEALAND': 'NZ',
    'FRANCE': 'FR', 'GERMANY': 'DE', 'SPAIN': 'ES', 'ITALY': 'IT', 'NETHERLANDS': 'NL',
    'BELGIUM': 'BE', 'PORTUGAL': 'PT', 'IRELAND': 'IE', 'REPUBLIC OF IRELAND': 'IE',
    'INDIA': 'IN', 'PAKISTAN': 'PK', 'BANGLADESH': 'BD', 'SRI LANKA': 'LK',
    'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE', 'SAUDI ARABIA': 'SA',
    'JAPAN': 'JP', 'CHINA': 'CN', 'SOUTH KOREA': 'KR', 'SINGAPORE': 'SG',
    'THAILAND': 'TH', 'MALAYSIA': 'MY', 'PHILIPPINES': 'PH', 'INDONESIA': 'ID',
    'SOUTH AFRICA': 'ZA', 'BRAZIL': 'BR', 'MEXICO': 'MX', 'ARGENTINA': 'AR',
    'NORWAY': 'NO', 'SWEDEN': 'SE', 'DENMARK': 'DK', 'FINLAND': 'FI',
    'SWITZERLAND': 'CH', 'AUSTRIA': 'AT', 'POLAND': 'PL', 'CZECH REPUBLIC': 'CZ',
    'GREECE': 'GR', 'TURKEY': 'TR', 'ISRAEL': 'IL', 'EGYPT': 'EG',
  };
  return map[c] || c.substring(0, 2);
}

module.exports = { isConfigured, createOrder, getOrderStatus, getLabels, mapCountryToCode };
