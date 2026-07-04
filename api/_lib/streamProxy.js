// Shared helpers for the fixed-host AI provider proxies (OpenAI / Anthropic).
// Fixed upstream hosts, so no SSRF concern here — just timeout, size cap and
// client-disconnect handling.

import { FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES, readCappedText } from './urlSecurity.js';

export { readCappedText };

// fetch() with an abort timeout.
export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
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
// Cancels the upstream reader on client disconnect and caps total bytes.
export async function pipeStream(response, res, transformLine) {
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
