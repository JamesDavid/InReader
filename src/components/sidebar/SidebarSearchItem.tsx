import React from 'react';
import { Link } from 'react-router-dom';

interface SidebarSearchItemProps {
  path: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onDelete?: () => void;
  hits?: number;
}

const SidebarSearchItem: React.FC<SidebarSearchItemProps> = ({
  path,
  title,
  isActive,
  isSelected,
  isDarkMode,
  index,
  onSelect,
  onFocusChange,
  onDelete,
  hits,
}) => {
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
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center justify-end flex-shrink-0 relative">
            {typeof hits === 'number' && (
              <span className={`text-xs px-2 py-0.5 rounded-full
                ${isDarkMode 
                  ? 'bg-reader-blue text-white' 
                  : 'bg-reader-blue/10 text-reader-blue'}
                ${onDelete ? 'group-hover:opacity-0' : ''} transition-opacity`}
              >
                {hits}
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

export default SidebarSearchItem; 