import PQueue from 'p-queue';
import { db, updateRequestStatus } from './db';

let queue: PQueue | null = null;

interface QueuedRequest {
  entryId: number;
  feedId: number;
  feedTitle: string;
  entryTitle: string;
  status: 'queued' | 'processing';
  addedAt: Date;
}

let queuedRequests: QueuedRequest[] = [];

export const initializeQueue = (concurrency: number = 2) => {
  if (queue) {
    // Only reinitialize if concurrency changed
    if (queue.concurrency === concurrency) {
      console.log('Queue already initialized with same concurrency:', concurrency);
      return;
    }
    console.log('Reinitializing queue with new concurrency:', concurrency);
  } else {
    console.log('Initializing new queue with concurrency:', concurrency);
  }
  queue = new PQueue({ concurrency });
};

export const enqueueRequest = async <T>(
  request: () => Promise<T>,
  entryId?: number,
  priority: number = 0
): Promise<T> => {
  if (!queue) {
    console.log('Queue not initialized, creating with default concurrency');
    initializeQueue();
  }

  // Only check entry status if an entryId is provided
  if (typeof entryId === 'number') {
    try {
      const entry = await db.entries.get(entryId);
      if (!entry) {
        console.error('Entry not found:', entryId);
        return Promise.reject(new Error('Entry not found'));
      }

      if (entry.requestProcessingStatus === 'success') {
        console.log('Entry already processed successfully, skipping:', entryId);
        return Promise.reject(new Error('Entry already processed'));
      }

      // Get feed information
      const feed = await db.feeds.get(entry.feedId);
      if (!feed) {
        console.error('Feed not found:', entry.feedId);
        return Promise.reject(new Error('Feed not found'));
      }

      // Add to queued requests
      queuedRequests.push({
        entryId,
        feedId: entry.feedId,
        feedTitle: feed.title,
        entryTitle: entry.title,
        status: 'queued',
        addedAt: new Date()
      });

      // Update entry status to pending and record attempt time
      await updateRequestStatus(entryId, 'pending');
    } catch (error) {
      console.error('Error checking entry status:', error);
      return Promise.reject(error);
    }
  }
  
  console.log('Adding request to queue. Current stats:', getQueueStats());
  
  try {
    const result = await queue!.add(async () => {
      // Update request status to processing
      if (typeof entryId === 'number') {
        const requestIndex = queuedRequests.findIndex(r => r.entryId === entryId);
        if (requestIndex !== -1) {
          queuedRequests[requestIndex].status = 'processing';
        }
      }

      try {
        const response = await request();
        // Only update entry status if an entryId was provided
        if (typeof entryId === 'number') {
          await updateRequestStatus(entryId, 'success');
          // Remove from queued requests
          queuedRequests = queuedRequests.filter(r => r.entryId !== entryId);
        }
        return response;
      } catch (error) {
        // Only update entry status if an entryId was provided
        if (typeof entryId === 'number') {
          const errorInfo = {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: (error as any).code,
            details: (error as any).details
          };
          await updateRequestStatus(entryId, 'failed', errorInfo);
          // Remove from queued requests
          queuedRequests = queuedRequests.filter(r => r.entryId !== entryId);
        }
        throw error;
      }
    }, { priority });

    console.log('Request completed. Updated stats:', getQueueStats());
    return result;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export const getQueueStats = () => {
  if (!queue) return { size: 0, pending: 0, requests: [] };
  return {
    size: queue.size,
    pending: queue.pending,
    concurrency: queue.concurrency,
    requests: queuedRequests
  };
};

export const clearQueue = () => {
  if (queue) {
    console.log('Clearing queue. Stats before clear:', getQueueStats());
    queue.clear();
    queuedRequests = [];
    console.log('Queue cleared. New stats:', getQueueStats());
  }
}; 