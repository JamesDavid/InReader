import React, { useRef, useState, useCallback, useMemo } from 'react';
import { type FeedEntryWithTitle } from '../services/db';
import { reprocessEntry } from '../services/feedParser';
import ttsService from '../services/ttsService';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useMobileDetection } from '../hooks/useMobileDetection';
import { useEntryState } from '../hooks/useEntryState';
import { useEntryScroll } from '../hooks/useEntryScroll';
import { formatRelativeDate } from '../utils/dateFormatters';
import { formatForSharing, getContentLength, getPreviewContent } from '../utils/contentFormatters';
import { createTTSQueueItem } from '../utils/ttsHelpers';
import { dispatchAppEvent } from '../utils/eventDispatcher';
import { EntryHeader, EntryContent, EntryMobileActions } from './entry';
import EntryBottomSheet from './EntryBottomSheet';

interface FeedListEntryProps {
  entry: FeedEntryWithTitle;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isDarkMode: boolean;
  isChatOpen: boolean;
  isExpanded: boolean;
  interestTagNames?: Set<string>;
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
  interestTagNames,
  onContentLeave,
  contentRef,
  onOpenChat,
}) => {
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  // Use extracted hooks
  const isMobile = useMobileDetection();
  const { currentEntry, feedTitle, isRefreshing, setIsRefreshing } = useEntryState({ entry });

  const content = currentEntry.content_fullArticle || currentEntry.content_rssAbstract;
  const { articleRef, contentElementRef } = useEntryScroll({
    entryId: currentEntry.id,
    isSelected,
    isExpanded,
    content,
    onToggleExpand
  });

  // Swipe gesture handlers
  const handleSwipeArchive = useCallback(() => {
    if (!currentEntry.id) return;
    onMarkAsRead(currentEntry.id, true);
    dispatchAppEvent('mobileSwipeDismiss', {
      entryId: currentEntry.id,
      index
    });
  }, [currentEntry.id, index, onMarkAsRead]);

  const handleSwipeLongPress = useCallback(() => {
    setBottomSheetOpen(true);
  }, []);

  const { state: swipeState, resetReveal } = useSwipeGesture(swipeContainerRef, {
    onSwipeLeft: handleSwipeArchive,
    onLongPress: handleSwipeLongPress,
    enabled: isMobile,
  });

  // Memoized values
  const contentLength = useMemo(() => getContentLength(content), [content]);
  const formattedDate = useMemo(() => formatRelativeDate(new Date(currentEntry.publishDate)), [currentEntry.publishDate]);
  const previewContent = useMemo(() => getPreviewContent(content, isExpanded), [content, isExpanded]);

  const computedMarkdownClass = useMemo(() => {
    return `prose prose-sm max-w-none
      ${isDarkMode ? 'prose-invert prose-p:text-gray-300' : 'prose-p:text-gray-600'}
      prose-p:my-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
      prose-pre:bg-gray-800 prose-pre:text-gray-100
      prose-code:text-blue-500 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
      prose-a:text-blue-500 hover:prose-a:text-blue-600
      ${isDarkMode ? 'prose-code:bg-gray-700' : ''}`;
  }, [isDarkMode]);

  // Action handlers
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
  }, [currentEntry.id, isRefreshing, setIsRefreshing]);

  const handleCopy = useCallback(async () => {
    const content = formatForSharing(currentEntry);
    await navigator.clipboard.writeText(content);
    dispatchAppEvent('showToast', {
      message: 'Article copied to clipboard',
      type: 'success'
    });
  }, [currentEntry]);

  const handleEmail = useCallback(async () => {
    const content = formatForSharing(currentEntry);
    const subject = encodeURIComponent(`Via InReader: ${currentEntry.title}`);
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
  }, [currentEntry]);

  const handleTTS = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (content && currentEntry.id && isSelected) {
      ttsService.addToQueue(createTTSQueueItem(currentEntry, feedTitle));
    }
  }, [currentEntry, isSelected, feedTitle, content]);

  const handleMobileListen = useCallback(() => {
    if (content && currentEntry.id) {
      ttsService.addToQueue(createTTSQueueItem(currentEntry, feedTitle));
    }
  }, [currentEntry, feedTitle, content]);

  // Combined content ref handler
  const handleContentRef = useCallback((element: HTMLDivElement | null) => {
    contentElementRef.current = element;
    contentRef(element);
  }, [contentRef, contentElementRef]);

  return (
    <article
      ref={articleRef}
      data-index={index}
      data-entry-id={currentEntry.id}
      onClick={(e) => {
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
      {/* Action strip revealed by swipe-left */}
      {isMobile && (
        <EntryMobileActions
          entry={currentEntry}
          isDarkMode={isDarkMode}
          feedTitle={feedTitle}
          onToggleStar={onToggleStar}
          onOpenChat={onOpenChat}
          onListen={handleMobileListen}
          resetReveal={resetReveal}
        />
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
        <EntryHeader
          entry={currentEntry}
          feedTitle={feedTitle}
          formattedDate={formattedDate}
          isDarkMode={isDarkMode}
          isMobile={isMobile}
          isRefreshing={isRefreshing}
          onMarkAsRead={onMarkAsRead}
          onToggleStar={onToggleStar}
          onRefresh={handleRefresh}
          onOpenChat={onOpenChat}
        />

        {isSelected && (
          <EntryContent
            entry={currentEntry}
            isDarkMode={isDarkMode}
            isExpanded={isExpanded}
            isSelected={isSelected}
            contentLength={contentLength}
            previewContent={previewContent}
            markdownClass={computedMarkdownClass}
            interestTagNames={interestTagNames}
            onToggleExpand={onToggleExpand}
            onContentView={onContentView}
            onContentLeave={onContentLeave}
            onTTS={handleTTS}
            onCopy={handleCopy}
            onEmail={handleEmail}
            contentRef={handleContentRef}
          />
        )}
      </div>

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
          onListen={handleMobileListen}
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
