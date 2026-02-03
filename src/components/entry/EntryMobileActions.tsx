import React from 'react';
import { type FeedEntryWithTitle } from '../../services/db';

interface EntryMobileActionsProps {
  entry: FeedEntryWithTitle;
  isDarkMode: boolean;
  feedTitle: string;
  onToggleStar: (entryId: number) => void;
  onOpenChat?: (entry: FeedEntryWithTitle) => void;
  onListen: () => void;
  resetReveal: () => void;
}

const EntryMobileActions: React.FC<EntryMobileActionsProps> = ({
  entry,
  isDarkMode,
  onToggleStar,
  onOpenChat,
  onListen,
  resetReveal
}) => {
  return (
    <div
      className={`absolute inset-y-0 right-0 flex items-center gap-3 pr-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
      style={{ width: 156 }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(entry.id!);
          resetReveal();
        }}
        className={`flex flex-col items-center justify-center p-2 rounded-lg ${
          entry.isStarred
            ? 'text-yellow-500'
            : isDarkMode ? 'text-gray-300' : 'text-gray-600'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span className="text-xs mt-0.5">Star</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          resetReveal();
          onOpenChat?.(entry);
        }}
        className={`flex flex-col items-center justify-center p-2 rounded-lg ${
          isDarkMode ? 'text-gray-300' : 'text-gray-600'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
        <span className="text-xs mt-0.5">Chat</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          resetReveal();
          onListen();
        }}
        className={`flex flex-col items-center justify-center p-2 rounded-lg ${
          isDarkMode ? 'text-gray-300' : 'text-gray-600'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
        </svg>
        <span className="text-xs mt-0.5">Listen</span>
      </button>
    </div>
  );
};

export default EntryMobileActions;
