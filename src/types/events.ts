/**
 * Custom event type definitions for the application
 */

import { type FeedEntryWithTitle } from '../services/db';

// Event detail types
export interface EntryReadChangedDetail {
  entryId: number;
  isRead: boolean;
}

export interface EntryUpdatedDetail {
  entry: FeedEntryWithTitle;
}

export interface EntryRefreshStartDetail {
  entryId: number;
}

export interface EntryRefreshCompleteDetail {
  entry: FeedEntryWithTitle;
}

export interface ShowToastDetail {
  message: string;
  type: 'success' | 'error';
}

export interface MobileSwipeDismissDetail {
  entryId: number;
  index: number;
}

export interface EntryStarredChangedDetail {
  entryId: number;
  isStarred: boolean;
  starredDate?: Date;
}

export interface ToggleEntryExpandDetail {
  entryId: number;
}

export interface FeedEntryScrollDetail {
  entryId: number;
}

export interface ChatModalScrollDetail {
  direction: 'up' | 'down';
}

export interface EntryMarkedAsReadDetail {
  feedId?: number;
}

export interface FeedRefreshedDetail {
  feedId?: number;
}

export interface EntryProcessingCompleteDetail {
  entryId?: number;
}

// Fired by the data layer after an entry row is written, so views showing that
// entry can re-read it. (Replaces the old db.ts subscribeToEntryUpdates channel.)
export interface EntryDbUpdatedDetail {
  entryId: number;
}

// Map of event names to their detail types.
// Events with no payload use `void` and are dispatched without a detail arg.
export interface AppEventMap {
  entryReadChanged: EntryReadChangedDetail;
  entryUpdated: EntryUpdatedDetail;
  entryRefreshStart: EntryRefreshStartDetail;
  entryRefreshComplete: EntryRefreshCompleteDetail;
  showToast: ShowToastDetail;
  mobileSwipeDismiss: MobileSwipeDismissDetail;
  entryStarredChanged: EntryStarredChangedDetail;
  toggleEntryExpand: ToggleEntryExpandDetail;
  feedEntryScroll: FeedEntryScrollDetail;
  chatModalScroll: ChatModalScrollDetail;
  entryMarkedAsRead: EntryMarkedAsReadDetail;
  feedRefreshed: FeedRefreshedDetail;
  entryProcessingComplete: EntryProcessingCompleteDetail;
  queueChanged: void;
  allFeedsRefreshed: void;
  entryDbUpdated: EntryDbUpdatedDetail;
}

// Type helper for event detail extraction
export type EventDetail<K extends keyof AppEventMap> = AppEventMap[K];

// Typed CustomEvent
export type AppCustomEvent<K extends keyof AppEventMap> = CustomEvent<AppEventMap[K]>;
