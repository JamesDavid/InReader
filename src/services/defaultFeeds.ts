import { getAllFeeds } from './db';
import { addNewFeed } from './feedParser';
import { dispatchAppEvent } from '../utils/eventDispatcher';

// A small starter set so a brand-new install isn't an empty screen.
const DEFAULT_FEED_URLS = [
  'https://feeds.macrumors.com/MacRumors-All',
  'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  'https://patentlyo.com/feed',
  'https://ipwatchdog.com/feed',
  'https://www.creditbubblestocks.com/feeds/posts/default',
];

const SEEDED_KEY = 'defaultFeedsSeeded';

/**
 * On a brand-new install (no feeds ever, and not seeded before) add a few
 * starter feeds so the app isn't empty. Runs at most once per browser — if the
 * user later deletes everything, we don't re-seed.
 */
export async function seedDefaultFeedsIfNeeded(): Promise<void> {
  if (localStorage.getItem(SEEDED_KEY)) return;

  try {
    // Include deleted feeds: someone who deleted all their feeds isn't "new".
    const existing = await getAllFeeds(true);
    // Mark seeded up-front so a re-render / second mount can't double-seed.
    localStorage.setItem(SEEDED_KEY, 'true');
    if (existing.length > 0) return;

    for (const url of DEFAULT_FEED_URLS) {
      try {
        await addNewFeed(url);
      } catch (err) {
        console.warn('Could not seed default feed:', url, err);
      }
    }

    // Feeds (and their initial entries) are in the DB now — tell the sidebar and
    // the current view to reload.
    dispatchAppEvent('allFeedsRefreshed');
  } catch (err) {
    console.error('Default feed seeding failed:', err);
  }
}
