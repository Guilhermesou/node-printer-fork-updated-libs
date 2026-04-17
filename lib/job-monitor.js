'use strict';

const { PrinterError, ErrorCodes } = require('./errors');

/**
 * Monitors the status of print jobs after they are submitted
 * to the OS print spooler (via CUPS or WinSpool).
 */
class PrintJobMonitor {
  /**
   * @param {object} printerHelper - Reference to the printerHelper module
   */
  constructor(printerHelper) {
    if (!printerHelper || typeof printerHelper.getJob !== 'function') {
      throw new PrinterError(
        ErrorCodes.INVALID_ARGUMENT,
        'PrintJobMonitor requires a printerHelper instance with getJob method'
      );
    }
    this._helper = printerHelper;
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
   * Gets the current status of a print job without waiting.
   *
   * @param {string} printerName - The printer name
   * @param {number} jobId - The job ID
   * @returns {{found: boolean, status?: string[], job?: object, error?: string}}
   */
  getJobStatus(printerName, jobId) {
    try {
      const job = this._helper.getJob(printerName, jobId);
      return {
        found: true,
        status: job.status || [],
        job,
      };
    } catch (e) {
      return {
        found: false,
        error: e.message,
      };
    }
  }
}

module.exports = { PrintJobMonitor };
