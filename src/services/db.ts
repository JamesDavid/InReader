import Dexie, { Table } from 'dexie';

interface Feed {
  id?: number;
  url: string;
  title: string;
  folderId?: number;
  lastUpdated?: Date;
  order?: number;
  unreadCount?: number;
}

interface FeedEntry {
  id?: number;
  feedId: number;
  feedTitle?: string;
  title: string;
  content: string;
  link: string;
  publishDate: Date;
  isRead: boolean;
  readDate?: Date;
  isStarred: boolean;
  starredDate?: Date;
  isListened?: boolean;
  listenedDate?: Date;
  lastChatDate?: Date;
  aiSummary?: string;
  aiSummaryMetadata?: {
    isFullContent: boolean;
    model: string;
  };
  chatHistory?: ChatMessage[];
  requestProcessingStatus?: 'pending' | 'success' | 'failed';
  lastRequestAttempt?: Date;
  requestError?: {
    message: string;
    code?: string;
    details?: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'article';
  content: string;
  timestamp: Date;
  model?: string;
}

interface Folder {
  id?: number;
  name: string;
  parentId?: number;
  order?: number;
}

interface SavedSearch {
  id?: number;
  query: string;
  title: string;
  createdAt: Date;
  resultCount?: number;
}

class ReaderDatabase extends Dexie {
  feeds!: Table<Feed>;
  entries!: Table<FeedEntry>;
  folders!: Table<Folder>;
  savedSearches!: Table<SavedSearch>;

  constructor() {
    super('ReaderDatabase');
    
    // Define all fields that need indexing
    const entriesSchema = '++id, feedId, publishDate, isRead, readDate, isStarred, starredDate, isListened, listenedDate, lastChatDate, aiSummary, chatHistory, requestProcessingStatus, [feedId+link]';
    const feedsSchema = '++id, url, folderId';
    const foldersSchema = '++id, parentId';
    const savedSearchesSchema = '++id, query';

    this.version(617).stores({
      feeds: feedsSchema,
      entries: entriesSchema,
      folders: foldersSchema,
      savedSearches: savedSearchesSchema
    }).upgrade(async tx => {
      // Ensure all existing entries have the required fields
      await tx.table('entries').toCollection().modify(entry => {
        if (!entry.requestProcessingStatus) {
          entry.requestProcessingStatus = 'pending';
        }
        if (entry.isStarred && !entry.starredDate) {
          entry.starredDate = new Date();
        }
        if (entry.isListened && !entry.listenedDate) {
          entry.listenedDate = new Date();
        }
        if (entry.isRead && !entry.readDate) {
          entry.readDate = new Date();
        }
        if (entry.chatHistory && entry.chatHistory.length > 0 && !entry.lastChatDate) {
          const latestMessage = entry.chatHistory.reduce((latest: Date, msg: ChatMessage) => 
            msg.timestamp > latest ? msg.timestamp : latest,
            new Date(0)
          );
          entry.lastChatDate = latestMessage;
        }
        if (entry.requestProcessingStatus === 'failed' && !entry.requestError) {
          entry.requestError = {
            message: 'Unknown error from previous version',
            code: 'UNKNOWN'
          };
        }
      });
    });
  }
}

// Create a singleton instance
let dbInstance: ReaderDatabase | null = null;

// Function to get or create the database instance
function getDatabase(): ReaderDatabase {
  if (!dbInstance) {
    dbInstance = new ReaderDatabase();
    
    // Handle database errors
    dbInstance.on('blocked', () => {
      console.warn('Database blocked - another instance needs to upgrade');
    });

    dbInstance.on('versionchange', event => {
      console.log('Database version changed:', event);
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        window.location.reload(); // Reload the page to get a fresh database instance
      }
    });
  }
  return dbInstance;
}

// Initialize and export the database instance
export const db = getDatabase();

// Export database operations with error handling
export async function addFeed(url: string, title: string, folderId?: number) {
  try {
    return await db.feeds.add({
      url,
      title,
      folderId,
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('Error adding feed:', error);
    if (error instanceof Dexie.DatabaseClosedError) {
      window.location.reload(); // Reload on database closed error
    }
    throw error;
  }
}

export async function addEntry(entry: Omit<FeedEntry, 'id'>) {
  try {
    // Check if entry already exists
    const existingEntry = await db.entries
      .where('[feedId+link]')
      .equals([entry.feedId, entry.link])
      .first();

    if (!existingEntry) {
      return await db.entries.add({
        ...entry,
        isListened: false,
        requestProcessingStatus: entry.requestProcessingStatus || 'pending',
        lastRequestAttempt: entry.lastRequestAttempt || undefined
      });
    }
    return existingEntry.id;
  } catch (error) {
    console.error('Error adding entry:', error);
    if (error instanceof Dexie.DatabaseClosedError) {
      window.location.reload();
    }
    throw error;
  }
}

// Add error handling to other database operations
const withErrorHandling = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation error:', error);
    if (error instanceof Dexie.DatabaseClosedError) {
      window.location.reload();
    }
    throw error;
  }
};

