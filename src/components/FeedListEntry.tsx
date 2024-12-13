import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeedEntry, type ChatMessage } from '../services/db';
import { reprocessEntry } from '../services/feedParser';

interface FeedListEntryProps {
  entry: FeedEntry;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isDarkMode: boolean;
  isChatOpen: boolean;
  isExpanded: boolean;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onMarkAsRead: (entryId: number) => void;
  onToggleStar: (entryId: number) => void;
  onToggleExpand: (entryId: number) => void;
  onContentView: (entry: FeedEntry) => void;
  onContentLeave: (entryId: number) => void;
  contentRef: (element: HTMLDivElement | null) => void;
  onOpenChat?: (entry: FeedEntry) => void;
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
  onSelect,
  onFocusChange,
  onMarkAsRead,
  onToggleStar,
  onToggleExpand,
  onContentView,
  onContentLeave,
  contentRef,
  onOpenChat,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent article selection when clicking refresh
    if (!entry.id || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await reprocessEntry(entry.id);
    } catch (error) {
      console.error('Failed to refresh entry:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

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
    if (!content) return '';
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

    return content.slice(0, content.indexOf(result) + result.length) + '...';
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
        
        ${entry.content_aiSummary ? `
          <div style="margin-top: 24px;">
            <h2 style="font-size: 18px; margin-bottom: 16px; color: #374151;">
              Summary ${entry.aiSummaryMetadata?.model ? 
                `<span style="font-weight: normal; color: #6b7280; font-size: 14px;">
                  (${entry.aiSummaryMetadata.model} - 
                  ${entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'})
                </span>` : 
                ''}:
            </h2>
            <div style="font-size: 16px; color: #374151; background: #f9fafb; padding: 16px; border-radius: 6px; border: 1px solid #e5e7eb;">
              ${formatContent(entry.content_aiSummary)}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // For the clipboard, we'll write both HTML and plain text
    const plainText = `${entry.title}\n${entry.feedTitle ? `From: ${entry.feedTitle}\n` : ''}${entry.link}\n\nSummary${
      entry.aiSummaryMetadata?.model 
        ? ` (${entry.aiSummaryMetadata.model} - ${
            entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'
          })`
        : ''
    }:\n\n${entry.content_aiSummary || ''}`;

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
            (e.target instanceof HTMLElement && e.target.closest('button'))) {
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
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
            } ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh content and summary"
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
          {entry.content_fullArticle && (
            <div 
              className={`px-1.5 py-0.5 rounded text-xs font-medium
                ${isDarkMode 
                  ? 'bg-green-500/20 text-green-200' 
                  : 'bg-green-100 text-green-800'}`}
              title="Full article content available"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-medium flex-grow min-w-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <div className="flex items-center min-w-0">
                <button 
                  className={`truncate w-[75%] text-left ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-reader-blue'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead(entry.id!);
                    onOpenChat?.(entry);
                  }}
                >
                  {entry.title}
                </button>
              </div>
            </h3>
          </div>
          <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {entry.feedTitle && (
              <span className="mr-2">{entry.feedTitle}</span>
            )}
            <span>{formatDate(new Date(entry.publishDate))}</span>
          </div>
        </div>
      </div>

      {isSelected && (
        <div 
          ref={contentRef}
          className={`px-4 pb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          onMouseEnter={() => onContentView(entry)}
          onMouseLeave={() => onContentLeave(entry.id!)}
        >
          <div className={markdownClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {getPreviewContent(entry.content_fullArticle || entry.content_rssAbstract, isExpanded)}
            </ReactMarkdown>
          </div>
          {entry.content_aiSummary && (
            <div className={`mt-4 p-4 rounded ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Summary {entry.aiSummaryMetadata?.model && (
                  <span className={`font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    ({entry.aiSummaryMetadata.model} - {entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'})
                  </span>
                )}:
              </div>
              <div className={markdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {entry.content_aiSummary}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {getContentLength(entry.content_fullArticle || entry.content_rssAbstract) > 600 && (
            <button
              onClick={() => onToggleExpand(entry.id!)}
              className={`mt-2 text-sm ${
                isDarkMode 
                  ? 'text-gray-400 hover:text-gray-200' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default FeedListEntry; 