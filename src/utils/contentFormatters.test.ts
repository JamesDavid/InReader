// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getContentLength, getPreviewContent } from './contentFormatters';

describe('getContentLength', () => {
  it('counts visible text, ignoring markup', () => {
    expect(getContentLength('<p>hello <b>world</b></p>')).toBe('hello world'.length);
  });
  it('returns 0 for empty/whitespace-only markup', () => {
    expect(getContentLength('<div></div>')).toBe(0);
  });
  it('does not execute or fetch on malicious markup (just measures)', () => {
    // Should not throw; <img onerror> is inert under DOMParser.
    expect(getContentLength('<img src=x onerror="throw new Error()">text')).toBe('text'.length);
  });
});

describe('getPreviewContent', () => {
  it('returns the content unchanged when it is short', () => {
    const short = 'A short summary.';
    expect(getPreviewContent(short, false)).toBe(short);
  });

  it('returns the full content when expanded, regardless of length', () => {
    const long = 'word '.repeat(400); // ~2000 chars
    expect(getPreviewContent(long, true)).toBe(long);
  });

  it('truncates long content and appends an ellipsis', () => {
    const long = 'word '.repeat(400);
    const preview = getPreviewContent(long, false, 100);
    expect(preview.endsWith('...')).toBe(true);
    expect(preview.length).toBeLessThan(long.length);
    // ~100 chars + ellipsis, not the whole thing
    expect(preview.length).toBeLessThanOrEqual(110);
  });

  it('breaks on a word boundary (does not cut mid-word)', () => {
    const long = 'alpha bravo charlie delta echo foxtrot '.repeat(30);
    const body = getPreviewContent(long, false, 50).replace(/\.\.\.$/, '');
    // body is a prefix of the original, and the original char right after it is a
    // space — i.e. the cut landed on a word boundary, not mid-word.
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length]).toBe(' ');
  });

  it('returns empty string for empty input', () => {
    expect(getPreviewContent('', false)).toBe('');
  });
});
