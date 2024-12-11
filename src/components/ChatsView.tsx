import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getEntriesWithChats, type FeedEntry } from '../services/db';
import FeedList from './FeedList';

interface ContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  onFocusChange: (focused: boolean) => void;
}

const ChatsView: React.FC = () => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isDarkMode, isFocused, onFocusChange } = useOutletContext<ContextType>();

  useEffect(() => {
    const loadChats = async () => {
      try {
        const results = await getEntriesWithChats();
        setEntries(results);
      } catch (error) {
        console.error('Failed to load chats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadChats();
  }, []);

  // Update entries when they change
  const handleEntriesUpdate = (updatedEntries: FeedEntry[]) => {
    setEntries(updatedEntries);
  };

  if (isLoading) {
    return (
      <div className={`p-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        Loading chats...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={`p-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        No chat history found. Press 'l' while an article is selected to start a chat.
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

export default ChatsView; 