import React, { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import SidebarFeedItem from './SidebarFeedItem';

interface FeedInFolder {
  id: number;
  title: string;
  path: string;
  isRefreshing: boolean;
}

interface VisibleItem {
  id?: string | number;
  path: string;
  title: string;
  isFolder?: boolean;
  unreadCount?: number;
}

interface SidebarFeedFolderProps {
  id: string;
  title: string;
  feeds: FeedInFolder[];
  isDarkMode: boolean;
  isLoading: boolean;
  selectedIndex: number;
  visibleItems: VisibleItem[];
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onDeleteFeed: (feedId: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (folderId: string) => void;
}

const SidebarFeedFolder: React.FC<SidebarFeedFolderProps> = ({
  id,
  title,
  feeds,
  isDarkMode,
  isLoading,
  selectedIndex,
  visibleItems,
  onSelect,
  onFocusChange,
  onDeleteFeed,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [feedCounts, setFeedCounts] = useState<Record<number, number>>({});
  const folderUnreadCount = React.useMemo(() => 
    Object.values(feedCounts).reduce((sum, count) => sum + count, 0),
    [feedCounts]
  );

  const handleFeedUnreadCount = React.useCallback((feedId: number, count: number) => {
    setFeedCounts(prev => {
      if (prev[feedId] === count) return prev;
      return { ...prev, [feedId]: count };
    });
  }, []);

  const folderIndex = visibleItems.findIndex(item => item.id === `folder-${id}`);

  return (
    <div className="mb-1">
      {/* Folder Header */}
      <button
        onClick={() => onToggleCollapse(id)}
        className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors
          ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}
          ${selectedIndex === folderIndex ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
        `}
        data-index={folderIndex}
      >
        <div className="flex items-center gap-2">
          <ChevronDownIcon 
            className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
          />
          <span className="font-medium">{title}</span>
        </div>
        {folderUnreadCount > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full
            ${isDarkMode 
              ? 'bg-gray-600 text-gray-200'
              : 'bg-gray-200 text-gray-600'
            }`}
          >
            {folderUnreadCount}
          </span>
        )}
      </button>

      {/* Folder Content */}
      <div className={`
        overflow-hidden transition-all duration-200 ease-in-out
        ${isCollapsed ? 'max-h-0' : 'max-h-[1000px]'}
      `}>
        <div className="pl-4">
          {feeds.map((feed) => {
            const feedIndex = visibleItems.findIndex(item => item.path === feed.path);
            return (
              <SidebarFeedItem
                key={feed.id}
                id={feed.id}
                path={feed.path}
                title={feed.title}
                isActive={selectedIndex === feedIndex}
                isSelected={selectedIndex === feedIndex}
                isDarkMode={isDarkMode}
                index={feedIndex}
                isLoading={isLoading}
                isRefreshing={feed.isRefreshing}
                onSelect={onSelect}
                onFocusChange={onFocusChange}
                onDelete={() => onDeleteFeed(feed.id)}
                onUnreadCountChange={handleFeedUnreadCount}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SidebarFeedFolder; 