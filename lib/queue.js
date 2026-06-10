'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { PrinterError, ErrorCodes } = require('./errors');

/**
 * Possible states for a print job in the queue
 */
const JobState = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  CANCELLED: 'CANCELLED',
};

/**
 * Print job priority levels
 */
const Priority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
};

/**
 * Represents a single print job in the queue
 */
class PrintJob {
  /**
   * @param {number} id - Unique job identifier
   * @param {Buffer|string} data - Data to print
   * @param {object} [options]
   * @param {string} [options.printer] - Target printer name
   * @param {number} [options.priority] - Job priority (use Priority enum)
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {object} [options.metadata] - Arbitrary metadata for the job
   * @param {Function} [options.onSuccess] - Success callback
   * @param {Function} [options.onError] - Error callback
   */
  constructor(id, data, options = {}) {
    this.id = id;
    this.data = data;
    this.printer = options.printer || null;
    this.priority = options.priority !== undefined ? options.priority : Priority.NORMAL;
    this.state = JobState.QUEUED;
    this.attempts = 0;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.completedAt = null;
    this.error = null;
    this.result = null;
    this.metadata = options.metadata || {};
    this.onSuccess = options.onSuccess || null;
    this.onError = options.onError || null;
  }

  /**
   * Returns a safe, serializable representation of the job
   */
  toJSON() {
    return {
      id: this.id,
      printer: this.printer,
      priority: this.priority,
      state: this.state,
      attempts: this.attempts,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      error: this.error ? this.error.message : null,
      metadata: this.metadata,
      dataSize: Buffer.isBuffer(this.data) ? this.data.length : (typeof this.data === 'string' ? this.data.length : 0),
    };
  }
}

/**
 * Internal print queue manager with priority, retry, and event support.
 *
 * @example
 * const queue = new PrintQueue({
 *   concurrency: 1,
 *   maxRetries: 3,
 *   retryDelay: 2000,
 *   printFunction: async (job) => {
 *     return await networkPrinter.execute(job.data);
 *   },
 * });
 *
 * queue.on('completed', (job) => console.log(`Job #${job.id} done`));
 * queue.on('failed', (job, err) => console.error(`Job #${job.id} failed`, err));
 *
 * const job = queue.enqueue(buffer, { priority: Priority.HIGH });
 *
 * @fires PrintQueue#enqueued
 * @fires PrintQueue#processing
 * @fires PrintQueue#completed
 * @fires PrintQueue#failed
 * @fires PrintQueue#retrying
 * @fires PrintQueue#cancelled
 * @fires PrintQueue#paused
 * @fires PrintQueue#resumed
 * @fires PrintQueue#drained
 */
