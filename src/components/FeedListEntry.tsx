import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeedEntryWithTitle, type ChatMessage, subscribeToEntryUpdates, db, getFeedTitle } from '../services/db';
import { reprocessEntry } from '../services/feedParser';

interface FeedListEntryProps {
  entry: FeedEntryWithTitle;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isDarkMode: boolean;
  isChatOpen: boolean;
  isExpanded: boolean;
  onSelect: (index: number) => void;
  onFocusChange: (focused: boolean) => void;
  onMarkAsRead: (entryId: number, isRead?: boolean) => void;
  onToggleStar: (entryId: number) => void;
  onToggleExpand: (entryId: number) => void;
  onContentView: (entry: FeedEntryWithTitle) => void;
  onContentLeave: (entryId: number) => void;
  contentRef: (element: HTMLDivElement | null) => void;
  onOpenChat?: (entry: FeedEntryWithTitle) => void;
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
  const [currentEntry, setCurrentEntry] = useState(entry);
  const articleRef = useRef<HTMLElement>(null);
  const contentElementRef = useRef<HTMLDivElement | null>(null);
  const [feedTitle, setFeedTitle] = useState(entry.feedTitle);

  useEffect(() => {
    setCurrentEntry(entry);
  }, [entry]);

  useEffect(() => {
    if (entry.feedId) {
      getFeedTitle(entry.feedId).then(title => setFeedTitle(title));
    }
  }, [entry.feedId]);

