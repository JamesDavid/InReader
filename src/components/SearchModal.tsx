import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveSearch, updateSearchResultCounts } from '../services/db';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onSearchHistoryUpdate: () => void;
}

const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  onSearchHistoryUpdate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    console.log('Handling search for:', trimmedQuery);
    
    if (trimmedQuery) {
      try {
        onClose();
        
        console.log('Saving search...');
        await Promise.all([
          saveSearch(trimmedQuery),
          updateSearchResultCounts()
        ]);
        
        onSearchHistoryUpdate();
        
        const searchPath = `/search/${encodeURIComponent(trimmedQuery)}`;
        console.log('Navigating to:', searchPath);
        navigate(searchPath);
        
        setSearchQuery('');
      } catch (error) {
        console.error('Error saving search:', error);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
        
        <div className={`relative w-full max-w-2xl transform overflow-hidden rounded-lg text-left shadow-xl transition-all
          ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <form onSubmit={handleSearch} className="p-6">
            <div className="flex items-center gap-4">
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`w-full px-4 py-2 rounded-lg text-lg
                  ${isDarkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500'} 
                  border focus:outline-none focus:ring-2 focus:ring-reader-blue`}
              />
            </div>
            <div className={`mt-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Press Enter to search, Escape to close
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SearchModal; 