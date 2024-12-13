import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
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
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.querySelector('.fixed.inset-0')
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'j': {
          e.preventDefault();
          if (sidebarFocused) {
            const sidebarElement = document.querySelector('[data-sidebar-items-count]');
            const maxItems = parseInt(sidebarElement?.getAttribute('data-sidebar-items-count') || '0');
            setSelectedSidebarIndex(prev => Math.min(prev + 1, maxItems - 1));
          } else {
            const feedListElement = document.querySelector('main');
            const maxItems = feedListElement?.querySelectorAll('[data-index]').length || 0;
            if (maxItems > 0) {
              setSelectedFeedIndex(prev => {
                const nextIndex = prev + 1;
                if (nextIndex >= maxItems) {
                  return prev;
                }
                // Update the selected entry ID when changing index
                const nextArticle = document.querySelector(`article[data-index="${nextIndex}"]`);
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
          if (sidebarFocused) {
            setSelectedSidebarIndex(prev => Math.max(0, prev - 1));
          } else {
            setSelectedFeedIndex(prev => {
              const nextIndex = Math.max(0, prev - 1);
              // Update the selected entry ID when changing index
              const nextArticle = document.querySelector(`article[data-index="${nextIndex}"]`);
              const nextEntryId = nextArticle?.getAttribute('data-entry-id');
              if (nextEntryId) {
                setSelectedEntryId(parseInt(nextEntryId));
              }
              return nextIndex;
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
          focusSearchCallback?.();
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
    selectedEntryId
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
          onClose={() => setShowChatModal(false)}
          isDarkMode={isDarkMode}
          articleTitle={selectedEntry.title}
          articleContent={selectedEntry.content_rssAbstract}
          articleUrl={selectedEntry.link}
          entryId={selectedEntry.id!}
          onChatUpdate={() => {
            // Handle chat updates if needed
          }}
        />
      )}
    </div>
  );
};

export default Layout; 