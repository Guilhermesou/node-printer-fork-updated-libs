const EventEmitter = require('events');
const { PrinterError, ErrorCodes } = require('./errors');

/**
 * Monitors the status of print jobs after they are submitted
 * to the OS print spooler (via CUPS or WinSpool).
 */
class PrintJobMonitor extends EventEmitter {
  /**
   * @param {object} printerHelper - Reference to the printerHelper module
   */
  constructor(printerHelper) {
    super();
    if (!printerHelper || typeof printerHelper.getJob !== 'function') {
      const helper = require('./printerHelper');
      this._helper = helper;
    } else {
      this._helper = printerHelper;
    }
    this._activeWatches = new Map();
  }

  /**
   * Polls the OS print spooler for a specific job's status until it completes,
   * fails, or times out.
   *
   * @param {string} printerName - The printer name
   * @param {number} jobId - The job ID returned by printDirect or printFile
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - Maximum time to wait in ms
   * @param {number} [options.pollInterval=500] - Polling interval in ms
   * @returns {Promise<{success: boolean, status: string, job?: object, error?: string}>}
   *
   * @example
   * const result = await monitor.waitForCompletion('MyPrinter', 42);
   * if (result.success) {
   *   console.log('Job printed successfully');
   * } else {
   *   console.error('Job failed:', result.error);
   * }
   */
  async waitForCompletion(printerName, jobId, options = {}) {
    const { timeout = 30000, pollInterval = 500 } = options;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        // Check for timeout
        if (Date.now() - startTime > timeout) {
          resolve({
            success: false,
            status: 'TIMEOUT',
            error: `Job ${jobId} did not complete within ${timeout}ms`,
          });
          return;
        }

        try {
          const job = this._helper.getJob(printerName, jobId);
          const status = job.status || [];

          // Check for completion statuses
          const completedStatuses = ['PRINTED', 'COMPLETE'];
          const failedStatuses = ['ERROR', 'ABORTED', 'CANCELLED', 'DELETED'];

          const isCompleted = status.some(s => completedStatuses.includes(s));
          const isFailed = status.some(s => failedStatuses.includes(s));

          if (isCompleted) {
            resolve({ success: true, status: 'COMPLETED', job });
          } else if (isFailed) {
            resolve({
              success: false,
              status: status.join(','),
              error: `Job failed with status: ${status.join(', ')}`,
              job,
            });
          } else {
            // Still processing, check again
            setTimeout(check, pollInterval);
          }
        } catch (e) {
          // Job might have been cleaned from the spooler queue.
          // If we've been polling for a while, assume it completed.
          const elapsed = Date.now() - startTime;
          if (elapsed < 2000) {
            // Too early to assume completion, keep trying
            setTimeout(check, pollInterval);
          } else {
            // Job was probably processed and removed from the queue
            resolve({
              success: true,
              status: 'ASSUMED_COMPLETE',
              error: null,
            });
          }
        }
      };

      check();
    });
  }

  /**
   * Starts monitoring a print job and emits events when status changes.
   * 
   * Events emitted:
   * - 'status' (job): Emitted on every status change
   * - 'completed' (job): Emitted when job prints successfully
   * - 'error' (err, job): Emitted when job fails
   * - 'timeout' (jobId): Emitted if timeout is reached
   * 
   * @param {string} printerName 
   * @param {number} jobId 
   * @param {object} [options]
   */
  watch(printerName, jobId, options = {}) {
    const { timeout = 60000, pollInterval = 500 } = options;
    const startTime = Date.now();
    const watchKey = `${printerName}:${jobId}`;

    if (this._activeWatches.has(watchKey)) return;

    // Use native watch if available (N-API implementation)
    const printerNative = require('./interface');
    if (printerNative && typeof printerNative.watchJob === 'function') {
      try {
        printerNative.watchJob(printerName, jobId, (job) => {
          this.emit('status', job);
          
          const completedStatuses = ['PRINTED', 'COMPLETE', 'ASSUMED_COMPLETE'];
          const failedStatuses = ['ERROR', 'ABORTED', 'CANCELLED', 'DELETED'];

          if (job.status.some(s => completedStatuses.includes(s))) {
            this.emit('completed', job);
            this._activeWatches.delete(watchKey);
          } else if (job.status.some(s => failedStatuses.includes(s))) {
            this.emit('error', new Error(`Job failed: ${job.status.join(',')}`), job);
            this._activeWatches.delete(watchKey);
          }
        });
        this._activeWatches.set(watchKey, true);
        return;
      } catch (e) {
        // Fallback to JS polling if native fails
      }
    }

    let lastStatus = null;

    const check = () => {
      if (Date.now() - startTime > timeout) {
        this.emit('timeout', jobId);
        this.stop(printerName, jobId);
        return;
      }

      try {
        const job = this._helper.getJob(printerName, jobId);
        const currentStatus = (job.status || []).join(',');

        if (currentStatus !== lastStatus) {
          this.emit('status', job);
          lastStatus = currentStatus;
        }

        const completedStatuses = ['PRINTED', 'COMPLETE'];
        const failedStatuses = ['ERROR', 'ABORTED', 'CANCELLED', 'DELETED'];

        const isCompleted = job.status.some(s => completedStatuses.includes(s));
        const isFailed = job.status.some(s => failedStatuses.includes(s));

        if (isCompleted) {
          this.emit('completed', job);
          this.stop(printerName, jobId);
        } else if (isFailed) {
          this.emit('error', new Error(`Job failed: ${currentStatus}`), job);
          this.stop(printerName, jobId);
        } else {
          const timer = setTimeout(check, pollInterval);
          this._activeWatches.set(watchKey, timer);
        }
      } catch (e) {
        // Handle job removal from spooler
        if (Date.now() - startTime > 2000) {
          this.emit('completed', { id: jobId, status: ['ASSUMED_COMPLETE'] });
          this.stop(printerName, jobId);
        } else {
          const timer = setTimeout(check, pollInterval);
          this._activeWatches.set(watchKey, timer);
        }
      }
    };

    const timer = setTimeout(check, 0);
    this._activeWatches.set(watchKey, timer);
  }

  /**
   * Stops monitoring a job.
   */
  stop(printerName, jobId) {
    const watchKey = `${printerName}:${jobId}`;
    const timer = this._activeWatches.get(watchKey);
    if (timer) {
      clearTimeout(timer);
      this._activeWatches.delete(watchKey);
    }
  }

  // Keep legacy methods for compatibility
  async waitForCompletion(printerName, jobId, options = {}) {
    return new Promise((resolve) => {
      this.watch(printerName, jobId, options);
      this.once('completed', (job) => resolve({ success: true, status: 'COMPLETED', job }));
      this.once('error', (err, job) => resolve({ success: false, status: 'FAILED', error: err.message, job }));
      this.once('timeout', (id) => resolve({ success: false, status: 'TIMEOUT', error: 'Timeout reached' }));
    });
  }

  getJobStatus(printerName, jobId) {
    try {
      const job = this._helper.getJob(printerName, jobId);
      return { found: true, status: job.status || [], job };
    } catch (e) {
      return { found: false, error: e.message };
    }
  }
}

module.exports = { PrintJobMonitor };
