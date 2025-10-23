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

  // Helper function to log queue state
  const logQueueState = (eventName: string) => {
    console.log(`Queue event - ${eventName}. Queue size:`, queue?.size);
    console.log('Request state - Queued:', queuedRequests.length, 'Processing:', processingRequests.length, 'Failed:', failedRequests.length);
  };

  // Set up queue event listeners
  queue.on('active', () => logQueueState('active'));
  queue.on('idle', () => logQueueState('idle'));
  queue.on('add', () => logQueueState('add'));
  queue.on('next', () => logQueueState('next'));
  queue.on('completed', () => logQueueState('completed'));
  queue.on('error', () => logQueueState('error'));
};

// Helper function to create a minimal request object
const createMinimalRequest = (request: QueuedRequest): QueuedRequest => {
  return {
    entryId: request.entryId,
    feedId: request.feedId,
    feedTitle: request.feedTitle,
    entryTitle: request.entryTitle,
    status: request.status,
    addedAt: request.addedAt,
    type: request.type,
    error: request.error
  };
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
    type: entryId ? 'summary' : 'unknown'
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

      // Get feed information
      console.log('Getting feed information for feedId:', entry.feedId);
      const feed = await db.feeds.get(entry.feedId);
      if (!feed) {
        console.error('Feed not found:', entry.feedId);
        return Promise.reject(new Error('Feed not found'));
      }

      // Create a minimal request object with only necessary information
      queuedRequest = {
        entryId,
        feedId: entry.feedId,
        feedTitle: feed.title,
        entryTitle: entry.title,
        status: 'queued',
        addedAt: new Date(),
        type: 'summary'
      };

      // Update entry status to pending and record attempt time
      await updateRequestStatus(entryId, 'pending');
    } catch (error) {
      console.error('Error checking entry status:', error);
      return Promise.reject(error);
    }
  }

  // Add to queued requests with minimal copy
  const queuedCopy = createMinimalRequest(queuedRequest);
  queuedRequests.push(queuedCopy);
  
  const stats = getQueueStats();
  window.dispatchEvent(new CustomEvent('queueChanged'));
  
  try {
    const result = await queue!.add(async () => {
      // Update request status to processing
      const requestIndex = queuedRequests.findIndex(r => 
        r.entryId === queuedRequest.entryId && 
        r.feedId === queuedRequest.feedId
      );
      if (requestIndex !== -1) {
        // Create a minimal processing request object
        const processingRequest = createMinimalRequest({
          ...queuedRequest,
          status: 'processing' as const
        });
        processingRequests.push(processingRequest);
        queuedRequests.splice(requestIndex, 1);
        window.dispatchEvent(new CustomEvent('queueChanged'));
      }

      try {
        const response = await request();
        if (queuedRequest.entryId) {
          try {
            await updateRequestStatus(queuedRequest.entryId, 'success');
          } catch (dbError) {
            console.error('Failed to update request status to success:', dbError);
            // Don't fail the whole request if DB update fails
          }
        }
        // Remove from processing requests
        processingRequests = processingRequests.filter(r =>
          !(r.entryId === queuedRequest.entryId && r.feedId === queuedRequest.feedId)
        );

        window.dispatchEvent(new CustomEvent('entryProcessingComplete', {
          detail: { entryId: queuedRequest.entryId }
        }));

        return response as T;
      } catch (error) {
        if (queuedRequest.entryId) {
          try {
            const errorInfo = {
              message: error instanceof Error ? error.message : 'Unknown error',
              code: (error as any).code,
              details: (error as any).details
            };
            await updateRequestStatus(queuedRequest.entryId, 'failed', errorInfo);
          } catch (dbError) {
            console.error('Failed to update request status to failed:', dbError);
            // Continue with error handling even if DB update fails
          }
        }
        // Create a minimal failed request object
        const failedRequest = createMinimalRequest({
          ...queuedRequest,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedRequests.push(failedRequest);
        processingRequests = processingRequests.filter(r =>
          !(r.entryId === queuedRequest.entryId && r.feedId === queuedRequest.feedId)
        );

        window.dispatchEvent(new CustomEvent('queueChanged'));
        throw error;
      }
    }, { priority });

    return result as T;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export const getQueueStats = () => {
  if (!queue) return { size: 0, pending: 0, requests: [] };

  // Create minimal copies of requests
  const allRequests = [
    ...queuedRequests.map(createMinimalRequest),
    ...processingRequests.map(createMinimalRequest),
    ...failedRequests.map(createMinimalRequest)
  ];

  return {
    size: queuedRequests.length,
    pending: processingRequests.length,
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