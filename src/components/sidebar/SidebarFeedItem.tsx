import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getUnreadEntries } from '../../services/db';

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
  isLoading,
  isRefreshing,
  onSelect,
  onFocusChange,
  onUnreadCountChange,
}) => {
  const [localUnreadCount, setLocalUnreadCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
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
      const unreadEntries = await getUnreadEntries(id);
      const count = unreadEntries.length;
      
      if (!isMountedRef.current) return;

      // Only update if count has changed or is initial value
      if (localUnreadCount === null || count !== previousCountRef.current) {
        setLocalUnreadCount(count);
        onUnreadCountChange?.(id, count);
        previousCountRef.current = count;
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
      if (isMountedRef.current) {
        // Only set to 0 if we don't have a previous value
        if (localUnreadCount === null) {
          setLocalUnreadCount(0);
          onUnreadCountChange?.(id, 0);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCount(false);
      }
    }
  }, [id, onUnreadCountChange, localUnreadCount]);

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
    const handleEntryRead = async (event: CustomEvent) => {
      const { feedId } = event.detail;
      if ((feedId === id || feedId === null) && isMountedRef.current) {
        await updateUnreadCount();
      }
    };

    window.addEventListener('entryMarkedAsRead', handleEntryRead as EventListener);
    return () => {
      window.removeEventListener('entryMarkedAsRead', handleEntryRead as EventListener);
    };
  }, [id, updateUnreadCount]);

  const menuItemClass = `
    block px-4 py-2 text-sm transition-colors
    ${isActive ? (isDarkMode ? 'bg-gray-700' : 'bg-reader-hover') : ''}
    ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
    ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
  `;

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
            <span className="truncate" title={title}>{truncateTitle(title)}</span>
          </div>
          <div className="flex items-center justify-end flex-shrink-0">
            {localUnreadCount !== null && localUnreadCount > 0 && (
              <span className={`text-xs px-2 py-0.5 rounded-full
                ${isDarkMode 
                  ? 'bg-reader-blue text-white' 
                  : 'bg-reader-blue/10 text-reader-blue'}`}
              >
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