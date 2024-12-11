import React from 'react';
import { Link } from 'react-router-dom';

interface SidebarMainItemProps {
  path: string;
  title: string;
  isActive: boolean;
  isSelected: boolean;
  isDarkMode: boolean;
  index: number;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
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
      {title}
    </Link>
  );
};

export default SidebarMainItem; 