import Dexie, { Table } from 'dexie';

interface Feed {
  id?: number;
  url: string;
  title: string;
  folderId?: number;
  lastUpdated?: Date;
  order?: number;
  unreadCount?: number;
  isDeleted?: boolean;
  deletedAt?: Date;
}

interface FeedEntry {
  id?: number;
  feedId: number;
  title: string;
  content_rssAbstract: string;
  content_fullArticle?: string;
  content_aiSummary?: string;
  link: string;
  publishDate: Date;
  isRead: boolean;
  readDate?: Date;
  isStarred: boolean;
  starredDate?: Date;
  isListened?: boolean;
  listenedDate?: Date;
  lastChatDate?: Date;
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

// Add a new type for entries with feed titles
interface FeedEntryWithTitle extends FeedEntry {
  feedTitle: string;
}

interface ChatMessage {
  id: string;
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
  lastUpdated?: Date;
  mostRecentResult?: Date | null;
}

class ReaderDatabase extends Dexie {
  feeds!: Table<Feed>;
  entries!: Table<FeedEntry>;
  folders!: Table<Folder>;
  savedSearches!: Table<SavedSearch>;

  constructor() {
    super('ReaderDatabase');
    
    // Define all fields that need indexing
    const entriesSchema = '++id, feedId, publishDate, isRead, readDate, isStarred, starredDate, isListened, listenedDate, lastChatDate, content_aiSummary, chatHistory, requestProcessingStatus, [feedId+link]';
    const feedsSchema = '++id, url, folderId';
    const foldersSchema = '++id, parentId';
    const savedSearchesSchema = '++id, query, createdAt, lastUpdated, mostRecentResult';

    this.version(62020).stores({
      feeds: feedsSchema,
      entries: entriesSchema,
      folders: foldersSchema,
      savedSearches: savedSearchesSchema
    }).upgrade(async tx => {
      // Ensure all existing entries have the required fields
      await tx.table('entries').toCollection().modify(entry => {
        // Migrate content fields
        if (!entry.content_rssAbstract) {
          entry.content_rssAbstract = entry.content || '';
        }
        if (!entry.content_fullArticle && entry.content && entry.content !== entry.content_rssAbstract) {
          entry.content_fullArticle = entry.content;
        }
        if (!entry.content_aiSummary && entry.aiSummary) {
          entry.content_aiSummary = entry.aiSummary;
        }
        delete entry.content;
        delete entry.aiSummary;

        // Handle other fields
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
        // Reset processing status for entries that were stuck
        if (entry.requestProcessingStatus === 'processing') {
          entry.requestProcessingStatus = 'pending';
          entry.lastRequestAttempt = null;
        }
      });

      // Add new timestamp fields to existing saved searches
      await tx.table('savedSearches').toCollection().modify(search => {
        if (!search.createdAt) {
          search.createdAt = new Date();
        }
        if (!search.lastUpdated) {
          search.lastUpdated = search.createdAt;
        }
        if (search.mostRecentResult === undefined) {
          search.mostRecentResult = null;
        }
        // Ensure dates are actual Date objects
        search.createdAt = new Date(search.createdAt);
        search.lastUpdated = new Date(search.lastUpdated);
        if (search.mostRecentResult) {
          search.mostRecentResult = new Date(search.mostRecentResult);
        }
      });
    });
  }
}

// Create a singleton instance
let dbInstance: ReaderDatabase | null = null;

// Event system for entry updates
type EntryUpdateListener = (entryId: number) => void;
const entryUpdateListeners = new Set<EntryUpdateListener>();

export function subscribeToEntryUpdates(listener: EntryUpdateListener) {
  entryUpdateListeners.add(listener);
  return () => entryUpdateListeners.delete(listener);
}

export function notifyEntryUpdate(entryId: number) {
  entryUpdateListeners.forEach(listener => listener(entryId));
}

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
      const entryId = await db.entries.add({
        ...entry,
        isListened: false,
        requestProcessingStatus: entry.requestProcessingStatus || 'pending',
        lastRequestAttempt: entry.lastRequestAttempt || undefined
      });
      
