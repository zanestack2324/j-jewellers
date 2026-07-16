const { authenticate, setCors } = require('./_auth');
const db = require('../_db');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const shipping = await db.getShipping();
      return res.status(200).json(shipping);
    } catch (err) {
      return res.status(200).json({ zones: [], countryToZone: {}, allowedCountries: [] });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
