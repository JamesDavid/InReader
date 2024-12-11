import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { getFeedEntries, getAllEntries, getStarredEntries, getListenedEntries, getFeedsByFolder, markAsRead, toggleStar, type FeedEntry, db } from '../services/db';
import { generateSummary, loadOllamaConfig } from '../services/ollamaService';
import { fetchArticleContent } from '../services/articleService';
import { refreshFeed } from '../services/feedParser';
import ChatModal from './ChatModal';
import ttsService from '../services/ttsService';
import FeedListEntry from './FeedListEntry';
import { PaginationService, PaginationState } from '../services/paginationService';
import { Pagination } from './Pagination';

interface ContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

interface FeedListProps {
  isDarkMode?: boolean;
  isFocused?: boolean;
  onFocusChange?: (focused: boolean) => void;
  entries?: FeedEntry[];
  onEntriesUpdate?: (entries: FeedEntry[]) => void;
}

interface SummaryState {
  content: string;
  isFullContent: boolean;
  model?: string;
  isLoading?: boolean;
}

const FeedList: React.FC<FeedListProps> = (props) => {
  const context = useOutletContext<ContextType>();
  const isDarkMode = props.isDarkMode ?? context.isDarkMode;
  const isFocused = props.isFocused ?? context.isFocused;
  const onFocusChange = props.onFocusChange ?? context.onFocusChange;
  const showUnreadOnly = context.showUnreadOnly;
  const selectedIndex = context.selectedIndex;
  const onSelectedIndexChange = context.onSelectedIndexChange;

  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [summaryStates, setSummaryStates] = useState<{ [key: number]: SummaryState }>({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatEntry, setChatEntry] = useState<FeedEntry | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const readTimerRef = useRef<{ [key: number]: NodeJS.Timeout }>({});
  const contentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const { feedId } = useParams();
  const location = useLocation();
  const folderId = location.pathname.startsWith('/folder/') ? location.pathname.split('/folder/')[1] : null;
  const [expandedEntries, setExpandedEntries] = useState<{ [key: number]: boolean }>({});
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedState, setPaginatedState] = useState<PaginationState<FeedEntry>>({
    items: [],
    currentPage: 1,
    totalItems: 0,
    itemsPerPage: 20,
    totalPages: 0
  });
  const paginationService = new PaginationService<FeedEntry>(20);

  // Filter entries based on showUnreadOnly
  const filteredEntries = useMemo(() => {
    return showUnreadOnly ? entries.filter(entry => !entry.isRead) : entries;
  }, [entries, showUnreadOnly]);

  // Update pagination state when page or entries change
  useEffect(() => {
    paginationService.setItems(filteredEntries);
    const newState = paginationService.getState(currentPage);
    setPaginatedState(newState);
  }, [currentPage, filteredEntries]);

  // Ensure selection is within bounds
  useEffect(() => {
    if (selectedIndex >= paginatedState.items.length) {
      onSelectedIndexChange(Math.max(0, paginatedState.items.length - 1));
    }
  }, [paginatedState.items.length, selectedIndex, onSelectedIndexChange]);

  // Handle scrolling
  useEffect(() => {
    if (!isFocused || paginatedState.items.length === 0) return;
    
    const selectedElement = document.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest'
      });
    }
  }, [selectedIndex, isFocused, paginatedState.items.length]);

  const handleMarkAsRead = useCallback(async (entryId: number) => {
    await markAsRead(entryId);
    // Update the entry in the local state immediately
    setEntries(prevEntries => 
      prevEntries.map(entry => 
        entry.id === entryId 
          ? { ...entry, isRead: true }
          : entry
      )
    );
    // Then refresh from DB
    const loadedEntries = props.entries 
      ? props.entries 
      : feedId 
        ? await getFeedEntries(parseInt(feedId))
        : location.pathname === '/starred'
          ? await getStarredEntries()
          : location.pathname === '/listened'
            ? await getListenedEntries()
            : await getAllEntries();
    setEntries(loadedEntries);
  }, [feedId, location.pathname, props.entries]);

  const handleToggleStar = useCallback(async (entryId: number) => {
    await toggleStar(entryId);
    // Then refresh from DB
    const loadedEntries = props.entries 
      ? props.entries 
      : feedId 
        ? await getFeedEntries(parseInt(feedId))
        : location.pathname === '/starred'
          ? await getStarredEntries()
          : location.pathname === '/listened'
            ? await getListenedEntries()
            : await getAllEntries();
    setEntries(loadedEntries);
  }, [feedId, location.pathname, props.entries]);

  const getContentLength = (content: string): number => {
    const div = document.createElement('div');
    div.innerHTML = content;
    return (div.textContent || div.innerText || '').length;
  };

  const isContentFullyVisible = useCallback((entryId: number) => {
    const contentElement = contentRefs.current[entryId];
    if (!contentElement) return true;

    const rect = contentElement.getBoundingClientRect();
    const containerRect = listRef.current?.getBoundingClientRect();
    if (!containerRect) return true;

    return rect.bottom <= containerRect.bottom;
  }, []);

  const scrollContent = useCallback((entryId: number) => {
    const contentElement = contentRefs.current[entryId];
    if (!contentElement || !listRef.current) return;

    const containerRect = listRef.current.getBoundingClientRect();
    listRef.current.scrollBy({
      top: containerRect.height * 0.5,
      behavior: 'smooth'
    });
  }, []);

  const handleSpaceKey = useCallback((entryId: number) => {
    const contentLength = getContentLength(entries.find(e => e.id === entryId)?.content || '');
    if (contentLength <= 600) return;

    // If not expanded, expand it
    if (!expandedEntries[entryId]) {
      setExpandedEntries(prev => ({ ...prev, [entryId]: true }));
      return;
    }

    // If expanded but not fully visible, scroll
    if (!isContentFullyVisible(entryId)) {
      scrollContent(entryId);
      return;
    }

    // If expanded and fully visible, collapse
    setExpandedEntries(prev => ({ ...prev, [entryId]: false }));
  }, [entries, expandedEntries, isContentFullyVisible, scrollContent]);

  const handleRefreshCurrentFeed = useCallback(async () => {
    if (!feedId && !folderId) return;
    
    try {
      if (feedId) {
        const feed = await db.feeds.get(parseInt(feedId));
        if (feed) {
          await refreshFeed(feed);
          const loadedEntries = await getFeedEntries(parseInt(feedId));
          setEntries(loadedEntries);
        }
      } else if (folderId) {
        const folderFeeds = await getFeedsByFolder(parseInt(folderId));
        await Promise.all(folderFeeds.map(feed => refreshFeed(feed)));
        const entriesPromises = folderFeeds.map(feed => getFeedEntries(feed.id!));
        const feedEntries = await Promise.all(entriesPromises);
        const loadedEntries = feedEntries
          .flat()
          .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
        setEntries(loadedEntries);
      }
    } catch (error) {
      console.error('Error refreshing feed:', error);
    }
  }, [feedId, folderId]);

  // Load entries based on current route
  useEffect(() => {
    const loadEntries = async () => {
      try {
        let loadedEntries: FeedEntry[];
        
        if (props.entries) {
          loadedEntries = props.entries;
        } else if (folderId) {
          // Get all feeds in the folder
          const folderFeeds = await getFeedsByFolder(parseInt(folderId));
          // Get entries for each feed and combine them
          const entriesPromises = folderFeeds.map(feed => getFeedEntries(feed.id!));
          const feedEntries = await Promise.all(entriesPromises);
          // Flatten and ensure dates are properly converted
          loadedEntries = feedEntries
            .flat()
            .map(entry => ({
              ...entry,
              publishDate: new Date(entry.publishDate),
              readDate: entry.readDate ? new Date(entry.readDate) : undefined,
              starredDate: entry.starredDate ? new Date(entry.starredDate) : undefined,
              listenedDate: entry.listenedDate ? new Date(entry.listenedDate) : undefined,
              lastChatDate: entry.lastChatDate ? new Date(entry.lastChatDate) : undefined
            }))
            .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime());
        } else if (feedId) {
          loadedEntries = await getFeedEntries(parseInt(feedId));
        } else if (location.pathname === '/starred') {
          loadedEntries = await getStarredEntries();
        } else if (location.pathname === '/listened') {
          loadedEntries = await getListenedEntries();
        } else {
          loadedEntries = await getAllEntries();
        }
        
        setEntries(loadedEntries);
      } catch (error) {
        console.error('Error loading entries:', error);
        setEntries([]);
      }
    };

    loadEntries();
  }, [feedId, folderId, location.pathname, props.entries]);

  const toggleExpanded = useCallback((entryId: number) => {
    // Don't toggle if content is short
    const entry = entries.find(e => e.id === entryId);
    if (entry && getContentLength(entry.content) <= 600) return;

    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  }, [entries]);

  const handleContentView = useCallback((entry: FeedEntry) => {
    if (!entry.id || entry.isRead) return;

    // Set a timer to mark as read after dwelling
    readTimerRef.current[entry.id] = setTimeout(async () => {
      await markAsRead(entry.id!);
      // Update the entry in the local state immediately
      const updatedEntries = entries.map(e => 
        e.id === entry.id 
          ? { ...e, isRead: true }
          : e
      );
      setEntries(updatedEntries);
      // Notify parent component of the update
      props.onEntriesUpdate?.(updatedEntries);
      // Clean up the timer reference
      delete readTimerRef.current[entry.id!];
    }, 2000); // 2 second dwell time
  }, [entries, props.onEntriesUpdate]);

  const generateAISummary = async (entry: FeedEntry) => {
    if (!entry.id || entry.aiSummary) return;

    const config = loadOllamaConfig();
    if (!config) return;

    setSummaryStates(prev => ({ 
      ...prev, 
      [entry.id!]: {
        content: 'Fetching full article and generating summary...',
        isFullContent: false,
        model: config.summaryModel,
        isLoading: true
      }
    }));

    try {
      console.log('Attempting to fetch full article content for:', entry.link);
      const articleContent = await fetchArticleContent(entry.link);
      let finalContent = entry.content;
      let isFullContent = false;

      if (articleContent && articleContent.content.length > entry.content.length * 1.5) {
        console.log('Successfully fetched longer article content');
        finalContent = articleContent.content;
        isFullContent = true;
      } else {
        console.log('Fetched content was not substantially longer than RSS content');
      }

      setSummaryStates(prev => ({ 
        ...prev, 
        [entry.id!]: {
          content: 'Generating summary...',
          isFullContent,
          model: config.summaryModel,
          isLoading: true
        }
      }));

      const summary = await generateSummary(finalContent, entry.link, config);
      
      // Update the entry in the database with the summary
      await db.entries.update(entry.id!, {
        aiSummary: summary,
        aiSummaryMetadata: {
          isFullContent,
          model: config.summaryModel
        }
      });

      // Update the local state
      setSummaryStates(prev => ({ 
        ...prev, 
        [entry.id!]: {
          content: summary,
          isFullContent,
          model: config.summaryModel,
          isLoading: false
        }
      }));

      // Update entries state while preserving the current view
      setEntries(prevEntries => 
        prevEntries.map(e => 
          e.id === entry.id ? {
            ...e,
            aiSummary: summary,
            aiSummaryMetadata: {
              isFullContent,
              model: config.summaryModel
            }
          } : e
        )
      );
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setSummaryStates(prev => ({ 
        ...prev, 
        [entry.id!]: {
          content: 'Failed to generate summary',
          isFullContent: false,
          model: config.summaryModel,
          isLoading: false
        }
      }));
    }
  };

  useEffect(() => {
    // Check for entries without summaries and generate them
    const config = loadOllamaConfig();
    if (!config) return;

    entries.forEach(entry => {
      if (!entry.aiSummary && !summaryStates[entry.id!]) {
        generateAISummary(entry);
      }
    });
  }, [entries]);

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

  // Style classes for markdown content
  const markdownClass = `prose prose-sm max-w-none 
    ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
    prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
    prose-pre:bg-gray-800 prose-pre:text-gray-100
    prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
    prose-a:text-blue-500 hover:prose-a:text-blue-600
    ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;

  const handleRefreshSummary = async (entry: FeedEntry) => {
    if (!entry.id) return;

    // Clear existing summary
    await db.entries.update(entry.id, {
      aiSummary: null,
      aiSummaryMetadata: null
    });

    // Update local state to show loading
    setSummaryStates(prev => ({
      ...prev,
      [entry.id!]: {
        ...prev[entry.id!],
        content: 'Refreshing summary...',
        isLoading: true
      }
    }));

    // Generate new summary
    await generateAISummary(entry);
  };

  const hasChatHistory = (entry: FeedEntry) => {
    if (!entry.chatHistory || entry.chatHistory.length === 0) return false;
    // Only count entries that have at least one user message and one assistant message
    const hasUserMessage = entry.chatHistory.some(msg => msg.role === 'user');
    const hasAssistantMessage = entry.chatHistory.some(msg => msg.role === 'assistant');
    return hasUserMessage && hasAssistantMessage;
  };

  const getPreviewContent = (content: string, expanded: boolean) => {
    const contentLength = getContentLength(content);
    
    // If content is short, always show full content
    if (contentLength <= 600) return content;
    
    // Otherwise, handle expansion/collapse
    if (expanded) return content;
    
    // Find the position in the HTML that corresponds to ~500 characters of text
    let charCount = 0;
    let result = '';
    const div = document.createElement('div');
    div.innerHTML = content;
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (charCount + node.textContent!.length > 500) {
        // Add the portion of this text node that gets us to ~500 chars
        const remainingChars = 500 - charCount;
        result += node.textContent!.slice(0, remainingChars);
        break;
      }
      charCount += node.textContent!.length;
      result += node.textContent;
    }

    // Get the HTML up to where we stopped
    const endIndex = content.indexOf(result) + result.length;
    return content.slice(0, endIndex) + '...';
  };

  // Add handler for page changes
  const handlePageChange = useCallback((page: number) => {
    const isMovingForward = page > currentPage;
    setCurrentPage(page);
    
    // Scroll to top for next page, bottom for previous page
    if (listRef.current) {
      listRef.current.scrollTo({
        top: isMovingForward ? 0 : listRef.current.scrollHeight,
        behavior: 'instant'
      });
    }
  }, [currentPage]);

  // Footer component for pagination
  const PaginationFooter = () => {
    if (paginatedState.totalPages <= 1) return null;

    return (
      <div className={`sticky bottom-0 w-full py-2 px-4 ${isDarkMode ? 'bg-gray-800/90 text-gray-300' : 'bg-white/90 text-gray-600'} backdrop-blur-sm border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-2 py-1 rounded ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              ←
            </button>
            <span>
              Page {currentPage} of {paginatedState.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === paginatedState.totalPages}
              className={`px-2 py-1 rounded ${currentPage === paginatedState.totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              →
            </button>
          </div>
          <div className="text-xs opacity-75">
            {paginatedState.totalItems} items
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div 
        ref={listRef}
        className={`h-full overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        onClick={() => !isFocused && onFocusChange(true)}
        tabIndex={0}
      >
        {paginatedState.items.length === 0 ? (
          <div className={`text-center mt-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {entries.length === 0 ? 'No entries to display' : 'No unread entries'}
          </div>
        ) : (
          <>
            {paginatedState.items.map((entry, index) => (
              <FeedListEntry
                key={entry.id}
                entry={entry}
                index={index}
                isSelected={selectedIndex === index}
                isFocused={isFocused}
                isDarkMode={isDarkMode}
                isChatOpen={isChatOpen}
                isExpanded={expandedEntries[entry.id!] || false}
                summaryState={summaryStates[entry.id!]}
                onSelect={onSelectedIndexChange}
                onFocusChange={onFocusChange}
                onMarkAsRead={handleMarkAsRead}
                onToggleStar={handleToggleStar}
                onToggleExpand={toggleExpanded}
                onRefreshSummary={handleRefreshSummary}
                onContentView={handleContentView}
                onContentLeave={(entryId) => {
                  if (readTimerRef.current[entryId]) {
                    clearTimeout(readTimerRef.current[entryId]);
                    delete readTimerRef.current[entryId];
                  }
                }}
                contentRef={(element) => {
                  if (entry.id) {
                    contentRefs.current[entry.id] = element;
                  }
                }}
              />
            ))}
            <PaginationFooter />
          </>
        )}
      </div>

      {isChatOpen && chatEntry && (
        <ChatModal
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false);
            setChatEntry(null);
          }}
          isDarkMode={isDarkMode}
          articleTitle={chatEntry.title}
          articleContent={chatEntry.content}
          articleUrl={chatEntry.link}
          entryId={chatEntry.id!}
          onChatUpdate={() => {
            const loadLatest = async () => {
              const loadedEntries = props.entries 
                ? props.entries 
                : feedId 
                  ? await getFeedEntries(parseInt(feedId))
                  : location.pathname === '/starred'
                    ? await getStarredEntries()
                    : location.pathname === '/listened'
                      ? await getListenedEntries()
                      : await getAllEntries();
              setEntries(loadedEntries);
            };
            loadLatest();
          }}
        />
      )}
    </>
  );
};

export default FeedList; 