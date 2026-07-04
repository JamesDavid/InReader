import { describe, it, expect } from 'vitest';
import { blockedIpReason, validateUrl, readCappedText } from './urlSecurity.js';

describe('blockedIpReason (external policy, allowPrivate=false)', () => {
  it('blocks cloud-metadata / link-local IPv4', () => {
    expect(blockedIpReason('169.254.169.254')).toMatch(/link-local|metadata/);
  });
  it('blocks loopback, private and CGNAT IPv4', () => {
    expect(blockedIpReason('127.0.0.1')).toMatch(/loopback/);
    expect(blockedIpReason('10.0.0.5')).toMatch(/private/);
    expect(blockedIpReason('172.16.0.1')).toMatch(/private/);
    expect(blockedIpReason('192.168.1.1')).toMatch(/private/);
    expect(blockedIpReason('100.64.0.1')).toMatch(/carrier-grade/);
  });
  it('blocks unspecified and multicast/reserved IPv4', () => {
    expect(blockedIpReason('0.0.0.0')).toMatch(/unspecified/);
    expect(blockedIpReason('224.0.0.1')).toMatch(/multicast|reserved/);
  });
  it('allows ordinary public IPv4', () => {
    expect(blockedIpReason('8.8.8.8')).toBeNull();
    expect(blockedIpReason('1.1.1.1')).toBeNull();
  });
  it('blocks IPv6 loopback, ULA, link-local, multicast', () => {
    expect(blockedIpReason('::1')).toMatch(/loopback|unspecified/);
    expect(blockedIpReason('fd00::1')).toMatch(/unique-local/);
    expect(blockedIpReason('fe80::1')).toMatch(/link-local/);
    expect(blockedIpReason('ff02::1')).toMatch(/multicast/);
  });
  it('unwraps IPv4-mapped IPv6 (dotted and hex) and applies IPv4 rules', () => {
    expect(blockedIpReason('::ffff:169.254.169.254')).toMatch(/link-local|metadata/);
    // hex form, how the WHATWG URL parser normalizes it
    expect(blockedIpReason('::ffff:a9fe:a9fe')).toMatch(/link-local|metadata/);
    expect(blockedIpReason('::ffff:10.0.0.1')).toMatch(/private/);
  });
  it('allows public IPv6', () => {
    expect(blockedIpReason('2606:4700:4700::1111')).toBeNull();
  });
});

describe('blockedIpReason (Ollama policy, allowPrivate=true)', () => {
  const opts = { allowPrivate: true };
  it('permits loopback and RFC1918 (the point of the LAN proxy)', () => {
    expect(blockedIpReason('127.0.0.1', opts)).toBeNull();
    expect(blockedIpReason('192.168.1.9', opts)).toBeNull();
    expect(blockedIpReason('10.0.0.5', opts)).toBeNull();
    expect(blockedIpReason('::1', opts)).toBeNull();
  });
  it('STILL blocks cloud-metadata and link-local even when private is allowed', () => {
    expect(blockedIpReason('169.254.169.254', opts)).toMatch(/link-local|metadata/);
    expect(blockedIpReason('fe80::1', opts)).toMatch(/link-local/);
    expect(blockedIpReason('::ffff:a9fe:a9fe', opts)).toMatch(/link-local|metadata/);
  });
});

describe('validateUrl (IP literals — no DNS)', () => {
  it('rejects non-http(s) protocols', async () => {
    expect((await validateUrl('ftp://example.com/')).valid).toBe(false);
    expect((await validateUrl('file:///etc/passwd')).valid).toBe(false);
  });
  it('rejects empty / non-string input', async () => {
    expect((await validateUrl('')).valid).toBe(false);
    expect((await validateUrl(null)).valid).toBe(false);
  });
  it('blocks the metadata IP under BOTH policies', async () => {
    expect((await validateUrl('http://169.254.169.254/latest/meta-data/')).valid).toBe(false);
    expect((await validateUrl('http://169.254.169.254/', { allowPrivate: true })).valid).toBe(false);
  });
  it('blocks metadata hostnames', async () => {
    expect((await validateUrl('http://metadata.google.internal/')).valid).toBe(false);
  });
  it('blocks localhost hostname for external, allows it for Ollama', async () => {
    expect((await validateUrl('http://localhost:8080/')).valid).toBe(false);
    expect((await validateUrl('http://localhost:11434/', { allowPrivate: true })).valid).toBe(true);
  });
  it('external policy blocks private IP literals; ollama policy allows them', async () => {
    expect((await validateUrl('http://10.0.0.5:6379/')).valid).toBe(false);
    expect((await validateUrl('http://192.168.1.9:11434/', { allowPrivate: true })).valid).toBe(true);
  });
  it('allows a public IP literal', async () => {
    const r = await validateUrl('http://1.1.1.1/');
    expect(r.valid).toBe(true);
    expect(r.addresses).toContain('1.1.1.1');
  });
});

describe('readCappedText', () => {
  const makeResponse = (chunks) => ({
    body: {
      getReader() {
        let i = 0;
        return {
          read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }),
          cancel: async () => {},
        };
      },
    },
  });

  it('concatenates streamed chunks into text', async () => {
    const enc = new TextEncoder();
    const res = makeResponse([enc.encode('hello '), enc.encode('world')]);
    await expect(readCappedText(res)).resolves.toBe('hello world');
  });

  it('throws when the response exceeds the byte cap', async () => {
    const big = new Uint8Array(20);
    const res = makeResponse([big, big]);
    await expect(readCappedText(res, 30)).rejects.toThrow(/maximum allowed size/);
  });
});
