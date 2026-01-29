import { useState, useEffect, useRef, RefObject } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  enabled: boolean;
  threshold?: number;
  maxPull?: number;
}

interface PullToRefreshState {
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
}

// Find the actual scrollable container (might be the element itself or a parent)
function getScrollContainer(element: HTMLElement): HTMLElement {
  let el: HTMLElement | null = element;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      // Check if this element can actually scroll
      if (el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    el = el.parentElement;
  }
  // Fallback to the element itself
  return element;
}

export function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  options: PullToRefreshOptions
) {
  const { onRefresh, enabled, threshold = 80, maxPull = 120 } = options;
  const [state, setState] = useState<PullToRefreshState>({
    pullDistance: 0,
    isRefreshing: false,
    isPulling: false,
  });

  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  // Keep callback ref in sync
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let cleanupFn: (() => void) | null = null;

    // Use a small delay to ensure the ref is populated after render
    const timerId = setTimeout(() => {
      const element = containerRef.current;
      if (!element) {
        return;
      }

      // The element we listen on for touch events
      const touchTarget = element;
      // The container that actually scrolls (might be parent)
      const scrollContainer = getScrollContainer(element);

      const handleTouchStart = (e: TouchEvent) => {
        if (isRefreshingRef.current) return;
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = false;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (isRefreshingRef.current) return;

        const deltaY = e.touches[0].clientY - startYRef.current;

        // Check scroll position of the actual scroll container
        const scrollTop = scrollContainer.scrollTop;

        // Only activate if at scroll top and pulling down
        if (scrollTop > 0 || deltaY <= 0) {
          if (isPullingRef.current) {
            isPullingRef.current = false;
            pullDistanceRef.current = 0;
            setState(s => ({ ...s, pullDistance: 0, isPulling: false }));
          }
          return;
        }

        // We're at top and pulling down - prevent default scroll
        e.preventDefault();
        isPullingRef.current = true;

        const distance = Math.min(deltaY * 0.4, maxPull);
        pullDistanceRef.current = distance;
        setState(s => ({ ...s, pullDistance: distance, isPulling: true }));
      };

      const handleTouchEnd = async () => {
        if (!isPullingRef.current || isRefreshingRef.current) return;

        const currentDistance = pullDistanceRef.current;
        isPullingRef.current = false;
        pullDistanceRef.current = 0;

        if (currentDistance >= threshold) {
          isRefreshingRef.current = true;
          setState({ pullDistance: 0, isRefreshing: true, isPulling: false });
          try {
            await onRefreshRef.current();
          } finally {
            isRefreshingRef.current = false;
            setState({ pullDistance: 0, isRefreshing: false, isPulling: false });
          }
        } else {
          setState({ pullDistance: 0, isRefreshing: false, isPulling: false });
        }
      };

      touchTarget.addEventListener('touchstart', handleTouchStart, { passive: true });
      touchTarget.addEventListener('touchmove', handleTouchMove, { passive: false });
      touchTarget.addEventListener('touchend', handleTouchEnd, { passive: true });

      cleanupFn = () => {
        touchTarget.removeEventListener('touchstart', handleTouchStart);
        touchTarget.removeEventListener('touchmove', handleTouchMove);
        touchTarget.removeEventListener('touchend', handleTouchEnd);
      };
    }, 0);

    return () => {
      clearTimeout(timerId);
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [enabled, threshold, maxPull, containerRef]);

  return { state };
}
