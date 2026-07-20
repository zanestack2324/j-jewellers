module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  return res.status(200).json({ stripePublishableKey: pk });
};
