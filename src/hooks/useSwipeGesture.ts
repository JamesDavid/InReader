import { useEffect, useRef, useState, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft: () => void;        // extreme swipe-left = archive
  onLongPress: () => void;
  enabled: boolean;
  revealThreshold?: number;       // min distance to reveal strip (default 60)
  archiveThreshold?: number;      // min distance to archive (default 200)
  revealDistance?: number;         // snap-to offset when revealing (default 156)
  longPressDelay?: number;
}

interface SwipeState {
  translateX: number;
  isSwiping: boolean;
  direction: 'left' | null;
  isTransitioning: boolean;
  isRevealed: boolean;
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: SwipeOptions
) {
  const {
    onSwipeLeft,
    onLongPress,
    enabled,
    revealThreshold = 60,
    archiveThreshold = 200,
    revealDistance = 156,
    longPressDelay = 500,
  } = options;

  const [state, setState] = useState<SwipeState>({
    translateX: 0,
    isSwiping: false,
    direction: null,
    isTransitioning: false,
    isRevealed: false,
  });

  const callbacksRef = useRef({ onSwipeLeft, onLongPress });
  callbacksRef.current = { onSwipeLeft, onLongPress };

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const isRevealedRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetReveal = useCallback(() => {
    isRevealedRef.current = false;
    setState(prev => ({
      ...prev,
      translateX: 0,
      isRevealed: false,
      isTransitioning: true,
    }));
    setTimeout(() => {
      setState(prev => ({ ...prev, isTransitioning: false }));
    }, 300);
  }, []);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // If revealed, any touch on the content area dismisses the strip.
      if (isRevealedRef.current) {
        e.preventDefault();
        resetReveal();
        return;
      }

      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      directionLockedRef.current = null;
      longPressFiredRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        callbacksRef.current.onLongPress();
        touchStartRef.current = null;
        setState(prev => ({ ...prev, isSwiping: false, translateX: 0, direction: null }));
      }, longPressDelay);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || longPressFiredRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (absDeltaX > 10 || absDeltaY > 10) {
        clearLongPress();
      }

      if (!directionLockedRef.current && (absDeltaX > 10 || absDeltaY > 10)) {
        if (absDeltaX > absDeltaY) {
          directionLockedRef.current = 'horizontal';
        } else {
          directionLockedRef.current = 'vertical';
          touchStartRef.current = null;
          return;
        }
      }

      if (directionLockedRef.current !== 'horizontal') return;

      e.preventDefault();

      // Only allow left swipes (clamp to <= 0)
      if (deltaX > 0) {
        // Slight rubber-band resistance on right drag
        const tx = deltaX * 0.15;
        setState(prev => ({
          ...prev,
          translateX: tx,
          isSwiping: true,
          direction: null,
          isTransitioning: false,
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        translateX: deltaX,
        isSwiping: true,
        direction: 'left',
        isTransitioning: false,
      }));
    };

    const handleTouchEnd = () => {
      clearLongPress();

      if (longPressFiredRef.current || !touchStartRef.current) {
        touchStartRef.current = null;
        return;
      }

      touchStartRef.current = null;

      let action: 'archive' | 'reveal' | 'snap-back' | 'none' = 'none';

      setState(prev => {
        if (!prev.isSwiping) return prev;

        const absX = Math.abs(prev.translateX);

        if (prev.direction === 'left') {
          if (absX > archiveThreshold) {
            action = 'archive';
            return {
              ...prev,
              translateX: -window.innerWidth,
              isTransitioning: true,
              isSwiping: false,
            };
          } else if (absX > revealThreshold) {
            action = 'reveal';
            return {
              ...prev,
              translateX: -revealDistance,
              isTransitioning: true,
              isSwiping: false,
              isRevealed: true,
            };
          }
        }

        // Snap back (including any right drag)
        action = 'snap-back';
        return {
          ...prev,
          translateX: 0,
          isTransitioning: true,
          isSwiping: false,
          direction: null,
        };
      });

      if (action === 'archive') {
        setTimeout(() => {
          callbacksRef.current.onSwipeLeft();
        }, 300);
      } else if (action === 'reveal') {
        isRevealedRef.current = true;
        setTimeout(() => {
          setState(s => ({ ...s, isTransitioning: false }));
        }, 300);
      } else if (action === 'snap-back') {
        setTimeout(() => {
          setState(s => ({ ...s, isTransitioning: false }));
        }, 300);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      clearLongPress();
    };
  }, [enabled, revealThreshold, archiveThreshold, revealDistance, longPressDelay, clearLongPress, resetReveal, elementRef]);

  return { state, resetReveal };
}
