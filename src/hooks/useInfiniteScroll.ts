import { useEffect, useRef, useCallback, useState } from 'react';

interface UseInfiniteScrollOptions {
  /** Callback when user scrolls near the bottom */
  onLoadMore: () => Promise<void> | void;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Threshold in pixels from bottom to trigger load */
  threshold?: number;
  /** Whether loading is currently enabled */
  enabled?: boolean;
}

interface UseInfiniteScrollReturn {
  /** Ref to attach to the scroll container */
  sentinelRef: React.RefObject<HTMLDivElement>;
  /** Whether currently loading more items */
  isLoading: boolean;
}

/**
 * Hook for infinite scroll functionality using Intersection Observer
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  threshold = 200,
  enabled = true,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const handleIntersection = useCallback(
    async (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;

      if (entry.isIntersecting && hasMore && enabled && !loadingRef.current) {
        loadingRef.current = true;
        setIsLoading(true);

        try {
          await onLoadMore();
        } finally {
          loadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [onLoadMore, hasMore, enabled]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !enabled) return;

    const observer = new IntersectionObserver(handleIntersection, {
      root: null, // Use viewport
      rootMargin: `0px 0px ${threshold}px 0px`, // Trigger before reaching bottom
      threshold: 0,
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersection, threshold, enabled]);

  return {
    sentinelRef,
    isLoading,
  };
}

export default useInfiniteScroll;
