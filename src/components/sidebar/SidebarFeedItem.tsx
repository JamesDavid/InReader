import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getUnreadEntries, getMostRecentEntry } from '../../services/db';

interface EntryReadEvent extends CustomEvent {
  detail: {
    feedId: number | null;
  };
}

interface SidebarFeedItemProps {
  id: number;
  path: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onDelete: () => Promise<void>;
  isDeleted: boolean;
}

const getBadgeColors = (timestamp: Date | null, isDarkMode: boolean): string => {
  if (!timestamp) return isDarkMode ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-600';
  
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours <= 1) {
    // Less than 1 hour - dark purple
    return isDarkMode ? 'bg-purple-700 text-white' : 'bg-purple-700 text-white';
  } else if (hours <= 24) {
    // Less than 24 hours - dark blue
    return isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white';
  } else if (hours <= 168) { // 7 days
    // Less than a week - light blue
    return isDarkMode ? 'bg-blue-400 text-white' : 'bg-blue-400 text-white';
  } else {
    // Older - gray
    return isDarkMode ? 'bg-gray-500 text-white' : 'bg-gray-500 text-white';
  }
};

const SidebarFeedItem: React.FC<SidebarFeedItemProps> = ({
  id,
  path,
  title,
  isActive,
  isSelected,
  isDarkMode,
  index,
  isLoading,
  isRefreshing,
  onSelect,
  onFocusChange,
  onDelete,
  isDeleted,
}) => {
  const [localUnreadCount, setLocalUnreadCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [mostRecentTimestamp, setMostRecentTimestamp] = useState<Date | null>(null);
  const previousCountRef = useRef(localUnreadCount);
  const isMountedRef = useRef(true);

  const truncateTitle = (text: string, maxLength: number = 20) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const updateUnreadCount = React.useCallback(async (isInitialLoad = false) => {
    if (!isMountedRef.current) return;
    
    try {
      if (!isInitialLoad) {
        setIsLoadingCount(true);
      }
      const [unreadEntries, mostRecent] = await Promise.all([
        getUnreadEntries(id),
        getMostRecentEntry(id)
      ]);
      const count = unreadEntries.length;
      
      if (!isMountedRef.current) return;

      setMostRecentTimestamp(mostRecent?.publishDate || null);

      // Only update if count has changed or is initial value
      if (localUnreadCount === null || count !== previousCountRef.current) {
        setLocalUnreadCount(count);
        previousCountRef.current = count;
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
      if (isMountedRef.current) {
        // Only set to 0 if we don't have a previous value
        if (localUnreadCount === null) {
          setLocalUnreadCount(0);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCount(false);
      }
    }
  }, [id, localUnreadCount]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    updateUnreadCount(true);
    return () => {
      isMountedRef.current = false;
    };
  }, [updateUnreadCount]);

  // Staggered periodic refresh
  useEffect(() => {
    const initialDelay = Math.random() * 5000;
    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;
      
      const interval = setInterval(() => {
        if (isMountedRef.current) {
          updateUnreadCount();
        }
      }, 30000);

      return () => clearInterval(interval);
    }, initialDelay);

    return () => {
      clearTimeout(timer);
    };
  }, [updateUnreadCount]);

  // Listen for entry read updates
  useEffect(() => {
    const handleEntryRead = async (event: EntryReadEvent) => {
      const { feedId } = event.detail;
      if ((feedId === id || feedId === null) && isMountedRef.current) {
        await updateUnreadCount();
      }
    };

    window.addEventListener('entryMarkedAsRead', handleEntryRead as unknown as EventListener);
    return () => {
      window.removeEventListener('entryMarkedAsRead', handleEntryRead as unknown as EventListener);
    };
  }, [id, updateUnreadCount]);

  const menuItemClass = `
    block px-4 py-2 text-sm transition-colors
    ${isActive ? (isDarkMode ? 'bg-gray-700' : 'bg-reader-hover') : ''}
    ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
    ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
  `;

  const titleClass = `truncate ${
    isDarkMode 
      ? 'text-gray-300 hover:text-gray-100' 
      : 'text-gray-700 hover:text-gray-900'
  } ${isDeleted ? 'italic opacity-75' : ''}`;

  return (
    <div className="group relative">
      <Link
        to={path}
        data-index={index}
        className={menuItemClass}
        onClick={() => {
          onSelect(index);
          onFocusChange(false);
        }}
      >
        <div className="flex items-center w-full">
          <div className="flex items-center gap-2 flex-grow">
            {isRefreshing && (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 animate-spin ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span className={titleClass}>
              {truncateTitle(title)}{isDeleted ? ' (Deleted)' : ''}
            </span>
          </div>
          <div className="flex items-center justify-end flex-shrink-0">
            {localUnreadCount !== null && localUnreadCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${getBadgeColors(mostRecentTimestamp, isDarkMode)}`}>
                {localUnreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default SidebarFeedItem; 