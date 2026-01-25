import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { extract } from '@extractus/article-extractor';

const app = express();

// Security: Configure CORS with specific options
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 3600
}));

// Security: Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '10kb' }));

// Simple in-memory rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  const record = rateLimitMap.get(ip);

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests, please try again later' });
  }

  record.count++;
  next();
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 300000);

app.use(rateLimit);

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

  // Only allow http and https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    return { valid: false, error: 'Local URLs are not allowed' };
  }

  // Block private IP ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return { valid: false, error: 'Private IP addresses are not allowed' };
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: 'Private IP addresses are not allowed' };
    // 192.168.0.0/16
    if (a === 192 && b === 168) return { valid: false, error: 'Private IP addresses are not allowed' };
    // 169.254.0.0/16 (link-local, includes cloud metadata)
    if (a === 169 && b === 254) return { valid: false, error: 'Link-local addresses are not allowed' };
    // 0.0.0.0
    if (a === 0) return { valid: false, error: 'Invalid IP address' };
  }

  // Block cloud metadata endpoints
  const blockedHosts = ['metadata.google.internal', 'metadata.goog'];
  if (blockedHosts.includes(hostname)) {
    return { valid: false, error: 'Metadata endpoints are not allowed' };
  }

  return { valid: true };
}

app.post('/api/parse-feed', async (req, res) => {
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
});

app.post('/api/fetch-article', async (req, res) => {
  try {
    const { url } = req.body;

    const validation = isValidExternalUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const article = await extract(url);
    
    if (!article) {
      throw new Error('Failed to extract article content');
    }

    res.json({
      content: article.content || '',
      title: article.title,
      published: article.published
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Failed to fetch article content' });
  }
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 