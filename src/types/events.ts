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

export interface FeedListPageChangeDetail {
  page: number;
  selectIndex?: number;
  direction: 'next' | 'prev';
}

export interface ChatModalScrollDetail {
  direction: 'up' | 'down';
}

export interface EntryMarkedAsReadDetail {
  feedId?: number;
}

// Map of event names to their detail types
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
  feedListPageChange: FeedListPageChangeDetail;
  chatModalScroll: ChatModalScrollDetail;
  entryMarkedAsRead: EntryMarkedAsReadDetail;
}

// Type helper for event detail extraction
export type EventDetail<K extends keyof AppEventMap> = AppEventMap[K];

// Typed CustomEvent
export type AppCustomEvent<K extends keyof AppEventMap> = CustomEvent<AppEventMap[K]>;