class PrintQueue extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} [options.concurrency=1] - Max concurrent print jobs
   * @param {number} [options.maxQueueSize=1000] - Max jobs allowed in queue
   * @param {number} [options.maxRetries=3] - Default max retries per job
   * @param {number} [options.retryDelay=2000] - Base delay in ms between retries (exponential backoff)
   * @param {Function} options.printFunction - Async function that performs the actual printing. Receives a PrintJob.
   * @param {boolean} [options.autoStart=true] - Start processing immediately on enqueue
   */
  constructor(options = {}) {
    super();

    if (!options.printFunction || typeof options.printFunction !== 'function') {
      throw new PrinterError(
        ErrorCodes.INVALID_ARGUMENT,
        'PrintQueue requires a "printFunction" option'
      );
    }

    this._queue = [];
    this._processing = new Map();
    this._completed = [];
    this._failed = [];
    this._jobIdCounter = 0;
    this._concurrency = options.concurrency || 1;
    this._maxQueueSize = options.maxQueueSize || 1000;
    this._maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this._retryDelay = options.retryDelay || 2000;
    this._printFn = options.printFunction;
    this._paused = false;
    this._retryTimers = new Set();
    this._destroyed = false;

    // Opt-in deduplication: rejects identical data submitted within a time window
    this._deduplication = options.deduplication || false;
    this._deduplicationWindowMs = options.deduplicationWindowMs || 5000;
    this._recentHashes = new Map(); // hash → timestamp
  }

  /**
   * Adds a print job to the queue.
   *
   * @param {Buffer|string} data - Data to send to the printer
   * @param {object} [options]
   * @param {string} [options.printer] - Target printer name
   * @param {number} [options.priority] - Job priority (Priority.LOW/NORMAL/HIGH/URGENT)
   * @param {number} [options.maxRetries] - Override default max retries
   * @param {object} [options.metadata] - Arbitrary metadata (e.g., orderId, type)
   * @param {Function} [options.onSuccess] - Called when job completes successfully
   * @param {Function} [options.onError] - Called when job fails permanently
   * @returns {PrintJob} The created job
   * @throws {PrinterError} If queue is full or destroyed
   */
  enqueue(data, options = {}) {
    if (this._destroyed) {
      throw new PrinterError(ErrorCodes.QUEUE_PAUSED, 'Queue has been destroyed');
    }

    if (this._queue.length >= this._maxQueueSize) {
      throw new PrinterError(
        ErrorCodes.QUEUE_FULL,
        `Queue is full (${this._maxQueueSize} jobs). Try again later.`,
        { currentSize: this._queue.length, maxSize: this._maxQueueSize }
      );
    }

    // Opt-in deduplication check
    if (this._deduplication) {
      const hashInput = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      const hash = crypto.createHash('md5').update(hashInput).digest('hex');
      const now = Date.now();
      const lastSeen = this._recentHashes.get(hash);

      if (lastSeen && (now - lastSeen) < this._deduplicationWindowMs) {
        /**
         * @event PrintQueue#duplicate-rejected
         */
        this.emit('duplicate-rejected', { hash, timeSinceLastMs: now - lastSeen });
        return null;
      }

      this._recentHashes.set(hash, now);

      // Prune old hashes to prevent memory leak
      if (this._recentHashes.size > 1000) {
        for (const [h, t] of this._recentHashes) {
          if (now - t > this._deduplicationWindowMs) this._recentHashes.delete(h);
        }
      }
    }

    const job = new PrintJob(++this._jobIdCounter, data, {
      maxRetries: this._maxRetries,
      ...options,
    });

    this._insertWithPriority(job);

    /**
     * @event PrintQueue#enqueued
     * @type {PrintJob}
     */
    this.emit('enqueued', job);

    // Try to process immediately
    this._processQueue();

    return job;
  }

  /**
   * Inserts a job at the correct position based on priority (higher priority first).
   * @private
   */
  _insertWithPriority(job) {
    const idx = this._queue.findIndex(j => j.priority < job.priority);
    if (idx === -1) {
      this._queue.push(job);
    } else {
      this._queue.splice(idx, 0, job);
    }
  }

  /**
   * Cancels a queued job (before it starts processing).
   * @param {number} jobId - The job ID to cancel
   * @returns {boolean} true if the job was found and cancelled
   */
  cancel(jobId) {
    const idx = this._queue.findIndex(j => j.id === jobId);
    if (idx !== -1) {
      const [job] = this._queue.splice(idx, 1);
      job.state = JobState.CANCELLED;
      job.updatedAt = new Date();

      /**
       * @event PrintQueue#cancelled
       * @type {PrintJob}
       */
      this.emit('cancelled', job);
      return true;
    }
    return false;
  }

  /**
   * Pauses queue processing. Jobs currently processing will complete.
   */
  pause() {
    this._paused = true;
    /**
     * @event PrintQueue#paused
     */
    this.emit('paused');
  }

  /**
   * Resumes queue processing.
   */
  resume() {
    this._paused = false;
    /**
     * @event PrintQueue#resumed
     */
    this.emit('resumed');
    this._processQueue();
  }

  /**
   * Processes the next job(s) in the queue.
   * @private
   */
  async _processQueue() {
    if (this._paused || this._destroyed) return;
    if (this._queue.length === 0) {
      if (this._processing.size === 0) {
        /**
         * @event PrintQueue#drained
         */
        this.emit('drained');
      }
      return;
    }
    if (this._processing.size >= this._concurrency) return;

    const job = this._queue.shift();
    if (!job) return;

    job.state = JobState.PROCESSING;
    job.attempts++;
    job.updatedAt = new Date();
    this._processing.set(job.id, job);

    /**
     * @event PrintQueue#processing
     * @type {PrintJob}
     */
    this.emit('processing', job);

    try {
      const result = await this._printFn(job);

      job.state = JobState.COMPLETED;
      job.result = result;
      job.completedAt = new Date();
      job.updatedAt = new Date();
      this._processing.delete(job.id);
      this._completed.push(job);

      /**
       * @event PrintQueue#completed
       * @type {PrintJob}
       */
      this.emit('completed', job, result);
      if (job.onSuccess) {
        try { job.onSuccess(result); } catch (_) { /* user callback error */ }
      }
    } catch (error) {
      this._processing.delete(job.id);
      job.error = error;
      job.updatedAt = new Date();

      if (job.attempts < job.maxRetries) {
        job.state = JobState.RETRYING;

        /**
         * @event PrintQueue#retrying
         * @type {PrintJob}
         */
        this.emit('retrying', job, error);

        const delay = this._retryDelay * Math.pow(2, job.attempts - 1);
        const timer = setTimeout(() => {
          this._retryTimers.delete(timer);
          if (!this._destroyed) {
            job.state = JobState.QUEUED;
            this._insertWithPriority(job);
            this._processQueue();
          }
        }, delay);
        this._retryTimers.add(timer);
      } else {
        job.state = JobState.FAILED;
        this._failed.push(job);

        /**
         * @event PrintQueue#failed
         * @type {PrintJob}
         */
        this.emit('failed', job, error);
        if (job.onError) {
          try { job.onError(error); } catch (_) { /* user callback error */ }
        }
      }
    }

    // Try to process the next job
    this._processQueue();
  }

  /**
   * Returns the current state of the queue.
   * @returns {object} Queue status snapshot
   */
  getStatus() {
    return {
      queued: this._queue.length,
      processing: this._processing.size,
      completed: this._completed.length,
      failed: this._failed.length,
      paused: this._paused,
      destroyed: this._destroyed,
    };
  }

  /**
   * Returns detailed information about all jobs by state.
   * @returns {object} Jobs grouped by state
   */
  getJobs() {
    return {
      queued: this._queue.map(j => j.toJSON()),
      processing: [...this._processing.values()].map(j => j.toJSON()),
      completed: this._completed.map(j => j.toJSON()),
      failed: this._failed.map(j => j.toJSON()),
    };
  }

  /**
   * Gets a specific job by ID from any state.
   * @param {number} jobId
   * @returns {PrintJob|null}
   */
  getJob(jobId) {
    return (
      this._queue.find(j => j.id === jobId) ||
      this._processing.get(jobId) ||
      this._completed.find(j => j.id === jobId) ||
      this._failed.find(j => j.id === jobId) ||
      null
    );
  }

  /**
   * Clears completed and failed job history.
   */
  clearHistory() {
    this._completed = [];
    this._failed = [];
  }

  /**
   * Moves all failed jobs back to the queue for reprocessing.
   * @returns {number} Number of jobs requeued
   */
  retryFailed() {
    const failed = this._failed.splice(0);
    for (const job of failed) {
      job.state = JobState.QUEUED;
      job.attempts = 0;
      job.error = null;
      job.result = null;
      this._insertWithPriority(job);
    }
    this._processQueue();
    return failed.length;
  }

  /**
   * Destroys the queue, cancels all pending timers and clears all jobs.
   */
  destroy() {
    this._destroyed = true;
    this._paused = true;
    this._queue = [];
    this._processing.clear();
    for (const timer of this._retryTimers) {
      clearTimeout(timer);
    }
    this._retryTimers.clear();
    this._recentHashes.clear();
    this.removeAllListeners();
  }
}

module.exports = {
  PrintQueue,
  PrintJob,
  JobState,
  Priority,
};
