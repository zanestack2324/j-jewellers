const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SHIPPING_FILE = path.join(DATA_DIR, 'shipping.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

let redis = null;
function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url, token });
    return redis;
  } catch { return null; }
}

function readJsonFile(filePath, fallback) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return fallback;
}

function writeJsonFile(filePath, data) {
  try { writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

async function getData(key, file, fallback) {
  const r = getRedis();
  if (r) {
    try {
      const cached = await r.get('jj:' + key);
      if (cached) return cached;
      const fileData = readJsonFile(file, fallback);
      await r.set('jj:' + key, fileData);
      return fileData;
    } catch {}
  }
  return readJsonFile(file, fallback);
}

async function setData(key, file, fallback, data) {
  const r = getRedis();
  if (r) {
    try { await r.set('jj:' + key, data); } catch {}
  }
  writeJsonFile(file, data);
  return data;
}

module.exports = {
  async getProducts() {
    return getData('products', PRODUCTS_FILE, { products: [], nextId: 1 });
  },
  async saveProducts(store) {
    return setData('products', PRODUCTS_FILE, { products: [], nextId: 1 }, store);
  },
  async getSettings() {
    return getData('settings', SETTINGS_FILE, null);
  },
  async saveSettings(data) {
    return setData('settings', SETTINGS_FILE, null, data);
  },
  async getShipping() {
    return getData('shipping', SHIPPING_FILE, { zones: [], countryToZone: {}, allowedCountries: [] });
  },
  async saveShipping(data) {
    return setData('shipping', SHIPPING_FILE, { zones: [], countryToZone: {}, allowedCountries: [] }, data);
  },
  async getOrders() {
    return getData('orders', ORDERS_FILE, { orders: [], nextId: 3 });
  },
  async saveOrders(store) {
    return setData('orders', ORDERS_FILE, { orders: [], nextId: 3 }, store);
  },
  async getCustomers() {
    return getData('customers', CUSTOMERS_FILE, { customers: [], nextId: 5 });
  },
  async saveCustomers(store) {
    return setData('customers', CUSTOMERS_FILE, { customers: [], nextId: 5 }, store);
  },
  async getCoupons() {
    return getData('coupons', COUPONS_FILE, { coupons: [], nextId: 3 });
  },
  async saveCoupons(store) {
    return setData('coupons', COUPONS_FILE, { coupons: [], nextId: 3 }, store);
  },
  async getReviews() {
    return getData('reviews', REVIEWS_FILE, { reviews: [], nextId: 5 });
  },
  async saveReviews(store) {
    return setData('reviews', REVIEWS_FILE, { reviews: [], nextId: 5 }, store);
  },
  async getContacts() {
    return getData('contacts', CONTACTS_FILE, { submissions: [] });
  },
  async saveContacts(store) {
    return setData('contacts', CONTACTS_FILE, { submissions: [] }, store);
  },
  async getContent() {
    return getData('content', CONTENT_FILE, null);
  },
  async saveContent(data) {
    return setData('content', CONTENT_FILE, null, data);
  }
};
