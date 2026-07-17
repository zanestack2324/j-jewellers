const db = require('./_db');

module.exports = async (req, res) => {
  const ALLOWED_ORIGINS = ['https://jjeweller.com', 'https://j-jewellers-six.vercel.app'];
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://jjeweller.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const shipping = await db.getShipping();

    const country = (req.query.country || '').toUpperCase();
    if (!country) {
      return res.status(200).json({
        zones: shipping.zones,
        allowedCountries: shipping.allowedCountries
      });
    }

    const zoneId = shipping.countryToZone[country];
    if (!zoneId) {
      return res.status(400).json({
        error: 'Unsupported country',
        country: country,
        zones: shipping.zones,
        allowedCountries: shipping.allowedCountries
      });
    }

    const zone = shipping.zones.find(function(z) { return z.id === zoneId; });
    if (!zone) {
      return res.status(404).json({ error: 'Zone not found', country: country });
    }

    return res.status(200).json({
      country: country,
      zone: zone.id,
      zoneName: zone.name,
      rate: zone.rate,
      currency: shipping.currency,
      deliveryEstimate: zone.deliveryEstimate,
      description: zone.description,
      service: shipping.service
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load shipping rates', rate: 0 });
  }
};
