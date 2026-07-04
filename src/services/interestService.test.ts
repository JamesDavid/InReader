import { describe, it, expect } from 'vitest';
import { parseSummaryAndTags } from './interestService';

describe('parseSummaryAndTags', () => {
  it('splits the summary from a trailing TAGS: line', () => {
    const raw = 'This is a summary of the article.\nTAGS: ai, react, testing';
    const { summaryText, tags } = parseSummaryAndTags(raw);
    expect(summaryText).toBe('This is a summary of the article.');
    expect(tags).toEqual(['ai', 'react', 'testing']);
  });

  it('lowercases, trims, and drops empty tags', () => {
    const { tags } = parseSummaryAndTags('Body.\nTAGS:  React ,  AI ,,  Testing ');
    expect(tags).toEqual(['react', 'ai', 'testing']);
  });

  it('returns the whole text and no tags when there is no TAGS line', () => {
    const raw = 'Just a summary with no tags at all.';
    const { summaryText, tags } = parseSummaryAndTags(raw);
    expect(summaryText).toBe('Just a summary with no tags at all.');
    expect(tags).toEqual([]);
  });

  it('matches TAGS case-insensitively', () => {
    const { tags } = parseSummaryAndTags('Body.\ntags: alpha, beta');
    expect(tags).toEqual(['alpha', 'beta']);
  });

  it('does not treat a mid-text "TAGS:" without a preceding newline as the tag line', () => {
    // The regex requires a newline before TAGS:, so an inline mention stays in the body.
    const { summaryText, tags } = parseSummaryAndTags('See TAGS: not a real tag line here');
    expect(tags).toEqual([]);
    expect(summaryText).toContain('TAGS:');
  });
});
