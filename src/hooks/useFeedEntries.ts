import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import {
  getFeedEntries,
  getAllEntries,
  getStarredEntries,
  getListenedEntries,
  getRecommendedEntries,
  getFeedsByFolder,
  getAllFeeds,
  type FeedEntryWithTitle,
  db,
} from '../services/db';
import { refreshFeed, refreshFeeds } from '../services/feedParser';
import { usePullToRefresh } from './usePullToRefresh';
import { useInfiniteScroll } from './useInfiniteScroll';

interface UseFeedEntriesOptions {
  /** When provided (e.g. search results), these entries are shown verbatim and DB loading is skipped. */
  propEntries?: FeedEntryWithTitle[];
  feedId?: string;
  folderId: string | null;
  pathname: string;
  pageSize: number;
  listRef: RefObject<HTMLElement | null>;
}

/**
 * Owns the FeedList entry lifecycle: route-based loading, DB pagination /
 * infinite scroll, and pull-to-refresh. Extracted from FeedList so the component
 * is left with presentation, selection, and per-entry actions.
 */
export function useFeedEntries({
  propEntries,
  feedId,
  folderId,
  pathname,
  pageSize,
  listRef,
}: UseFeedEntriesOptions) {
  const [entries, setEntries] = useState<FeedEntryWithTitle[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const isLoadingMoreRef = useRef(false);

  // Only "All Items" and a single feed are DB-paginated; the aggregate views
  // (folder/starred/listened/recommended) and prop-driven lists load in full.
  const isDBPaginated =
    !propEntries &&
    !folderId &&
    !pathname.startsWith('/starred') &&
    !pathname.startsWith('/listened') &&
    !pathname.startsWith('/recommended');

  // Load more entries for infinite scroll
  const loadMoreEntries = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;

    try {
      const nextPage = currentPage + 1;

      if (isDBPaginated) {
        let result;
        if (feedId) {
          result = await getFeedEntries(parseInt(feedId), nextPage, pageSize);
        } else {
          result = await getAllEntries(nextPage, pageSize);
        }

        if (result.entries.length > 0) {
          setEntries(prev => [...prev, ...result.entries]);
          setCurrentPage(nextPage);
          setHasMore(entries.length + result.entries.length < result.total);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error('Error loading more entries:', error);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [currentPage, hasMore, feedId, isDBPaginated, entries.length, pageSize]);

  const { sentinelRef, isLoading: isLoadingMore } = useInfiniteScroll({
    onLoadMore: loadMoreEntries,
    hasMore,
    threshold: 300,
    enabled: isDBPaginated,
  });

  // Load entries based on current route
  useEffect(() => {
    const loadEntries = async () => {
      try {
        let loadedEntries: FeedEntryWithTitle[];
        let totalEntriesCount = 0;
        // This effect runs on route change and always loads the first page
        // (currentPage is reset to 1 below). Use a literal 1 rather than the
        // closed-over currentPage, which still holds the previous route's page.
        const page = 1;

        if (propEntries) {
          loadedEntries = propEntries;
          totalEntriesCount = propEntries.length;
        } else if (folderId) {
          // Get all feeds in the folder
          const folderFeeds = await getFeedsByFolder(parseInt(folderId));
          // Get entries for each feed and combine them
          const entriesPromises = folderFeeds.map(feed => getFeedEntries(feed.id!));
          const feedEntries = await Promise.all(entriesPromises);
          // Flatten and ensure dates are properly converted
          loadedEntries = feedEntries
            .map(result => result.entries)
            .flat()
            .map(entry => ({
              ...entry,
              publishDate: new Date(entry.publishDate),
              readDate: entry.readDate ? new Date(entry.readDate) : undefined,
              starredDate: entry.starredDate ? new Date(entry.starredDate) : undefined,
              listenedDate: entry.listenedDate ? new Date(entry.listenedDate) : undefined,
              lastChatDate: entry.lastChatDate ? new Date(entry.lastChatDate) : undefined
            }))
            .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
          totalEntriesCount = loadedEntries.length;
        } else if (feedId) {
          const result = await getFeedEntries(parseInt(feedId), page, pageSize);
          loadedEntries = result.entries;
          totalEntriesCount = result.total;
        } else if (pathname === '/starred') {
          loadedEntries = await getStarredEntries();
          totalEntriesCount = loadedEntries.length;
        } else if (pathname === '/listened') {
          loadedEntries = await getListenedEntries();
          totalEntriesCount = loadedEntries.length;
          // Sort by listenedDate in descending order
          loadedEntries.sort((a, b) => {
            const dateA = a.listenedDate?.getTime() || 0;
            const dateB = b.listenedDate?.getTime() || 0;
            return dateB - dateA;
          });
        } else if (pathname === '/recommended') {
          loadedEntries = await getRecommendedEntries();
          totalEntriesCount = loadedEntries.length;
        } else {
          const result = await getAllEntries(page, pageSize);
          loadedEntries = result.entries;
          totalEntriesCount = result.total;
        }

        setEntries(loadedEntries);
        setTotalItems(totalEntriesCount);

        // For DB-paginated routes, check if there are more items to load
        setHasMore(isDBPaginated && loadedEntries.length < totalEntriesCount);
      } catch (error) {
        console.error('Error loading entries:', error);
        setEntries([]);
        setTotalItems(0);
        setHasMore(false);
      }
    };

    // Reset state when route changes
    setCurrentPage(1);
    setHasMore(true);
    loadEntries();
    // isDBPaginated is derived from these same inputs, so it is intentionally
    // not listed to keep the load semantics identical to the original effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedId, folderId, pathname, propEntries]);

  // Pull-to-refresh re-fetches the current view.
  const handlePullToRefresh = useCallback(async () => {
    if (feedId) {
      const feed = await db.feeds.get(parseInt(feedId));
      if (feed) {
        await refreshFeed(feed);
        const loaded = (await getFeedEntries(parseInt(feedId))).entries;
        setEntries(loaded);
      }
    } else if (folderId) {
      const folderFeeds = await getFeedsByFolder(parseInt(folderId));
      await refreshFeeds(folderFeeds);
      const results = await Promise.all(folderFeeds.map(f => getFeedEntries(f.id!)));
      const loaded = results.flatMap(r => r.entries)
        .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
      setEntries(loaded);
    } else {
      const allFeeds = await getAllFeeds();
      await refreshFeeds(allFeeds);
      if (pathname === '/starred') {
        setEntries(await getStarredEntries());
      } else if (pathname === '/listened') {
        setEntries(await getListenedEntries());
      } else if (pathname === '/recommended') {
        setEntries(await getRecommendedEntries());
      } else {
        const result = await getAllEntries(currentPage, pageSize);
        setEntries(result.entries);
      }
    }
  }, [feedId, folderId, pathname, currentPage, pageSize]);

  const { state: pullState } = usePullToRefresh(listRef, {
    onRefresh: handlePullToRefresh,
    enabled: true,
  });

  return {
    entries,
    setEntries,
    totalItems,
    hasMore,
    sentinelRef,
    isLoadingMore,
    pullState,
  };
}
