/**
 * Hook for detecting mobile device based on viewport width
 */

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 767;

/**
 * Returns true if the viewport width is at or below the mobile breakpoint
 */
export function useMobileDetection(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
