/**
 * A generic in-memory queue for processing operations sequentially
 */
export class OperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  /**
   * Add an operation to the queue
   * @param {Function} operation - Async function to be executed
   * @returns {Promise} Resolves when the operation completes
   */
  async add(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { operation, resolve, reject } = this.queue.shift();

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
export class QueueManager {
  constructor() {
    this.queues = new Map();
  }

  /**
   * Gets or creates a queue for the given key
   * @param {string} key - The unique identifier for the queue
   * @returns {OperationQueue} The queue instance
   */
  getQueue(key) {
    if (!this.queues.has(key)) {
      this.queues.set(key, new OperationQueue());
    }
    return this.queues.get(key);
  }

  /**
   * Executes an operation in the queue for the given key
   * @param {string} key - The unique identifier for the queue
   * @param {Function} operation - The async operation to execute
   * @returns {Promise} Resolves when the operation completes
   */
  async executeInQueue(key, operation) {
    const queue = this.getQueue(key);
    return queue.add(operation);
  }

  /**
   * Removes a queue if it exists and is empty
   * @param {string} key - The unique identifier for the queue
   * @returns {boolean} True if the queue was removed
   */
  cleanupQueue(key) {
    const queue = this.queues.get(key);
    if (queue && queue.queue.length === 0 && !queue.processing) {
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
