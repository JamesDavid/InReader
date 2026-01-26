import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { extract } from '@extractus/article-extractor';

const app = express();

// Trust proxy - needed when running behind nginx to get real client IPs
app.set('trust proxy', true);

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

// Increase limit for Ollama proxy requests which include full article content
app.use(express.json({ limit: '5mb' }));

// Simple in-memory rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 requests per minute per client

function rateLimit(req, res, next) {
  // Skip rate limiting for AI proxies (have their own natural throttling / rate limits)
  if (req.path.startsWith('/api/ollama') || req.path.startsWith('/api/openai') || req.path.startsWith('/api/anthropic')) {
    return next();
  }

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

// Ollama proxy validation - allows local network IPs for Ollama
function isValidOllamaUrl(urlString) {
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

  // Block cloud metadata endpoints
  const blockedHosts = ['metadata.google.internal', 'metadata.goog'];
  if (blockedHosts.includes(hostname)) {
    return { valid: false, error: 'Metadata endpoints are not allowed' };
  }

  // Allow localhost, private IPs for Ollama (user's LAN server)
  return { valid: true };
}

// Ollama proxy endpoint - proxies requests to user's Ollama server
app.post('/api/ollama/proxy', async (req, res) => {
  try {
    const { targetUrl, method = 'GET', body } = req.body;

    console.log('Ollama proxy request:', { targetUrl, method, stream: body?.stream });

    const validation = isValidOllamaUrl(targetUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama server error:', response.status, errorText);
      return res.status(response.status).json({ error: `Ollama error: ${errorText}` });
    }

    // Check if this is a streaming response
    if (body?.stream && response.body) {
      // Forward streaming response
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (error) {
        console.error('Streaming error:', error);
        reader.cancel();
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming error' });
        }
      }
    } else {
      // Non-streaming response
      const data = await response.json();
      console.log('Ollama proxy response received, has response:', !!data.response);
      res.json(data);
    }
  } catch (error) {
    console.error('Ollama proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Ollama server: ' + error.message });
  }
});

// OpenAI proxy endpoint - forwards to OpenAI API, normalizes streaming to NDJSON
app.post('/api/openai/proxy', async (req, res) => {
  try {
    const { apiKey, model, messages, stream, max_tokens } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!model) return res.status(400).json({ error: 'Model is required' });

    const requestBody = { model, messages, stream: Boolean(stream) };
    if (max_tokens) requestBody.max_tokens = max_tokens;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ error: `OpenAI error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize OpenAI SSE to NDJSON {"response":"token"} format
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                res.write(JSON.stringify({ response: content }) + '\n');
              }
            } catch (e) {
              // ignore partial JSON
            }
          }
        }
        res.end();
      } catch (error) {
        console.error('OpenAI streaming error:', error);
        reader.cancel();
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming error' });
        }
      }
    } else {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      res.json({ response: content });
    }
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to OpenAI: ' + error.message });
  }
});

// Anthropic proxy endpoint - forwards to Anthropic API, normalizes streaming to NDJSON
app.post('/api/anthropic/proxy', async (req, res) => {
  try {
    const { apiKey, model, messages, stream, system, max_tokens } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!model) return res.status(400).json({ error: 'Model is required' });

    const requestBody = {
      model,
      messages,
      max_tokens: max_tokens || 4096,
      stream: Boolean(stream)
    };
    if (system) requestBody.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: `Anthropic error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize Anthropic SSE to NDJSON {"response":"token"} format
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                res.write(JSON.stringify({ response: json.delta.text }) + '\n');
              }
            } catch (e) {
              // ignore partial JSON
            }
          }
        }
        res.end();
      } catch (error) {
        console.error('Anthropic streaming error:', error);
        reader.cancel();
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming error' });
        }
      }
    } else {
      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      res.json({ response: content });
    }
  } catch (error) {
    console.error('Anthropic proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Anthropic: ' + error.message });
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