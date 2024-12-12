import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ttsService from '../services/ttsService';
import { getSavedSearches, deleteSavedSearch, type SavedSearch, db } from '../services/db';
import AddFeedModal from './AddFeedModal';

interface OutletContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  onSearchHistoryUpdate: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarFocused, setSidebarFocused] = useState(true);
  const [selectedSidebarIndex, setSelectedSidebarIndex] = useState(0);
  const [selectedFeedIndex, setSelectedFeedIndex] = useState(0);
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
                  // TODO: Handle pagination if needed
                  return prev;
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
            setSelectedFeedIndex(prev => Math.max(0, prev - 1));
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
          if (sidebarFocused) {
            e.preventDefault();
            setSidebarFocused(false);
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
          if (!sidebarFocused) {
            e.preventDefault();
            console.log('[ key pressed, selectedFeedIndex:', selectedFeedIndex);
            const selectedArticle = document.querySelector(`article[data-index="${selectedFeedIndex}"]`);
            console.log('Found selected article:', selectedArticle);
            if (selectedArticle) {
              const entryId = selectedArticle.getAttribute('data-entry-id');
              console.log('Found entry ID:', entryId);
              if (entryId) {
                const entry = await db.entries.get(parseInt(entryId));
                console.log('Found entry from DB:', entry);
                if (entry) {
                  console.log('Adding to TTS queue:', entry.title);
                  ttsService.addToQueue(entry);
                }
              }
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
    setSelectedFeedIndex
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

  const outletContext: OutletContextType = {
    isFocused: !sidebarFocused,
    isDarkMode,
    showUnreadOnly,
    onFocusChange: handleFocusChange,
    onSearchHistoryUpdate: loadSearchHistory,
    selectedIndex: selectedFeedIndex,
    onSelectedIndexChange: setSelectedFeedIndex
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
    </div>
  );
};

export default Layout; 