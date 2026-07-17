const { authenticate, setCors } = require('./_auth');
const github = require('../_github');

function compressImage(base64Data, maxDimension) {
  return new Promise((resolve) => {
    try {
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return resolve({ raw: base64Data, ext: 'jpg' });
      const ext = matches[1] === 'png' ? 'png' : 'jpg';
      const buffer = Buffer.from(matches[2], 'base64');
      if (buffer.length < 200 * 1024) return resolve({ raw: matches[2], ext: ext });
      const sharp = require('sharp');
      sharp(buffer)
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
        .then(out => resolve({ raw: out.toString('base64'), ext: 'jpg' }))
        .catch(() => resolve({ raw: matches[2], ext: ext }));
    } catch { resolve({ raw: base64Data, ext: 'jpg' }); }
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authenticate(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!github.isConfigured()) {
    return res.status(200).json({ error: 'GitHub not configured. Set GITHUB_TOKEN env var.', configured: false });
  }

  try {
    if (!req.body) return res.status(400).json({ error: 'No image provided' });

    if (req.body._check) {
      return res.status(200).json({ success: true, configured: true });
    }

    const imageData = req.body.image;
    const productName = req.body.name || 'product';
    if (!imageData || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const { raw, ext } = await compressImage(imageData, 800);
    const sizeKB = Math.round(raw.length * 3 / 4 / 1024);
    if (sizeKB > 2500) {
      return res.status(400).json({ error: 'Image too large (' + sizeKB + 'KB). Max 2.5MB after compression.' });
    }

    const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const timestamp = Date.now();
    const filePath = 'uploads/products/' + slug + '-' + timestamp + '.' + ext;

    await github.createOrUpdateBinary(
      filePath,
      raw,
      'Upload product image: ' + productName
    );

    return res.status(200).json({ success: true, url: filePath, sizeKB: sizeKB });
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
