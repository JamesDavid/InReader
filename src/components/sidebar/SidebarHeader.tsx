import React, { useState } from 'react';
import { FolderIcon, MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import FeedManagementModal from '../FeedManagementModal';

interface HeaderButton {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  className?: string;
}

interface SidebarHeaderProps {
  title: string;
  isDarkMode: boolean;
  isLoading?: boolean;
  buttons?: HeaderButton[];
  folders: { id: string; name: string; }[];
  feeds: { id: number; title: string; folderId: string | null; }[];
  onCreateFolder: (name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDeleteFeed: (feedId: number) => Promise<void>;
  onUpdateFeedOrder: (updates: { feedId: number; folderId: string | null; order: number }[]) => Promise<void>;
  onUpdateFolderOrder: (updates: { folderId: string; order: number }[]) => Promise<void>;
  type?: 'default' | 'searches';
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSearch?: () => void;
}

const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  title,
  isDarkMode,
  isLoading,
  buttons = [],
  folders,
  feeds,
  onCreateFolder,
  onDeleteFolder,
  onDeleteFeed,
  onUpdateFeedOrder,
  onUpdateFolderOrder,
  type = 'default',
  isCollapsed,
  onToggleCollapse,
  onOpenSearch,
}) => {
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);

  const renderManagementButton = () => {
    if (type === 'searches') {
      return (
        <button
          onClick={() => {
            onOpenSearch?.();
          }}
          className={`p-1 rounded transition-colors ${
            isDarkMode 
              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
              : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
          }`}
          title="Search feeds"
        >
          <MagnifyingGlassIcon className="h-4 w-4" />
        </button>
      );
    }

    return (
      <button
        onClick={() => setIsManagementModalOpen(true)}
        className={`p-1 rounded transition-colors ${
          isDarkMode 
            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
            : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
        }`}
        title="Manage feeds and folders"
      >
        <FolderIcon className="w-4 h-4" />
      </button>
    );
  };

  return (
    <>
      <div className={`mt-4 mb-2 px-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'} border rounded-lg py-2 mx-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          {type === 'searches' && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={`p-1 rounded transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                  : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
              }`}
            >
              <ChevronDownIcon 
                className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              />
            </button>
          )}
          {type === 'default' && buttons.find(b => b.title === "Refresh all feeds") && (
            <button
              onClick={buttons.find(b => b.title === "Refresh all feeds")!.onClick}
              disabled={buttons.find(b => b.title === "Refresh all feeds")!.disabled}
              className={`p-1 rounded transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                  : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
              } ${buttons.find(b => b.title === "Refresh all feeds")!.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Refresh all feeds"
            >
              {buttons.find(b => b.title === "Refresh all feeds")!.icon}
            </button>
          )}
          
          <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {title} {isLoading && type !== 'default' && '(Loading...)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {type === 'searches' && renderManagementButton()}
          {type === 'default' && (
            <>
              {buttons.filter(b => b.title !== "Refresh all feeds").map((button, index) => (
                <button
                  key={index}
                  onClick={button.onClick}
                  disabled={button.disabled}
                  className={`p-1 rounded transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  } ${button.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${button.className || ''}`}
                  title={button.title}
                >
                  {button.icon}
                </button>
              ))}
              {renderManagementButton()}
            </>
          )}
        </div>
      </div>

      {type === 'default' && (
        <FeedManagementModal
          isOpen={isManagementModalOpen}
          onClose={() => setIsManagementModalOpen(false)}
          folders={folders}
          feeds={feeds}
          isDarkMode={isDarkMode}
          onCreateFolder={onCreateFolder}
          onDeleteFolder={onDeleteFolder}
          onDeleteFeed={onDeleteFeed}
          onUpdateFeedOrder={onUpdateFeedOrder}
          onUpdateFolderOrder={onUpdateFolderOrder}
        />
      )}
    </>
  );
};

export default SidebarHeader; 