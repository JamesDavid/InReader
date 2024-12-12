import { addEntry, addFeed, type Feed, type FeedEntry, db } from './db';
import { enqueueRequest } from './requestQueueService';
import { fetchArticleContent } from './articleService';
import { generateSummary, loadOllamaConfig } from './ollamaService';

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

// Process a single feed entry: fetch full article and generate summary
async function processEntry(entryId: number) {
  const entry = await db.entries.get(entryId);
  if (!entry) {
    throw new Error('Entry not found');
  }

  try {
    // Check if entry is already being processed
    if (entry.requestProcessingStatus === 'pending') {
      console.log('Entry is already being processed:', entry.title);
      return;
    }

    // Update status to processing before starting
    await db.entries.update(entryId, {
      requestProcessingStatus: 'pending',
      lastRequestAttempt: new Date(),
      requestError: undefined,
      aiSummary: undefined,
      aiSummaryMetadata: undefined
    });

    // Step 1: Fetch full article content
    console.log('Fetching article content for:', entry.title);
    const articleContent = await fetchArticleContent(entry.link, entryId);
    console.log('Successfully fetched article content for:', entry.title);

    // Update entry with fetched content
    await db.entries.update(entryId, {
      content: articleContent.content
    });

    // Step 2: Generate AI summary
    console.log('Loading Ollama config for:', entry.title);
    const config = loadOllamaConfig();
    if (!config) {
      throw new Error('Ollama config not found');
    }

    console.log('Generating summary for:', entry.title);
    const summary = await generateSummary(
      articleContent.content,
      entry.link,
      config,
      undefined,
      entryId
    );
    console.log('Successfully generated summary for:', entry.title);

    // Update entry with summary
    await db.entries.update(entryId, {
      aiSummary: summary,
      aiSummaryMetadata: {
        isFullContent: articleContent.isFullContent,
        model: config.summaryModel,
        contentLength: articleContent.content.length
      },
      requestProcessingStatus: 'success',
      lastRequestAttempt: new Date()
    });

    return true;
  } catch (error) {
    console.error('Failed to process entry:', error);
    await db.entries.update(entryId, {
      requestProcessingStatus: 'failed',
      lastRequestAttempt: new Date(),
      requestError: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any).code,
        details: (error as any).details
      }
    });
    throw error;
  }
}

// Parse feed and return parsed items
async function parseFeed(url: string): Promise<ParsedFeed> {
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

  return response.json();
}

// Add new entries to database and process them
async function processNewEntries(feedId: number, feedTitle: string, items: ParsedFeedItem[]) {
  const newEntries: Omit<FeedEntry, 'id'>[] = [];
  
  // Filter out existing entries
  for (const item of items) {
    const isNew = await isNewEntry(feedId, item.link);
    if (isNew) {
      newEntries.push({
        feedId,
        feedTitle,
        title: item.title,
        content: item.content,
        link: item.link,
        publishDate: new Date(item.pubDate),
        isRead: false,
        isStarred: false,
        requestProcessingStatus: 'pending',
        isListened: false,
        lastRequestAttempt: undefined,
        requestError: undefined,
        aiSummary: undefined,
        aiSummaryMetadata: undefined
      });
    }
  }

  if (newEntries.length === 0) {
    return [];
  }

  // Add entries and get their IDs
  const entryIds = await Promise.all(newEntries.map(entry => addEntry(entry)));
  
  // Process each entry (fetch article and generate summary)
  await Promise.all(entryIds.map(id => processEntry(id as number)));
  
  return entryIds;
}

// Re-enqueue an entry for processing
export async function reprocessEntry(entryId: number) {
  try {
    // Get the entry to check if it exists
    const entry = await db.entries.get(entryId);
    if (!entry) {
      throw new Error('Entry not found');
    }

    // Reset the entry's processing status and clear previous results
    await db.entries.update(entryId, {
      requestProcessingStatus: 'pending',
      lastRequestAttempt: null,
      requestError: null,
      aiSummary: null,
      aiSummaryMetadata: null
    });

    // Process the entry again
    return processEntry(entryId);
  } catch (error) {
    console.error('Error reprocessing entry:', error);
    // Update entry status to failed
    await db.entries.update(entryId, {
      requestProcessingStatus: 'failed',
      lastRequestAttempt: new Date(),
      requestError: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any).code,
        details: (error as any).details
      }
    });
    throw error;
  }
}

export async function addNewFeed(url: string, folderId?: number) {
  try {
    // Check if feed already exists
    const existingFeed = await db.feeds.where('url').equals(url).first();
    if (existingFeed) {
      throw new Error('Feed already exists');
    }

    const feed = await parseFeed(url);
    const feedId = await addFeed(url, feed.title || 'Untitled Feed', folderId);
    
    await processNewEntries(feedId as number, feed.title || 'Untitled Feed', feed.items);
    
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
    const parsedFeed = await parseFeed(feed.url);
    await processNewEntries(feed.id!, feed.title, parsedFeed.items);
  } catch (error) {
    console.error('Error refreshing feed:', error);
    throw error;
  }
} 