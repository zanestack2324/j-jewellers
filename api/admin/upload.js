const { authenticate, setCors } = require('./_auth');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!req.body) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Support bulk upload: { images: [base64, base64, ...] }
    if (req.body.images && Array.isArray(req.body.images)) {
      const results = [];
      for (const imageData of req.body.images) {
        if (!imageData || !imageData.startsWith('data:image/')) {
          results.push({ error: 'Invalid image format' });
          continue;
        }
        const sizeInBytes = Math.round((imageData.length * 3) / 4);
        if (sizeInBytes > 4 * 1024 * 1024) {
          results.push({ error: 'Image too large (max 4MB)' });
          continue;
        }
        results.push({ success: true, url: imageData });
      }
      return res.status(200).json({ success: true, results });
    }

    // Single image: { image: base64 }
    const imageData = req.body.image;
    if (!imageData || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const sizeInBytes = Math.round((imageData.length * 3) / 4);
    if (sizeInBytes > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 4MB)' });
    }

    return res.status(200).json({ success: true, url: imageData });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

module.exports.config = {
  api: {
    bodyParser: { sizeLimit: '10mb' }
  }
};