export async function markAsRead(entryId: number) {
  return withErrorHandling(async () => {
    return await db.entries.update(entryId, { 
      isRead: true,
      readDate: new Date()
    });
  });
}

export async function markAsListened(entryId: number) {
  return await db.entries.update(entryId, { 
    isListened: true,
    listenedDate: new Date()
  });
}

export async function toggleStar(entryId: number) {
  const entry = await db.entries.get(entryId);
  if (entry) {
    const isStarred = !entry.isStarred;
    return await db.entries.update(entryId, {
      isStarred,
      starredDate: isStarred ? new Date() : undefined
    });
  }
}

export async function getFeedsByFolder(folderId?: number | null) {
  if (folderId === undefined || folderId === null) {
    return await db.feeds.where('folderId').equals(undefined).toArray();
  }
  return await db.feeds.where('folderId').equals(folderId).toArray();
}

export async function getUnreadEntries(feedId?: number) {
  let query = db.entries.filter(entry => !entry.isRead);
  if (feedId) {
    query = query.filter(entry => entry.feedId === feedId);
  }
  return await query.reverse().sortBy('publishDate');
}

async function addFeedTitleToEntries(entries: FeedEntry[]): Promise<FeedEntry[]> {
  const feedIds = [...new Set(entries
    .map(entry => entry.feedId)
    .filter((id): id is number => id != null))];
  
  const feeds = feedIds.length > 0 
    ? await db.feeds.where('id').anyOf(feedIds).toArray()
    : [];
    
  const feedMap = new Map(feeds.map(feed => [feed.id, feed.title]));
  
  return entries.map(entry => ({
    ...entry,
    feedTitle: entry.feedId ? feedMap.get(entry.feedId) : undefined,
    publishDate: new Date(entry.publishDate),
    readDate: entry.readDate ? new Date(entry.readDate) : undefined,
    starredDate: entry.starredDate ? new Date(entry.starredDate) : undefined,
    listenedDate: entry.listenedDate ? new Date(entry.listenedDate) : undefined,
    lastChatDate: entry.lastChatDate ? new Date(entry.lastChatDate) : undefined
  }));
}

export async function getFeedEntries(feedId: number) {
  const entries = await db.entries
    .where('feedId')
    .equals(feedId)
    .reverse()
    .sortBy('publishDate');
  return addFeedTitleToEntries(entries);
}

export async function getAllEntries() {
  const entries = await db.entries
    .orderBy('publishDate')
    .reverse()
    .toArray();
  return addFeedTitleToEntries(entries);
}

export async function getStarredEntries() {
  const entries = await db.entries
    .filter(entry => entry.isStarred)
    .toArray();
  
  // Convert dates before sorting
  const entriesWithDates = await addFeedTitleToEntries(entries);
  
  // Sort by starred date (most recent first), falling back to publish date
  return entriesWithDates.sort((a, b) => {
    if (a.starredDate && b.starredDate) {
      return b.starredDate.getTime() - a.starredDate.getTime();
    }
    // If no starred dates (for legacy entries), fall back to publish date
    return b.publishDate.getTime() - a.publishDate.getTime();
  });
}

export async function getListenedEntries() {
  const entries = await db.entries
    .filter(entry => entry.isListened === true)
    .toArray();
  return addFeedTitleToEntries(entries);
}

export async function addFolder(name: string, parentId?: number) {
  return await db.folders.add({ name, parentId });
}

