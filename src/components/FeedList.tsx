import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { getFeedEntries, getAllEntries, getStarredEntries, getListenedEntries, getFeedsByFolder, markAsRead, toggleStar, type FeedEntryWithTitle, db } from '../services/db';
import ChatModal from './ChatModal';
import ttsService from '../services/ttsService';
import FeedListEntry from './FeedListEntry';
import { PaginationService, type PaginationState } from '../services/paginationService';
import { refreshFeed } from '../services/feedParser';
import { Pagination } from './Pagination';

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
  const onOpenChat = context.onOpenChat;

  const [entries, setEntries] = useState<FeedEntryWithTitle[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatEntry, setChatEntry] = useState<FeedEntryWithTitle | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const readTimerRef = useRef<{ [key: number]: NodeJS.Timeout }>({});
  const contentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const { feedId } = useParams();
  const location = useLocation();
  const folderId = location.pathname.startsWith('/folder/') ? location.pathname.split('/folder/')[1] : null;
  const [expandedEntries, setExpandedEntries] = useState<{ [key: number]: boolean }>({});
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedState, setPaginatedState] = useState<PaginationState<FeedEntryWithTitle>>({
    items: [],
    currentPage: 1,
    totalItems: 0,
    itemsPerPage: 20,
    totalPages: 0
  });
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [targetPage, setTargetPage] = useState(1);

  // Filter entries based on showUnreadOnly
  const filteredEntries = useMemo(() => {
    return showUnreadOnly ? entries.filter(entry => !entry.isRead) : entries;
  }, [entries, showUnreadOnly]);

  // Update pagination state when page or entries change
  useEffect(() => {
    if (!isLoadingPage) return; // Only load if we're in loading state

    console.log('Loading page entries:', {
      totalItems: paginatedState.totalItems,
      entriesLength: entries.length,
      filteredEntriesLength: filteredEntries.length,
      currentPage,
      showUnreadOnly
    });

    // Load new page of entries if needed
    const loadPageEntries = async () => {
      try {
        if (!props.entries && !folderId && !location.pathname.startsWith('/starred') && !location.pathname.startsWith('/listened')) {
          let result;
          if (feedId) {
            result = await getFeedEntries(parseInt(feedId), currentPage, ITEMS_PER_PAGE);
          } else {
            result = await getAllEntries(currentPage, ITEMS_PER_PAGE);
          }
          
          console.log('Loaded new page:', {
            currentPage,
            loadedCount: result.entries.length,
            totalItems: result.total
          });

          setEntries(result.entries);
          setPaginatedState(prev => ({
            items: showUnreadOnly ? result.entries.filter(entry => !entry.isRead) : result.entries,
            currentPage,
            totalItems: result.total,
            itemsPerPage: ITEMS_PER_PAGE,
            totalPages: Math.ceil(result.total / ITEMS_PER_PAGE)
          }));
        } else {
          // For other cases (starred, listened, folder), handle pagination locally
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredEntries.length);
          const pageItems = filteredEntries.slice(startIndex, endIndex);

          setPaginatedState(prev => ({
            items: pageItems,
            currentPage,
            totalItems: prev.totalItems,
            itemsPerPage: ITEMS_PER_PAGE,
            totalPages: prev.totalPages
          }));
        }
      } catch (error) {
        console.error('Error loading page entries:', error);
      } finally {
        setIsLoadingPage(false);
      }
    };

    loadPageEntries();
  }, [currentPage, isLoadingPage]); // Only depend on currentPage and isLoadingPage

  // Add a separate effect to handle filtered entries updates
  useEffect(() => {
    if (isLoadingPage) return; // Don't update while loading

    if (props.entries || folderId || location.pathname.startsWith('/starred') || location.pathname.startsWith('/listened')) {
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredEntries.length);
      const pageItems = filteredEntries.slice(startIndex, endIndex);

      setPaginatedState(prev => ({
        items: pageItems,
        currentPage,
        totalItems: filteredEntries.length,
        itemsPerPage: ITEMS_PER_PAGE,
        totalPages: Math.ceil(filteredEntries.length / ITEMS_PER_PAGE)
      }));
    }
  }, [filteredEntries, showUnreadOnly, props.entries, folderId, location.pathname, currentPage]);

  // Ensure selection is within bounds
  useEffect(() => {
    if (selectedIndex >= paginatedState.items.length) {
      onSelectedIndexChange(Math.max(0, paginatedState.items.length - 1));
    }
  }, [paginatedState.items.length, selectedIndex, onSelectedIndexChange]);

  // Handle scrolling
  useEffect(() => {
    if (!isFocused || paginatedState.items.length === 0) return;
  }, [selectedIndex, isFocused, paginatedState.items.length]);

  const handleMarkAsRead = useCallback(async (entryId: number, isRead?: boolean) => {
    // Dispatch event first for immediate UI update
    window.dispatchEvent(new CustomEvent('entryReadChanged', {
      detail: { 
        entryId,
        isRead: isRead ?? true
      }
    }));

    // Then update database
    await markAsRead(entryId, isRead);

    // Dispatch event for sidebar update
    const event = new CustomEvent('entryMarkedAsRead', {
      detail: { feedId: feedId ? parseInt(feedId) : null }
    });
    window.dispatchEvent(event);
  }, [feedId]);

  const handleToggleStar = useCallback(async (entryId: number) => {
    await toggleStar(entryId);
    // Then refresh from DB
    const loadedEntries = props.entries 
      ? props.entries 
      : feedId 
        ? (await getFeedEntries(parseInt(feedId))).entries
        : location.pathname === '/starred'
          ? await getStarredEntries()
          : location.pathname === '/listened'
            ? await getListenedEntries()
            : (await getAllEntries()).entries;
    setEntries(loadedEntries);
  }, [feedId, location.pathname, props.entries]);

  const getContentLength = (content: string): number => {
    const div = document.createElement('div');
    div.innerHTML = content;
    return (div.textContent || div.innerText || '').length;
  };

  const isContentFullyVisible = useCallback((entryId: number) => {
    const contentElement = contentRefs.current[entryId];
    if (!contentElement) return true;

    const rect = contentElement.getBoundingClientRect();
    const containerRect = listRef.current?.getBoundingClientRect();
    if (!containerRect) return true;

    return rect.bottom <= containerRect.bottom;
  }, []);

  const scrollContent = useCallback((entryId: number) => {
    const contentElement = contentRefs.current[entryId];
    if (!contentElement || !listRef.current) return;

    const containerRect = listRef.current.getBoundingClientRect();
    listRef.current.scrollBy({
      top: containerRect.height * 0.5,
      behavior: 'smooth'
    });
  }, []);

  const handleSpaceKey = useCallback((entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    const content = entry?.content_fullArticle || entry?.content_rssAbstract || '';
    const contentLength = getContentLength(content);
    if (contentLength <= 600) return;

    // If not expanded, expand it
    if (!expandedEntries[entryId]) {
      setExpandedEntries(prev => ({ ...prev, [entryId]: true }));
      return;
    }

    // If expanded but not fully visible, scroll
    if (!isContentFullyVisible(entryId)) {
      scrollContent(entryId);
      return;
    }

    // If expanded and fully visible, collapse
    setExpandedEntries(prev => ({ ...prev, [entryId]: false }));
  }, [entries, expandedEntries, isContentFullyVisible, scrollContent]);

  const handleRefreshCurrentFeed = useCallback(async () => {
    if (!feedId && !folderId) return;
    
    try {
      if (feedId) {
        const feed = await db.feeds.get(parseInt(feedId));
        if (feed) {
          await refreshFeed(feed);
          const loadedEntries = (await getFeedEntries(parseInt(feedId))).entries;
          setEntries(loadedEntries);
        }
      } else if (folderId) {
        const folderFeeds = await getFeedsByFolder(parseInt(folderId));
        // Use parallel refresh for folder feeds
        await refreshFeeds(folderFeeds);
        const entriesPromises = folderFeeds.map(feed => getFeedEntries(feed.id!));
        const feedEntries = await Promise.all(entriesPromises);
        const loadedEntries = feedEntries
          .map(result => result.entries)
          .flat()
          .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
        setEntries(loadedEntries);
      }
    } catch (error) {
      console.error('Error refreshing feed:', error);
    }
  }, [feedId, folderId]);

  // Load entries based on current route
  useEffect(() => {
    const loadEntries = async () => {
      try {
        let loadedEntries: FeedEntryWithTitle[];
        let totalEntriesCount = 0;
        
        if (props.entries) {
          loadedEntries = props.entries;
          totalEntriesCount = props.entries.length;
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
          const result = await getFeedEntries(parseInt(feedId), currentPage, ITEMS_PER_PAGE);
          loadedEntries = result.entries;
          totalEntriesCount = result.total;
          console.log('Feed entries loaded:', {
            feedId,
            totalEntriesCount: result.total,
            loadedCount: result.entries.length,
            currentPage,
            totalPages: result.totalPages
          });
        } else if (location.pathname === '/starred') {
          loadedEntries = await getStarredEntries();
          totalEntriesCount = loadedEntries.length;
        } else if (location.pathname === '/listened') {
          loadedEntries = await getListenedEntries();
          totalEntriesCount = loadedEntries.length;
          // Sort by listenedDate in descending order
          loadedEntries.sort((a, b) => {
            const dateA = a.listenedDate?.getTime() || 0;
            const dateB = b.listenedDate?.getTime() || 0;
            return dateB - dateA;
          });
        } else {
          const result = await getAllEntries(currentPage, ITEMS_PER_PAGE);
          loadedEntries = result.entries;
          totalEntriesCount = result.total;
          console.log('All entries loaded:', {
            totalEntriesCount: result.total,
            loadedCount: result.entries.length,
            currentPage,
            totalPages: result.totalPages
          });
        }
        
        setEntries(loadedEntries);
        
        // Initialize pagination state immediately
        const totalPages = Math.max(1, Math.ceil(totalEntriesCount / ITEMS_PER_PAGE));
        
        console.log('Initializing pagination state:', {
          totalEntriesCount,
          totalPages,
          currentPage,
          ITEMS_PER_PAGE,
          shouldShowPagination: totalEntriesCount > ITEMS_PER_PAGE
        });
        
        setPaginatedState({
          items: loadedEntries,
          currentPage,
          totalItems: totalEntriesCount,
          itemsPerPage: ITEMS_PER_PAGE,
          totalPages
        });
      } catch (error) {
        console.error('Error loading entries:', error);
        setEntries([]);
        setPaginatedState({
          items: [],
          currentPage: 1,
          totalItems: 0,
          itemsPerPage: ITEMS_PER_PAGE,
          totalPages: 0
        });
      }
    };

    loadEntries();
  }, [feedId, folderId, location.pathname, props.entries, currentPage]);

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

    // Set a timer to mark as read after dwelling
    readTimerRef.current[entry.id] = setTimeout(async () => {
      await markAsRead(entry.id!);
      // Update the entry in the local state immediately
      const updatedEntries = entries.map(e => 
        e.id === entry.id 
          ? { ...e, isRead: true }
          : e
      );
      setEntries(updatedEntries);
      // Notify parent component of the update
      props.onEntriesUpdate?.(updatedEntries);
      // Clean up the timer reference
      delete readTimerRef.current[entry.id!];
    }, 2000); // 2 second dwell time
  }, [entries, props.onEntriesUpdate]);

  // Add handler for page changes
  const handlePageChange = useCallback((page: number) => {
    console.log('Changing to page:', page);
    if (page === currentPage) return; // Don't reload if we're already on this page
    
    setTargetPage(page);
    setCurrentPage(page);
    setIsLoadingPage(true);
    
    // Reset selection when changing pages
    onSelectedIndexChange(0);
    
    // Scroll to top for next page, bottom for previous page
    if (listRef.current) {
      listRef.current.scrollTo({
        top: page > currentPage ? 0 : listRef.current.scrollHeight,
        behavior: 'instant'
      });
    }
  }, [currentPage, onSelectedIndexChange]);

  // Replace the database hook effect with this updated version
  useEffect(() => {
    const handleStarredChange = (event: CustomEvent<{
      entryId: number;
      isStarred: boolean;
      starredDate: Date | undefined;
    }>) => {
      // Update the entry in the local state immediately
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
    };

    // Add event listener for star changes
    window.addEventListener('entryStarredChanged', handleStarredChange as EventListener);

    return () => {
      window.removeEventListener('entryStarredChanged', handleStarredChange as EventListener);
    };
  }, []);

  // Keep the existing database hook for other updates
  useEffect(() => {
    // Create the hook handler
    const hookHandler = (modifications: any) => {
      if (modifications.isStarred !== undefined) {
        const loadEntries = async () => {
          const loadedEntries = props.entries
            ? props.entries
            : feedId
              ? (await getFeedEntries(parseInt(feedId))).entries
              : location.pathname === '/starred'
                ? await getStarredEntries()
                : location.pathname === '/listened'
                  ? await getListenedEntries()
                  : (await getAllEntries()).entries;
          setEntries(loadedEntries);
        };
        loadEntries();
      }
    };

    // Subscribe to the hook
    db.entries.hook('updating', hookHandler);

    // Cleanup: unsubscribe from the hook
    return () => {
      db.entries.hook('updating').unsubscribe(hookHandler);
    };
  }, [feedId, location.pathname, props.entries]);

  // Add pagination event listener
  useEffect(() => {
    const handlePageChange = (event: CustomEvent<{ page: number; selectIndex: number; direction: 'prev' | 'next' }>) => {
      setCurrentPage(event.detail.page);
      onSelectedIndexChange(event.detail.selectIndex);

      // Wait for the page change to complete before scrolling
      setTimeout(() => {
        const scrollContainer = listRef.current;
        if (!scrollContainer) return;

        // If going to previous page, scroll to bottom, if next page, scroll to top
        scrollContainer.scrollTo({
          top: event.detail.direction === 'prev' ? scrollContainer.scrollHeight : 0,
          behavior: 'instant'
        });
      }, 0);
    };

    window.addEventListener('feedListPageChange', handlePageChange as EventListener);
    return () => {
      window.removeEventListener('feedListPageChange', handlePageChange as EventListener);
    };
  }, [onSelectedIndexChange]);

  // Add this effect to handle read state changes
  useEffect(() => {
    const handleReadChange = (event: CustomEvent<{
      entryId: number;
      isRead: boolean;
    }>) => {
      setEntries(prevEntries =>
        prevEntries.map(entry =>
          entry.id === event.detail.entryId
            ? { ...entry, isRead: event.detail.isRead }
            : entry
        )
      );
    };

    window.addEventListener('entryReadChanged', handleReadChange as EventListener);
    return () => {
      window.removeEventListener('entryReadChanged', handleReadChange as EventListener);
    };
  }, []);

  // Add this effect to handle feed refreshes
  useEffect(() => {
    const handleFeedRefresh = async (event: CustomEvent<{ feedId: number }>) => {
      // Only reload if we're viewing the refreshed feed
      const currentFeedId = feedId ? parseInt(feedId) : null;
      if (currentFeedId === event.detail.feedId) {
        const loadedEntries = (await getFeedEntries(event.detail.feedId)).entries;
        setEntries(loadedEntries);
      }
    };

    window.addEventListener('feedRefreshed', handleFeedRefresh as unknown as EventListener);
    return () => {
      window.removeEventListener('feedRefreshed', handleFeedRefresh as unknown as EventListener);
    };
  }, [feedId]);

  // Add this effect to handle entry reprocessing
  useEffect(() => {
    const handleEntryReprocess = async (event: CustomEvent<{ entryId: number }>) => {
      // Reload the entries to get the updated content
      const loadedEntries = props.entries 
        ? props.entries 
        : feedId 
          ? (await getFeedEntries(parseInt(feedId))).entries
          : location.pathname === '/starred'
            ? await getStarredEntries()
            : location.pathname === '/listened'
              ? await getListenedEntries()
              : (await getAllEntries()).entries;
      setEntries(loadedEntries);
    };

    window.addEventListener('entryReprocessed', handleEntryReprocess as unknown as EventListener);
    return () => {
      window.removeEventListener('entryReprocessed', handleEntryReprocess as unknown as EventListener);
    };
  }, [feedId, location.pathname, props.entries]);

  return (
    <>
      <div 
        ref={listRef}
        className={`h-full overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        onClick={() => !isFocused && onFocusChange(true)}
        tabIndex={0}
      >
        {paginatedState.items.length === 0 ? (
          <div className={`text-center mt-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {isLoadingPage ? 'Loading entries...' : (entries.length === 0 ? 'No entries to display' : 'No unread entries')}
          </div>
        ) : (
          <div className="flex flex-col min-h-full">
            <div className="flex-grow">
              {isLoadingPage ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Loading page {targetPage}...
                </div>
              ) : (
                <div
                  data-current-page={paginatedState.currentPage}
                  data-total-pages={paginatedState.totalPages}
                  data-prev-page-items={paginatedState.currentPage > 1 ? ITEMS_PER_PAGE : 0}
                  data-next-page-items={paginatedState.currentPage < paginatedState.totalPages ? ITEMS_PER_PAGE : 0}
                >
                  {paginatedState.items.map((entry, index) => (
                    <FeedListEntry
                      key={entry.id}
                      entry={entry}
                      index={index}
                      isSelected={selectedIndex === index}
                      isFocused={isFocused}
                      isDarkMode={isDarkMode}
                      isChatOpen={isChatOpen}
                      isExpanded={expandedEntries[entry.id!] || false}
                      onSelect={onSelectedIndexChange}
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
              )}
            </div>
            {paginatedState.totalItems > ITEMS_PER_PAGE && (
              <div className={`sticky bottom-0 w-full z-10 ${isDarkMode ? 'bg-gray-800/90' : 'bg-white/90'} backdrop-blur-sm border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <Pagination
                  currentPage={targetPage}
                  totalPages={paginatedState.totalPages}
                  totalItems={paginatedState.totalItems}
                  onPageChange={handlePageChange}
                  isLoading={isLoadingPage}
                />
              </div>
            )}
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