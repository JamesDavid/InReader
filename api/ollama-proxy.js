import { validateUrl, safeFetch, readCappedText, MAX_RESPONSE_BYTES } from './_lib/urlSecurity.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

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
    const { targetUrl, method = 'GET', body } = req.body;

    // allowPrivate: the target is intentionally the user's Ollama server;
    // cloud-metadata and link-local ranges are still blocked.
    const validation = await validateUrl(targetUrl, { allowPrivate: true });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const response = await safeFetch(targetUrl, {
      allowPrivate: true,
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await readCappedText(response);
      return res.status(response.status).json({ error: `Ollama error: ${errorText}` });
    }

    // Check if this is a streaming response
    if (body?.stream && response.body) {
      res.setHeader('Content-Type', 'application/x-ndjson');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let clientGone = false;
      res.on('close', () => { clientGone = true; reader.cancel().catch(() => {}); });

      let received = 0;
      try {
        while (!clientGone) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > MAX_RESPONSE_BYTES) throw new Error('Response exceeded maximum allowed size');
          res.write(decoder.decode(value, { stream: true }));
        }
        if (!clientGone) res.end();
      } catch (error) {
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
      res.json(JSON.parse(text));
    }
  } catch (error) {
    console.error('Ollama proxy error:', error);
    res.status(error.statusCode || 500).json({ error: 'Failed to connect to Ollama server' });
  }
}
