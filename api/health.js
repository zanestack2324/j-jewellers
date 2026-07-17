const startTime = Date.now();

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
};
