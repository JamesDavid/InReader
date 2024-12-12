import React, { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeedEntry, type ChatMessage } from '../services/db';

interface FeedListEntryProps {
  entry: FeedEntry;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isDarkMode: boolean;
  isChatOpen: boolean;
  isExpanded: boolean;
  summaryState?: {
    content: string;
    isFullContent: boolean;
    model?: string;
    isLoading?: boolean;
  };
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onMarkAsRead: (entryId: number) => void;
  onToggleStar: (entryId: number) => void;
  onToggleExpand: (entryId: number) => void;
  onRefreshSummary: (entry: FeedEntry) => void;
  onContentView: (entry: FeedEntry) => void;
  onContentLeave: (entryId: number) => void;
  contentRef: (element: HTMLDivElement | null) => void;
}

interface FormattedContent {
  html: string;
  text: string;
}

const FeedListEntry: React.FC<FeedListEntryProps> = ({
  entry,
  index,
  isSelected,
  isFocused,
  isDarkMode,
  isChatOpen,
  isExpanded,
  summaryState,
  onSelect,
  onFocusChange,
  onMarkAsRead,
  onToggleStar,
  onToggleExpand,
  onRefreshSummary,
  onContentView,
  onContentLeave,
  contentRef,
}) => {
  const getContentLength = (content: string): number => {
    const div = document.createElement('div');
    div.innerHTML = content;
    return (div.textContent || div.innerText || '').length;
  };

  const getExcerpt = (content: string) => {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || div.innerText || '';
    return text.slice(0, 100) + (text.length > 100 ? '...' : '');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  };

  const hasChatHistory = (entry: FeedEntry) => {
    if (!entry.chatHistory || entry.chatHistory.length === 0) return false;
    const hasUserMessage = entry.chatHistory.some(msg => msg.role === 'user');
    const hasAssistantMessage = entry.chatHistory.some(msg => msg.role === 'assistant');
    return hasUserMessage && hasAssistantMessage;
  };

  const getPreviewContent = (content: string, expanded: boolean) => {
    const contentLength = getContentLength(content);
    if (contentLength <= 600) return content;
    if (expanded) return content;
    
    let charCount = 0;
    let result = '';
    const div = document.createElement('div');
    div.innerHTML = content;
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (charCount + node.textContent!.length > 500) {
        const remainingChars = 500 - charCount;
        result += node.textContent!.slice(0, remainingChars);
        break;
      }
      charCount += node.textContent!.length;
      result += node.textContent;
    }

    const endIndex = content.indexOf(result) + result.length;
    return content.slice(0, endIndex) + '...';
  };

  const markdownClass = `prose prose-sm max-w-none 
    ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
    prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
    prose-pre:bg-gray-800 prose-pre:text-gray-100
    prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
    prose-a:text-blue-500 hover:prose-a:text-blue-600
    ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;

  const formatDateForCopy = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatForSharing = (entry: FeedEntry): FormattedContent => {
    // Format the AI summary with preserved paragraph formatting
    const formatContent = (content: string) => {
      return content
        .split('\n')
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => `<p style="margin: 0 0 16px 0; font-weight: normal;">${para}</p>`)
        .join('');
    };

    // Create HTML version for rich text email clients
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 800px; margin: 0 auto; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 8px; color: #1a1a1a;">${entry.title}</h1>
        ${entry.feedTitle ? `<div style="font-size: 14px; color: #666; margin-bottom: 4px;">From: ${entry.feedTitle}</div>` : ''}
        <div style="font-size: 14px; color: #666; margin-bottom: 8px;">Published: ${formatDateForCopy(new Date(entry.publishDate))}</div>
        <a href="${entry.link}" style="color: #2563eb; text-decoration: none; font-size: 14px; margin-bottom: 16px; display: inline-block;">${entry.link}</a>
        
        ${(entry.aiSummary || summaryState?.content) ? `
          <div style="margin-top: 24px;">
            <h2 style="font-size: 18px; margin-bottom: 16px; color: #374151;">
              Summary ${(entry.aiSummaryMetadata?.model || summaryState?.model) ? 
                `<span style="font-weight: normal; color: #6b7280; font-size: 14px;">
                  (${entry.aiSummaryMetadata?.model || summaryState?.model} - 
                  ${(entry.aiSummaryMetadata?.isFullContent || summaryState?.isFullContent) ? 'Full article' : 'RSS preview'})
                </span>` : 
                ''}:
            </h2>
            <div style="font-size: 16px; color: #374151; background: #f9fafb; padding: 16px; border-radius: 6px; border: 1px solid #e5e7eb;">
              ${formatContent(entry.aiSummary || summaryState?.content || '')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // For the clipboard, we'll write both HTML and plain text
    const plainText = `${entry.title}\n${entry.feedTitle ? `From: ${entry.feedTitle}\n` : ''}${entry.link}\n\nSummary${
      (entry.aiSummaryMetadata?.model || summaryState?.model) 
        ? ` (${entry.aiSummaryMetadata?.model || summaryState?.model} - ${
            (entry.aiSummaryMetadata?.isFullContent || summaryState?.isFullContent) ? 'Full article' : 'RSS preview'
          })`
        : ''
    }:\n\n${entry.aiSummary || summaryState?.content || ''}`;

    return { html: htmlContent.trim(), text: plainText };
  };

  return (
    <article
      data-index={index}
      data-entry-id={entry.id}
      onClick={(e) => {
        console.log('Article clicked, entry ID:', entry.id);
        if (isChatOpen) return;
        if (e.target instanceof HTMLButtonElement || 
            e.target instanceof HTMLAnchorElement ||
            (e.target instanceof HTMLElement && e.target.closest('button')) ||
            (e.target instanceof HTMLElement && e.target.closest('a'))) {
          return;
        }
        onSelect(index);
        !isFocused && onFocusChange(true);
      }}
      className={`border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'} transition-colors
        ${entry.isRead ? 'opacity-75' : ''} 
        ${isDarkMode 
          ? 'hover:bg-gray-800' 
          : 'hover:bg-reader-hover'} 
        ${isFocused && isSelected 
          ? (isDarkMode ? 'bg-gray-800 ring-2 ring-reader-blue ring-opacity-50' : 'bg-reader-hover ring-2 ring-reader-blue ring-opacity-50') 
          : ''}`}
      style={{ cursor: isChatOpen ? 'default' : 'pointer' }}
    >
      <div className="flex items-center px-4 py-2 gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMarkAsRead(entry.id!)}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
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
          >
            {entry.isStarred ? '★' : '☆'}
          </button>
        </div>

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-medium flex-grow min-w-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <div className="flex items-center min-w-0">
                <a 
                  href={entry.link} 
                  target={isSelected ? "reader_tab" : "_blank"} 
                  rel="noopener noreferrer"
                  className={`truncate w-[75%] ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                  onClick={() => onMarkAsRead(entry.id!)}
                >
                  {entry.title}
                </a>
                {entry.feedTitle && (
                  <span className={`text-sm font-normal w-[25%] truncate ml-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    • {entry.feedTitle}
                  </span>
                )}
              </div>
            </h3>
            {hasChatHistory(entry) && (
              <div className={`flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          {!isFocused || !isSelected ? (
            <p className={`text-sm truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {getExcerpt(entry.content)}
            </p>
          ) : null}
        </div>

        <div className={`flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {formatDate(new Date(entry.publishDate))}
        </div>
      </div>

      {isFocused && isSelected && (
        <div 
          className="px-4 pb-4"
          onMouseEnter={() => onContentView(entry)}
          onMouseLeave={() => onContentLeave(entry.id!)}
        >
          {(entry.aiSummary || summaryState) && (
            <div className={`mb-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                    ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                  >
                    <span>AI Summary</span>
                  </div>
                  {(entry.aiSummaryMetadata?.model || summaryState?.model) && (
                    <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                      ${isDarkMode ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-800'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                      </svg>
                      <span>{entry.aiSummaryMetadata?.model || summaryState?.model}</span>
                    </div>
                  )}
                  <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                    ${(entry.aiSummaryMetadata?.isFullContent || summaryState?.isFullContent)
                      ? (isDarkMode ? 'bg-green-500/20 text-green-200' : 'bg-green-100 text-green-800')
                      : (isDarkMode ? 'bg-yellow-500/20 text-yellow-200' : 'bg-yellow-100 text-yellow-800')}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      {(entry.aiSummaryMetadata?.isFullContent || summaryState?.isFullContent) ? (
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      ) : (
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      )}
                    </svg>
                    <span>
                      {(entry.aiSummaryMetadata?.isFullContent || summaryState?.isFullContent)
                        ? 'Full article'
                        : 'RSS preview'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRefreshSummary(entry)}
                  disabled={summaryState?.isLoading}
                  className={`p-1.5 rounded transition-colors
                    ${isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'}
                    ${summaryState?.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Refresh summary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${summaryState?.isLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className={markdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {entry.aiSummary || summaryState?.content || 'Generating summary...'}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Share Toolbar */}
          <div className={`mb-4 p-2 rounded-lg flex items-center justify-end gap-2 ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
            <button
              onClick={async () => {
                const content = formatForSharing(entry);
                const emailSubject = encodeURIComponent(entry.title);
                const emailBody = encodeURIComponent(content.html);
                window.open(`mailto:?subject=${emailSubject}&body=${emailBody}&type=text/html`);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                ${isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-300 hover:text-gray-100' 
                  : 'hover:bg-gray-200 text-gray-600 hover:text-gray-800'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              <span>Email</span>
            </button>

            <button
              onClick={async () => {
                const content = formatForSharing(entry);
                try {
                  await navigator.clipboard.write([
                    new ClipboardItem({
                      'text/html': new Blob([content.html], { type: 'text/html' }),
                      'text/plain': new Blob([content.text], { type: 'text/plain' })
                    })
                  ]);
                  console.log('Content copied to clipboard');
                } catch (err) {
                  // Fallback for browsers that don't support ClipboardItem
                  navigator.clipboard.writeText(content.text);
                  console.log('Fallback: Plain text copied to clipboard');
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                ${isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-300 hover:text-gray-100' 
                  : 'hover:bg-gray-200 text-gray-600 hover:text-gray-800'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
              <span>Copy</span>
            </button>
          </div>

          <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
            <div 
              className={`flex items-center justify-between mb-2 ${getContentLength(entry.content) > 600 ? 'cursor-pointer' : ''}`}
              onClick={() => entry.id && onToggleExpand(entry.id)}
            >
              <div className={`text-sm px-2 py-1 rounded flex items-center gap-1
                ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
              >
                <span>RSS Content</span>
                {getContentLength(entry.content) > 600 && (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
            <div 
              ref={contentRef}
              className={`prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}`}
              dangerouslySetInnerHTML={{ 
                __html: getPreviewContent(entry.content, isExpanded) 
              }}
            />
          </div>
        </div>
      )}
    </article>
  );
};

export default FeedListEntry; 