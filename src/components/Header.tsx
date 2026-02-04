import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AIConfigModal from './AIConfigModal';
import GunConfigModal from './GunConfigModal';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';
import TTSQueueStatus from './TTSQueueStatus';
import { getQueueStats } from '../services/requestQueueService';
import { gunService } from '../services/gunService';

interface HeaderProps {
  isDarkMode: boolean;
  onDarkModeToggle: () => void;
  showUnreadOnly: boolean;
  onShowUnreadToggle: () => void;
  showAddFeedModal: boolean;
  onCloseAddFeedModal: () => void;
  onRegisterFocusSearch: (callback: () => void) => void;
  onToggleMobileSidebar?: () => void;
  isMobileSidebarOpen?: boolean;
  isShortcutsModalOpen?: boolean;
  onToggleShortcutsModal?: () => void;
  onOpenSearch?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  isDarkMode,
  showUnreadOnly,
  onDarkModeToggle,
  onShowUnreadToggle,
  showAddFeedModal,
  onCloseAddFeedModal,
  onRegisterFocusSearch,
  onToggleMobileSidebar,
  isMobileSidebarOpen,
  isShortcutsModalOpen,
  onToggleShortcutsModal,
  onOpenSearch
}) => {
  const [isOllamaModalOpen, setIsOllamaModalOpen] = useState(false);
  const [isGunModalOpen, setIsGunModalOpen] = useState(false);
  const [queueStats, setQueueStats] = useState({ size: 0, pending: 0 });
  const [isGunAuthenticated, setIsGunAuthenticated] = useState(false);

  // Add Gun authentication check effect
  useEffect(() => {
    const checkGunAuth = () => {
      setIsGunAuthenticated(gunService.isAuthenticated());
    };
    checkGunAuth();
    window.addEventListener('gunAuthChanged', checkGunAuth);
    return () => {
      window.removeEventListener('gunAuthChanged', checkGunAuth);
    };
  }, []);

  // Add queue stats update effect
  useEffect(() => {
    const updateStats = () => {
      const stats = getQueueStats();
      setQueueStats({
        size: stats.size + stats.pending,
        pending: stats.pending
      });
    };

    // Initial update
    updateStats();

    // Update when queue changes
    const handleQueueChange = () => {
      updateStats();
    };

    window.addEventListener('queueChanged', handleQueueChange);
    window.addEventListener('entryProcessingComplete', handleQueueChange);

    return () => {
      window.removeEventListener('queueChanged', handleQueueChange);
      window.removeEventListener('entryProcessingComplete', handleQueueChange);
    };
  }, []);

  return (
    <>
      <header className={`h-14 flex-shrink-0 z-40 border-b ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-reader-border'} flex items-center px-4 justify-between overflow-hidden`}>
        <div className="flex items-center gap-4">
          {/* Hamburger menu button - visible only on mobile */}
          <button
            onClick={onToggleMobileSidebar}
            className={`md:hidden p-2 -ml-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            aria-label={isMobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {isMobileSidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <button
            onClick={onToggleShortcutsModal}
            className={`text-xl font-bold cursor-pointer ${isDarkMode ? 'text-white hover:text-blue-400' : 'text-reader-blue hover:text-blue-700'} transition-colors`}
            title="Keyboard shortcuts (?)"
          >
            InReader
          </button>
          <button
            onClick={onOpenSearch}
            className={`md:hidden p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            aria-label="Search"
            title="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <TTSQueueStatus isDarkMode={isDarkMode} />
          <div className="relative">
            <button
              onClick={() => setIsOllamaModalOpen(true)}
              className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
              title="AI Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </button>
            {(queueStats.size > 0 || queueStats.pending > 0) && (
              <div className={`absolute -top-1 -right-1 min-w-[1.2rem] h-[1.2rem] flex items-center justify-center text-xs rounded-full px-1
                ${isDarkMode 
                  ? 'bg-reader-blue text-white' 
                  : 'bg-reader-blue text-white'}`}
              >
                {queueStats.size}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsGunModalOpen(true)}
            className={`p-2 rounded-lg relative ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            title="Gun.js Configuration"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.72,4.28l-3-3a1,1,0,0,0-1.42,0L16,2.59,15.29,1.88a1,1,0,0,0-1.42,0l-1.5,1.5a1,1,0,0,0,0,1.42l.71.71L4.21,14.38A1,1,0,0,0,4,15v3a1,1,0,0,0,.3.71l2,2A1,1,0,0,0,7,21H10a1,1,0,0,0,.62-.21l9.87-8.87.71.71a1,1,0,0,0,1.42,0l1.5-1.5a1,1,0,0,0,0-1.42L23.41,8.29l1.31-1.31a1,1,0,0,0,0-1.42l-3-3ZM9.38,19H7.41l-1-1V16.41l8.83-8.83,2.59,2.59Z"/>
            </svg>
            {isGunAuthenticated && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
            )}
          </button>
          <button
            onClick={onShowUnreadToggle}
            className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            title={showUnreadOnly ? "Showing unread only" : "Showing all items"}
          >
            {showUnreadOnly ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button
            onClick={onDarkModeToggle}
            className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            title="Toggle Dark Mode"
          >
            {isDarkMode ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <AIConfigModal
        isOpen={isOllamaModalOpen}
        onClose={() => setIsOllamaModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      <GunConfigModal
        isOpen={isGunModalOpen}
        onClose={() => setIsGunModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      <KeyboardShortcutsModal
        isOpen={!!isShortcutsModalOpen}
        onClose={() => onToggleShortcutsModal?.()}
        isDarkMode={isDarkMode}
      />
    </>
  );
};

export default Header; 