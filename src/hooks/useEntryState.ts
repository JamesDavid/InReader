/**
 * Hook for managing entry state with event-based synchronization
 */

import { useState, useEffect } from 'react';
import { type FeedEntryWithTitle, db, getFeedTitle, subscribeToEntryUpdates } from '../services/db';
import { useAppEventListener } from '../utils/eventDispatcher';

interface UseEntryStateOptions {
  entry: FeedEntryWithTitle;
}

interface UseEntryStateResult {
  currentEntry: FeedEntryWithTitle;
  setCurrentEntry: React.Dispatch<React.SetStateAction<FeedEntryWithTitle>>;
  feedTitle: string;
  isRefreshing: boolean;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Manages entry state with automatic synchronization via custom events and DB subscriptions
 */
export function useEntryState({ entry }: UseEntryStateOptions): UseEntryStateResult {
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [feedTitle, setFeedTitle] = useState(entry.feedTitle);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync with prop changes only when rendering a different entry.
  // For the same entry, the DB subscription provides fresher data
  // and must not be overwritten by a stale prop.
  useEffect(() => {
    setCurrentEntry(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  // Fetch feed title when feedId changes
  useEffect(() => {
    if (entry.feedId) {
      getFeedTitle(entry.feedId).then(title => setFeedTitle(title));
    }
  }, [entry.feedId]);

  // Subscribe to database updates for this entry
  useEffect(() => {
    if (!entry.id) return;

    const unsubscribe = subscribeToEntryUpdates(async (updatedEntryId) => {
      if (updatedEntryId === entry.id) {
        const updated = await db.entries.get(entry.id);
        if (updated) {
          const feed = await db.feeds.get(updated.feedId!);
          setCurrentEntry({
            ...updated,
            feedTitle: feed?.title || 'Unknown Feed'
          });
        }
      }
    });

    return unsubscribe;
  }, [entry.id]);

  // Listen for entryReadChanged events
  useAppEventListener('entryReadChanged', (event) => {
    if (event.detail.entryId === currentEntry.id) {
      setCurrentEntry(prev => ({ ...prev, isRead: event.detail.isRead }));
    }
  }, [currentEntry.id]);

  // Listen for entryUpdated events
  useAppEventListener('entryUpdated', (event) => {
    if (event.detail.entry.id === currentEntry.id) {
      setCurrentEntry(event.detail.entry);
    }
  }, [currentEntry.id]);

  // Listen for entryRefreshStart events
  useAppEventListener('entryRefreshStart', (event) => {
    if (event.detail.entryId === currentEntry.id) {
      setIsRefreshing(true);
    }
  }, [currentEntry.id]);

  // Listen for entryRefreshComplete events
  useAppEventListener('entryRefreshComplete', (event) => {
    if (event.detail.entry.id === currentEntry.id) {
      setCurrentEntry(event.detail.entry);
      setIsRefreshing(false);
    }
  }, [currentEntry.id]);

  return {
    currentEntry,
    setCurrentEntry,
    feedTitle,
    isRefreshing,
    setIsRefreshing
  };
}
