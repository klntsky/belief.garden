/**
 * A generic in-memory queue for processing operations sequentially
 */
interface QueuedOperation<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class OperationQueue<T = unknown> {
  private queue: QueuedOperation<T>[] = [];
  private processing = false;

  /**
   * Add an operation to the queue
   * @param operation - Async function to be executed
   * @returns Resolves when the operation completes
   */
  async add(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { operation, resolve, reject } = this.queue.shift()!;

    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      console.error('Error processing queue operation:', error);
      reject(error);
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.process();
      }
    }
  }
}

/**
 * Manages a collection of queues, creating them on demand
 */
export class QueueManager<T = unknown> {
  private queues = new Map<string, OperationQueue<T>>();

  /**
   * Gets or creates a queue for the given key
   * @param key - The unique identifier for the queue
   * @returns The queue instance
   */
  getQueue(key: string): OperationQueue<T> {
    if (!this.queues.has(key)) {
      this.queues.set(key, new OperationQueue<T>());
    }
    return this.queues.get(key)!;
  }

  /**
   * Executes an operation in the queue for the given key
   * @param key - The unique identifier for the queue
   * @param operation - The async operation to execute
   * @returns Resolves when the operation completes
   */
  async executeInQueue(key: string, operation: () => Promise<T>): Promise<T> {
    const queue = this.getQueue(key);
    return queue.add(operation);
  }

  /**
   * Removes a queue if it exists and is empty
   * @param key - The unique identifier for the queue
   * @returns True if the queue was removed
   */
  cleanupQueue(key: string): boolean {
    const queue = this.queues.get(key);
    if (queue && (queue as unknown as { queue: QueuedOperation<T>[]; processing: boolean }).queue.length === 0 && !(queue as unknown as { processing: boolean }).processing) {
      this.queues.delete(key);
      return true;
    }
    return false;
  }
}

// Export singleton instances for different operation types
export const feedQueue = new OperationQueue();
export const notificationQueue = new OperationQueue();
export const userBeliefsManager = new QueueManager();

