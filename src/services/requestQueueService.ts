import PQueue from 'p-queue';

let queue: PQueue | null = null;

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
  priority: number = 0
): Promise<T> => {
  if (!queue) {
    console.log('Queue not initialized, creating with default concurrency');
    initializeQueue();
  }
  
  console.log('Adding request to queue. Current stats:', getQueueStats());
  const result = await queue!.add(() => request(), { priority });
  console.log('Request completed. Updated stats:', getQueueStats());
  return result;
};

export const getQueueStats = () => {
  if (!queue) return { size: 0, pending: 0 };
  return {
    size: queue.size,
    pending: queue.pending,
    concurrency: queue.concurrency
  };
};

export const clearQueue = () => {
  if (queue) {
    console.log('Clearing queue. Stats before clear:', getQueueStats());
    queue.clear();
    console.log('Queue cleared. New stats:', getQueueStats());
  }
}; 