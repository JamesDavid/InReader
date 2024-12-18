import React, { useState, useEffect, useCallback } from 'react';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import { getUnreadCount } from '../../services/db';

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
  onDelete,
  onUnreadCountChange
}) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateUnreadCount = useCallback(async () => {
    const count = await getUnreadCount(id);
    setUnreadCount(count);
    onUnreadCountChange?.(id, count);
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
        // Update unread count after refresh
        updateUnreadCount();
      }
    };

    // Add event listeners
    window.addEventListener('feedRefreshStart', handleRefreshStart as EventListener);
    window.addEventListener('feedRefreshComplete', handleRefreshComplete as EventListener);
    window.addEventListener('entryReadChanged', updateUnreadCount as EventListener);

    // Initial unread count
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
        <ArrowPathIcon 
          className={`w-4 h-4 transition-opacity duration-200
            ${isRefreshing ? 'opacity-100 animate-spin' : 'opacity-0 group-hover:opacity-100'}
          `}
        />
        <span className="truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {unreadCount > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full
            ${isDarkMode 
              ? 'bg-gray-600 text-gray-200'
              : 'bg-gray-200 text-gray-600'
            }`}
          >
            {unreadCount}
          </span>
        )}
        <TrashIcon
          className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500
            ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}
          `}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
};

export default SidebarFeedItem; 