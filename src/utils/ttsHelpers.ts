/**
 * TTS queue helpers for creating queue items
 */

import { type FeedEntryWithTitle } from '../services/db';

/**
 * TTS queue item interface matching ttsService.addToQueue parameter
 */
export interface TTSQueueItem {
  id: number;
  title: string;
  content_fullArticle?: string;
  content_rssAbstract?: string;
  content_aiSummary?: string;
  feedTitle?: string;
}

/**
 * Create a TTS queue item from a feed entry
 */
export function createTTSQueueItem(entry: FeedEntryWithTitle, feedTitle?: string): TTSQueueItem {
  return {
    id: entry.id!,
    title: entry.title,
    content_fullArticle: entry.content_fullArticle,
    content_rssAbstract: entry.content_rssAbstract,
    content_aiSummary: entry.content_aiSummary,
    feedTitle: feedTitle || entry.feedTitle
  };
}
