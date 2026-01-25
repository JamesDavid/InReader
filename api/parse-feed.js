import Parser from 'rss-parser';

const parser = new Parser();

// URL validation to prevent SSRF attacks
function isValidExternalUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    return { valid: false, error: 'Local URLs are not allowed' };
  }

  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (a === 10) return { valid: false, error: 'Private IP addresses are not allowed' };
    if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: 'Private IP addresses are not allowed' };
    if (a === 192 && b === 168) return { valid: false, error: 'Private IP addresses are not allowed' };
    if (a === 169 && b === 254) return { valid: false, error: 'Link-local addresses are not allowed' };
    if (a === 0) return { valid: false, error: 'Invalid IP address' };
  }

  const blockedHosts = ['metadata.google.internal', 'metadata.goog'];
  if (blockedHosts.includes(hostname)) {
    return { valid: false, error: 'Metadata endpoints are not allowed' };
  }

  return { valid: true };
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    const validation = isValidExternalUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const feed = await parser.parseURL(url);
    res.json({
      title: feed.title,
      items: feed.items.map(item => ({
        title: item.title,
        content: item.content || item.contentSnippet || '',
        link: item.link,
        pubDate: item.pubDate || item.isoDate
      }))
    });
  } catch (error) {
    console.error('Error parsing feed:', error);
    res.status(500).json({ error: 'Failed to parse feed' });
  }
}
