import React, { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { searchEntries, saveSearch, updateSearchResultCounts, type FeedEntry, type FeedEntryWithTitle, getFeedTitle } from '../services/db';
import FeedList from './FeedList';

interface ContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  onFocusChange: (focused: boolean) => void;
  onSearchHistoryUpdate: () => void;
  onSearchResultTimestamp?: (query: string, timestamp: Date | null) => void;
}

const SearchResults: React.FC = () => {
  const [entries, setEntries] = useState<FeedEntryWithTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { query } = useParams<{ query: string }>();
  const { isDarkMode, isFocused, onFocusChange, onSearchHistoryUpdate, onSearchResultTimestamp } = useOutletContext<ContextType>();

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
          // Get the most recent timestamp from the results
          const mostRecentTimestamp = results.length > 0 
            ? results.reduce((latest, entry) => 
                entry.publishDate > latest ? entry.publishDate : latest,
                results[0].publishDate)
            : null;
          // Update the parent component with the timestamp
          onSearchResultTimestamp?.(query, mostRecentTimestamp);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Search failed:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    search();
    
    return () => {
      isMounted = false;
    };
  }, [query, onSearchResultTimestamp]);

  // Update entries when a summary is refreshed
  const handleEntriesUpdate = (updatedEntries: FeedEntryWithTitle[]) => {
    setEntries(updatedEntries);
  };

  // Add useEffect to update feed titles for deleted feeds
  useEffect(() => {
    const updateFeedTitles = async () => {
      const updatedEntries = await Promise.all(entries.map(async entry => {
        if (entry.feedId) {
          const feedTitle = await getFeedTitle(entry.feedId);
          return {
            ...entry,
            feedTitle
          };
        }
        return entry;
      }));
      setEntries(updatedEntries);
    };

    updateFeedTitles();
  }, [entries]);

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