import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SearchModal from './SearchModal';
import Toast from './Toast';
import ttsService from '../services/ttsService';
import { getSavedSearches, deleteSavedSearch, type SavedSearch, type FeedEntryWithTitle, db } from '../services/db';
import AddFeedModal from './AddFeedModal';
import ChatModal from './ChatModal';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useAppEventListener } from '../utils/eventDispatcher';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Create refs to store callbacks
  const [focusSearchCallback, setFocusSearchCallback] = useState<(() => void) | null>(null);
  const [refreshFeedsCallback, setRefreshFeedsCallback] = useState<(() => void) | null>(null);

  const loadSearchHistory = useCallback(async () => {
    const history = await getSavedSearches();
    setSearchHistory(history);
  }, []);

  const handleClearSearchHistory = useCallback(async (searchId?: number) => {
    if (searchId) {
      await deleteSavedSearch(searchId);
      setSearchHistory(prev => prev.filter(search => search.id !== searchId));
    } else {
      await Promise.all(searchHistory.map(search => deleteSavedSearch(search.id!)));
      setSearchHistory([]);
    }
  }, [searchHistory]);

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
      const entry = await db.entries.get(currentArticle.id);
      if (!entry) return;

      navigate(`/feed/${entry.feedId}`);
      setSidebarFocused(false);

      const checkForArticle = (retries = 0, maxRetries = 10) => {
        if (retries >= maxRetries) return;

        setTimeout(() => {
          const articleElement = document.querySelector(`[data-entry-id="${currentArticle.id}"]`);
          if (articleElement) {
            const index = parseInt(articleElement.getAttribute('data-index') || '0');
            setSelectedFeedIndex(index);
            setSelectedEntryId(currentArticle.id);
            articleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            checkForArticle(retries + 1);
          }
        }, 100);
      };

      checkForArticle();
    } catch (error) {
      console.error('Error popping to current item:', error);
    }
  }, [navigate]);

  // Listen for toast events
  useAppEventListener('showToast', (event) => {
    setToast(event.detail);
  }, []);

  // Use the keyboard navigation hook
  useKeyboardNavigation({
    sidebarFocused,
    setSidebarFocused,
    selectedSidebarIndex,
    setSelectedSidebarIndex,
    selectedFeedIndex,
    setSelectedFeedIndex,
    selectedEntryId,
    setSelectedEntryId,
    lastNavigationKey,
    setLastNavigationKey,
    isChatModalOpen,
    setIsChatModalOpen,
    isSearchModalOpen,
    setIsSearchModalOpen,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    showAddFeedModal,
    setShowAddFeedModal,
    setSelectedEntry,
    refreshFeedsCallback,
    handlePopToCurrentItem
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#111827'; // gray-900
    } else {
      document.documentElement.classList.remove('dark');
      document.body.style.backgroundColor = '#ffffff';
    }
    // Update theme-color meta tag for iOS browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDarkMode ? '#111827' : '#ffffff');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('showUnreadOnly', JSON.stringify(showUnreadOnly));
  }, [showUnreadOnly]);

  // Auto-close mobile sidebar on navigation
  const location = useLocation();
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleToggleMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(prev => !prev);
  }, []);

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
    <div className={`h-screen h-dvh flex flex-col overflow-hidden ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
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
        onToggleMobileSidebar={handleToggleMobileSidebar}
        isMobileSidebarOpen={isMobileSidebarOpen}
        isShortcutsModalOpen={isShortcutsModalOpen}
        onToggleShortcutsModal={() => setIsShortcutsModalOpen(prev => !prev)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <Sidebar
          className={`
            ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-reader-border'}
            w-sidebar flex-shrink-0 border-r
            fixed md:relative inset-y-0 left-0 z-30
            transform transition-transform duration-300 ease-in-out
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
            top-14 md:top-0 h-[calc(100vh-3.5rem)] md:h-auto
          `}
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
          className={`flex-grow overflow-auto overscroll-contain ${!sidebarFocused ? 'ring-2 ring-reader-blue ring-opacity-50' : ''}`}
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
          onChatUpdate={() => {}}
        />
      )}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        isDarkMode={isDarkMode}
        onSearchHistoryUpdate={loadSearchHistory}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Layout;

export { useOutletContext };
export type { OutletContextType };
