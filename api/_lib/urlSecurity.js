// Shared SSRF-hardening + safe-fetch utilities.
// Used by both the Express server (server.js) and the Vercel serverless
// functions (api/*.js) so the two parallel backend implementations stay in sync.

import dns from 'node:dns/promises';
import net from 'node:net';

export const FETCH_TIMEOUT_MS = 15000;
// Time-to-first-response budget for calls to a user's own trusted LLM server,
// where a cold model load + prompt processing can legitimately take minutes.
export const LLM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_REDIRECTS = 5;

const METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

// Returns a string reason if the IP is in a blocked range, otherwise null.
// `allowPrivate` permits RFC1918 / loopback (used by the Ollama proxy, which is
// intentionally allowed to reach a user's LAN or localhost server) but still
// blocks cloud-metadata / link-local / multicast / reserved ranges.
export function blockedIpReason(ip, { allowPrivate = false } = {}) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0) return 'unspecified address';
    if (a === 169 && b === 254) return 'link-local / cloud metadata address';
    if (a >= 224) return 'multicast / reserved address';
    if (!allowPrivate) {
      if (a === 10) return 'private address';
      if (a === 127) return 'loopback address';
      if (a === 172 && b >= 16 && b <= 31) return 'private address';
      if (a === 192 && b === 168) return 'private address';
      if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT address';
    }
    return null;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // IPv4-mapped in dotted form (::ffff:a.b.c.d) — validate the embedded IPv4.
    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return blockedIpReason(mapped[1], { allowPrivate });
    // IPv4-mapped in hex form (::ffff:a9fe:a9fe) — how the WHATWG URL parser
    // normalizes it. Reconstruct the IPv4 and validate that.
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const ipv4 = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
      return blockedIpReason(ipv4, { allowPrivate });
    }
    if (lower.startsWith('fe80')) return 'link-local address';
    if (lower.startsWith('ff')) return 'multicast address';
    if (!allowPrivate) {
      if (lower === '::1' || lower === '::') return 'loopback / unspecified address';
      if (lower.startsWith('fc') || lower.startsWith('fd')) return 'unique-local address';
    }
    return null;
  }

  return 'invalid IP address';
}

// Validate a URL string and resolve its hostname, checking every resolved IP
// against the blocked ranges. Rejecting when ANY resolved address is internal
// closes the DNS-rebinding hole where one A record points somewhere internal.
export async function validateUrl(urlString, { allowPrivate = false } = {}) {
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

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (METADATA_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'Metadata endpoints are not allowed' };
  }
  if (!allowPrivate && (hostname === 'localhost' || hostname.endsWith('.localhost'))) {
    return { valid: false, error: 'Local URLs are not allowed' };
  }

  // If the host is an IP literal, check it directly; otherwise resolve it.
  let addresses;
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const resolved = await dns.lookup(hostname, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      return { valid: false, error: 'Could not resolve hostname' };
    }
  }

  if (addresses.length === 0) {
    return { valid: false, error: 'Could not resolve hostname' };
  }

  for (const address of addresses) {
    const reason = blockedIpReason(address, { allowPrivate });
    if (reason) {
      return { valid: false, error: `Blocked address (${reason})` };
    }
  }

  return { valid: true, addresses };
}

// Read a Response body with a hard byte cap so a malicious/huge upstream can't
// exhaust server memory. Returns the decoded text.
export async function readCappedText(response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!response.body) return await response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        throw new Error('Response exceeded maximum allowed size');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

// SSRF-safe fetch that manually follows redirects, re-validating (and
// re-resolving) every hop, and enforces a timeout. Returns the final Response
// (whose body has not yet been consumed).
export async function safeFetch(urlString, { allowPrivate = false, method = 'GET', headers = {}, body, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  let currentUrl = urlString;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateUrl(currentUrl, { allowPrivate });
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.statusCode = 400;
      throw err;
    }

    // The timer guards time-to-response-headers only; it is cleared once fetch()
    // resolves, so a slow streaming body (e.g. an LLM generating tokens) is not
    // affected. Callers hitting a trusted LLM server pass a generous timeoutMs.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Follow redirects manually so each target is re-validated.
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const location = new URL(response.headers.get('location'), currentUrl).toString();
      response.body?.cancel().catch(() => {});
      currentUrl = location;
      continue;
    }

    return response;
  }

  const err = new Error('Too many redirects');
  err.statusCode = 400;
  throw err;
}

// Convenience: safe GET returning capped text (used for feed XML / article HTML).
export async function safeFetchText(urlString, options = {}) {
  const response = await safeFetch(urlString, options);
  if (!response.ok) {
    const err = new Error(`Upstream responded ${response.status}`);
    err.statusCode = 502;
    response.body?.cancel().catch(() => {});
    throw err;
  }
  return await readCappedText(response, options.maxBytes);
}
