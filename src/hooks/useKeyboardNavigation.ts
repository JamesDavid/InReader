/**
 * Hook for handling all keyboard navigation in the application
 */

import { useEffect, useCallback } from 'react';
import ttsService from '../services/ttsService';
import { db, markAsRead } from '../services/db';
import { reprocessEntry } from '../services/feedParser';
import { dispatchAppEvent } from '../utils/eventDispatcher';
import { formatForSharing } from '../utils/contentFormatters';
import { createTTSQueueItem } from '../utils/ttsHelpers';

interface UseKeyboardNavigationOptions {
  sidebarFocused: boolean;
  setSidebarFocused: (focused: boolean) => void;
  selectedSidebarIndex: number;
  setSelectedSidebarIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedFeedIndex: number;
  setSelectedFeedIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedEntryId: number | null;
  setSelectedEntryId: (id: number | null) => void;
  lastNavigationKey: 'j' | 'k' | null;
  setLastNavigationKey: (key: 'j' | 'k' | null) => void;
  isChatModalOpen: boolean;
  setIsChatModalOpen: (open: boolean) => void;
  isSearchModalOpen: boolean;
  setIsSearchModalOpen: (open: boolean) => void;
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showAddFeedModal: boolean;
  setShowAddFeedModal: (open: boolean) => void;
  setSelectedEntry: (entry: unknown) => void;
  refreshFeedsCallback: (() => void) | null;
  handlePopToCurrentItem: () => void;
}

/**
 * Handles all keyboard navigation for the application
 */
