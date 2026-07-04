import Parser from 'rss-parser';
import { safeFetchText } from './_lib/urlSecurity.js';

const parser = new Parser();

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

    // SSRF-safe fetch (validates + resolves the URL, re-validates redirects,
    // enforces a timeout and a size cap) then parse the XML text.
    const xml = await safeFetchText(url);
    const feed = await parser.parseString(xml);
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
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to parse feed' });
  }
}
