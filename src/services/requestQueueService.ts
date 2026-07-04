import PQueue from 'p-queue';
import { db, updateRequestStatus } from './db';

let queue: PQueue | null = null;

interface QueuedRequest {
  // Unique per enqueue call so tracking never confuses two requests that share
  // the same entryId (e.g. an article fetch and a summary for one entry).
  id: number;
  entryId?: number;
  feedId?: number;
  feedTitle?: string;
  entryTitle?: string;
  status: 'queued' | 'processing' | 'failed';
  addedAt: Date;
  error?: string;
  type?: string;
}

let requestSeq = 0;

interface EnqueueOptions {
  priority?: number;
  // Whether completion of this request should write the entry's terminal
  // requestProcessingStatus ('success'/'failed'). Intermediate steps such as
  // article extraction pass false so they don't mark the entry done before the
  // summary has been generated.
  updateEntryStatus?: boolean;
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
    // Remove all listeners from old queue before creating new one
    queue.removeAllListeners();
  } else {
    console.log('Initializing new queue with concurrency:', concurrency);
  }
  queue = new PQueue({ concurrency });

  // Set up queue event listeners
  queue.on('active', () => {
    console.log('Queue event - active. Queue size:', queue?.size);
  });

  queue.on('idle', () => {
    console.log('Queue event - idle. Queue size:', queue?.size);
  });

  queue.on('error', () => {
    console.log('Queue event - error. Queue size:', queue?.size);
  });
};

// Helper function to create a minimal request object
const createMinimalRequest = (request: QueuedRequest): QueuedRequest => {
  return {
    id: request.id,
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
  options: EnqueueOptions = {}
): Promise<T> => {
  const { priority = 0, updateEntryStatus = true, type } = options;

  if (!queue) {
    console.log('Queue not initialized, creating with default concurrency');
    initializeQueue();
  }

  const id = ++requestSeq;

  // Create a base request object
  let queuedRequest: QueuedRequest = {
    id,
    status: 'queued',
    addedAt: new Date(),
    type: type || (entryId ? 'summary' : 'unknown')
  };

  // Add entry-specific information if available
  if (typeof entryId === 'number') {
    try {
      const entry = await db.entries.get(entryId);
      if (!entry) {
        console.error('Entry not found:', entryId);
        return Promise.reject(new Error('Entry not found'));
      }

      // Get feed information
      const feed = await db.feeds.get(entry.feedId);
      if (!feed) {
        console.error('Feed not found:', entry.feedId);
        return Promise.reject(new Error('Feed not found'));
      }

      // Create a minimal request object with only necessary information
      queuedRequest = {
        id,
        entryId,
        feedId: entry.feedId,
        feedTitle: feed.title,
        entryTitle: entry.title,
        status: 'queued',
        addedAt: new Date(),
        type: type || 'summary'
      };

      // Update entry status to pending and record attempt time
      if (updateEntryStatus) {
        await updateRequestStatus(entryId, 'pending');
      }
    } catch (error) {
      console.error('Error checking entry status:', error);
      return Promise.reject(error);
    }
  }

  // Add to queued requests with minimal copy
  const queuedCopy = createMinimalRequest(queuedRequest);
  queuedRequests.push(queuedCopy);

  window.dispatchEvent(new CustomEvent('queueChanged'));

  try {
    const result = await queue!.add(async () => {
      // Move this specific request (by unique id) from queued to processing.
      const requestIndex = queuedRequests.findIndex(r => r.id === id);
      if (requestIndex !== -1) {
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
        if (queuedRequest.entryId && updateEntryStatus) {
          await updateRequestStatus(queuedRequest.entryId, 'success');
        }
        // Remove only this request from processing (by unique id).
        processingRequests = processingRequests.filter(r => r.id !== id);

        if (updateEntryStatus) {
          window.dispatchEvent(new CustomEvent('entryProcessingComplete', {
            detail: { entryId: queuedRequest.entryId }
          }));
        }
        window.dispatchEvent(new CustomEvent('queueChanged'));

        return response as T;
      } catch (error) {
        if (queuedRequest.entryId && updateEntryStatus) {
          const errorInfo = {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: (error as any).code,
            details: (error as any).details
          };
          await updateRequestStatus(queuedRequest.entryId, 'failed', errorInfo);
        }
        // Create a minimal failed request object
        const failedRequest = createMinimalRequest({
          ...queuedRequest,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedRequests.push(failedRequest);
        processingRequests = processingRequests.filter(r => r.id !== id);

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