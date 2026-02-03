/**
 * Hook for managing entry scroll behavior
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppEventListener } from '../utils/eventDispatcher';
import { getContentLength } from '../utils/contentFormatters';

interface UseEntryScrollOptions {
  entryId?: number;
  isSelected: boolean;
  isExpanded: boolean;
  content: string;
  onToggleExpand: (entryId: number) => void;
}

interface UseEntryScrollResult {
  articleRef: React.RefObject<HTMLElement | null>;
  contentElementRef: React.RefObject<HTMLDivElement | null>;
  checkVisibility: () => void;
  isContentFullyVisible: () => boolean;
  scrollContent: () => void;
  scrollUp: () => void;
  isTopVisible: () => boolean;
}

/**
 * Manages scroll behavior for feed entries
 */
export function useEntryScroll({
  entryId,
  isSelected,
  isExpanded,
  content,
  onToggleExpand
}: UseEntryScrollOptions): UseEntryScrollResult {
  const articleRef = useRef<HTMLElement | null>(null);
  const contentElementRef = useRef<HTMLDivElement | null>(null);

  /**
   * Check if entry is properly visible and scroll if needed
   */
  const checkVisibility = useCallback(() => {
    if (!articleRef.current) return;

    const scrollContainer = articleRef.current.closest('.overflow-y-auto');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const rect = articleRef.current.getBoundingClientRect();
    const halfwayPoint = containerRect.top + (containerRect.height / 2);

    // Check if the top edge is below the halfway point (scrolling down)
    if (rect.top > halfwayPoint) {
      const targetPosition = scrollContainer.scrollTop + (rect.top - containerRect.top) - (containerRect.height * 0.25);
      scrollContainer.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
    // Check if the top edge is above the container's top edge (scrolling up)
    else if (rect.top < containerRect.top) {
      if (rect.height > containerRect.height) {
        const targetPosition = scrollContainer.scrollTop + (rect.bottom - containerRect.bottom);
        scrollContainer.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      } else {
        const targetPosition = scrollContainer.scrollTop + (rect.top - containerRect.top);
        scrollContainer.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  /**
   * Check if the content is fully visible in the viewport
   */
  const isContentFullyVisible = useCallback(() => {
    const contentElement = contentElementRef.current;
    if (!contentElement) return true;

    const rect = contentElement.getBoundingClientRect();
    const parentContainer = contentElement.closest('.overflow-y-auto');
    if (!parentContainer) return true;

    const containerRect = parentContainer.getBoundingClientRect();
    return rect.bottom <= containerRect.bottom;
  }, []);

  /**
   * Scroll the content down by 33% of the viewport
   */
  const scrollContent = useCallback(() => {
    const contentElement = contentElementRef.current;
    if (!contentElement) return;

    const parentContainer = contentElement.closest('.overflow-y-auto');
    if (!parentContainer) return;

    const scrollAmount = parentContainer.clientHeight * 0.33;
    parentContainer.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });
  }, []);

  /**
   * Check if the top of the entry is visible
   */
  const isTopVisible = useCallback(() => {
    if (!articleRef.current) return true;
    const rect = articleRef.current.getBoundingClientRect();
    const parentContainer = articleRef.current.closest('.overflow-y-auto');
    if (!parentContainer) return true;

    const containerRect = parentContainer.getBoundingClientRect();
    return rect.top >= containerRect.top;
  }, []);

  /**
   * Scroll up by 33% of the viewport
   */
  const scrollUp = useCallback(() => {
    if (!articleRef.current) return;
    const parentContainer = articleRef.current.closest('.overflow-y-auto');
    if (!parentContainer) return;

    const scrollAmount = parentContainer.clientHeight * 0.33;
    parentContainer.scrollBy({
      top: -scrollAmount,
      behavior: 'smooth'
    });
  }, []);

  // Auto-scroll when selected
  useEffect(() => {
    if (isSelected) {
      setTimeout(checkVisibility, 0);
    }
  }, [isSelected, checkVisibility]);

  // Handle toggle expand event (spacebar)
  useAppEventListener('toggleEntryExpand', (event) => {
    if (event.detail.entryId === entryId) {
      if (!content || getContentLength(content) <= 600) return;

      // If content is expanded but not fully visible, scroll instead of collapsing
      if (isExpanded && !isContentFullyVisible()) {
        scrollContent();
      } else if (entryId) {
        onToggleExpand(entryId);
      }
    }
  }, [entryId, content, isExpanded, isContentFullyVisible, scrollContent, onToggleExpand]);

  // Handle scroll event (k key when top not visible)
  useAppEventListener('feedEntryScroll', (event) => {
    if (event.detail.entryId === entryId && !isTopVisible()) {
      scrollUp();
    }
  }, [entryId, isTopVisible, scrollUp]);

  return {
    articleRef,
    contentElementRef,
    checkVisibility,
    isContentFullyVisible,
    scrollContent,
    scrollUp,
    isTopVisible
  };
}
