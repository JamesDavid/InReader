/**
 * Type-safe event dispatcher utilities
 */

import { useEffect } from 'react';
import { type AppEventMap, type EventDetail } from '../types/events';

/**
 * Dispatch a typed custom event
 */
export function dispatchAppEvent<K extends keyof AppEventMap>(
  name: K,
  detail: EventDetail<K>
): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Type-safe event handler type
 */
export type AppEventHandler<K extends keyof AppEventMap> = (
  event: CustomEvent<AppEventMap[K]>
) => void;

/**
 * React hook to listen to app events with automatic cleanup
 */
export function useAppEventListener<K extends keyof AppEventMap>(
  eventName: K,
  handler: AppEventHandler<K>,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    const eventHandler = handler as EventListener;
    window.addEventListener(eventName, eventHandler);
    return () => window.removeEventListener(eventName, eventHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}

/**
 * Add an event listener without React (for use in callbacks)
 */
export function addAppEventListener<K extends keyof AppEventMap>(
  eventName: K,
  handler: AppEventHandler<K>
): () => void {
  const eventHandler = handler as EventListener;
  window.addEventListener(eventName, eventHandler);
  return () => window.removeEventListener(eventName, eventHandler);
}
