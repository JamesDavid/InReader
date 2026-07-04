import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation, useOutletContext } from 'react-router-dom';
import { getFeedEntries, getAllEntries, getStarredEntries, getListenedEntries, getRecommendedEntries, markAsRead, toggleStar, type FeedEntryWithTitle } from '../services/db';
import ChatModal from './ChatModal';
import FeedListEntry from './FeedListEntry';
import { useFeedEntries } from '../hooks/useFeedEntries';
import { getInterestProfile } from '../services/interestService';
import { useMobileDetection } from '../hooks/useMobileDetection';
import { dispatchAppEvent, useAppEventListener } from '../utils/eventDispatcher';

interface ContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  selectedEntryId: number | null;
  onSelectedEntryIdChange: (id: number | null) => void;
  onOpenChat: (entry: FeedEntryWithTitle) => void;
}

interface FeedListProps {
  isDarkMode?: boolean;
  isFocused?: boolean;
  onFocusChange?: (focused: boolean) => void;
  entries?: FeedEntryWithTitle[];
  onEntriesUpdate?: (entries: FeedEntryWithTitle[]) => void;
}

const ITEMS_PER_PAGE = 20;

const FeedList: React.FC<FeedListProps> = (props) => {
  const context = useOutletContext<ContextType>();
  const isDarkMode = props.isDarkMode ?? context.isDarkMode;
  const isFocused = props.isFocused ?? context.isFocused;
  const onFocusChange = props.onFocusChange ?? context.onFocusChange;
  const showUnreadOnly = context.showUnreadOnly;
  const selectedIndex = context.selectedIndex;
  const onSelectedIndexChange = context.onSelectedIndexChange;
  const selectedEntryId = context.selectedEntryId;
  const onSelectedEntryIdChange = context.onSelectedEntryIdChange;
  const onOpenChat = context.onOpenChat;

  const isMobile = useMobileDetection();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatEntry, setChatEntry] = useState<FeedEntryWithTitle | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const readTimerRef = useRef<{ [key: number]: NodeJS.Timeout }>({});
  const contentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const prevSelectedEntryIdRef = useRef<number | null>(null);
  const { feedId } = useParams();
  const location = useLocation();
  const folderId = location.pathname.startsWith('/folder/') ? location.pathname.split('/folder/')[1] : null;

  // Entry loading, DB pagination / infinite scroll, and pull-to-refresh.
  const {
    entries,
    setEntries,
    totalItems,
    hasMore,
    sentinelRef,
    isLoadingMore,
    pullState,
  } = useFeedEntries({
    propEntries: props.entries,
    feedId,
    folderId,
    pathname: location.pathname,
    pageSize: ITEMS_PER_PAGE,
    listRef,
  });

  const [expandedEntries, setExpandedEntries] = useState<{ [key: number]: boolean }>({});
  const [dismissedEntryIds, setDismissedEntryIds] = useState<Set<number>>(new Set());
  const [interestTagNames, setInterestTagNames] = useState<Set<string>>(new Set());
  const displayItemsRef = useRef<FeedEntryWithTitle[]>([]);
  const selectedEntryIdRef = useRef<number | null>(selectedEntryId);
  const selectedIndexRef = useRef<number>(selectedIndex);
  const entriesRef = useRef<FeedEntryWithTitle[]>(entries);
  entriesRef.current = entries;

  // Filter entries based on showUnreadOnly and dismissed entries
  const displayItems = useMemo(() => {
    let result = entries;
    if (dismissedEntryIds.size > 0) {
      result = result.filter(entry => !dismissedEntryIds.has(entry.id!));
    }
    if (showUnreadOnly) {
      // Keep the entry you're currently on visible even after it's marked read,
      // so it isn't yanked out from under you while reading. It drops off once
      // you move to another entry.
      result = result.filter(entry => !entry.isRead || entry.id === selectedEntryId);
    }
    return result;
  }, [entries, showUnreadOnly, dismissedEntryIds, selectedEntryId]);

  // Keep refs in sync for use in event handlers
  displayItemsRef.current = displayItems;
  selectedEntryIdRef.current = selectedEntryId;
  selectedIndexRef.current = selectedIndex;

  // Ensure selection is within bounds
  useEffect(() => {
    if (selectedIndex >= displayItems.length) {
      onSelectedIndexChange(Math.max(0, displayItems.length - 1));
    }
  }, [displayItems.length, selectedIndex, onSelectedIndexChange]);

  const handleMarkAsRead = useCallback(async (entryId: number, isRead?: boolean) => {
    // Dispatch event first for immediate UI update
    dispatchAppEvent('entryReadChanged', { entryId, isRead: isRead ?? true });

    // Then update database
    await markAsRead(entryId, isRead);

    // Dispatch event for sidebar update
    dispatchAppEvent('entryMarkedAsRead', { feedId: feedId ? parseInt(feedId) : undefined });
  }, [feedId]);

  const handleToggleStar = useCallback(async (entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    const newStarred = !entry?.isStarred;
    const starredDate = newStarred ? new Date() : undefined;

    // Update local state immediately
    setEntries(prev =>
      prev.map(e =>
        e.id === entryId
          ? { ...e, isStarred: newStarred, starredDate }
          : e
      )
    );

    // Persist to DB
    await toggleStar(entryId);

    // Notify other components (interest profile, etc.)
    dispatchAppEvent('entryStarredChanged', {
      entryId,
      isStarred: newStarred,
      starredDate,
    });
  }, [entries, setEntries]);

  const getContentLength = (content: string): number => {
    // DOMParser parses without executing scripts or fetching resources
    // (e.g. <img onerror>), unlike assigning to a live element's innerHTML.
    const doc = new DOMParser().parseFromString(content, 'text/html');
    return (doc.body.textContent || '').length;
  };

  const toggleExpanded = useCallback((entryId: number) => {
    // Don't toggle if content is short
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const content = entry.content_fullArticle || entry.content_rssAbstract;
    if (!content || getContentLength(content) <= 600) return;

    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  }, [entries]);

  const handleContentView = useCallback((entry: FeedEntryWithTitle) => {
    if (!entry.id || entry.isRead) return;
    // On mobile, mark as read when navigating away instead of on a timer
    if (isMobile) return;

    // Set a timer to mark as read after dwelling (desktop only)
    readTimerRef.current[entry.id] = setTimeout(async () => {
      await markAsRead(entry.id!);
      // Use the functional form so a concurrent star/read update isn't clobbered.
      setEntries(prev => {
        const updatedEntries = prev.map(e =>
          e.id === entry.id
            ? { ...e, isRead: true }
            : e
        );
        props.onEntriesUpdate?.(updatedEntries);
        return updatedEntries;
      });
      // Clean up the timer reference
      delete readTimerRef.current[entry.id!];
    }, 2000); // 2 second dwell time
    // Depends on props.onEntriesUpdate specifically, not the whole props object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.onEntriesUpdate, isMobile, setEntries]);

  // Clear any pending dwell timers on unmount to avoid setState-after-unmount.
  useEffect(() => {
    const timers = readTimerRef.current;
    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  // Reflect star changes into local state immediately.
  useAppEventListener('entryStarredChanged', (event) => {
    setEntries(prevEntries =>
      prevEntries.map(entry =>
        entry.id === event.detail.entryId
          ? {
              ...entry,
              isStarred: event.detail.isStarred,
              starredDate: event.detail.starredDate
            }
          : entry
      )
    );
  }, []);

  // Reflect read-state changes into local state immediately.
  useAppEventListener('entryReadChanged', (event) => {
    setEntries(prevEntries =>
      prevEntries.map(entry =>
        entry.id === event.detail.entryId
          ? { ...entry, isRead: event.detail.isRead }
          : entry
      )
    );
  }, []);

  // Handle mobile swipe dismiss: remove entry from rendered list and advance selection
  useAppEventListener('mobileSwipeDismiss', (event) => {
    const { entryId } = event.detail;

    // Build the post-dismiss list to determine next selection
    const currentItems = displayItemsRef.current;
    const currentIdx = currentItems.findIndex(e => e.id === entryId);
    const remainingItems = currentItems.filter(e => e.id !== entryId);

    // Pick the entry that will occupy the same position, or the new last entry
    const nextIdx = Math.min(currentIdx, remainingItems.length - 1);
    const nextEntry = nextIdx >= 0 ? remainingItems[nextIdx] : null;

    setDismissedEntryIds(prev => {
      const next = new Set(prev);
      next.add(entryId);
      return next;
    });

    if (nextEntry?.id) {
      onSelectedIndexChange(nextIdx);
      onSelectedEntryIdChange(nextEntry.id!);
    }
  }, [onSelectedIndexChange, onSelectedEntryIdChange]);

  // On mobile, mark previous entry as read when selecting a new one
  useEffect(() => {
    if (!isMobile) return;
    const prevId = prevSelectedEntryIdRef.current;
    prevSelectedEntryIdRef.current = selectedEntryId;

    if (prevId && prevId !== selectedEntryId) {
      const prevEntry = entries.find(e => e.id === prevId);
      if (prevEntry && !prevEntry.isRead) {
        handleMarkAsRead(prevId);
      }
    }
  }, [selectedEntryId, isMobile, entries, handleMarkAsRead]);

  // On desktop, mark the SELECTED article read after dwelling on it for 2s. This
  // makes keyboard (j/k) reading mark entries read — the mouse-hover dwell only
  // fires when the cursor is over the entry. Moving to another entry before the
  // timer elapses cancels it. entriesRef is read at fire time so the timer isn't
  // re-armed on every unrelated entries update.
  useEffect(() => {
    if (isMobile || selectedEntryId == null) return;
    const entry = entriesRef.current.find(e => e.id === selectedEntryId);
    if (!entry || entry.isRead) return;
    const timer = setTimeout(() => {
      const current = entriesRef.current.find(e => e.id === selectedEntryId);
      if (current && !current.isRead) {
        handleMarkAsRead(selectedEntryId);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedEntryId, isMobile, handleMarkAsRead]);

  // Clear dismissed entries when route changes (navigating to different feed/view)
  useEffect(() => {
    setDismissedEntryIds(new Set());
  }, [feedId, folderId, location.pathname]);

  // Preserve selection when entries reorder (feed refresh, AI processing, score changes)
  useEffect(() => {
    const entryId = selectedEntryIdRef.current;
    if (entryId == null || displayItems.length === 0) return;
    const newIdx = displayItems.findIndex(e => e.id === entryId);
    if (newIdx >= 0 && newIdx !== selectedIndexRef.current) {
      onSelectedIndexChange(newIdx);
    }
  }, [displayItems, onSelectedIndexChange]);

  // When a feed we're viewing gets refreshed, reload its entries.
  useAppEventListener('feedRefreshed', async (event) => {
    const refreshedId = event.detail.feedId;
    const currentFeedId = feedId ? parseInt(feedId) : null;
    if (refreshedId != null && currentFeedId === refreshedId) {
      const loadedEntries = (await getFeedEntries(refreshedId)).entries;
      setEntries(loadedEntries);
    }
  }, [feedId]);

  // Load interest tag names for highlighting tag pills; refresh on star changes.
  const loadInterestTags = useCallback(async () => {
    const profile = await getInterestProfile();
    setInterestTagNames(new Set(profile.map(t => t.tag)));
  }, []);
  useEffect(() => { loadInterestTags(); }, [loadInterestTags]);
  useAppEventListener('entryStarredChanged', loadInterestTags, [loadInterestTags]);

  return (
    <>
      <div 
        ref={listRef}
        className={`h-full overflow-y-auto overscroll-contain ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        onClick={() => !isFocused && onFocusChange(true)}
        tabIndex={0}
      >
        {(pullState.isPulling || pullState.isRefreshing) && (
          <div
            className={`flex items-center justify-center overflow-hidden ${
              pullState.isRefreshing ? 'sticky top-0 z-10' : ''
            } ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
            style={{ height: pullState.isRefreshing ? 48 : pullState.pullDistance }}
          >
            {pullState.isRefreshing ? (
              <svg className="h-5 w-5 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                pullState.pullDistance >= 80 ? 'rotate-180 text-blue-500' : ''
              }`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
        )}
        {displayItems.length === 0 ? (
          <div className={`text-center mt-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {entries.length === 0 ? 'No entries to display' : 'No unread entries'}
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            <div className="flex-grow">
              <div>
                {displayItems.map((entry, index) => (
                    <FeedListEntry
                      key={entry.id}
                      entry={entry}
                      index={index}
                      isSelected={selectedIndex === index}
                      isFocused={isFocused}
                      isDarkMode={isDarkMode}
                      isChatOpen={isChatOpen}
                      isExpanded={expandedEntries[entry.id!] || false}
                      onSelect={(idx: number) => {
                        onSelectedIndexChange(idx);
                        onSelectedEntryIdChange(entry.id!);
                      }}
                      interestTagNames={interestTagNames}
                      onFocusChange={onFocusChange}
                      onMarkAsRead={handleMarkAsRead}
                      onToggleStar={handleToggleStar}
                      onToggleExpand={toggleExpanded}
                      onContentView={handleContentView}
                      onContentLeave={(entryId) => {
                        if (readTimerRef.current[entryId]) {
                          clearTimeout(readTimerRef.current[entryId]);
                          delete readTimerRef.current[entryId];
                        }
                      }}
                      contentRef={(element) => {
                        if (entry.id) {
                          contentRefs.current[entry.id] = element;
                        }
                      }}
                      onOpenChat={onOpenChat}
                    />
                  ))}
                </div>

                {/* Infinite scroll sentinel */}
                {hasMore && (
                  <div
                    ref={sentinelRef as React.RefObject<HTMLDivElement>}
                    className={`flex items-center justify-center py-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {isLoadingMore && (
                      <svg className="h-5 w-5 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                  </div>
                )}

                {/* End of list indicator */}
                {!hasMore && displayItems.length > 0 && totalItems > ITEMS_PER_PAGE && (
                  <div className={`text-center py-4 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    End of entries
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {isChatOpen && chatEntry && (
        <ChatModal
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false);
            setChatEntry(null);
          }}
          isDarkMode={isDarkMode}
          articleTitle={chatEntry.title}
          articleContent={chatEntry.content_fullArticle || chatEntry.content_rssAbstract || ''}
          articleUrl={chatEntry.link}
          entryId={chatEntry.id!}
          feedTitle={chatEntry.feedTitle}
          onChatUpdate={() => {
            const loadLatest = async () => {
              const loadedEntries = props.entries
                ? props.entries
                : feedId
                  ? (await getFeedEntries(parseInt(feedId))).entries
                  : location.pathname === '/starred'
                    ? await getStarredEntries()
                    : location.pathname === '/listened'
                      ? await getListenedEntries()
                      : location.pathname === '/recommended'
                        ? await getRecommendedEntries()
                        : (await getAllEntries()).entries;
              setEntries(loadedEntries);
            };
            loadLatest();
          }}
        />
      )}
    </>
  );
};

export default FeedList; 