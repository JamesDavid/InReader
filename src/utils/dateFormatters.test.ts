import { describe, it, expect } from 'vitest';
import { formatRelativeDate } from './dateFormatters';

describe('formatRelativeDate', () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('shows "now" for very recent dates', () => {
    expect(formatRelativeDate(ago(10 * 1000))).toBe('now');
  });
  it('shows minutes', () => {
    expect(formatRelativeDate(ago(5 * MIN))).toBe('5m');
  });
  it('shows hours', () => {
    expect(formatRelativeDate(ago(3 * HOUR))).toBe('3h');
  });
  it('shows days up to a week', () => {
    expect(formatRelativeDate(ago(2 * DAY))).toBe('2d');
  });
  it('falls back to a locale date string beyond a week', () => {
    const old = ago(10 * DAY);
    expect(formatRelativeDate(old)).toBe(old.toLocaleDateString());
  });
});