  useEffect(() => {
    // Subscribe to updates for this entry
    if (entry.id) {
      const unsubscribe = subscribeToEntryUpdates(async (updatedEntryId) => {
        if (updatedEntryId === entry.id) {
          // Fetch the updated entry and feed title
          const updated = await db.entries.get(entry.id);
          if (updated) {
            const feed = await db.feeds.get(updated.feedId!);
            setCurrentEntry({
              ...updated,
              feedTitle: feed?.title || 'Unknown Feed'
            });
          }
        }
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [entry.id]);

  const checkVisibility = () => {
    if (!articleRef.current) return;
    
    const scrollContainer = articleRef.current.closest('.overflow-y-auto');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const rect = articleRef.current.getBoundingClientRect();
    const halfwayPoint = containerRect.top + (containerRect.height / 2);
    
    // Check if the top edge is below the halfway point (scrolling down)
    if (rect.top > halfwayPoint) {
      // Calculate the target scroll position (25% from the top)
      const targetPosition = scrollContainer.scrollTop + (rect.top - containerRect.top) - (containerRect.height * 0.25);
      scrollContainer.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
    // Check if the top edge is above the container's top edge (scrolling up)
    else if (rect.top < containerRect.top) {
      // If entry is taller than viewport, align bottom edge with bottom of viewport
      if (rect.height > containerRect.height) {
        const targetPosition = scrollContainer.scrollTop + (rect.bottom - containerRect.bottom);
        scrollContainer.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
      // If entry is shorter than viewport, align top edge with top of viewport
      else {
        const targetPosition = scrollContainer.scrollTop + (rect.top - containerRect.top);
        scrollContainer.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    }
  };

  useEffect(() => {
    if (isSelected) {
      // Small delay to let other scroll behaviors complete
      setTimeout(checkVisibility, 0);
    }
  }, [isSelected]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent article selection when clicking refresh
    if (!currentEntry.id || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await reprocessEntry(currentEntry.id);
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

  const hasChatHistory = (entry: FeedEntryWithTitle) => {
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

  const formatForSharing = (entry: FeedEntryWithTitle): string => {
    const parts = [
      `${entry.title}`,
      entry.feedTitle ? `From: ${entry.feedTitle}` : '',
      `Published: ${formatDateForCopy(new Date(entry.publishDate))}`,
      `Source: ${entry.link}`,
      '',
      entry.content_aiSummary ? `Summary${
        entry.aiSummaryMetadata?.model 
          ? ` (${entry.aiSummaryMetadata.model} - ${
              entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'
            })`
          : ''
      }:\n\n${entry.content_aiSummary}` : '',
      '',
      'Full Content:',
      entry.content_fullArticle || entry.content_rssAbstract
    ];

    return parts.filter(Boolean).join('\n');
  };

  const handleCopy = async () => {
    const content = formatForSharing(currentEntry);
    await navigator.clipboard.writeText(content);
  };

  useEffect(() => {
    const handleReadChange = (event: CustomEvent<{
      entryId: number;
      isRead: boolean;
    }>) => {
      if (event.detail.entryId === currentEntry.id) {
        setCurrentEntry(prev => ({
          ...prev,
          isRead: event.detail.isRead
        }));
      }
    };

    window.addEventListener('entryReadChanged', handleReadChange as EventListener);
    return () => {
      window.removeEventListener('entryReadChanged', handleReadChange as EventListener);
    };
  }, [currentEntry.id]);

  useEffect(() => {
    const handleEntryUpdate = (event: CustomEvent<{ entry: FeedEntryWithTitle }>) => {
      if (event.detail.entry.id === currentEntry.id) {
        setCurrentEntry(event.detail.entry);
      }
    };

    window.addEventListener('entryUpdated', handleEntryUpdate as EventListener);
    return () => {
      window.removeEventListener('entryUpdated', handleEntryUpdate as EventListener);
    };
  }, [currentEntry.id]);

  useEffect(() => {
    const handleRefreshStart = (event: CustomEvent<{ entryId: number }>) => {
      if (event.detail.entryId === currentEntry.id) {
        setIsRefreshing(true);
      }
    };

    const handleRefreshComplete = (event: CustomEvent<{ entry: FeedEntryWithTitle }>) => {
      if (event.detail.entry.id === currentEntry.id) {
        setCurrentEntry(event.detail.entry);
        setIsRefreshing(false);
      }
    };

    window.addEventListener('entryRefreshStart', handleRefreshStart as EventListener);
    window.addEventListener('entryRefreshComplete', handleRefreshComplete as EventListener);
    return () => {
      window.removeEventListener('entryRefreshStart', handleRefreshStart as EventListener);
      window.removeEventListener('entryRefreshComplete', handleRefreshComplete as EventListener);
    };
  }, [currentEntry.id]);

  // Modify the isContentFullyVisible function
  const isContentFullyVisible = () => {
    const contentElement = contentElementRef.current;
    if (!contentElement) return true;

    const rect = contentElement.getBoundingClientRect();
    const parentContainer = contentElement.closest('.overflow-y-auto');
    if (!parentContainer) return true;

    const containerRect = parentContainer.getBoundingClientRect();
    return rect.bottom <= containerRect.bottom;
  };

  // Modify the scrollContent function
  const scrollContent = () => {
    const contentElement = contentElementRef.current;
    if (!contentElement) return;

    const parentContainer = contentElement.closest('.overflow-y-auto');
    if (!parentContainer) return;

    const scrollAmount = parentContainer.clientHeight * 0.33;
    parentContainer.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });
  };

  // Modify the spacebar expansion handler
  useEffect(() => {
    const handleToggleExpand = (event: CustomEvent<{ entryId: number }>) => {
      if (event.detail.entryId === currentEntry.id) {
        const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
        if (!content || getContentLength(content) <= 600) return;

        // If content is expanded but not fully visible, scroll instead of collapsing
        if (isExpanded && !isContentFullyVisible()) {
          scrollContent();
        } else {
          onToggleExpand(currentEntry.id!);
        }
      }
    };

    window.addEventListener('toggleEntryExpand', handleToggleExpand as EventListener);
    return () => {
      window.removeEventListener('toggleEntryExpand', handleToggleExpand as EventListener);
    };
  }, [currentEntry.id, currentEntry.content_fullArticle, currentEntry.content_rssAbstract, onToggleExpand, isExpanded]);

  // Add this helper function to check if top is visible
  const isTopVisible = () => {
    if (!articleRef.current) return true;
    const rect = articleRef.current.getBoundingClientRect();
    const parentContainer = articleRef.current.closest('.overflow-y-auto');
    if (!parentContainer) return true;

    const containerRect = parentContainer.getBoundingClientRect();
    return rect.top >= containerRect.top;
  };

  // Add this helper function to scroll up
  const scrollUp = () => {
    if (!articleRef.current) return;
    const parentContainer = articleRef.current.closest('.overflow-y-auto');
    if (!parentContainer) return;

    const scrollAmount = parentContainer.clientHeight * 0.33;
    parentContainer.scrollBy({
      top: -scrollAmount,
      behavior: 'smooth'
    });
  };

  // Add effect to listen for scroll event
  useEffect(() => {
    const handleEntryScroll = (event: CustomEvent<{ entryId: number }>) => {
      if (event.detail.entryId === currentEntry.id && !isTopVisible()) {
        scrollUp();
      }
    };

    window.addEventListener('feedEntryScroll', handleEntryScroll as EventListener);
    return () => {
      window.removeEventListener('feedEntryScroll', handleEntryScroll as EventListener);
    };
  }, [currentEntry.id]);

  return (
    <article
      ref={articleRef}
      data-index={index}
      data-entry-id={currentEntry.id}
      onClick={(e) => {
        console.log('Article clicked, entry ID:', currentEntry.id);
        if (isChatOpen) return;
        if (e.target instanceof HTMLButtonElement || 
            (e.target instanceof HTMLElement && e.target.closest('button'))) {
          return;
        }
        onSelect(index);
        !isFocused && onFocusChange(true);
      }}
      className={`border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'} transition-colors
        ${currentEntry.isRead ? 'opacity-75' : ''} 
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
            onClick={() => onMarkAsRead(currentEntry.id!, !currentEntry.isRead)}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {currentEntry.isRead ? '✓' : '○'}
          </button>
          <button
            onClick={() => onToggleStar(currentEntry.id!)}
            className={`p-1.5 rounded transition-colors ${
              currentEntry.isStarred
                ? 'text-yellow-500'
                : isDarkMode
                  ? 'text-gray-400 hover:text-yellow-500'
                  : 'text-gray-500 hover:text-yellow-500'
            }`}
          >
            {currentEntry.isStarred ? '★' : '☆'}
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
          {currentEntry.content_fullArticle && currentEntry.content_fullArticle.length > 0 && (
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
                    console.log('Title clicked, opening chat for:', currentEntry.title);
                    if (onOpenChat) {
                      onOpenChat(currentEntry);
                    }
                  }}
                >
                  {currentEntry.title}
                </button>
              </div>
            </h3>
          </div>
          <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {feedTitle}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasChatHistory(currentEntry) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('Chat icon clicked, opening chat for:', currentEntry.title);
                if (onOpenChat) {
                  onOpenChat(currentEntry);
                }
              }}
              className={`p-1 rounded transition-colors ${
                isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-600'
              }`}
              title="Open chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <span>{formatDate(new Date(currentEntry.publishDate))}</span>
        </div>
      </div>

      {isSelected && (
        <div 
          ref={(element) => {
            contentElementRef.current = element;
            contentRef(element);
          }}
          className={`px-4 pb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} relative`}
          onMouseEnter={() => onContentView(currentEntry)}
          onMouseLeave={() => onContentLeave(currentEntry.id!)}
        >
          {currentEntry.content_aiSummary && (
            <div className={`mb-4 p-4 rounded border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`text-sm font-medium mb-2 flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>Summary</span>
                {currentEntry.aiSummaryMetadata?.model && (
                  <>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      isDarkMode ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {currentEntry.aiSummaryMetadata.model}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      isDarkMode 
                        ? (currentEntry.aiSummaryMetadata.isFullContent ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200')
                        : (currentEntry.aiSummaryMetadata.isFullContent ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')
                    }`}>
                      {currentEntry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'}
                    </span>
                  </>
                )}
              </div>
              <div className={markdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentEntry.content_aiSummary}
                </ReactMarkdown>
              </div>
            </div>
          )}
          <div className={markdownClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {getPreviewContent(currentEntry.content_fullArticle || currentEntry.content_rssAbstract, isExpanded)}
            </ReactMarkdown>
          </div>
          <div className="flex justify-between items-center mt-4">
            {getContentLength(currentEntry.content_fullArticle || currentEntry.content_rssAbstract) > 600 && (
              <button
                onClick={() => onToggleExpand(currentEntry.id!)}
                className={`text-sm ${
                  isDarkMode 
                    ? 'text-gray-400 hover:text-gray-200' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
            <button
              onClick={handleCopy}
              className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm ml-auto
                ${isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
              title="Copy article content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

export default FeedListEntry; 