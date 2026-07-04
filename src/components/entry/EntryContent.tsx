import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeedEntryWithTitle } from '../../services/db';

interface EntryContentProps {
  entry: FeedEntryWithTitle;
  isDarkMode: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  contentLength: number;
  previewContent: string;
  markdownClass: string;
  interestTagNames?: Set<string>;
  onToggleExpand: (entryId: number) => void;
  onContentView: (entry: FeedEntryWithTitle) => void;
  onContentLeave: (entryId: number) => void;
  onTTS: (e: React.MouseEvent) => void;
  onCopy: () => void;
  onEmail: () => void;
  contentRef: (element: HTMLDivElement | null) => void;
}

const EntryContent: React.FC<EntryContentProps> = ({
  entry,
  isDarkMode,
  isExpanded,
  isSelected,
  contentLength,
  previewContent,
  markdownClass,
  interestTagNames,
  onToggleExpand,
  onContentView,
  onContentLeave,
  onTTS,
  onCopy,
  onEmail,
  contentRef
}) => {
  return (
    <div
      ref={contentRef}
      className={`px-4 pb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} relative`}
      onMouseEnter={() => onContentView(entry)}
      onMouseLeave={() => onContentLeave(entry.id!)}
    >
      {entry.content_aiSummary && (
        <div className={`mb-4 p-4 rounded border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-sm font-medium mb-2 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            <span>Summary</span>
            {entry.aiSummaryMetadata?.model && (
              <>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  isDarkMode ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-800'
                }`}>
                  {entry.aiSummaryMetadata.model}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  isDarkMode
                    ? (entry.aiSummaryMetadata.isFullContent ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200')
                    : (entry.aiSummaryMetadata.isFullContent ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')
                }`}>
                  {entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'}
                </span>
              </>
            )}
          </div>
          <div className={markdownClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entry.content_aiSummary}
            </ReactMarkdown>
          </div>
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.tags.map(tag => {
                const isInterest = interestTagNames?.has(tag);
                return (
                  <span
                    key={tag}
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      isInterest
                        ? isDarkMode
                          ? 'bg-purple-500/20 text-purple-200'
                          : 'bg-purple-100 text-purple-800'
                        : isDarkMode
                          ? 'bg-gray-700 text-gray-300'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className={markdownClass}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {previewContent}
        </ReactMarkdown>
      </div>
      <div className="flex justify-between items-center mt-4">
        {contentLength > 600 && (
          <button
            onClick={() => onToggleExpand(entry.id!)}
            className={`text-sm ${
              isDarkMode
                ? 'text-gray-400 hover:text-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
        {/* Desktop action bar - hidden on mobile */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          <button
            onClick={onTTS}
            disabled={!isSelected}
            className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm
              ${isDarkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}
              ${!isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isSelected ? "Add to TTS queue ([)" : "Select entry to add to TTS queue"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd"/>
            </svg>
            <span>Listen</span>
          </button>
          <button
            onClick={onCopy}
            className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm
              ${isDarkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
            title="Copy article content (')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
            <span>Copy</span>
          </button>
          <button
            onClick={onEmail}
            className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm
              ${isDarkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
            title="Email article (-)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            <span>Email</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EntryContent;
