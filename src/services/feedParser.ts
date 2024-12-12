import { addEntry, addFeed, type Feed, type FeedEntry, db } from './db';
import { enqueueRequest } from './requestQueueService';
import { processArticle } from './articleService';

const API_URL = 'http://localhost:3000/api';

interface ParsedFeedItem {
  title: string;
  content: string;
  link: string;
  pubDate: string;
}

interface ParsedFeed {
  title: string;
  items: ParsedFeedItem[];
}

// Helper function to check if an entry already exists
async function isNewEntry(feedId: number, link: string): Promise<boolean> {
  const existingEntry = await db.entries
    .where(['feedId', 'link'])
    .equals([feedId, link])
    .first();
  return !existingEntry;
}

export async function addNewFeed(url: string, folderId?: number) {
  try {
    // Check if feed already exists
    const existingFeed = await db.feeds.where('url').equals(url).first();
    if (existingFeed) {
      throw new Error('Feed already exists');
    }

    const response = await fetch(`${API_URL}/parse-feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Server error:', error);
      throw new Error('Failed to fetch feed');
    }

    const feed: ParsedFeed = await response.json();
    const feedId = await addFeed(url, feed.title || 'Untitled Feed', folderId);

    // Add all items from the feed
    const entries: Omit<FeedEntry, 'id'>[] = [];
    for (const item of feed.items) {
      const isNew = await isNewEntry(feedId, item.link);
      if (isNew) {
        entries.push({
          feedId: feedId as number,
          title: item.title,
          content: item.content,
          link: item.link,
          publishDate: new Date(item.pubDate),
          isRead: false,
          isStarred: false,
          requestProcessingStatus: 'pending'
        });
      }
    }

    // Add entries and get their IDs
    const entryIds = await Promise.all(entries.map(entry => addEntry(entry)));
    
    // Process each entry through the request queue
    await Promise.all(entryIds.map(async (entryId) => {
      if (typeof entryId === 'number') {
        try {
          await enqueueRequest(
            async () => {
              return true;
            },
            entryId
          );
        } catch (error) {
          console.error('Error processing entry:', error);
        }
      }
    }));

    return feedId;
  } catch (error) {
    console.error('Error adding feed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to add feed');
  }
}

export async function refreshFeed(feed: Feed) {
  try {
    const response = await fetch(`${API_URL}/parse-feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: feed.url }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch feed');
    }

    const parsedFeed: ParsedFeed = await response.json();
    
    // Filter out existing entries and only process new ones
    const newEntries: Omit<FeedEntry, 'id'>[] = [];
    for (const item of parsedFeed.items) {
      const isNew = await isNewEntry(feed.id!, item.link);
      if (isNew) {
        newEntries.push({
          feedId: feed.id!,
          title: item.title,
          content: item.content,
          link: item.link,
          publishDate: new Date(item.pubDate),
          isRead: false,
          isStarred: false,
          requestProcessingStatus: 'pending'
        });
      }
    }

    if (newEntries.length === 0) {
      return; // No new entries to process
    }

    // Add only new entries and get their IDs
    const entryIds = await Promise.all(newEntries.map(entry => addEntry(entry)));
    
    // Process each new entry through the request queue
    await Promise.all(entryIds.map(async (entryId) => {
      if (typeof entryId === 'number') {
        try {
          await enqueueRequest(
            async () => {
              return true;
            },
            entryId
          );
        } catch (error) {
          console.error('Error processing entry:', error);
        }
      }
    }));
  } catch (error) {
    console.error('Error refreshing feed:', error);
    throw new Error('Failed to refresh feed');
  }
} 