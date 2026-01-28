import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SearchModal from './SearchModal';
import ttsService from '../services/ttsService';
import { getSavedSearches, deleteSavedSearch, type SavedSearch, type FeedEntryWithTitle, db, markAsRead } from '../services/db';
import AddFeedModal from './AddFeedModal';
import ChatModal from './ChatModal';
import { refreshFeed } from '../services/feedParser';
import { updateSearchResultCounts } from '../services/db';
import { reprocessEntry } from '../services/feedParser';

// Add Toast component
const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ 
  message, 
  type,
  onClose 
}) => {
  useEffect(() => {
    // Auto dismiss after 3 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    // Dismiss on any input
    const handleInput = () => {
      onClose();
    };

    window.addEventListener('keydown', handleInput);
    window.addEventListener('mousedown', handleInput);
    window.addEventListener('touchstart', handleInput);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('mousedown', handleInput);
      window.removeEventListener('touchstart', handleInput);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      {/* Toast */}
      <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
        px-8 py-4 rounded-lg shadow-xl transition-all duration-300
        ${type === 'success' 
          ? 'bg-green-500 text-white' 
          : 'bg-red-500 text-white'}
        z-50 font-medium text-lg min-w-[200px] text-center`}
      >
        <div className="flex items-center justify-center gap-2">
          {type === 'success' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {message}
        </div>
      </div>
    </>
  );
};

interface OutletContextType {
  isFocused: boolean;
  isDarkMode: boolean;
  showUnreadOnly: boolean;
  onFocusChange: (focused: boolean) => void;
  onSearchHistoryUpdate: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelectedEntryIdChange: (id: number | null) => void;
  selectedEntryId: number | null;
  onOpenChat: (entry: FeedEntryWithTitle) => void;
}

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarFocused, setSidebarFocused] = useState(true);
  const [selectedSidebarIndex, setSelectedSidebarIndex] = useState(0);
  const [selectedFeedIndex, setSelectedFeedIndex] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [lastNavigationKey, setLastNavigationKey] = useState<'j' | 'k' | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [showUnreadOnly, setShowUnreadOnly] = useState(() => {
    const saved = localStorage.getItem('showUnreadOnly');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchHistory, setSearchHistory] = useState<SavedSearch[]>([]);
  const [showAddFeedModal, setShowAddFeedModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FeedEntryWithTitle | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Create a ref to store the focusSearch callback from Header
  const [focusSearchCallback, setFocusSearchCallback] = useState<(() => void) | null>(null);
  // Create a ref to store the refreshFeeds callback from Sidebar
  const [refreshFeedsCallback, setRefreshFeedsCallback] = useState<(() => void) | null>(null);

  const loadSearchHistory = useCallback(async () => {
    const history = await getSavedSearches();
    setSearchHistory(history);
  }, []);

  const handleClearSearchHistory = useCallback(async (searchId?: number) => {
    if (searchId) {
      // Delete single search
      await deleteSavedSearch(searchId);
      setSearchHistory(prev => prev.filter(search => search.id !== searchId));
    } else {
      // Delete all saved searches
      await Promise.all(searchHistory.map(search => deleteSavedSearch(search.id!)));
      setSearchHistory([]);
    }
  }, [searchHistory]);

  // Load search history on mount
  useEffect(() => {
    loadSearchHistory();
  }, [loadSearchHistory]);

  const handleFocusSearch = useCallback((callback: () => void) => {
    setFocusSearchCallback(() => callback);
  }, []);

  const handleRegisterRefreshFeeds = useCallback((callback: () => void) => {
    setRefreshFeedsCallback(() => callback);
  }, []);

  const handlePopToCurrentItem = useCallback(async () => {
    const currentArticle = ttsService.getCurrentArticle();
    if (!currentArticle) return;

    try {
      // Get the entry from the database to find its feed ID
      const entry = await db.entries.get(currentArticle.id);
      if (!entry) return;

      // Navigate to the feed view
      navigate(`/feed/${entry.feedId}`);
      
      // Set focus to the content area
      setSidebarFocused(false);

      // Wait for the feed list to load and update
      // Store timeout ID to allow cleanup
      let timeoutId: NodeJS.Timeout | null = null;

      const checkForArticle = (retries = 0, maxRetries = 10) => {
        if (retries >= maxRetries) return;

        timeoutId = setTimeout(() => {
          const articleElement = document.querySelector(`[data-entry-id="${currentArticle.id}"]`);
          if (articleElement) {
            const index = parseInt(articleElement.getAttribute('data-index') || '0');
            setSelectedFeedIndex(index);
            setSelectedEntryId(currentArticle.id);

            // Ensure the article is scrolled into view
            articleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // Try again if element not found
            checkForArticle(retries + 1);
          }
        }, 100); // Check every 100ms
      };

      checkForArticle();

      // Return cleanup function (though this is in an async callback, it won't be called automatically)
      // The timeout will naturally complete or fail after maxRetries
    } catch (error) {
      console.error('Error popping to current item:', error);
    }
  }, [navigate, setSelectedFeedIndex, setSelectedEntryId]);

  useEffect(() => {
    // Add toast event listener
    const handleToast = (event: CustomEvent<{ message: string; type: 'success' | 'error' }>) => {
      setToast(event.detail);
    };

    window.addEventListener('showToast', handleToast as EventListener);
    return () => window.removeEventListener('showToast', handleToast as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Only block non-TTS keyboard shortcuts if we're in an input/textarea
      // or if a modal other than chat is open
      const isInInput = document.activeElement?.tagName === 'INPUT' || 
                       document.activeElement?.tagName === 'TEXTAREA';
      const isModalOpen = document.querySelector('.fixed.inset-0') !== null;
      const isTTSKey = e.key === ']' || e.key === '\\';

      // Always allow TTS controls
      if (isTTSKey) {
        e.preventDefault();
        if (e.key === ']') {
          ttsService.next();
        } else if (e.key === '\\') {
          ttsService.togglePlayPause();
        }
        return;
      }

      // Handle ? key to open shortcuts modal (fires before modal check)
      if (e.key === '?' && !isInInput) {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
        return;
      }

      // Always allow Escape to close modals, even when focused in inputs
      if (e.key === 'Escape') {
        if (isChatModalOpen) {
          e.preventDefault();
          setIsChatModalOpen(false);
          setSelectedEntry(null);
        } else if (isSearchModalOpen) {
          e.preventDefault();
          setIsSearchModalOpen(false);
        } else if (isShortcutsModalOpen) {
          e.preventDefault();
          setIsShortcutsModalOpen(false);
        } else if (showAddFeedModal) {
          e.preventDefault();
          setShowAddFeedModal(false);
        }
        return;
      }

      // Block other shortcuts if in input or non-chat modal (including shortcuts modal)
      if (isInInput || (isModalOpen && !isChatModalOpen)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'j': {
          e.preventDefault();
          setLastNavigationKey('j');
          if (sidebarFocused) {
            const sidebarElement = document.querySelector('[data-sidebar-items-count]');
            const maxItems = parseInt(sidebarElement?.getAttribute('data-sidebar-items-count') || '0');
            setSelectedSidebarIndex(prev => Math.min(prev + 1, maxItems - 1));
          } else {
            const feedListElement = document.querySelector('main [data-current-page]');
            if (!feedListElement) return;

            const maxItems = feedListElement.querySelectorAll('article').length;
            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            const totalPages = parseInt(feedListElement.getAttribute('data-total-pages') || '1');
            const nextPageItems = parseInt(feedListElement.getAttribute('data-next-page-items') || '0');

            if (maxItems > 0) {
              setSelectedFeedIndex(prev => {
                const nextIndex = prev + 1;
                console.log('j pressed:', { nextIndex, maxItems, currentPage, totalPages });
                // If we're at the last item and there's a next page
                if (nextIndex >= maxItems && currentPage < totalPages) {
                  console.log('Triggering page change to next page');
                  // Dispatch a custom event to notify FeedList to change page
                  window.dispatchEvent(new CustomEvent('feedListPageChange', {
                    detail: { 
                      page: currentPage + 1,
                      selectIndex: 0, // Select first item on next page
                      direction: 'next'
                    }
                  }));
                  return 0; // Reset to first item
                }
                if (nextIndex >= maxItems) {
                  return prev;
                }
                // Update the selected entry ID when changing index
                const nextArticle = feedListElement.querySelector(`article[data-index="${nextIndex}"]`);
                const nextEntryId = nextArticle?.getAttribute('data-entry-id');
                if (nextEntryId) {
                  setSelectedEntryId(parseInt(nextEntryId));
                }
                return nextIndex;
              });
            }
          }
          break;
        }
        case 'k': {
          e.preventDefault();
          setLastNavigationKey('k');
          if (sidebarFocused) {
            setSelectedSidebarIndex(prev => Math.max(0, prev - 1));
          } else {
            const feedListElement = document.querySelector('main [data-current-page]');
            if (!feedListElement) return;

            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            const prevPageItems = parseInt(feedListElement.getAttribute('data-prev-page-items') || '0');
            
            // Check if current entry needs scrolling
            const currentArticle = feedListElement.querySelector(`article[data-index="${selectedFeedIndex}"]`);
            if (currentArticle) {
              const rect = currentArticle.getBoundingClientRect();
              const containerRect = feedListElement.closest('.overflow-y-auto')?.getBoundingClientRect();
              if (containerRect && rect.top < containerRect.top) {
                const entryId = currentArticle.getAttribute('data-entry-id');
                if (entryId) {
                  window.dispatchEvent(new CustomEvent('feedEntryScroll', {
                    detail: { entryId: parseInt(entryId) }
                  }));
                  return; // Don't move to previous entry until scrolling is complete
                }
              }
            }
            
            setSelectedFeedIndex(prev => {
              const nextIndex = prev - 1;
              console.log('k pressed:', { nextIndex, currentPage, prevPageItems });
              // If we're at the first item and there's a previous page
              if (nextIndex < 0 && currentPage > 1) {
                console.log('Triggering page change to previous page');
                // Dispatch a custom event to notify FeedList to change page
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage - 1,
                    selectIndex: prevPageItems - 1, // Select last item on previous page
                    direction: 'prev'
                  }
                }));
                return prevPageItems - 1; // Set to last item of previous page
              }
              if (nextIndex < 0) {
                return 0;
              }
              // Update the selected entry ID when changing index
              const nextArticle = feedListElement.querySelector(`article[data-index="${nextIndex}"]`);
              const nextEntryId = nextArticle?.getAttribute('data-entry-id');
              if (nextEntryId) {
                setSelectedEntryId(parseInt(nextEntryId));
              }
              return nextIndex;
            });
          }
          break;
        }
        case ' ': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            // Check if chat modal is open
            const chatModal = document.querySelector('[data-chat-modal]');
            if (chatModal) {
              window.dispatchEvent(new CustomEvent('chatModalScroll', {
                detail: { direction: lastNavigationKey === 'j' ? 'down' : 'up' }
              }));
              return;
            }

            // Expand / progressive scroll the selected entry
            window.dispatchEvent(new CustomEvent('toggleEntryExpand', {
              detail: { entryId: selectedEntryId }
            }));
          }
          break;
        }
        case '\'': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              const feed = await db.feeds.get(entry.feedId!);
              const feedTitle = feed?.title || 'Unknown Feed';
              const fullEntry = { ...entry, feedTitle };

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

              const content = formatForSharing(fullEntry);
              await navigator.clipboard.writeText(content);
              window.dispatchEvent(new CustomEvent('showToast', {
                detail: {
                  message: 'Article copied to clipboard',
                  type: 'success'
                }
              }));
            }
          }
          break;
        }
        case 'h':
          if (!sidebarFocused) {
            e.preventDefault();
            setSidebarFocused(true);
          }
          break;
        case 'l': {
          e.preventDefault();
          if (sidebarFocused) {
            setSidebarFocused(false);
          } else if (selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              const feed = await db.feeds.get(entry.feedId!);
              setSelectedEntry({
                ...entry,
                feedTitle: feed?.title || 'Unknown Feed'
              });
              setIsChatModalOpen(true);
            }
          }
          break;
        }
        case 'a':
          e.preventDefault();
          setShowAddFeedModal(true);
          break;
        case '/':
          e.preventDefault();
          setIsSearchModalOpen(true);
          break;
        case 'r':
          e.preventDefault();
          refreshFeedsCallback?.();
          break;
        case '[':
          if (!sidebarFocused && selectedEntryId !== null) {
            e.preventDefault();
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              console.log('Adding to TTS queue:', entry.title);
              let feedTitle = 'Unknown Feed';
              if (entry.feedId) {
                const feed = await db.feeds.get(entry.feedId);
                feedTitle = feed?.title || 'Unknown Feed';
              }
              const ttsEntry = {
                id: entry.id!,
                title: entry.title,
                content_fullArticle: entry.content_fullArticle,
                content_rssAbstract: entry.content_rssAbstract,
                content_aiSummary: entry.content_aiSummary,
                feedTitle: feedTitle
              };
              ttsService.addToQueue(ttsEntry);
            }
          }
          break;
        case ']':
          if (!sidebarFocused) {
            e.preventDefault();
            ttsService.next();
          }
          break;
        case '\\':
          if (!sidebarFocused) {
            e.preventDefault();
            ttsService.togglePlayPause();
          }
          break;
        case 'p': {
          if (e.shiftKey && !sidebarFocused) {
            e.preventDefault();
            // Dispatch event for previous page
            const feedListElement = document.querySelector('main [data-current-page]');
            if (feedListElement) {
              const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
              if (currentPage > 1) {
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage - 1,
                    direction: 'prev'
                  }
                }));
              }
            }
          } else if (e.ctrlKey && !sidebarFocused) {
            e.preventDefault();
            // Dispatch event for next page
            const feedListElement = document.querySelector('main [data-current-page]');
            if (feedListElement) {
              const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
              const totalPages = parseInt(feedListElement.getAttribute('data-total-pages') || '1');
              if (currentPage < totalPages) {
                window.dispatchEvent(new CustomEvent('feedListPageChange', {
                  detail: { 
                    page: currentPage + 1,
                    direction: 'next'
                  }
                }));
              }
            }
          } else {
            e.preventDefault();
            handlePopToCurrentItem();
          }
          break;
        }
        case 'i':
          if (!sidebarFocused && selectedEntryId !== null) {
            e.preventDefault();
            await db.transaction('rw', db.entries, async () => {
              const entry = await db.entries.get(selectedEntryId);
              if (entry) {
                const newStarredState = !entry.isStarred;
                // Update the database
                await db.entries.update(selectedEntryId, {
                  isStarred: newStarredState,
                  starredDate: newStarredState ? new Date() : undefined
                });
                // Dispatch a custom event with the new state for immediate UI update
                window.dispatchEvent(new CustomEvent('entryStarredChanged', {
                  detail: { 
                    entryId: selectedEntryId,
                    isStarred: newStarredState,
                    starredDate: newStarredState ? new Date() : undefined
                  }
                }));
              }
            });
          }
          break;
        case 'm': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              // Dispatch event first for immediate UI update
              window.dispatchEvent(new CustomEvent('entryReadChanged', {
                detail: { 
                  entryId: selectedEntryId,
                  isRead: !entry.isRead  // Toggle the current state
                }
              }));

              // Then update database
              await markAsRead(selectedEntryId, !entry.isRead);

              // Dispatch event for sidebar update
              window.dispatchEvent(new CustomEvent('entryMarkedAsRead', {
                detail: { 
                  feedId: entry.feedId
                }
              }));
            }
          }
          break;
        }
        case 'o': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry?.link) {
              window.open(entry.link, '_blank');
            }
          }
          break;
        }
        case '0': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            const entry = await db.entries.get(selectedEntryId);
            if (entry?.link) {
              // Open in named window for reuse
              window.open(entry.link, 'reader_article_window');
            }
          }
          break;
        }
        case 'u': {
          e.preventDefault();
          if (!sidebarFocused && selectedEntryId !== null) {
            try {
              // Dispatch refresh start event
              window.dispatchEvent(new CustomEvent('entryRefreshStart', {
                detail: { entryId: selectedEntryId }
              }));

              // Use reprocessEntry like the refresh button does
              await reprocessEntry(selectedEntryId);
              
              // Get the updated entry from the database
              const updatedEntry = await db.entries.get(selectedEntryId);
              if (updatedEntry) {
                // Get the feed title
                const feed = await db.feeds.get(updatedEntry.feedId!);
                
                // Dispatch refresh complete event with full updated entry
                window.dispatchEvent(new CustomEvent('entryRefreshComplete', {
                  detail: { 
                    entry: {
                      ...updatedEntry,
                      feedTitle: feed?.title || 'Unknown Feed'
                    }
                  }
                }));
              }
            } catch (error) {
              console.error('Failed to refresh entry:', error);
              // Dispatch refresh complete to clear loading state even on error
              window.dispatchEvent(new CustomEvent('entryRefreshComplete', {
                detail: { 
                  entry: await db.entries.get(selectedEntryId)!
                }
              }));
            }
          }
          break;
        }
        case '-': {
          e.preventDefault();
          console.log('Email hotkey pressed');
          if (!sidebarFocused && selectedEntryId !== null) {
            console.log('Fetching entry with ID:', selectedEntryId);
            const entry = await db.entries.get(selectedEntryId);
            if (entry) {
              console.log('Found entry:', entry.title);
              const feed = await db.feeds.get(entry.feedId!);
              const feedTitle = feed?.title || 'Unknown Feed';
              const fullEntry = { ...entry, feedTitle };
              console.log('Prepared full entry with feed title:', feedTitle);
              
              // Format the content for email
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

              const content = formatForSharing(fullEntry);
              console.log('Formatted content length:', content.length);
              const subject = encodeURIComponent(`Via InReader: ${entry.title}`);
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
            } else {
              console.log('No entry found with ID:', selectedEntryId);
            }
          } else {
            console.log('Email hotkey ignored - sidebar focused or no entry selected', {
              sidebarFocused,
              selectedEntryId
            });
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    sidebarFocused,
    focusSearchCallback,
    refreshFeedsCallback,
    handlePopToCurrentItem,
    setSelectedSidebarIndex,
    setSelectedFeedIndex,
    selectedEntryId,
    lastNavigationKey,
    isChatModalOpen,
    isShortcutsModalOpen
  ]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('showUnreadOnly', JSON.stringify(showUnreadOnly));
  }, [showUnreadOnly]);

  // Auto-close mobile sidebar on navigation
  const location = useLocation();
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleToggleMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(prev => !prev);
  }, []);

  const handleFocusChange = (focused: boolean) => {
    setSidebarFocused(!focused);
  };

  const handleOpenChat = (entry: FeedEntryWithTitle) => {
    setSelectedEntry(entry);
    setIsChatModalOpen(true);
  };

  const handleOpenSearch = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const outletContext: OutletContextType = {
    isFocused: !sidebarFocused,
    isDarkMode,
    showUnreadOnly,
    onFocusChange: handleFocusChange,
    onSearchHistoryUpdate: loadSearchHistory,
    selectedIndex: selectedFeedIndex,
    onSelectedIndexChange: setSelectedFeedIndex,
    onSelectedEntryIdChange: setSelectedEntryId,
    selectedEntryId,
    onOpenChat: handleOpenChat
  };

  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <Header
        isDarkMode={isDarkMode}
        onDarkModeToggle={() => {
          setIsDarkMode(!isDarkMode);
          localStorage.setItem('darkMode', JSON.stringify(!isDarkMode));
        }}
        showUnreadOnly={showUnreadOnly}
        onShowUnreadToggle={() => {
          setShowUnreadOnly(!showUnreadOnly);
          localStorage.setItem('showUnreadOnly', JSON.stringify(!showUnreadOnly));
        }}
        onRegisterFocusSearch={handleFocusSearch}
        showAddFeedModal={showAddFeedModal}
        onCloseAddFeedModal={() => setShowAddFeedModal(false)}
        onToggleMobileSidebar={handleToggleMobileSidebar}
        isMobileSidebarOpen={isMobileSidebarOpen}
        isShortcutsModalOpen={isShortcutsModalOpen}
        onToggleShortcutsModal={() => setIsShortcutsModalOpen(prev => !prev)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <Sidebar
          className={`
            ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-reader-border'}
            w-sidebar flex-shrink-0 border-r
            fixed md:relative inset-y-0 left-0 z-30
            transform transition-transform duration-300 ease-in-out
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
            top-14 md:top-0 h-[calc(100vh-3.5rem)] md:h-auto
          `}
          isFocused={sidebarFocused}
          onFocusChange={setSidebarFocused}
          isDarkMode={isDarkMode}
          onRegisterRefreshFeeds={handleRegisterRefreshFeeds}
          searchHistory={searchHistory}
          onClearSearchHistory={handleClearSearchHistory}
          selectedIndex={selectedSidebarIndex}
          onSelectedIndexChange={setSelectedSidebarIndex}
          onOpenSearch={handleOpenSearch}
        />
        <main
          className={`flex-grow overflow-auto ${!sidebarFocused ? 'ring-2 ring-reader-blue ring-opacity-50' : ''}`}
          onClick={() => sidebarFocused && handleFocusChange(true)}
        >
          <Outlet context={outletContext} />
        </main>
      </div>
      {showAddFeedModal && (
        <AddFeedModal
          isOpen={showAddFeedModal}
          onClose={() => setShowAddFeedModal(false)}
          isDarkMode={isDarkMode}
          onSuccess={() => refreshFeedsCallback?.()}
        />
      )}
      {isChatModalOpen && selectedEntry && (
        <ChatModal
          isOpen={isChatModalOpen}
          onClose={() => {
            setIsChatModalOpen(false);
            setSelectedEntry(null);
          }}
          isDarkMode={isDarkMode}
          articleTitle={selectedEntry.title}
          articleContent={selectedEntry.content_rssAbstract}
          articleUrl={selectedEntry.link}
          entryId={selectedEntry.id!}
          feedTitle={selectedEntry.feedTitle}
          onChatUpdate={() => {
            // Handle chat updates if needed
          }}
        />
      )}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        isDarkMode={isDarkMode}
        onSearchHistoryUpdate={loadSearchHistory}
      />
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

export default Layout; 