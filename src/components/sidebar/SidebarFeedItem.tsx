import React from 'react';
import { Link } from 'react-router-dom';

interface SidebarFeedItemProps {
  id: number;
  path: string;
  title: string;
  unreadCount: number;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onDelete?: () => void;
}

const SidebarFeedItem: React.FC<SidebarFeedItemProps> = ({
  path,
  title,
  unreadCount,
  isActive,
  isSelected,
  isDarkMode,
  index,
  isLoading,
  isRefreshing,
  onSelect,
  onFocusChange,
  onDelete,
}) => {
  const menuItemClass = `
    block px-4 py-2 text-sm transition-colors
    ${isActive ? (isDarkMode ? 'bg-gray-700' : 'bg-reader-hover') : ''}
    ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
    ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-reader-hover'}
  `;

  const truncateTitle = (text: string, maxLength: number = 20) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

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
          <div className="flex items-center justify-end flex-shrink-0 relative">
            {!isLoading && (unreadCount > 0 || isLoading) && (
              <span className={`text-xs px-2 py-0.5 rounded-full absolute right-2
                ${isDarkMode 
                  ? 'bg-reader-blue text-white' 
                  : 'bg-reader-blue/10 text-reader-blue'}
                ${onDelete ? 'group-hover:opacity-0' : ''} transition-opacity`}
              >
                {isLoading ? '...' : unreadCount}
              </span>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
                className={`absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${
                  isDarkMode
                    ? 'hover:bg-gray-600 text-gray-400 hover:text-gray-200'
                    : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default SidebarFeedItem; 