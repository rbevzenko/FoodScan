/**
 * Server-side proxy for DLC (dlc.mpg.de) IIIF images.
 *
 * The DLC image server returns an HTML bot-protection challenge for cross-origin
 * browser requests, so images cannot be loaded directly via img.src from external
 * sites.  This endpoint fetches the image server-side (no browser CORS restriction)
 * and streams it back with permissive CORS headers.
 *
 * Usage: GET /api/dlc-image?url=https://dlc.mpg.de/api/v2/records/.../default.jpg
 */
export default async function handler(req, res) {
  // Allow cross-origin requests (needed for the gothic-reader on github.io)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  // Security: only proxy dlc.mpg.de image URLs
  if (
    !url ||
    typeof url !== 'string' ||
    !/^https:\/\/dlc\.mpg\.de\//.test(url)
  ) {
    return res.status(400).json({ error: 'Invalid or missing url parameter' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        // Present ourselves as a normal browser to satisfy bot-protection checks
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://dlc.mpg.de/',
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Upstream returned ${upstream.status}`,
      });
    }

    const contentType = upstream.headers.get('Content-Type') || '';
    if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      // Upstream returned something that isn't an image (e.g. bot challenge HTML)
      return res.status(502).json({
        error: 'Upstream did not return an image',
        contentType,
      });
    }

    // Stream the image back
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
