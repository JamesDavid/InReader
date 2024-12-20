import React from 'react';
import { Link } from 'react-router-dom';
import { KeyIcon } from '@heroicons/react/24/outline';

interface SidebarMainItemProps {
  path: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  isGunFeed?: boolean;
  pubKey?: string;
}

const SidebarMainItem: React.FC<SidebarMainItemProps> = ({
  path,
  title,
  isActive,
  isSelected,
  isDarkMode,
  index,
  onSelect,
  onFocusChange,
  isGunFeed,
  pubKey,
}) => {
  const menuItemClass = `
    block px-4 py-2 text-sm transition-colors
    ${isActive ? (isDarkMode ? 'bg-gray-700' : 'bg-reader-hover') : ''}
    ${isSelected ? (isDarkMode ? 'ring-2 ring-reader-blue ring-opacity-50' : 'ring-2 ring-reader-blue ring-opacity-50') : ''}
    ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-reader-hover'}
  `;

  return (
    <Link
      to={path}
      data-index={index}
      className={menuItemClass}
      onClick={() => {
        onSelect(index);
        onFocusChange(false);
      }}
    >
      <div className="flex items-center justify-between">
        <span>{title}</span>
        {isGunFeed && pubKey && (
          <div className="group relative">
            <KeyIcon className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} hover:text-reader-blue transition-colors`} />
            <div className={`absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-700'}`}>
              {pubKey}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default SidebarMainItem; 