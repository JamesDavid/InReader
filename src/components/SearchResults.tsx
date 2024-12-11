import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { searchEntries, saveSearch, updateSearchResultCounts, type FeedEntry } from '../services/db';
import FeedList from './FeedList';

interface ContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  onFocusChange: (focused: boolean) => void;
  onSearchHistoryUpdate: () => void;
}

const SearchResults: React.FC = () => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { query } = useParams<{ query: string }>();
  const { isDarkMode, isFocused, onFocusChange, onSearchHistoryUpdate } = useOutletContext<ContextType>();

  // Reset state when query changes
  useEffect(() => {
    setIsLoading(true);
    setEntries([]);
  }, [query]);

  // Perform search
  useEffect(() => {
    let isMounted = true;
    
    const search = async () => {
      if (!query) return;

      try {
        const results = await searchEntries(query);
        if (isMounted) {
          setEntries(results);
          await saveSearch(query);
          // Update search result counts and history
          await updateSearchResultCounts();
          onSearchHistoryUpdate();
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    search();
    
    return () => {
      isMounted = false;
    };
  }, [query, onSearchHistoryUpdate]);

  // Update entries when a summary is refreshed
  const handleEntriesUpdate = (updatedEntries: FeedEntry[]) => {
    setEntries(updatedEntries);
  };

  if (isLoading) {
    return (
      <div className={`p-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        Searching...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={`p-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        No results found for "{query}"
      </div>
    );
  }

  return (
    <FeedList
      entries={entries}
      isDarkMode={isDarkMode}
      isFocused={isFocused}
      onFocusChange={onFocusChange}
      onEntriesUpdate={handleEntriesUpdate}
    />
  );
};

export default SearchResults; 