import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type FeedEntryWithTitle, type ChatMessage, subscribeToEntryUpdates, db, getFeedTitle } from '../services/db';
import { reprocessEntry } from '../services/feedParser';
import ttsService from '../services/ttsService';
import { gunService } from '../services/gunService';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import EntryActionStrip from './EntryActionStrip';
import EntryBottomSheet from './EntryBottomSheet';

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
  const [isMobile, setIsMobile] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Animate height collapse when dismissed via swipe
  useEffect(() => {
    if (!isDismissing || !articleRef.current) return;
    const el = articleRef.current;
    // Fix the height to current value
    el.style.height = el.offsetHeight + 'px';
    el.style.overflow = 'hidden';
    // Next frame: animate to 0
    requestAnimationFrame(() => {
      el.style.transition = 'height 300ms ease-out, opacity 300ms ease-out';
      el.style.height = '0px';
      el.style.opacity = '0';
    });
  }, [isDismissing]);

  const handleSwipeLeft = useCallback(() => {
    if (!currentEntry.id) return;
    // Start height collapse animation
    setIsDismissing(true);
    onMarkAsRead(currentEntry.id, true);
    // Delay the advance event so the collapse animation plays first
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mobileSwipeDismiss', {
        detail: { entryId: currentEntry.id, index }
      }));
    }, 200);
  }, [currentEntry.id, index, onMarkAsRead]);

  const handleSwipeLongPress = useCallback(() => {
    setBottomSheetOpen(true);
  }, []);

  const { state: swipeState, resetReveal } = useSwipeGesture(swipeContainerRef, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: () => { if (currentEntry.id) onMarkAsRead(currentEntry.id, true); },
    onLongPress: handleSwipeLongPress,
    enabled: isMobile,
  });

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

  // Combine all entry update handlers into a single effect
  useEffect(() => {
    const handlers = {
      readChange: (event: CustomEvent<{ entryId: number; isRead: boolean }>) => {
        if (event.detail.entryId === currentEntry.id) {
          setCurrentEntry(prev => ({...prev, isRead: event.detail.isRead}));
        }
      },

      entryUpdate: (event: CustomEvent<{ entry: FeedEntryWithTitle }>) => {
        if (event.detail.entry.id === currentEntry.id) {
          setCurrentEntry(event.detail.entry);
        }
      },

      refreshStart: (event: CustomEvent<{ entryId: number }>) => {
        if (event.detail.entryId === currentEntry.id) {
          setIsRefreshing(true);
        }
      },

      refreshComplete: (event: CustomEvent<{ entry: FeedEntryWithTitle }>) => {
        if (event.detail.entry.id === currentEntry.id) {
          setCurrentEntry(event.detail.entry);
          setIsRefreshing(false);
        }
      }
    };

    // Add all event listeners
    window.addEventListener('entryReadChanged', handlers.readChange as EventListener);
    window.addEventListener('entryUpdated', handlers.entryUpdate as EventListener);
    window.addEventListener('entryRefreshStart', handlers.refreshStart as EventListener);
    window.addEventListener('entryRefreshComplete', handlers.refreshComplete as EventListener);

    // Remove all event listeners on cleanup
    return () => {
      window.removeEventListener('entryReadChanged', handlers.readChange as EventListener);
      window.removeEventListener('entryUpdated', handlers.entryUpdate as EventListener);
      window.removeEventListener('entryRefreshStart', handlers.refreshStart as EventListener);
      window.removeEventListener('entryRefreshComplete', handlers.refreshComplete as EventListener);
    };
  }, [currentEntry.id]);

  // Memoize handlers that don't need to change often
  const handleRefresh = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentEntry.id || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await reprocessEntry(currentEntry.id);
    } catch (error) {
      console.error('Failed to refresh entry:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentEntry.id, isRefreshing]);

  const handleCopy = useCallback(async () => {
    const content = formatForSharing(currentEntry);
    await navigator.clipboard.writeText(content);
    // Dispatch custom event for toast notification
    window.dispatchEvent(new CustomEvent('showToast', {
      detail: { 
        message: 'Article copied to clipboard',
        type: 'success'
      }
    }));
  }, [currentEntry]);

  const handleEmail = useCallback(async () => {
    console.log('Email button clicked');
    const content = formatForSharing(currentEntry);
    console.log('Formatted content length:', content.length);
    const subject = encodeURIComponent(`Via InReader: ${currentEntry.title}`);
    const body = encodeURIComponent(content);
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    console.log('Generated mailto URL:', mailtoUrl.substring(0, 100) + '...');
    
    try {
      // Show a toast to indicate we're trying to open the email client
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { 
          message: 'Opening email client...',
          type: 'success'
        }
      }));

      // Create an invisible anchor element
      const link = document.createElement('a');
      link.href = mailtoUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // If we're still here after 2 seconds, show the error message
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('showToast', {
          detail: { 
            message: 'No email client responded. Please check your default email app settings.',
            type: 'error'
          }
        }));
      }, 2000);

    } catch (error) {
      console.error('Failed to open email client:', error);
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { 
          message: 'Unable to open email client. Please check your default email app.',
          type: 'error'
        }
      }));
    }
  }, [currentEntry]);

  // Memoize content length calculation
  const contentLength = useMemo(() => {
    const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
    return getContentLength(content);
  }, [currentEntry.content_fullArticle, currentEntry.content_rssAbstract]);

  // Memoize formatted date
  const formattedDate = useMemo(() => {
    return formatDate(new Date(currentEntry.publishDate));
  }, [currentEntry.publishDate]);

  // Memoize markdown class
  const computedMarkdownClass = useMemo(() => {
    return `prose prose-sm max-w-none 
      ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
      prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
      prose-pre:bg-gray-800 prose-pre:text-gray-100
      prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
      prose-a:text-blue-500 hover:prose-a:text-blue-600
      ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;
  }, [isDarkMode]);

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

  const formatDateForCopy = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatForSharing = (entry: FeedEntryWithTitle): string => {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const parts = [
      `${entry.title}`,
      entry.feedTitle ? `From: ${entry.feedTitle}` : '',
      `Published: ${formatDate(new Date(entry.publishDate))}`,
      `Source: ${entry.link}`,
      '',
      entry.content_aiSummary ? `\nSummary${
        entry.aiSummaryMetadata?.model 
          ? ` (${entry.aiSummaryMetadata.model} - ${
              entry.aiSummaryMetadata.isFullContent ? 'Full article' : 'RSS preview'
            })`
          : ''
      }:\n\n${entry.content_aiSummary}` : '',
      '',
      '\nFull Content:\n',
      entry.content_fullArticle || entry.content_rssAbstract
    ];

    return parts.filter(Boolean).join('\n');
  };

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

  const handleTTS = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selection change
    const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
    if (content && currentEntry.id && isSelected) {
      console.log('Adding to TTS queue:', {
        id: currentEntry.id,
        title: currentEntry.title,
        isSelected
      });
      ttsService.addToQueue({
        id: currentEntry.id,
        title: currentEntry.title,
        content_fullArticle: currentEntry.content_fullArticle,
        content_rssAbstract: currentEntry.content_rssAbstract,
        content_aiSummary: currentEntry.content_aiSummary,
        feedTitle: feedTitle
      });
    }
  }, [currentEntry, isSelected, feedTitle]);

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
        if (swipeState.isRevealed) {
          resetReveal();
          return;
        }
        onSelect(index);
        !isFocused && onFocusChange(true);
      }}
      className={`relative overflow-hidden border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-100'} transition-colors
        ${currentEntry.isRead ? 'opacity-75' : ''}
        ${isDarkMode
          ? 'hover:bg-gray-800'
          : 'hover:bg-reader-hover'}
        ${isFocused && isSelected
          ? (isDarkMode ? 'bg-gray-800 ring-2 ring-reader-blue ring-opacity-50' : 'bg-reader-hover ring-2 ring-reader-blue ring-opacity-50')
          : ''}`}
      style={{ cursor: isChatOpen ? 'default' : 'pointer' }}
    >
      {/* Action strip behind content (mobile only), clipped to swipe progress */}
      {isMobile && (swipeState.direction === 'right' || swipeState.isRevealed) && (
        <div
          className={`absolute inset-y-0 left-0 overflow-hidden z-10 ${
            swipeState.isTransitioning ? 'transition-[width] duration-300' : ''
          }`}
          style={{ width: Math.max(0, swipeState.translateX) }}
        >
          <EntryActionStrip
            isDarkMode={isDarkMode}
            isStarred={!!currentEntry.isStarred}
            onStar={() => onToggleStar(currentEntry.id!)}
            onChat={() => onOpenChat?.(currentEntry)}
            onListen={() => {
              const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
              if (content && currentEntry.id) {
                ttsService.addToQueue({
                  id: currentEntry.id,
                  title: currentEntry.title,
                  content_fullArticle: currentEntry.content_fullArticle,
                  content_rssAbstract: currentEntry.content_rssAbstract,
                  content_aiSummary: currentEntry.content_aiSummary,
                  feedTitle: feedTitle
                });
              }
            }}
            onDone={resetReveal}
          />
        </div>
      )}

      {/* Swipeable content layer */}
      <div
        ref={swipeContainerRef}
        style={{
          transform: isMobile ? `translateX(${swipeState.translateX}px)` : undefined,
        }}
        className={`${isDarkMode ? 'bg-gray-900' : 'bg-white'} ${
          swipeState.isTransitioning ? 'transition-transform duration-300' : ''
        } relative`}
      >
      <div className="flex items-center px-4 py-2 gap-4">
        {/* Desktop action buttons - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={() => onMarkAsRead(currentEntry.id!, !currentEntry.isRead)}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            title="Toggle read/unread (m)"
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
            title="Toggle star (i)"
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
        {/* Status badges - always visible */}
        <div className="flex items-center gap-1">
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
          {currentEntry.content_aiSummary && (
            <div
              className={`px-1.5 py-0.5 rounded text-xs font-medium
                ${isDarkMode
                  ? 'bg-yellow-500/20 text-yellow-200'
                  : 'bg-yellow-100 text-yellow-800'}`}
              title="AI Summary available"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {currentEntry.requestProcessingStatus === 'pending' && (
            <div
              className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1
                ${isDarkMode
                  ? 'bg-blue-500/20 text-blue-200'
                  : 'bg-blue-100 text-blue-800'}`}
              title="Processing article content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Processing</span>
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
              <div className={computedMarkdownClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentEntry.content_aiSummary}
                </ReactMarkdown>
              </div>
            </div>
          )}
          <div className={computedMarkdownClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {getPreviewContent(currentEntry.content_fullArticle || currentEntry.content_rssAbstract, isExpanded)}
            </ReactMarkdown>
          </div>
          <div className="flex justify-between items-center mt-4">
            {contentLength > 600 && (
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
            {/* Desktop action bar - hidden on mobile */}
            <div className="hidden md:flex items-center gap-2 ml-auto">
              <button
                onClick={handleTTS}
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
                onClick={handleCopy}
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
                onClick={handleEmail}
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
              {gunService.isAuthenticated() && (
                <>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await gunService.shareItem(currentEntry);
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: 'Article shared successfully',
                            type: 'success'
                          }
                        }));
                      } catch (error) {
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: 'Failed to share article',
                            type: 'error'
                          }
                        }));
                      }
                    }}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm
                      ${isDarkMode
                        ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                        : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                    title="Share article"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                    </svg>
                    <span>Share</span>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const comment = prompt('Add a comment to share with this article:');
                      if (comment !== null) {
                        try {
                          await gunService.shareItem(currentEntry, comment);
                          window.dispatchEvent(new CustomEvent('showToast', {
                            detail: {
                              message: 'Article shared with comment',
                              type: 'success'
                            }
                          }));
                        } catch (error) {
                          window.dispatchEvent(new CustomEvent('showToast', {
                            detail: {
                              message: 'Failed to share article',
                              type: 'error'
                            }
                          }));
                        }
                      }
                    }}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm
                      ${isDarkMode
                        ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                        : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                    title="Share article with comment"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <span>Share+</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </div>{/* end swipeable content layer */}

      {/* Bottom sheet (mobile only) */}
      {isMobile && (
        <EntryBottomSheet
          isOpen={bottomSheetOpen}
          onClose={() => setBottomSheetOpen(false)}
          isDarkMode={isDarkMode}
          entry={currentEntry}
          onMarkAsRead={onMarkAsRead}
          onToggleStar={onToggleStar}
          onOpenChat={() => onOpenChat?.(currentEntry)}
          onListen={() => {
            const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
            if (content && currentEntry.id) {
              ttsService.addToQueue({
                id: currentEntry.id,
                title: currentEntry.title,
                content_fullArticle: currentEntry.content_fullArticle,
                content_rssAbstract: currentEntry.content_rssAbstract,
                content_aiSummary: currentEntry.content_aiSummary,
                feedTitle: feedTitle
              });
            }
          }}
          onCopy={handleCopy}
          onEmail={handleEmail}
          onRefresh={async () => {
            if (!currentEntry.id || isRefreshing) return;
            setIsRefreshing(true);
            try {
              await reprocessEntry(currentEntry.id);
            } catch (error) {
              console.error('Failed to refresh entry:', error);
            } finally {
              setIsRefreshing(false);
            }
          }}
          onOpenInBrowser={() => {
            if (currentEntry.link) {
              window.open(currentEntry.link, '_blank');
            }
          }}
        />
      )}
    </article>
  );
};

export default FeedListEntry;