      // Update search results when new entries are added
      updateSearchResultCounts().catch(error => {
        console.error('Error updating search results after adding entry:', error);
      });
      
      return entryId;
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

export const markAsRead = async (entryId: number, isRead?: boolean) => {
  await db.entries.update(entryId, { 
    isRead: isRead ?? true,  // If isRead is not provided, defaults to true
    readDate: isRead ?? true ? new Date() : undefined  // Update readDate accordingly
  });
};

export async function markAsListened(entryId: number) {
  const result = await db.entries.update(entryId, { 
    isListened: true,
    listenedDate: new Date()
  });
  notifyEntryUpdate(entryId);
  return result;
}

export async function toggleStar(entryId: number) {
  const entry = await db.entries.get(entryId);
  if (entry) {
    const isStarred = !entry.isStarred;
    const result = await db.entries.update(entryId, {
      isStarred,
      starredDate: isStarred ? new Date() : undefined
    });
    notifyEntryUpdate(entryId);
    return result;
  }
}

export async function getFeedsByFolder(folderId?: number | null) {
  if (folderId === undefined || folderId === null) {
    return await db.feeds.filter(feed => feed.folderId === undefined || feed.folderId === null).toArray();
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

// Add feed title cache
const feedTitleCache = new Map<number, string>();

// Add this function to batch load feed titles
async function batchLoadFeedTitles(feedIds: number[]) {
  const uniqueIds = [...new Set(feedIds)];
  const uncachedIds = uniqueIds.filter(id => !feedTitleCache.has(id));
  
  if (uncachedIds.length > 0) {
    const feeds = await db.feeds.where('id').anyOf(uncachedIds).toArray();
    feeds.forEach(feed => {
      feedTitleCache.set(feed.id!, feed.isDeleted ? `${feed.title} (Deleted)` : feed.title);
    });
  }
}

// Modify getFeedTitle to use cache
export async function getFeedTitle(feedId: number): Promise<string> {
  if (feedTitleCache.has(feedId)) {
    return feedTitleCache.get(feedId)!;
  }
  
  const feed = await db.feeds.get(feedId);
  const title = feed ? (feed.isDeleted ? `${feed.title} (Deleted)` : feed.title) : 'Unknown Feed';
  feedTitleCache.set(feedId, title);
  return title;
}

// Modify addFeedTitleToEntries to use batch loading
async function addFeedTitleToEntries(entries: FeedEntry[]): Promise<FeedEntryWithTitle[]> {
  const feedIds = [...new Set(entries
    .map(entry => entry.feedId)
    .filter((id): id is number => id != null))];
  
  await batchLoadFeedTitles(feedIds);
  
  return entries.map(entry => ({
    ...entry,
    feedTitle: entry.feedId ? feedTitleCache.get(entry.feedId) || 'Unknown Feed' : 'Unknown Feed',
    publishDate: new Date(entry.publishDate),
    readDate: entry.readDate ? new Date(entry.readDate) : undefined,
    starredDate: entry.starredDate ? new Date(entry.starredDate) : undefined,
    listenedDate: entry.listenedDate ? new Date(entry.listenedDate) : undefined,
    lastChatDate: entry.lastChatDate ? new Date(entry.lastChatDate) : undefined
  }));
}

// Modify getFeedEntries to use pagination and caching
export async function getFeedEntries(feedId: number, page: number = 1, pageSize: number = 20) {
  const offset = (page - 1) * pageSize;
  
  const [entries, total] = await Promise.all([
    db.entries
      .where('feedId')
      .equals(feedId)
      .reverse()
      .offset(offset)
      .limit(pageSize)
      .sortBy('publishDate'),
    db.entries
      .where('feedId')
      .equals(feedId)
      .count()
  ]);

  const entriesWithTitles = await addFeedTitleToEntries(entries);
  
  return {
    entries: entriesWithTitles,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

// Modify getAllEntries to use pagination
export async function getAllEntries(page: number = 1, pageSize: number = 20) {
  const offset = (page - 1) * pageSize;
  
  const [entries, total] = await Promise.all([
    db.entries
      .orderBy('publishDate')
      .reverse()
      .offset(offset)
      .limit(pageSize)
      .toArray(),
    db.entries.count()
  ]);

  const entriesWithTitles = await addFeedTitleToEntries(entries);
  
  return {
    entries: entriesWithTitles,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
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

export async function getAllFeeds(includeDeleted: boolean = false) {
  // Use toCollection() to maintain Table type
  let query = db.feeds.toCollection();
  if (!includeDeleted) {
    query = query.filter(feed => !feed.isDeleted);
  }
  return await query.toArray();
}

export async function searchEntries(query: string) {
  const searchTerms = query.toLowerCase().split(' ');
  const entries = await db.entries
    .filter(entry => {
      const content = (
        entry.title + ' ' + 
        entry.content_rssAbstract + ' ' + 
        (entry.content_fullArticle || '') + ' ' + 
        (entry.content_aiSummary || '')
      ).toLowerCase();
      return searchTerms.every(term => content.includes(term));
    })
    .reverse()
    .sortBy('publishDate');
  return addFeedTitleToEntries(entries);
}

export async function saveSearch(query: string) {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Get the search results count and most recent timestamp
  const results = await searchEntries(query);
  const resultCount = results.length;
  
  // Find the most recent entry's publish date
  let mostRecentTimestamp: Date | null = null;
  if (results.length > 0) {
    // Convert all publishDates to Date objects and filter out invalid dates
    const validDates = results
      .map(entry => {
        try {
          const date = entry.publishDate instanceof Date 
            ? entry.publishDate 
            : new Date(entry.publishDate);
          return isNaN(date.getTime()) ? null : date;
        } catch (error) {
          console.warn('Invalid date for entry:', entry.title, entry.publishDate);
          return null;
        }
      })
      .filter((date): date is Date => date !== null);

    if (validDates.length > 0) {
      // Find the most recent valid date
      mostRecentTimestamp = validDates.reduce((latest, current) => 
        current > latest ? current : latest
      );
    }
  }
  
  // Check if search already exists
  const existingSearch = await db.savedSearches
    .where('query')
    .equals(normalizedQuery)
    .first();

  const now = new Date();

  if (existingSearch) {
    // Update the timestamp, result count, and most recent result
    const update = {
      lastUpdated: now,
      resultCount,
      mostRecentResult: mostRecentTimestamp
    };
    await db.savedSearches.update(existingSearch.id!, update);
    return existingSearch.id;
  }

  const title = `Search: ${query}`;
  const newSearch = {
    query: normalizedQuery,
    title,
    createdAt: now,
    resultCount,
    lastUpdated: now,
    mostRecentResult: mostRecentTimestamp
  };
  return await db.savedSearches.add(newSearch);
}

export async function getSavedSearches() {
  console.log('Getting saved searches from DB');
  const searches = await db.savedSearches.toArray();
  console.log('Raw searches from DB:', searches);
  
  // Convert date strings to Date objects
  const hydratedSearches = searches.map(search => {
    console.log('Hydrating search:', search.query, {
      rawMostRecent: search.mostRecentResult,
      type: typeof search.mostRecentResult
    });
    
    // Ensure we have valid Date objects
    const createdAt = new Date(search.createdAt);
    const lastUpdated = search.lastUpdated ? new Date(search.lastUpdated) : undefined;
    let mostRecentResult: Date | null = null;
    
    if (search.mostRecentResult) {
      try {
        mostRecentResult = new Date(search.mostRecentResult);
        // Verify it's a valid date
        if (isNaN(mostRecentResult.getTime())) {
          console.warn('Invalid mostRecentResult date for search:', search.query, search.mostRecentResult);
          mostRecentResult = null;
        }
      } catch (error) {
        console.error('Error converting mostRecentResult date:', error);
        mostRecentResult = null;
      }
    }

    const hydrated = {
      ...search,
      createdAt,
      lastUpdated,
      mostRecentResult
    };
    
    console.log('Hydrated search:', search.query, {
      mostRecentResult: hydrated.mostRecentResult,
      isDate: hydrated.mostRecentResult instanceof Date
    });
    
    return hydrated;
  });

  return hydratedSearches;
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
    const feed = await db.feeds.get(feedId);
    if (!feed) return;

    // Mark feed as deleted instead of deleting it
    await db.feeds.update(feedId, {
      isDeleted: true,
      deletedAt: new Date()
    });
    
    // Get all entries for this feed
    const entries = await db.entries
      .where('feedId')
      .equals(feedId)
      .toArray();
    
    // Only delete entries that aren't starred, listened to, or have chat history
    for (const entry of entries) {
      if (!entry.isStarred && !entry.isListened && !entry.chatHistory?.length) {
        await db.entries.delete(entry.id!);
      }
      // Note: We keep entries that are starred, listened to, or have chat history
      // and maintain their feedId for reference
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
  console.log('Getting entries with chats...');
  const entries = await db.entries
    .filter(entry => {
      if (!entry.chatHistory || entry.chatHistory.length === 0) {
        console.log('Entry has no chat history:', entry.id);
        return false;
      }

      // Only count entries that have at least one user message and one assistant message
      const hasUserMessage = entry.chatHistory.some(msg => msg.role === 'user');
      const hasAssistantMessage = entry.chatHistory.some(msg => msg.role === 'assistant' && msg.content.trim() !== '');
      
      console.log('Chat history for entry', entry.id, {
        hasUserMessage,
        hasAssistantMessage,
        messageCount: entry.chatHistory.length,
        messages: entry.chatHistory.map(msg => ({
          role: msg.role,
          contentLength: msg.content.length,
          timestamp: msg.timestamp
        }))
      });

      return hasUserMessage && hasAssistantMessage;
    })
    .toArray();

  console.log('Found entries with chats:', entries.length);

  // Add feed titles and convert to FeedEntryWithTitle
  const entriesWithTitles = await addFeedTitleToEntries(entries);

  // Sort by lastChatDate (most recent first), falling back to the most recent message timestamp
  const sortedEntries = entriesWithTitles.sort((a, b) => {
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

  console.log('Sorted entries:', sortedEntries.map(e => ({
    id: e.id,
    title: e.title,
    lastChatDate: e.lastChatDate,
    messageCount: e.chatHistory?.length
  })));

  return sortedEntries;
}

export async function updateSearchResultCounts() {
  const searches = await db.savedSearches.toArray();
  const now = new Date();
  
  // Process searches in batches
  const batchSize = 5;
  for (let i = 0; i < searches.length; i += batchSize) {
    const batch = searches.slice(i, i + batchSize);
    await Promise.all(batch.map(async (search) => {
      const results = await searchEntries(search.query);
      let mostRecentTimestamp: Date | null = null;
      if (results.length > 0) {
        mostRecentTimestamp = results.reduce((latest, entry) => {
          const entryDate = entry.publishDate;
          return entryDate > latest ? entryDate : latest;
        }, results[0].publishDate);
      }

      return db.savedSearches.update(search.id!, {
        resultCount: results.length,
        lastUpdated: now,
        mostRecentResult: mostRecentTimestamp
      });
    }));
  }
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

export async function getMostRecentEntry(feedId: number): Promise<FeedEntry | undefined> {
  return await db.entries
    .where('feedId')
    .equals(feedId)
    .reverse()
    .sortBy('publishDate')
    .then(entries => entries[0]);
}

export async function updateFeedTitle(feedId: number, newTitle: string) {
  return await withErrorHandling(async () => {
    const feed = await db.feeds.get(feedId);
    if (!feed) {
      throw new Error('Feed not found');
    }
    return await db.feeds.update(feedId, { title: newTitle });
  });
}

export async function updateFolderName(folderId: string, newName: string) {
  return await withErrorHandling(async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) {
      throw new Error('Folder not found');
    }
    return await db.folders.update(folderId, { name: newName });
  });
}

export type { Feed, FeedEntry, FeedEntryWithTitle, Folder, SavedSearch, ChatMessage }; 

// Add function to clear feed title cache when needed
export function clearFeedTitleCache() {
  feedTitleCache.clear();
}