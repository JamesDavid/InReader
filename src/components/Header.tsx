import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import OllamaConfigModal from './OllamaConfigModal';
import VoiceConfigModal from './VoiceConfigModal';
import TTSQueueStatus from './TTSQueueStatus';
import { getQueueStats } from '../services/requestQueueService';

interface HeaderProps {
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onDarkModeToggle: () => void;
  onShowUnreadToggle: () => void;
  onFocusChange?: (focused: boolean) => void;
  onRegisterFocusSearch?: (callback: () => void) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  isDarkMode, 
  showUnreadOnly,
  onDarkModeToggle,
  onShowUnreadToggle,
  onFocusChange,
  onRegisterFocusSearch 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOllamaModalOpen, setIsOllamaModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [queueStats, setQueueStats] = useState({ size: 0, pending: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Add queue stats update effect
  useEffect(() => {
    const updateStats = () => {
      const stats = getQueueStats();
      setQueueStats({
        size: stats.size,
        pending: stats.pending
      });
    };

    // Initial update
    updateStats();

    // Update every second
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, []);

  // Register the focus callback with the parent
  useEffect(() => {
    if (onRegisterFocusSearch) {
      onRegisterFocusSearch(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [onRegisterFocusSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search/${encodeURIComponent(searchQuery.trim())}`);
      searchInputRef.current?.blur();
      if (onFocusChange) {
        onFocusChange(false);
      }
    }
  };

  const handleSearchFocus = () => {
    if (onFocusChange) {
      onFocusChange(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' || (e.key === 'Backspace' && searchQuery === '')) {
      e.preventDefault();
      searchInputRef.current?.blur();
      if (onFocusChange) {
        onFocusChange(false);
      }
    }
  };

  return (
    <>
      <header className={`h-14 border-b ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-reader-border'} flex items-center px-4 justify-between`}>
        <div className="flex items-center gap-8">
          <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-reader-blue'}`}>
            InReader
          </h1>
          <form onSubmit={handleSearch} className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search entries... (Press '/' to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              className={`w-96 px-4 py-1.5 rounded-lg 
                ${isDarkMode 
                  ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-400' 
                  : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500'} 
                border focus:outline-none focus:ring-2 focus:ring-reader-blue`}
            />
          </form>
        </div>
        <div className="flex items-center gap-2">
          <TTSQueueStatus isDarkMode={isDarkMode} />
          <button
            onClick={() => setIsVoiceModalOpen(true)}
            className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setIsOllamaModalOpen(true)}
              className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </button>
            {(queueStats.size + queueStats.pending) > 0 && (
              <div className={`absolute -top-1 -right-1 min-w-[1.2rem] h-[1.2rem] flex items-center justify-center text-xs rounded-full px-1
                ${isDarkMode 
                  ? 'bg-reader-blue text-white' 
                  : 'bg-reader-blue text-white'}`}
              >
                {queueStats.size + queueStats.pending}
              </div>
            )}
          </div>
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

      <OllamaConfigModal
        isOpen={isOllamaModalOpen}
        onClose={() => setIsOllamaModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      <VoiceConfigModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        isDarkMode={isDarkMode}
      />
    </>
  );
};

export default Header; 