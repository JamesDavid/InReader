import PQueue from 'p-queue';
import { db, updateRequestStatus } from './db';

let queue: PQueue | null = null;

interface QueuedRequest {
  entryId?: number;
  feedId?: number;
  feedTitle?: string;
  entryTitle?: string;
  status: 'queued' | 'processing' | 'failed';
  addedAt: Date;
  error?: string;
  type?: string;
}

let queuedRequests: QueuedRequest[] = [];
let processingRequests: QueuedRequest[] = [];
let failedRequests: QueuedRequest[] = [];

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

  // Set up queue event listeners
  queue.on('active', () => {
    console.log('Queue event - active. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });

  queue.on('idle', () => {
    console.log('Queue event - idle. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });

  queue.on('add', () => {
    console.log('Queue event - add. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });

  queue.on('next', () => {
    console.log('Queue event - next. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });

  queue.on('completed', () => {
    console.log('Queue event - completed. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });

  queue.on('error', () => {
    console.log('Queue event - error. Queue size:', queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  });
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

  // Create a base request object
  const queuedRequest: QueuedRequest = {
    status: 'queued',
    addedAt: new Date(),
    type: 'unknown'
  };

  // Add entry-specific information if available
  if (typeof entryId === 'number') {
    try {
      console.log('Getting entry information for:', entryId);
      const entry = await db.entries.get(entryId);
      if (!entry) {
        console.error('Entry not found:', entryId);
        return Promise.reject(new Error('Entry not found'));
      }
      console.log('Found entry:', entry);

      if (entry.requestProcessingStatus === 'success') {
        console.log('Entry already processed successfully, skipping:', entryId);
        return Promise.reject(new Error('Entry already processed'));
      }

      // Get feed information
      console.log('Getting feed information for feedId:', entry.feedId);
      const feed = await db.feeds.get(entry.feedId);
      if (!feed) {
        console.error('Feed not found:', entry.feedId);
        return Promise.reject(new Error('Feed not found'));
      }
      console.log('Found feed:', feed);

      // Add entry information to request
      queuedRequest.entryId = entryId;
      queuedRequest.feedId = entry.feedId;
      queuedRequest.feedTitle = feed.title;
      queuedRequest.entryTitle = entry.title;
      queuedRequest.type = 'entry';
      console.log('Updated request with entry and feed info:', queuedRequest);

      // Update entry status to pending and record attempt time
      await updateRequestStatus(entryId, 'pending');
    } catch (error) {
      console.error('Error checking entry status:', error);
      return Promise.reject(error);
    }
  }

  // Add to queued requests
  queuedRequests.push(queuedRequest);
  console.log('Added request to queue:', queuedRequest);
  console.log('Current queued requests:', queuedRequests.length);
  
  const stats = getQueueStats();
  console.log('Adding request to queue. Current stats:', stats);
  console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  
  try {
    const result = await queue!.add(async () => {
      // Update request status to processing
      const requestIndex = queuedRequests.findIndex(r => r === queuedRequest);
      if (requestIndex !== -1) {
        queuedRequest.status = 'processing';
        processingRequests.push(queuedRequest);
        queuedRequests.splice(requestIndex, 1);
        console.log('Moved request to processing:', queuedRequest);
        console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length);
      }

      try {
        const response = await request();
        // Update entry status if this is an entry request
        if (queuedRequest.entryId) {
          await updateRequestStatus(queuedRequest.entryId, 'success');
        }
        // Remove from processing requests
        processingRequests = processingRequests.filter(r => r !== queuedRequest);
        console.log('Request completed successfully:', queuedRequest);
        console.log('Request state after completion - Processing:', processingRequests.length);
        return response as T;
      } catch (error) {
        // Update entry status if this is an entry request
        if (queuedRequest.entryId) {
          const errorInfo = {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: (error as any).code,
            details: (error as any).details
          };
          await updateRequestStatus(queuedRequest.entryId, 'failed', errorInfo);
        }
        // Move from processing to failed requests
        queuedRequest.status = 'failed';
        queuedRequest.error = error instanceof Error ? error.message : 'Unknown error';
        failedRequests.push(queuedRequest);
        processingRequests = processingRequests.filter(r => r !== queuedRequest);
        console.log('Request failed:', queuedRequest);
        console.log('Request state after failure - Processing:', processingRequests.length, 'Failed:', failedRequests.length);
        throw error;
      }
    }, { priority });

    const updatedStats = getQueueStats();
    console.log('Request completed. Updated stats:', updatedStats);
    console.log('Final request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
    return result as T;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export const getQueueStats = () => {
  if (!queue) return { size: 0, pending: 0, requests: [] };

  // Include all requests - queued, processing, and failed
  const allRequests = [...queuedRequests, ...processingRequests, ...failedRequests];
  console.log('Getting queue stats - Total requests:', allRequests.length);
  console.log('Queue size:', queue.size);
  console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);

  return {
    size: queuedRequests.length,  // Only count queued requests in size
    pending: processingRequests.length,  // Only count processing requests in pending
    concurrency: queue.concurrency,
    requests: allRequests
  };
};

export const clearQueue = () => {
  if (queue) {
    console.log('Clearing queue. Stats before clear:', getQueueStats());
    queue.clear();
    queuedRequests = [];
    processingRequests = [];
    failedRequests = [];
    console.log('Queue cleared. New stats:', getQueueStats());
  }
}; 