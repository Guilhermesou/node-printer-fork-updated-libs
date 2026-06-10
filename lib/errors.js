'use strict';

/**
 * Error codes for printer operations
 */
const ErrorCodes = {
  // Connection errors
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  CONNECTION_LOST: 'CONNECTION_LOST',

  // Printer errors
  PRINTER_NOT_FOUND: 'PRINTER_NOT_FOUND',
  PRINTER_OFFLINE: 'PRINTER_OFFLINE',
  PAPER_OUT: 'PAPER_OUT',
  COVER_OPEN: 'COVER_OPEN',

  // Print job errors
  PRINT_FAILED: 'PRINT_FAILED',
  JOB_CANCELLED: 'JOB_CANCELLED',
  JOB_TIMEOUT: 'JOB_TIMEOUT',

  // Data errors
  INVALID_DATA: 'INVALID_DATA',
  BUFFER_OVERFLOW: 'BUFFER_OVERFLOW',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  INVALID_PATH: 'INVALID_PATH',

  // Queue errors
  QUEUE_FULL: 'QUEUE_FULL',
  QUEUE_PAUSED: 'QUEUE_PAUSED',

  // General
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  RESPONSE_TIMEOUT: 'RESPONSE_TIMEOUT',
};

/**
 * Custom error class for printer operations with error codes
 */
class PrinterError extends Error {
  /**
   * @param {string} code - Error code from ErrorCodes
   * @param {string} message - Human-readable error message
   * @param {object} [details] - Additional error details
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PrinterError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

module.exports = {
  PrinterError,
  ErrorCodes,
};
