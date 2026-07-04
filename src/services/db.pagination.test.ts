// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { addFeed, addEntry, getFeedEntries } from './db';

// Insert entries in an order that is DIFFERENT from publishDate order, so the
// test catches the original bug (paging by insertion/id order and only sorting
// the already-sliced page).
async function seedFeedWithScrambledDates(feedId: number, isoDates: string[]) {
  for (let i = 0; i < isoDates.length; i++) {
    await addEntry({
      feedId,
      title: `Entry ${i} @ ${isoDates[i]}`,
      content_rssAbstract: 'body',
      link: `https://example.com/${feedId}/${i}`,
      publishDate: new Date(isoDates[i]),
      isRead: false,
      isStarred: false,
    });
  }
}

describe('getFeedEntries pagination (regression: page by publishDate, not id order)', () => {
  let feedId: number;

  beforeEach(async () => {
    feedId = (await addFeed(`https://example.com/feed-${Math.round(performance.now())}-${Math.random()}`, 'Feed')) as number;
    // Insertion order is scrambled vs. chronological order on purpose.
    await seedFeedWithScrambledDates(feedId, [
      '2026-01-03T00:00:00Z', // inserted 1st, 3rd-newest
      '2026-01-06T00:00:00Z', // inserted 2nd, newest
      '2026-01-01T00:00:00Z', // oldest
      '2026-01-05T00:00:00Z',
      '2026-01-02T00:00:00Z',
      '2026-01-04T00:00:00Z',
    ]);
  });

  it('returns the correct total', async () => {
    const { total } = await getFeedEntries(feedId, 1, 3);
    expect(total).toBe(6);
  });

  it('page 1 is the newest N by publishDate (descending)', async () => {
    const { entries } = await getFeedEntries(feedId, 1, 3);
    const dates = entries.map(e => new Date(e.publishDate).toISOString());
    expect(dates).toEqual([
      '2026-01-06T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      '2026-01-04T00:00:00.000Z',
    ]);
  });

  it('page 2 continues in publishDate order with no overlap or gaps', async () => {
    const page1 = await getFeedEntries(feedId, 1, 3);
    const page2 = await getFeedEntries(feedId, 2, 3);
    const p2dates = page2.entries.map(e => new Date(e.publishDate).toISOString());
    expect(p2dates).toEqual([
      '2026-01-03T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
    // Every entry appears exactly once across the two pages.
    const ids = [...page1.entries, ...page2.entries].map(e => e.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('reports the right totalPages', async () => {
    const { totalPages } = await getFeedEntries(feedId, 1, 3);
    expect(totalPages).toBe(2);
  });
});