export function useKeyboardNavigation({
  sidebarFocused,
  setSidebarFocused,
  selectedSidebarIndex,
  setSelectedSidebarIndex,
  selectedFeedIndex,
  setSelectedFeedIndex,
  selectedEntryId,
  setSelectedEntryId,
  lastNavigationKey,
  setLastNavigationKey,
  isChatModalOpen,
  setIsChatModalOpen,
  isSearchModalOpen,
  setIsSearchModalOpen,
  isShortcutsModalOpen,
  setIsShortcutsModalOpen,
  showAddFeedModal,
  setShowAddFeedModal,
  setSelectedEntry,
  refreshFeedsCallback,
  handlePopToCurrentItem
}: UseKeyboardNavigationOptions): void {

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
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

          if (maxItems > 0) {
            setSelectedFeedIndex(prev => {
              const nextIndex = prev + 1;
              // If we're at the last item and there's a next page
              if (nextIndex >= maxItems && currentPage < totalPages) {
                dispatchAppEvent('feedListPageChange', {
                  page: currentPage + 1,
                  selectIndex: 0,
                  direction: 'next'
                });
                return 0;
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
                dispatchAppEvent('feedEntryScroll', { entryId: parseInt(entryId) });
                return;
              }
            }
          }

          setSelectedFeedIndex(prev => {
            const nextIndex = prev - 1;
            // If we're at the first item and there's a previous page
            if (nextIndex < 0 && currentPage > 1) {
              dispatchAppEvent('feedListPageChange', {
                page: currentPage - 1,
                selectIndex: prevPageItems - 1,
                direction: 'prev'
              });
              return prevPageItems - 1;
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
            dispatchAppEvent('chatModalScroll', {
              direction: lastNavigationKey === 'j' ? 'down' : 'up'
            });
            return;
          }

          // Expand / progressive scroll the selected entry
          dispatchAppEvent('toggleEntryExpand', { entryId: selectedEntryId });
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

            const content = formatForSharing(fullEntry);
            await navigator.clipboard.writeText(content);
            dispatchAppEvent('showToast', {
              message: 'Article copied to clipboard',
              type: 'success'
            });
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
            let feedTitle = 'Unknown Feed';
            if (entry.feedId) {
              const feed = await db.feeds.get(entry.feedId);
              feedTitle = feed?.title || 'Unknown Feed';
            }
            const ttsEntry = createTTSQueueItem({ ...entry, feedTitle }, feedTitle);
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
          const feedListElement = document.querySelector('main [data-current-page]');
          if (feedListElement) {
            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            if (currentPage > 1) {
              dispatchAppEvent('feedListPageChange', {
                page: currentPage - 1,
                direction: 'prev'
              });
            }
          }
        } else if (e.ctrlKey && !sidebarFocused) {
          e.preventDefault();
          const feedListElement = document.querySelector('main [data-current-page]');
          if (feedListElement) {
            const currentPage = parseInt(feedListElement.getAttribute('data-current-page') || '1');
            const totalPages = parseInt(feedListElement.getAttribute('data-total-pages') || '1');
            if (currentPage < totalPages) {
              dispatchAppEvent('feedListPageChange', {
                page: currentPage + 1,
                direction: 'next'
              });
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
              await db.entries.update(selectedEntryId, {
                isStarred: newStarredState,
                starredDate: newStarredState ? new Date() : undefined
              });
              dispatchAppEvent('entryStarredChanged', {
                entryId: selectedEntryId,
                isStarred: newStarredState,
                starredDate: newStarredState ? new Date() : undefined
              });
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
            dispatchAppEvent('entryReadChanged', {
              entryId: selectedEntryId,
              isRead: !entry.isRead
            });

            // Then update database
            await markAsRead(selectedEntryId, !entry.isRead);

            // Dispatch event for sidebar update
            dispatchAppEvent('entryMarkedAsRead', {
              feedId: entry.feedId
            });
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
            window.open(entry.link, 'reader_article_window');
          }
        }
        break;
      }
      case 'u': {
        e.preventDefault();
        if (!sidebarFocused && selectedEntryId !== null) {
          try {
            dispatchAppEvent('entryRefreshStart', { entryId: selectedEntryId });

            await reprocessEntry(selectedEntryId);

            const updatedEntry = await db.entries.get(selectedEntryId);
            if (updatedEntry) {
              const feed = await db.feeds.get(updatedEntry.feedId!);
              dispatchAppEvent('entryRefreshComplete', {
                entry: {
                  ...updatedEntry,
                  feedTitle: feed?.title || 'Unknown Feed'
                }
              });
            }
          } catch (error) {
            console.error('Failed to refresh entry:', error);
            const failedEntry = await db.entries.get(selectedEntryId);
            if (failedEntry) {
              dispatchAppEvent('entryRefreshComplete', {
                entry: { ...failedEntry, feedTitle: 'Unknown Feed' }
              });
            }
          }
        }
        break;
      }
      case '-': {
        e.preventDefault();
        if (!sidebarFocused && selectedEntryId !== null) {
          const entry = await db.entries.get(selectedEntryId);
          if (entry) {
            const feed = await db.feeds.get(entry.feedId!);
            const feedTitle = feed?.title || 'Unknown Feed';
            const fullEntry = { ...entry, feedTitle };

            const content = formatForSharing(fullEntry);
            const subject = encodeURIComponent(`Via InReader: ${entry.title}`);
            const body = encodeURIComponent(content);
            const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;

            try {
              dispatchAppEvent('showToast', {
                message: 'Opening email client...',
                type: 'success'
              });

              const link = document.createElement('a');
              link.href = mailtoUrl;
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              setTimeout(() => {
                dispatchAppEvent('showToast', {
                  message: 'No email client responded. Please check your default email app settings.',
                  type: 'error'
                });
              }, 2000);

            } catch (error) {
              console.error('Failed to open email client:', error);
              dispatchAppEvent('showToast', {
                message: 'Unable to open email client. Please check your default email app.',
                type: 'error'
              });
            }
          }
        }
        break;
      }
    }
  }, [
    sidebarFocused,
    setSidebarFocused,
    setSelectedSidebarIndex,
    setSelectedFeedIndex,
    selectedFeedIndex,
    selectedEntryId,
    setSelectedEntryId,
    lastNavigationKey,
    setLastNavigationKey,
    isChatModalOpen,
    setIsChatModalOpen,
    isSearchModalOpen,
    setIsSearchModalOpen,
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,
    showAddFeedModal,
    setShowAddFeedModal,
    setSelectedEntry,
    refreshFeedsCallback,
    handlePopToCurrentItem
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
