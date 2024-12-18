import React, { useState, useEffect, useCallback } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { getUnreadCount, getMostRecentEntry } from '../../services/db';

interface SidebarFeedItemProps {
  id: number;
  path: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  isLoading: boolean;
  isRefreshing?: boolean;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onDelete: () => void;
  onUnreadCountChange?: (feedId: number, count: number) => void;
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
  onSelect,
  onFocusChange,
  onUnreadCountChange
}) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mostRecentTimestamp, setMostRecentTimestamp] = useState<Date | null>(null);

  const updateUnreadCount = useCallback(async () => {
    const count = await getUnreadCount(id);
    setUnreadCount(count);
    onUnreadCountChange?.(id, count);

    // Also update most recent timestamp
    const mostRecent = await getMostRecentEntry(id);
    setMostRecentTimestamp(mostRecent?.publishDate || null);
  }, [id, onUnreadCountChange]);

  // Listen for feed refresh events
  useEffect(() => {
    const handleRefreshStart = (event: CustomEvent<{ feedId: number }>) => {
      if (event.detail.feedId === id) {
        setIsRefreshing(true);
      }
    };

    const handleRefreshComplete = (event: CustomEvent<{ feedId: number, success: boolean }>) => {
      if (event.detail.feedId === id) {
        setIsRefreshing(false);
        // Update unread count and timestamp after refresh
        updateUnreadCount();
      }
    };

    // Add event listeners
    window.addEventListener('feedRefreshStart', handleRefreshStart as EventListener);
    window.addEventListener('feedRefreshComplete', handleRefreshComplete as EventListener);
    window.addEventListener('entryReadChanged', updateUnreadCount as EventListener);

    // Initial unread count and timestamp
    updateUnreadCount();

    // Cleanup
    return () => {
      window.removeEventListener('feedRefreshStart', handleRefreshStart as EventListener);
      window.removeEventListener('feedRefreshComplete', handleRefreshComplete as EventListener);
      window.removeEventListener('entryReadChanged', updateUnreadCount as EventListener);
    };
  }, [id, updateUnreadCount]);

  return (
    <div
      className={`group flex items-center justify-between px-4 py-2 text-sm transition-colors cursor-pointer
        ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
        ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
      `}
      onClick={() => {
        onSelect(index);
        onFocusChange(true);
      }}
      data-index={index}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {isRefreshing && (
          <ArrowPathIcon 
            className="w-4 h-4 animate-spin"
          />
        )}
        <span className="truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {unreadCount > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${getBadgeColors(mostRecentTimestamp, isDarkMode)}`}>
            {unreadCount}
          </span>
        )}
      </div>
    </div>
  );
};

export default SidebarFeedItem; 