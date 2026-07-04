import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import { extractFromHtml } from '@extractus/article-extractor';
import {
  validateUrl,
  safeFetch,
  safeFetchText,
  readCappedText,
  MAX_RESPONSE_BYTES,
  FETCH_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
} from './api/_lib/urlSecurity.js';

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

// fetch() with an abort timeout, for the fixed-host AI provider proxies.
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Pipe an upstream SSE/NDJSON stream to the client, transforming each complete
// line via `transformLine` (return a string to forward, or null to skip).
// Cancels the upstream reader if the client disconnects, and caps total bytes.
async function pipeStream(response, res, transformLine) {
  res.setHeader('Content-Type', 'application/x-ndjson');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let received = 0;
  let clientGone = false;
  res.on('close', () => { clientGone = true; reader.cancel().catch(() => {}); });

  try {
    while (!clientGone) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_RESPONSE_BYTES) throw new Error('Response exceeded maximum allowed size');
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const out = transformLine(line);
        if (out) res.write(out);
      }
    }
    if (!clientGone) res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    reader.cancel().catch(() => {});
    if (!res.headersSent) res.status(500).json({ error: 'Streaming error' });
    else if (!clientGone) res.end();
  }
}

app.post('/api/parse-feed', async (req, res) => {
  try {
    const { url } = req.body;

    // SSRF-safe fetch (validates + resolves the URL, re-validates every redirect
    // hop, enforces a timeout and a response-size cap) then parse the XML text.
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
});

app.post('/api/fetch-article', async (req, res) => {
  try {
    const { url } = req.body;

    const html = await safeFetchText(url);
    const article = await extractFromHtml(html, url);

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
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch article content' });
  }
});

// Ollama proxy endpoint - proxies requests to user's Ollama server.
// `allowPrivate: true` because the target is intentionally the user's LAN /
// localhost Ollama server; cloud-metadata and link-local ranges are still blocked.
app.post('/api/ollama/proxy', async (req, res) => {
  try {
    const { targetUrl, method = 'GET', body } = req.body;

    console.log('Ollama proxy request:', { targetUrl, method, stream: body?.stream });

    const validation = await validateUrl(targetUrl, { allowPrivate: true });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const response = await safeFetch(targetUrl, {
      allowPrivate: true,
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      // Generous: the target is the user's own (possibly slow) LLM server.
      timeoutMs: LLM_TIMEOUT_MS,
    });

    if (!response.ok) {
      const errorText = await readCappedText(response);
      console.error('Ollama server error:', response.status, errorText);
      return res.status(response.status).json({ error: `Ollama error: ${errorText}` });
    }

    // Check if this is a streaming response
    if (body?.stream && response.body) {
      res.setHeader('Content-Type', 'application/x-ndjson');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // Cancel the upstream read if the client disconnects mid-stream.
      let clientGone = false;
      res.on('close', () => { clientGone = true; reader.cancel().catch(() => {}); });

      let received = 0;
      try {
        while (!clientGone) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > MAX_RESPONSE_BYTES) {
            throw new Error('Ollama response exceeded maximum allowed size');
          }
          res.write(decoder.decode(value, { stream: true }));
        }
        if (!clientGone) res.end();
      } catch (error) {
        console.error('Streaming error:', error);
        reader.cancel().catch(() => {});
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming error' });
        } else if (!clientGone) {
          res.end();
        }
      }
    } else {
      // Non-streaming response (size-capped).
      const text = await readCappedText(response);
      const data = JSON.parse(text);
      console.log('Ollama proxy response received, has response:', !!data.response);
      res.json(data);
    }
  } catch (error) {
    console.error('Ollama proxy error:', error);
    res.status(error.statusCode || 500).json({ error: 'Failed to connect to Ollama server: ' + error.message });
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

    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    }, LLM_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await readCappedText(response);
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(response.status).json({ error: `OpenAI error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize OpenAI SSE to NDJSON {"response":"token"} format
      await pipeStream(response, res, (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) return null;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return null;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          return content ? JSON.stringify({ response: content }) + '\n' : null;
        } catch {
          return null;
        }
      });
    } else {
      const text = await readCappedText(response);
      const data = JSON.parse(text);
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

    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    }, LLM_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await readCappedText(response);
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: `Anthropic error: ${errorText}` });
    }

    if (stream && response.body) {
      // Normalize Anthropic SSE to NDJSON {"response":"token"} format
      await pipeStream(response, res, (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) return null;
        const data = trimmed.slice(6);
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            return JSON.stringify({ response: json.delta.text }) + '\n';
          }
          return null;
        } catch {
          return null;
        }
      });
    } else {
      const text = await readCappedText(response);
      const data = JSON.parse(text);
      const content = data.content?.[0]?.text || '';
      res.json({ response: content });
    }
  } catch (error) {
    console.error('Anthropic proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Anthropic: ' + error.message });
  }
});

// OpenAI TTS proxy
app.post('/api/openai/tts', async (req, res) => {
  try {
    const { apiKey, model, voice, input, speed } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });
    if (!input) return res.status(400).json({ error: 'Input text is required' });

    const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'tts-1',
        voice: voice || 'alloy',
        input: input,
        speed: speed || 1.0,
        response_format: 'mp3'
      })
    }, 60000);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI TTS error:', response.status, errorText);
      return res.status(response.status).json({ error: `OpenAI TTS error: ${errorText}` });
    }

    // Stream the audio back
    res.setHeader('Content-Type', 'audio/mpeg');
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('Error proxying OpenAI TTS request:', error);
    res.status(500).json({ error: 'Failed to generate speech: ' + error.message });
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