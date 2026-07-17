const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

const DEFAULT_CONTENT = {
  banners: [
    { id: 1, title: 'Hero Banner', image: 'HERO.png', headline: 'Look Boujee On A Budget', subtitle: 'Handcrafted luxury jewellery', active: true, link: '/' },
    { id: 2, title: 'Shipping Banner', image: '', headline: 'Free Worldwide Shipping', subtitle: 'On all orders', active: true, link: '' }
  ],
  homepage: {
    heroHeading: 'Look Boujee On A Budget',
    heroSubtext: 'Elevate your style with handcrafted luxury jewellery that speaks volumes without breaking the bank.',
    philosophy: 'Statement Jewellery for Everyday Style and Confidence',
    collections: [
      { name: 'Long Mala Sets', image: 'products/Long Mala Sets/Long mala sets/EE2EA028-493C-4DFF-ABD2-9BCC44337C6D.png', description: 'Regal heritage necklaces' },
      { name: 'Choker Sets', image: 'products/Choker Sets/Choker sets/Stone choker sets £40/E823B3C8-F36A-48DB-97E1-9E3C62B1F341.png', description: 'Bold & contemporary' },
      { name: 'Earrings', image: 'products/Earrings/Earrings/Mini Jhumki Earrings/B620C58D-FE2B-474D-96B5-A2C0040BDF50.png', description: 'Statement drops & jhumkas' }
    ],
    stats: { customers: 5000, designs: 200, cities: 50, satisfaction: 100 }
  },
  meta: {
    title: 'J JEWELLERS – Look Boujee On A Budget',
    description: 'Discover handcrafted luxury jewellery at unbeatable prices.',
    keywords: 'gold jewellery, bridal jewellery, choker set, bangles, earrings'
  }
};

function getNested(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    current = current[key];
  }
  return current;
}

function setNested(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
    if (!Object.prototype.hasOwnProperty.call(current, key) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey === '__proto__' || lastKey === 'constructor' || lastKey === 'prototype') return;
  current[lastKey] = value;
}

module.exports = async (req, res) => {
  setCors(res, req.headers.origin);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const saved = await db.getContent();
  const content = saved || JSON.parse(JSON.stringify(DEFAULT_CONTENT));

  if (req.method === 'GET') {
    const { section } = req.query;
    if (section) {
      const result = getNested(content, section);
      if (result === undefined) return res.status(404).json({ error: 'Section not found' });
      return res.status(200).json(result);
    }
    return res.status(200).json(content);
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const { section } = req.query;
    const allowedSections = ['hero', 'collections', 'essence', 'testimonials', 'gallery', 'newsletter', 'footer', 'announcement'];
    if (section && !allowedSections.includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    if (section && data.value !== undefined) {
      setNested(content, section, data.value);
      await db.saveContent(content);
    }
    return res.status(200).json(content);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
