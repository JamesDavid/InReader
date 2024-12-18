import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SearchModal from './SearchModal';
import ttsService from '../services/ttsService';
import { getSavedSearches, deleteSavedSearch, type SavedSearch, type FeedEntryWithTitle, db, markAsRead } from '../services/db';
import AddFeedModal from './AddFeedModal';
import ChatModal from './ChatModal';
import { refreshFeed } from '../services/feedParser';
import { updateSearchResultCounts } from '../services/db';
import { reprocessEntry } from '../services/feedParser';

interface OutletContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  onSearchHistoryUpdate: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelectedEntryIdChange: (id: number | null) => void;
  selectedEntryId: number | null;
  onOpenChat: (entry: FeedEntryWithTitle) => void;
}

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarFocused, setSidebarFocused] = useState(true);
  const [selectedSidebarIndex, setSelectedSidebarIndex] = useState(0);
  const [selectedFeedIndex, setSelectedFeedIndex] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [lastNavigationKey, setLastNavigationKey] = useState<'j' | 'k' | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [showUnreadOnly, setShowUnreadOnly] = useState(() => {
    const saved = localStorage.getItem('showUnreadOnly');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchHistory, setSearchHistory] = useState<SavedSearch[]>([]);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FeedEntryWithTitle | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  // Create a ref to store the focusSearch callback from Header
  const [focusSearchCallback, setFocusSearchCallback] = useState<(() => void) | null>(null);
  // Create a ref to store the refreshFeeds callback from Sidebar
  const [refreshFeedsCallback, setRefreshFeedsCallback] = useState<(() => void) | null>(null);

  const loadSearchHistory = useCallback(async () => {
    const history = await getSavedSearches();
    setSearchHistory(history);
  }, []);

  const handleClearSearchHistory = useCallback(async (searchId?: number) => {
    if (searchId) {
      // Delete single search
      await deleteSavedSearch(searchId);
      setSearchHistory(prev => prev.filter(search => search.id !== searchId));
    } else {
      // Delete all saved searches
      await Promise.all(searchHistory.map(search => deleteSavedSearch(search.id!)));
      setSearchHistory([]);
    }
  }, [searchHistory]);

  // Load search history on mount
  useEffect(() => {
    loadSearchHistory();
  }, [loadSearchHistory]);

  const handleFocusSearch = useCallback((callback: () => void) => {
    setFocusSearchCallback(() => callback);
  }, []);

  const handleRegisterRefreshFeeds = useCallback((callback: () => void) => {
    setRefreshFeedsCallback(() => callback);
  }, []);

  const handlePopToCurrentItem = useCallback(async () => {
    const currentArticle = ttsService.getCurrentArticle();
    if (!currentArticle) return;

    try {
      // Get the entry from the database to find its feed ID
      const entry = await db.entries.get(currentArticle.id);
      if (!entry) return;

      // Navigate to the feed view
      navigate(`/feed/${entry.feedId}`);
      
      // Set focus to the content area
      setSidebarFocused(false);

      // Wait for the feed list to load and update
      const checkForArticle = (retries = 0, maxRetries = 10) => {
        if (retries >= maxRetries) return;

        setTimeout(() => {
          const articleElement = document.querySelector(`[data-entry-id="${currentArticle.id}"]`);
          if (articleElement) {
            const index = parseInt(articleElement.getAttribute('data-index') || '0');
            setSelectedFeedIndex(index);
            setSelectedEntryId(currentArticle.id);
            
            // Ensure the article is scrolled into view
            articleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // Try again if element not found
            checkForArticle(retries + 1);
          }
        }, 100); // Check every 100ms
      };

      checkForArticle();
    } catch (error) {
      console.error('Error popping to current item:', error);
    }
  }, [navigate, setSelectedFeedIndex, setSelectedEntryId]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Only block non-TTS keyboard shortcuts if we're in an input/textarea
      // or if a modal other than chat is open
      const isInInput = document.activeElement?.tagName === 'INPUT' || 
                       document.activeElement?.tagName === 'TEXTAREA';
      const isModalOpen = document.querySelector('.fixed.inset-0') !== null;
      const isTTSKey = e.key === ']' || e.key === '\\';

      // Always allow TTS controls
      if (isTTSKey) {
        e.preventDefault();
        if (e.key === ']') {
          ttsService.next();
        } else if (e.key === '\\') {
          ttsService.togglePlayPause();
        }
        return;
      }

      // Block other shortcuts if in input or non-chat modal
      if (isInInput || (isModalOpen && !isChatModalOpen)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape': {
          e.preventDefault();
          if (isChatModalOpen) {
            setIsChatModalOpen(false);
            setSelectedEntry(null);
          } else if (isSearchModalOpen) {
            setIsSearchModalOpen(false);
          } else if (showAddFeedModal) {
            setShowAddFeedModal(false);
          }
          break;
        }
        case 'j': {
          e.preventDefault();
          setLastNavigationKey('j');
          if (sidebarFocused) {
            const sidebarElement = document.querySelector('[data-sidebar-items-count]');
            const maxItems = parseInt(sidebarElement?.getAttribute('data-sidebar-items-count') || '0');
            setSelectedSidebarIndex(prev => Math.min(prev + 1, maxItems - 1));
          } else {
            const feedListElement = document.querySelector('main [data-current-page]');
            if (!feedListElement) return;

            const maxItems = feedListElement.querySelectorAll('article').length;
            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            const totalPages = parseInt(feedListElement.getAttribute('data-total-pages') || '1');
            const nextPageItems = parseInt(feedListElement.getAttribute('data-next-page-items') || '0');

            if (maxItems > 0) {
              setSelectedFeedIndex(prev => {
                const nextIndex = prev + 1;
                console.log('j pressed:', { nextIndex, maxItems, currentPage, totalPages });
                // If we're at the last item and there's a next page
                if (nextIndex >= maxItems && currentPage < totalPages) {
                  console.log('Triggering page change to next page');
                  // Dispatch a custom event to notify FeedList to change page
                  window.dispatchEvent(new CustomEvent('feedListPageChange', {
                    detail: { 
                      page: currentPage + 1,
                      selectIndex: 0, // Select first item on next page
                      direction: 'next'
                    }
                  }));
                  return 0; // Reset to first item
                }
                if (nextIndex >= maxItems) {
                  return prev;
                }
                // Update the selected entry ID when changing index
                const nextArticle = feedListElement.querySelector(`article[data-index="${nextIndex}"]`);
                const nextEntryId = nextArticle?.getAttribute('data-entry-id');
                if (nextEntryId) {
                  setSelectedEntryId(parseInt(nextEntryId));
                }
                return nextIndex;
              });
            }
          }
          break;
        }
        case 'k': {
          e.preventDefault();
          setLastNavigationKey('k');
          if (sidebarFocused) {
            setSelectedSidebarIndex(prev => Math.max(0, prev - 1));
          } else {
            const feedListElement = document.querySelector('main [data-current-page]');
            if (!feedListElement) return;

            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            const prevPageItems = parseInt(feedListElement.getAttribute('data-prev-page-items') || '0');
            
            // Check if current entry needs scrolling
            const currentArticle = feedListElement.querySelector(`article[data-index="${selectedFeedIndex}"]`);
            if (currentArticle) {
              const rect = currentArticle.getBoundingClientRect();
              const containerRect = feedListElement.closest('.overflow-y-auto')?.getBoundingClientRect();
              if (containerRect && rect.top < containerRect.top) {
                const entryId = currentArticle.getAttribute('data-entry-id');
                if (entryId) {
                  window.dispatchEvent(new CustomEvent('feedEntryScroll', {
                    detail: { entryId: parseInt(entryId) }
                  }));
                  return; // Don't move to previous entry until scrolling is complete
                }
              }
            }
            
            setSelectedFeedIndex(prev => {
              const nextIndex = prev - 1;
              console.log('k pressed:', { nextIndex, currentPage, prevPageItems });
              // If we're at the first item and there's a previous page
              if (nextIndex < 0 && currentPage > 1) {
                console.log('Triggering page change to previous page');
                // Dispatch a custom event to notify FeedList to change page
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage - 1,
                    selectIndex: prevPageItems - 1, // Select last item on previous page
                    direction: 'prev'
                  }
                }));
                return prevPageItems - 1; // Set to last item of previous page
              }
              if (nextIndex < 0) {
                return 0;
              }
              // Update the selected entry ID when changing index
              const nextArticle = feedListElement.querySelector(`article[data-index="${nextIndex}"]`);
              const nextEntryId = nextArticle?.getAttribute('data-entry-id');
              if (nextEntryId) {
                setSelectedEntryId(parseInt(nextEntryId));
              }
              return nextIndex;
            });
          }
          break;
        }
        case ' ': {
          if (!sidebarFocused) {
            e.preventDefault();
            // Check if chat modal is open
            const chatModal = document.querySelector('[data-chat-modal]');
            if (chatModal) {
              // Dispatch event for chat modal to handle scrolling
              window.dispatchEvent(new CustomEvent('chatModalScroll', {
                detail: { direction: lastNavigationKey === 'j' ? 'down' : 'up' }
              }));
              return;
            }

            // If chat modal is not open and we have a selected entry, dispatch expand event
            if (selectedEntryId !== null) {
              window.dispatchEvent(new CustomEvent('toggleEntryExpand', {
                detail: { entryId: selectedEntryId }
              }));
            }
          }
          break;
        }
        case 'h':
          if (!sidebarFocused) {
            e.preventDefault();
            setSidebarFocused(true);
          }
          break;
        case 'l': {
          e.preventDefault();
          if (sidebarFocused) {
            setSidebarFocused(false);
          } else if (selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              const feed = await db.feeds.get(entry.feedId!);
              setSelectedEntry({
                ...entry,
                feedTitle: feed?.title || 'Unknown Feed'
              });
              setIsChatModalOpen(true);
            }
          }
          break;
        }
        case 'a':
          e.preventDefault();
          setShowAddFeedModal(true);
          break;
        case '/':
          e.preventDefault();
          setIsSearchModalOpen(true);
          break;
        case 'r':
          e.preventDefault();
          refreshFeedsCallback?.();
          break;
        case '[':
          if (!sidebarFocused && selectedEntryId !== null) {
            e.preventDefault();
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              console.log('Adding to TTS queue:', entry.title);
              let feedTitle = 'Unknown Feed';
              if (entry.feedId) {
                const feed = await db.feeds.get(entry.feedId);
                feedTitle = feed?.title || 'Unknown Feed';
              }
              const ttsEntry = {
                id: entry.id!,
                title: entry.title,
                content_fullArticle: entry.content_fullArticle,
                content_rssAbstract: entry.content_rssAbstract,
                content_aiSummary: entry.content_aiSummary,
                feedTitle: feedTitle
              };
              ttsService.addToQueue(ttsEntry);
            }
          }
          break;
        case ']':
          if (!sidebarFocused) {
            e.preventDefault();
            ttsService.next();
          }
          break;
        case '\\':
          if (!sidebarFocused) {
            e.preventDefault();
            ttsService.togglePlayPause();
          }
          break;
        case 'p': {
          if (e.shiftKey && !sidebarFocused) {
            e.preventDefault();
            // Dispatch event for previous page
            const feedListElement = document.querySelector('main [data-current-page]');
            if (feedListElement) {
              const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
              if (currentPage > 1) {
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage - 1,
                    direction: 'prev'
                  }
                }));
              }
            }
          } else if (e.ctrlKey && !sidebarFocused) {
            e.preventDefault();
            // Dispatch event for next page
            const feedListElement = document.querySelector('main [data-current-page]');
            if (feedListElement) {
              const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
              const totalPages = parseInt(feedListElement.getAttribute('data-total-pages') || '1');
              if (currentPage < totalPages) {
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage + 1,
                    direction: 'next'
                  }
                }));
              }
            }
          } else {
            e.preventDefault();
            handlePopToCurrentItem();
          }
          break;
        }
        case 'i':
          if (!sidebarFocused && selectedEntryId !== null) {
            e.preventDefault();
            await db.transaction('rw', db.entries, async () => {
              const entry = await db.entries.get(selectedEntryId);
              if (entry) {
                const newStarredState = !entry.isStarred;
                // Update the database
                await db.entries.update(selectedEntryId, {
                  isStarred: newStarredState,
                  starredDate: newStarredState ? new Date() : undefined
                });
                // Dispatch a custom event with the new state for immediate UI update
                window.dispatchEvent(new CustomEvent('entryStarredChanged', {
                  detail: { 
                    entryId: selectedEntryId,
                    isStarred: newStarredState,
                    starredDate: newStarredState ? new Date() : undefined
                  }
                }));
              }
            });
          }
          break;
        case 'm': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              // Dispatch event first for immediate UI update
              window.dispatchEvent(new CustomEvent('entryReadChanged', {
                detail: { 
                  entryId: selectedEntryId,
                  isRead: !entry.isRead  // Toggle the current state
                }
              }));

              // Then update database
              await markAsRead(selectedEntryId, !entry.isRead);

              // Dispatch event for sidebar update
              window.dispatchEvent(new CustomEvent('entryMarkedAsRead', {
                detail: { 
                  feedId: entry.feedId
                }
              }));
            }
          }
          break;
        }
        case 'o': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry?.link) {
              window.open(entry.link, '_blank');
            }
          }
          break;
        }
        case '0': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry?.link) {
              // Open in named window for reuse
              window.open(entry.link, 'reader_article_window');
            }
          }
          break;
        }
        case 'u': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            try {
              // Dispatch refresh start event
              window.dispatchEvent(new CustomEvent('entryRefreshStart', {
                detail: { entryId: selectedEntryId }
              }));

              // Use reprocessEntry like the refresh button does
              await reprocessEntry(selectedEntryId);
              
              // Get the updated entry from the database
              const updatedEntry = await db.entries.get(selectedEntryId);
              if (updatedEntry) {
                // Get the feed title
                const feed = await db.feeds.get(updatedEntry.feedId!);
                
                // Dispatch refresh complete event with full updated entry
                window.dispatchEvent(new CustomEvent('entryRefreshComplete', {
                  detail: { 
                    entry: {
                      ...updatedEntry,
                      feedTitle: feed?.title || 'Unknown Feed'
                    }
                  }
                }));
              }
            } catch (error) {
              console.error('Failed to refresh entry:', error);
              // Dispatch refresh complete to clear loading state even on error
              window.dispatchEvent(new CustomEvent('entryRefreshComplete', {
                detail: { 
                  entry: await db.entries.get(selectedEntryId)!
                }
              }));
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    sidebarFocused,
    focusSearchCallback,
    refreshFeedsCallback,
    handlePopToCurrentItem,
    setSelectedSidebarIndex,
    setSelectedFeedIndex,
    selectedEntryId,
    lastNavigationKey,
    isChatModalOpen
  ]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('showUnreadOnly', JSON.stringify(showUnreadOnly));
  }, [showUnreadOnly]);

  const handleFocusChange = (focused: boolean) => {
    setSidebarFocused(!focused);
  };

  const handleOpenChat = (entry: FeedEntryWithTitle) => {
    setSelectedEntry(entry);
    setIsChatModalOpen(true);
  };

  const handleOpenSearch = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const outletContext: OutletContextType = {
    isFocused: !sidebarFocused,
    isDarkMode,
    showUnreadOnly,
    onFocusChange: handleFocusChange,
    onSearchHistoryUpdate: loadSearchHistory,
    selectedIndex: selectedFeedIndex,
    onSelectedIndexChange: setSelectedFeedIndex,
    onSelectedEntryIdChange: setSelectedEntryId,
    selectedEntryId,
    onOpenChat: handleOpenChat
  };

  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <Header 
        isDarkMode={isDarkMode}
        onDarkModeToggle={() => {
          setIsDarkMode(!isDarkMode);
          localStorage.setItem('darkMode', JSON.stringify(!isDarkMode));
        }}
        showUnreadOnly={showUnreadOnly}
        onShowUnreadToggle={() => {
          setShowUnreadOnly(!showUnreadOnly);
          localStorage.setItem('showUnreadOnly', JSON.stringify(!showUnreadOnly));
        }}
        onRegisterFocusSearch={handleFocusSearch}
        showAddFeedModal={showAddFeedModal}
        onCloseAddFeedModal={() => setShowAddFeedModal(false)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          className={`w-sidebar flex-shrink-0 border-r ${isDarkMode ? 'border-gray-700' : 'border-reader-border'}`}
          isFocused={sidebarFocused}
          onFocusChange={setSidebarFocused}
          isDarkMode={isDarkMode}
          onRegisterRefreshFeeds={handleRegisterRefreshFeeds}
          searchHistory={searchHistory}
          onClearSearchHistory={handleClearSearchHistory}
          selectedIndex={selectedSidebarIndex}
          onSelectedIndexChange={setSelectedSidebarIndex}
          onOpenSearch={handleOpenSearch}
        />
        <main 
          className={`flex-grow overflow-auto ${!sidebarFocused ? 'ring-2 ring-reader-blue ring-opacity-50' : ''}`}
          onClick={() => sidebarFocused && handleFocusChange(true)}
        >
          <Outlet context={outletContext} />
        </main>
      </div>
      {showAddFeedModal && (
        <AddFeedModal
          isOpen={showAddFeedModal}
          onClose={() => setShowAddFeedModal(false)}
          isDarkMode={isDarkMode}
          onSuccess={() => refreshFeedsCallback?.()}
        />
      )}
      {isChatModalOpen && selectedEntry && (
        <ChatModal
          isOpen={isChatModalOpen}
          onClose={() => {
            setIsChatModalOpen(false);
            setSelectedEntry(null);
          }}
          isDarkMode={isDarkMode}
          articleTitle={selectedEntry.title}
          articleContent={selectedEntry.content_rssAbstract}
          articleUrl={selectedEntry.link}
          entryId={selectedEntry.id!}
          feedTitle={selectedEntry.feedTitle}
          onChatUpdate={() => {
            // Handle chat updates if needed
          }}
        />
      )}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        isDarkMode={isDarkMode}
        onSearchHistoryUpdate={loadSearchHistory}
      />
    </div>
  );
};

export default Layout; 