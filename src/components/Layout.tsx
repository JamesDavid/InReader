import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SearchModal from './SearchModal';
import ttsService from '../services/ttsService';
import { getSavedSearches, deleteSavedSearch, type SavedSearch, db } from '../services/db';
import AddFeedModal from './AddFeedModal';
import ChatModal from './ChatModal';

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
  onOpenChat: (entry: FeedEntry) => void;
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
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FeedEntry | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

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
      const entry = await db.entries.get(parseInt(currentArticle.id));
      if (!entry) return;

      // Navigate to the feed view with the article ID as a search param
      navigate(`/feed/${entry.feedId}?article=${currentArticle.id}`);
      
      // Set focus to the content area
      setSidebarFocused(false);
    } catch (error) {
      console.error('Error popping to current item:', error);
    }
  }, [navigate]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Only block non-TTS keyboard shortcuts if we're in an input/textarea
      // or if a modal other than chat is open
      const isInInput = document.activeElement?.tagName === 'INPUT' || 
                       document.activeElement?.tagName === 'TEXTAREA';
      const isModalOpen = document.querySelector('.fixed.inset-0') !== null;
      const isChatModalOpen = showChatModal;
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
          if (showChatModal) {
            setShowChatModal(false);
            setSelectedEntry(null);
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

            // If chat modal is not open, handle feed list scrolling
            const mainElement = document.querySelector('main');
            const scrollContainer = mainElement?.querySelector('.overflow-y-auto');
            if (!scrollContainer || !lastNavigationKey) return;
            
            console.log('Space pressed, last navigation key:', lastNavigationKey);
            const scrollAmount = scrollContainer.clientHeight * 0.33;
            const currentScroll = scrollContainer.scrollTop;
            console.log('Current scroll:', currentScroll, 'Scroll amount:', scrollAmount);
            
            scrollContainer.scrollTo({
              top: currentScroll + (lastNavigationKey === 'j' ? scrollAmount : -scrollAmount),
              behavior: 'smooth'
            });
          }
          break;
        }
        case 'h':
          if (!sidebarFocused) {
            e.preventDefault();
            setSidebarFocused(true);
          }
          break;
        case 'l':
          e.preventDefault();
          if (sidebarFocused) {
            setSidebarFocused(false);
          } else if (selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              setSelectedEntry(entry);
              setShowChatModal(true);
              // Mark as read when opening
              db.entries.update(selectedEntryId, { isRead: true });
            }
          }
          break;
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
              ttsService.addToQueue(entry);
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
        case 'p':
          e.preventDefault();
          handlePopToCurrentItem();
          break;
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
    lastNavigationKey
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

  const handleOpenChat = (entry: FeedEntry) => {
    setSelectedEntry(entry);
    setShowChatModal(true);
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
        onFocusChange={handleFocusChange}
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
      {showChatModal && selectedEntry && (
        <ChatModal
          isOpen={showChatModal}
          onClose={() => {
            setShowChatModal(false);
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