export async function getFolders() {
  const folders = await db.folders.toArray();
  return folders.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getAllFeeds() {
  return await db.feeds.toArray();
}

export async function searchEntries(query: string) {
  const searchTerms = query.toLowerCase().split(' ');
  const entries = await db.entries
    .filter(entry => {
      const content = (
        entry.title + ' ' + 
        entry.content + ' ' + 
        (entry.aiSummary || '')
      ).toLowerCase();
      return searchTerms.every(term => content.includes(term));
    })
    .reverse()
    .sortBy('publishDate');
  return addFeedTitleToEntries(entries);
}

export async function saveSearch(query: string) {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Get the search results count
  const results = await searchEntries(query);
  const resultCount = results.length;
  
  // Check if search already exists
  const existingSearch = await db.savedSearches
    .where('query')
    .equals(normalizedQuery)
    .first();

  if (existingSearch) {
    // Update the timestamp and result count
    await db.savedSearches.update(existingSearch.id!, {
      createdAt: new Date(),
      resultCount
    });
    return existingSearch.id;
  }

  const title = `Search: ${query}`;
  return await db.savedSearches.add({
    query: normalizedQuery,
    title,
    createdAt: new Date(),
    resultCount
  });
}

export async function getSavedSearches() {
  return await db.savedSearches.toArray();
}

export async function deleteSavedSearch(id: number) {
  return await db.savedSearches.delete(id);
}

export async function clearAllAISummaries() {
  // Get all entries with AI summaries
  const entries = await db.entries.where('aiSummary').notEqual('').toArray();
  
  // Clear the aiSummary field for all entries that have one
  const updates = entries.map(entry => 
    db.entries.update(entry.id!, { aiSummary: null })
  );
  
  await Promise.all(updates);
  return entries.length; // Return number of cleared summaries
}

export async function deleteFeed(feedId: number) {
  await db.transaction('rw', [db.feeds, db.entries], async () => {
    // Delete the feed
    await db.feeds.delete(feedId);
    
    // Get all entries for this feed
    const entries = await db.entries
      .where('feedId')
      .equals(feedId)
      .toArray();
    
    // Update or delete entries based on their status
    for (const entry of entries) {
      if (entry.isStarred || entry.chatHistory?.length) {
        await db.entries.update(entry.id!, {
          feedId: null
        });
      } else {
        await db.entries.delete(entry.id!);
      }
    }
  });
}

export async function saveChatHistory(entryId: number, messages: ChatMessage[]) {
  return await db.entries.update(entryId, { 
    chatHistory: messages,
    lastChatDate: new Date()
  });
}

export async function getChatHistory(entryId: number): Promise<ChatMessage[] | undefined> {
  const entry = await db.entries.get(entryId);
  return entry?.chatHistory;
}

export async function getEntriesWithChats() {
  const entries = await db.entries
    .filter(entry => {
      if (!entry.chatHistory || entry.chatHistory.length === 0) return false;
      // Only count entries that have at least one user message and one assistant message
      const hasUserMessage = entry.chatHistory.some(msg => msg.role === 'user');
      const hasAssistantMessage = entry.chatHistory.some(msg => msg.role === 'assistant');
      return hasUserMessage && hasAssistantMessage;
    })
    .toArray();

  // Sort by lastChatDate (most recent first), falling back to the most recent message timestamp
  return entries.sort((a, b) => {
    // If we have lastChatDate, use it
    if (a.lastChatDate && b.lastChatDate) {
      return b.lastChatDate.getTime() - a.lastChatDate.getTime();
    }
    
    // Otherwise, find the most recent message in each chat history
    const aLatest = a.chatHistory!.reduce((latest, msg) => 
      msg.timestamp > latest ? msg.timestamp : latest, 
      new Date(0)
    );
    const bLatest = b.chatHistory!.reduce((latest, msg) => 
      msg.timestamp > latest ? msg.timestamp : latest, 
      new Date(0)
    );
    return bLatest.getTime() - aLatest.getTime();
  });
}

export async function updateSearchResultCounts() {
  const searches = await db.savedSearches.toArray();
  
  // Update each search's result count
  const updates = searches.map(async (search) => {
    const results = await searchEntries(search.query);
    return db.savedSearches.update(search.id!, {
      resultCount: results.length
    });
  });
  
  await Promise.all(updates);
}

export async function updateFeedOrder(updates: { feedId: number; folderId: number | null; order: number }[]) {
  return await db.transaction('rw', db.feeds, async () => {
    try {
      // Process all updates in a single transaction
      await Promise.all(
        updates.map(async update => {
          const feed = await db.feeds.get(update.feedId);
          if (feed) {
            await db.feeds.update(feed.id!, {
              folderId: update.folderId,
              order: update.order
            });
          }
        })
      );
    } catch (error) {
      console.error('Error in updateFeedOrder transaction:', error);
      throw error; // Re-throw to trigger error handling in components
    }
  });
}

export async function updateFolderOrder(updates: { folderId: number; order: number }[]) {
  return await db.transaction('rw', db.folders, async () => {
    try {
      await Promise.all(
        updates.map(async update => {
          const folder = await db.folders.get(update.folderId);
          if (folder) {
            await db.folders.update(folder.id!, {
              order: update.order
            });
          }
        })
      );
    } catch (error) {
      console.error('Error in updateFolderOrder transaction:', error);
      throw error;
    }
  });
}

export async function deleteFolder(folderId: number) {
  return await db.transaction('rw', [db.folders, db.feeds], async () => {
    // Move all feeds in this folder to unorganized
    await db.feeds
      .where('folderId')
      .equals(folderId)
      .modify({ folderId: null });
    
    // Delete the folder
    await db.folders.delete(folderId);
  });
}

export async function markAsProcessed(entryId: number) {
  return await db.entries.update(entryId, { hasBeenProcessed: true });
}

export async function updateRequestStatus(
  entryId: number, 
  status: 'pending' | 'success' | 'failed',
  error?: {
    message: string;
    code?: string;
    details?: string;
  }
) {
  const update: Partial<FeedEntry> = {
    requestProcessingStatus: status,
    lastRequestAttempt: new Date()
  };

  if (error) {
    update.requestError = error;
  } else {
    // Clear any existing error when status is success or pending
    update.requestError = undefined;
  }

  return await db.entries.update(entryId, update);
}

export type { Feed, FeedEntry, Folder, SavedSearch, ChatMessage }; 