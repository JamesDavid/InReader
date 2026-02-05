import React from 'react';
import { type FeedEntryWithTitle, type ChatMessage } from '../../services/db';

interface EntryHeaderProps {
  entry: FeedEntryWithTitle;
  feedTitle: string;
  formattedDate: string;
  isDarkMode: boolean;
  isMobile: boolean;
  isRefreshing: boolean;
  onMarkAsRead: (entryId: number, isRead?: boolean) => void;
  onToggleStar: (entryId: number) => void;
  onRefresh: (e: React.MouseEvent) => void;
  onOpenChat?: (entry: FeedEntryWithTitle) => void;
}

function hasChatHistory(entry: FeedEntryWithTitle): boolean {
  if (!entry.chatHistory || entry.chatHistory.length === 0) return false;
  const hasUserMessage = entry.chatHistory.some((msg: ChatMessage) => msg.role === 'user');
  const hasAssistantMessage = entry.chatHistory.some((msg: ChatMessage) => msg.role === 'assistant');
  return hasUserMessage && hasAssistantMessage;
}

const EntryHeader: React.FC<EntryHeaderProps> = ({
  entry,
  feedTitle,
  formattedDate,
  isDarkMode,
  isMobile,
  isRefreshing,
  onMarkAsRead,
  onToggleStar,
  onRefresh,
  onOpenChat
}) => {
  return (
    <div className="flex items-center px-4 py-2 gap-4">
      {/* Desktop action buttons - hidden on mobile */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => onMarkAsRead(entry.id!, !entry.isRead)}
          className={`p-1.5 rounded transition-colors ${
            isDarkMode
              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
          title="Toggle read/unread (m)"
        >
          {entry.isRead ? '✓' : '○'}
        </button>
        <button
          onClick={() => onToggleStar(entry.id!)}
          className={`p-1.5 rounded transition-colors ${
            entry.isStarred
              ? 'text-yellow-500'
              : isDarkMode
                ? 'text-gray-400 hover:text-yellow-500'
                : 'text-gray-500 hover:text-yellow-500'
          }`}
          title="Toggle star (i)"
        >
          {entry.isStarred ? '★' : '☆'}
        </button>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`p-1.5 rounded transition-colors ${
            isDarkMode
              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
              : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
          } ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Refresh content and summary (u)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {/* Status badges - stacked vertically */}
      <div className="flex flex-col gap-0.5">
        {entry.content_fullArticle && entry.content_fullArticle.length > 0 && (
          <div
            className={`px-1.5 py-0.5 rounded text-xs font-medium
              ${isDarkMode
                ? 'bg-green-500/20 text-green-200'
                : 'bg-green-100 text-green-800'}`}
            title="Full article content available"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        {entry.content_aiSummary && (
          <div
            className={`px-1.5 py-0.5 rounded text-xs font-medium
              ${isDarkMode
                ? 'bg-yellow-500/20 text-yellow-200'
                : 'bg-yellow-100 text-yellow-800'}`}
            title="AI Summary available"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 1.5a1 1 0 110 2 1 1 0 010-2zM9.5 3.5h1V5h-1V3.5zM7 5h6a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zm.5 2.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm5 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM7.5 12.5h5v1h-5v-1z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        {(entry.interestScore ?? 0) > 0 && (
          <div
            className={`px-1.5 py-0.5 rounded text-xs font-medium
              ${isDarkMode
                ? 'bg-purple-500/20 text-purple-200'
                : 'bg-purple-100 text-purple-800'}`}
            title={`Interest score: ${entry.interestScore}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        )}
        {entry.requestProcessingStatus === 'pending' && (
          <div
            className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1
              ${isDarkMode
                ? 'bg-blue-500/20 text-blue-200'
                : 'bg-blue-100 text-blue-800'}`}
            title="Processing article content"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`text-base font-medium flex-grow min-w-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            <div className="flex items-center min-w-0">
              {isMobile ? (
                <span className="text-left">
                  {entry.title}
                </span>
              ) : (
                <button
                  className={`truncate w-[75%] text-left ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenChat) {
                      onOpenChat(entry);
                    }
                  }}
                >
                  {entry.title}
                </button>
              )}
            </div>
          </h3>
        </div>
        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {feedTitle}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasChatHistory(entry) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenChat) {
                onOpenChat(entry);
              }
            }}
            className={`p-1 rounded transition-colors ${
              isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-600'
            }`}
            title="Open chat (l)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <span>{formattedDate}</span>
      </div>
    </div>
  );
};

export default EntryHeader;
