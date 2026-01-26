import { useEffect, useRef, useState, useCallback } from 'react';

interface SwipeOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onLongPress: () => void;
  enabled: boolean;
  swipeThreshold?: number;
  swipeRightMax?: number;
  longPressDelay?: number;
}

interface SwipeState {
  translateX: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
  isTransitioning: boolean;
  isRevealed: boolean;
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: SwipeOptions
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
    enabled,
    swipeThreshold = 100,
    swipeRightMax = 180,
    longPressDelay = 500,
  } = options;

  const [state, setState] = useState<SwipeState>({
    translateX: 0,
    isSwiping: false,
    direction: null,
    isTransitioning: false,
    isRevealed: false,
  });

  // Use refs for callbacks so we don't re-attach listeners on every render
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight, onLongPress });
  callbacksRef.current = { onSwipeLeft, onSwipeRight, onLongPress };

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
      // The action strip buttons are sibling elements and handle their own events.
      if (isRevealedRef.current) {
        e.preventDefault();
        resetReveal();
        return;
      }

      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      directionLockedRef.current = null;
      longPressFiredRef.current = false;

      // Start long press timer
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        callbacksRef.current.onLongPress();
        // Reset touch state
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

      // Cancel long press on any significant movement
      if (absDeltaX > 10 || absDeltaY > 10) {
        clearLongPress();
      }

      // Lock direction on first significant movement
      if (!directionLockedRef.current && (absDeltaX > 10 || absDeltaY > 10)) {
        if (absDeltaX > absDeltaY) {
          directionLockedRef.current = 'horizontal';
        } else {
          directionLockedRef.current = 'vertical';
          // Vertical = scroll, abort gesture
          touchStartRef.current = null;
          return;
        }
      }

      if (directionLockedRef.current !== 'horizontal') return;

      // Prevent vertical scroll during horizontal swipe
      e.preventDefault();

      let tx: number;
      let direction: 'left' | 'right' | null = null;

      if (deltaX < 0) {
        // Swipe left: clamp to <= 0
        tx = deltaX;
        direction = 'left';
      } else {
        // Swipe right: cap at swipeRightMax
        tx = Math.min(deltaX, swipeRightMax);
        direction = 'right';
      }

      setState(prev => ({
        ...prev,
        translateX: tx,
        isSwiping: true,
        direction,
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

      // Read current state snapshot to decide action outside setState
      let action: 'swipe-left' | 'reveal-right' | 'snap-back' | 'none' = 'none';

      setState(prev => {
        if (!prev.isSwiping) return prev;

        if (prev.direction === 'left') {
          if (Math.abs(prev.translateX) > swipeThreshold) {
            action = 'swipe-left';
            return {
              ...prev,
              translateX: -window.innerWidth,
              isTransitioning: true,
              isSwiping: false,
            };
          } else {
            action = 'snap-back';
            return {
              ...prev,
              translateX: 0,
              isTransitioning: true,
              isSwiping: false,
              direction: null,
            };
          }
        }

        if (prev.direction === 'right') {
          if (prev.translateX > swipeRightMax / 2) {
            action = 'reveal-right';
            isRevealedRef.current = true;
            return {
              ...prev,
              translateX: swipeRightMax,
              isTransitioning: true,
              isSwiping: false,
              isRevealed: true,
            };
          } else {
            action = 'snap-back';
            return {
              ...prev,
              translateX: 0,
              isTransitioning: true,
              isSwiping: false,
              direction: null,
            };
          }
        }

        return { ...prev, isSwiping: false, direction: null };
      });

      // Fire callbacks outside setState updater
      if (action === 'swipe-left') {
        // Wait for slide-off animation to complete, then fire callback
        setTimeout(() => {
          callbacksRef.current.onSwipeLeft();
        }, 300);
      } else if (action === 'reveal-right') {
        callbacksRef.current.onSwipeRight();
        setTimeout(() => {
          setState(s => ({ ...s, isTransitioning: false }));
        }, 300);
      } else if (action === 'snap-back') {
        setTimeout(() => {
          setState(s => ({ ...s, isTransitioning: false }));
        }, 300);
      }
    };

    // Attach listeners imperatively for { passive: false } on touchmove
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
  }, [enabled, swipeThreshold, swipeRightMax, longPressDelay, clearLongPress, resetReveal, elementRef]);

  return { state, resetReveal };
}
