const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SHIPPING_FILE = path.join(DATA_DIR, 'shipping.json');

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
  }
};
