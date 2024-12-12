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
  let queuedRequest: QueuedRequest = {
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
      console.log('Found entry:', JSON.stringify(entry, null, 2));

      // Get feed information
      console.log('Getting feed information for feedId:', entry.feedId);
      const feed = await db.feeds.get(entry.feedId);
      if (!feed) {
        console.error('Feed not found:', entry.feedId);
        return Promise.reject(new Error('Feed not found'));
      }
      console.log('Found feed:', JSON.stringify(feed, null, 2));

      // Create a new request object with all information
      queuedRequest = {
        entryId,
        feedId: entry.feedId,
        feedTitle: feed.title,
        entryTitle: entry.title,
        status: 'queued',
        addedAt: new Date(),
        type: 'entry'
      };
      console.log('Created request with entry and feed info:', JSON.stringify(queuedRequest, null, 2));

      // Update entry status to pending and record attempt time
      await updateRequestStatus(entryId, 'pending');
    } catch (error) {
      console.error('Error checking entry status:', error);
      return Promise.reject(error);
    }
  }

  // Add to queued requests with a deep copy
  const queuedCopy = JSON.parse(JSON.stringify(queuedRequest));
  queuedRequests.push(queuedCopy);
  console.log('Added request to queue:', JSON.stringify(queuedCopy, null, 2));
  console.log('Current queued requests:', JSON.stringify(queuedRequests, null, 2));
  
  const stats = getQueueStats();
  console.log('Adding request to queue. Current stats:', JSON.stringify(stats, null, 2));
  
  try {
    const result = await queue!.add(async () => {
      // Update request status to processing
      const requestIndex = queuedRequests.findIndex(r => 
        r.entryId === queuedRequest.entryId && 
        r.feedId === queuedRequest.feedId
      );
      if (requestIndex !== -1) {
        // Create a new processing request object with a deep copy
        const processingRequest = JSON.parse(JSON.stringify({
          ...queuedRequest,
          status: 'processing' as const
        }));
        processingRequests.push(processingRequest);
        queuedRequests.splice(requestIndex, 1);
        console.log('Moved request to processing:', JSON.stringify(processingRequest, null, 2));
        console.log('Current processing requests:', JSON.stringify(processingRequests, null, 2));
      }

      try {
        const response = await request();
        // Update entry status if this is an entry request
        if (queuedRequest.entryId) {
          await updateRequestStatus(queuedRequest.entryId, 'success');
        }
        // Remove from processing requests
        processingRequests = processingRequests.filter(r => 
          !(r.entryId === queuedRequest.entryId && r.feedId === queuedRequest.feedId)
        );
        console.log('Request completed successfully:', JSON.stringify(queuedRequest, null, 2));
        console.log('Current processing requests:', JSON.stringify(processingRequests, null, 2));
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
        // Create a new failed request object with a deep copy
        const failedRequest = JSON.parse(JSON.stringify({
          ...queuedRequest,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
        failedRequests.push(failedRequest);
        processingRequests = processingRequests.filter(r => 
          !(r.entryId === queuedRequest.entryId && r.feedId === queuedRequest.feedId)
        );
        console.log('Request failed:', JSON.stringify(failedRequest, null, 2));
        console.log('Current failed requests:', JSON.stringify(failedRequests, null, 2));
        throw error;
      }
    }, { priority });

    const updatedStats = getQueueStats();
    console.log('Request completed. Updated stats:', JSON.stringify(updatedStats, null, 2));
    return result as T;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export const getQueueStats = () => {
  if (!queue) return { size: 0, pending: 0, requests: [] };

  // Include all requests - queued, processing, and failed
  // Use deep copies to ensure complete objects
  const allRequests = [
    ...queuedRequests.map(r => JSON.parse(JSON.stringify(r))),
    ...processingRequests.map(r => JSON.parse(JSON.stringify(r))),
    ...failedRequests.map(r => JSON.parse(JSON.stringify(r)))
  ];
  
  console.log('Getting queue stats - All requests:', JSON.stringify(allRequests, null, 2));

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