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

  const mountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Track mount + all deferred timers so pending animation callbacks don't fire
  // setState (or the archive callback) after the row unmounts.
  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const scheduleTimeout = useCallback((cb: () => void, delay: number) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      if (mountedRef.current) cb();
    }, delay);
    timersRef.current.add(t);
  }, []);

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
    scheduleTimeout(() => {
      setState(prev => ({ ...prev, isTransitioning: false }));
    }, 300);
  }, [scheduleTimeout]);

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

      // Held in an object so the assignments inside the setState updater (which
      // TS can't prove runs synchronously) don't get narrowed away afterwards.
      const decided: { action: 'archive' | 'reveal' | 'snap-back' | 'none' } = { action: 'none' };

      setState(prev => {
        if (!prev.isSwiping) return prev;

        const absX = Math.abs(prev.translateX);

        if (prev.direction === 'left') {
          if (absX > archiveThreshold) {
            decided.action = 'archive';
            return {
              ...prev,
              translateX: -window.innerWidth,
              isTransitioning: true,
              isSwiping: false,
            };
          } else if (absX > revealThreshold) {
            decided.action = 'reveal';
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
        decided.action = 'snap-back';
        return {
          ...prev,
          translateX: 0,
          isTransitioning: true,
          isSwiping: false,
          direction: null,
        };
      });

      const action = decided.action;
      if (action === 'archive') {
        scheduleTimeout(() => {
          callbacksRef.current.onSwipeLeft();
        }, 300);
      } else if (action === 'reveal') {
        isRevealedRef.current = true;
        scheduleTimeout(() => {
          setState(s => ({ ...s, isTransitioning: false }));
        }, 300);
      } else if (action === 'snap-back') {
        scheduleTimeout(() => {
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
  }, [enabled, revealThreshold, archiveThreshold, revealDistance, longPressDelay, clearLongPress, resetReveal, scheduleTimeout, elementRef]);

  return { state, resetReveal };
}
