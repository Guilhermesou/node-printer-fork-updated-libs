'use strict';

const Net = require('net');
const { EventEmitter } = require('events');
const Interface = require('./interface');
const { PrinterError, ErrorCodes } = require('./errors');
const { validateHost, validatePort } = require('./validators');

/**
 * Network printer connection via TCP/IP with keep-alive, retry, and event support.
 *
 * @extends EventEmitter
 *
 * @example
 * const printer = new NetworkPrinter('192.168.1.100', 9100, {
 *   timeout: 5000,
 *   keepAlive: true,
 * });
 *
 * printer.on('error', (e) => console.error('Printer error:', e));
 * printer.on('sent', (info) => console.log('Data sent:', info));
 *
 * if (await printer.isPrinterConnected()) {
 *   await printer.execute(buffer);
 * }
 *
 * @fires NetworkPrinter#sending
 * @fires NetworkPrinter#sent
 * @fires NetworkPrinter#error
 * @fires NetworkPrinter#connected
 * @fires NetworkPrinter#disconnected
 */
class NetworkPrinter extends EventEmitter {
  /**
   * @param {string} host - Printer IP address or hostname
   * @param {number} [port=9100] - Printer TCP port
   * @param {object} [options]
   * @param {number} [options.timeout=3000] - Connection timeout in ms
   * @param {boolean} [options.keepAlive=false] - Keep TCP connection alive between prints
   * @param {number} [options.keepAliveTimeout=30000] - Close idle connection after this many ms
   * @param {object} [options.logger] - Custom logger instance (debug, info, warn, error)
   */
  constructor(host, port, options) {
    super();
    options = options || {};

    this.host = validateHost(host);
    this.port = validatePort(port || 9100);
    this.timeout = options.timeout || 3000;
    this.keepAlive = options.keepAlive || false;
    this.keepAliveTimeout = options.keepAliveTimeout || 30000;
    this.logger = options.logger || {
      debug: () => {},
      info: () => {},
      warn: console.warn,
      error: console.error,
    };

    this._connection = null;
    this._keepAliveTimer = null;
  }

  /**
   * Checks if the printer is reachable via TCP.
   * @returns {Promise<boolean>} true if the printer TCP port is reachable
   */
  async isPrinterConnected() {
    return new Promise((resolve) => {
      const conn = Net.connect(
        {
          host: this.host,
          port: this.port,
          timeout: this.timeout,
        },
        () => {
          resolve(true);
          conn.destroy();
        },
      );

      conn.on('error', (error) => {
        this.logger.debug(`Connection check failed for ${this.host}:${this.port}: ${error.message}`);
        resolve(false);
        conn.destroy();
      });

      conn.on('timeout', () => {
        this.logger.debug(`Connection check timeout for ${this.host}:${this.port}`);
        resolve(false);
        conn.destroy();
      });
    });
  }

  /**
   * Queries printer status using ESC/POS DLE EOT command.
   * Only works with ESC/POS compatible printers.
   *
   * @param {object} [options]
   * @param {number} [options.responseTimeout=2000] - Time to wait for response in ms
   * @returns {Promise<{connected: boolean, online?: boolean, paperPresent?: boolean, coverClosed?: boolean, raw?: Buffer, error?: string}>}
   */
  async getStatus(options = {}) {
    const { responseTimeout = 2000 } = options;

    try {
      // DLE EOT n — Transmit real-time status
      // n=1: Printer status, n=2: Offline status, n=3: Error status, n=4: Paper status
      const statusCommand = Buffer.from([0x10, 0x04, 0x01]);
      const response = await this.execute(statusCommand, {
        waitForResponse: true,
        responseTimeout,
      });

      if (!response || response.length === 0) {
        return { connected: true, error: 'Empty response from printer' };
      }

      const byte = response[0];
      return {
        connected: true,
        online: !(byte & 0x08),
        paperPresent: !(byte & 0x20),
        coverClosed: !(byte & 0x04),
        raw: response,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Gets or creates a TCP connection to the printer.
   * @private
   * @returns {Promise<Net.Socket>}
   */
  _getConnection() {
    // Reuse existing keep-alive connection if available
    if (this.keepAlive && this._connection && !this._connection.destroyed) {
      this._resetKeepAliveTimer();
      return Promise.resolve(this._connection);
    }

    return new Promise((resolve, reject) => {
      const conn = Net.connect(
        {
          host: this.host,
          port: this.port,
          timeout: this.timeout,
        },
        () => {
          if (this.keepAlive) {
            this._connection = conn;
            this._resetKeepAliveTimer();
          }
          this.emit('connected', { host: this.host, port: this.port });
          resolve(conn);
        },
      );

      conn.once('error', (error) => {
        reject(new PrinterError(
          ErrorCodes.CONNECTION_REFUSED,
          `Failed to connect to printer at ${this.host}:${this.port}: ${error.message}`,
          { host: this.host, port: this.port, originalError: error.message }
        ));
      });

      conn.once('timeout', () => {
        conn.destroy();
        reject(new PrinterError(
          ErrorCodes.CONNECTION_TIMEOUT,
          `Connection timeout to printer at ${this.host}:${this.port}`,
          { host: this.host, port: this.port, timeout: this.timeout }
        ));
      });
    });
  }

  /**
   * Resets the keep-alive idle timer.
   * @private
   */
  _resetKeepAliveTimer() {
    clearTimeout(this._keepAliveTimer);
    this._keepAliveTimer = setTimeout(() => {
      this.close();
    }, this.keepAliveTimeout);
  }

  /**
   * Sends a buffer to the printer.
   *
   * @param {Buffer} buffer - Data to send
   * @param {object} [options]
   * @param {boolean} [options.waitForResponse=false] - Wait for printer to respond
   * @param {number} [options.responseTimeout=5000] - Time to wait for response in ms
   * @returns {Promise<void|Buffer>} Response buffer if waitForResponse is true
   */
  async execute(buffer, options = {}) {
    const { waitForResponse = false, responseTimeout = 5000 } = options;
    const name = `${this.host}:${this.port}`;

    /**
     * @event NetworkPrinter#sending
     */
    this.emit('sending', { size: buffer.length, printer: name });

    // Acquire connection BEFORE entering Promise to avoid the
    // `new Promise(async ...)` anti-pattern which can swallow rejections
    let conn;
    try {
      conn = await this._getConnection();
    } catch (error) {
      this.emit('error', { error, printer: name });
      throw error;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let responseTimer = null;

      // Named handler functions so they can be properly removed
      // after the request completes (prevents listener leak on keep-alive)
      const cleanup = () => {
        clearTimeout(responseTimer);
        conn.removeListener('data', onData);
        conn.removeListener('error', onError);
        conn.removeListener('timeout', onTimeout);
      };

      const settle = (fn, arg) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!this.keepAlive) conn.destroy();
        fn(arg);
      };

      const onData = (data) => {
        if (waitForResponse) {
          this.logger.debug(`Received ${data.length} bytes from ${name}`);
          settle(resolve, data);
        }
      };

      const onError = (error) => {
        const printerError = new PrinterError(
          ErrorCodes.CONNECTION_LOST,
          `Connection error with printer at ${name}: ${error.message}`,
          { printer: name, originalError: error.message }
        );
        this.emit('error', { error: printerError, printer: name });
        settle(reject, printerError);
      };

      const onTimeout = () => {
        const printerError = new PrinterError(
          ErrorCodes.CONNECTION_TIMEOUT,
          `Socket timeout with printer at ${name}`,
          { printer: name }
        );
        settle(reject, printerError);
      };

      // Register handlers
      conn.on('data', onData);
      conn.on('error', onError);
      conn.on('timeout', onTimeout);

      // Set up response timeout if waiting for response
      if (waitForResponse) {
        responseTimer = setTimeout(() => {
          settle(reject, new PrinterError(
            ErrorCodes.RESPONSE_TIMEOUT,
            `Timeout waiting for response from printer at ${name}`,
            { printer: name, timeout: responseTimeout }
          ));
        }, responseTimeout);
      }

      conn.write(buffer, null, () => {
        this.logger.debug(`Sent ${buffer.length} bytes to ${name}`);

        /**
         * @event NetworkPrinter#sent
         */
        this.emit('sent', { size: buffer.length, printer: name });

        if (!waitForResponse) {
          settle(resolve);
        }
      });
    });
  }

  /**
   * Sends data with automatic retry on failure.
   *
   * @param {Buffer} buffer - Data to send
   * @param {object} [options]
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.retryDelay=1000] - Base delay between retries in ms (exponential backoff)
   * @param {boolean} [options.waitForResponse=false] - Wait for printer to respond
   * @param {number} [options.responseTimeout=5000] - Response timeout in ms
   * @returns {Promise<void|Buffer>}
   */
  async executeWithRetry(buffer, options = {}) {
    const { maxRetries = 3, retryDelay = 1000, ...executeOptions } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(buffer, executeOptions);
      } catch (error) {
        if (attempt === maxRetries) throw error;

        const delay = retryDelay * Math.pow(2, attempt);
        this.logger.warn(
          `Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}. ` +
          `Retrying in ${delay}ms...`
        );

        // Close existing connection before retry
        this.close();

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Closes the current TCP connection and clears keep-alive timer.
   */
  close() {
    clearTimeout(this._keepAliveTimer);
    this._keepAliveTimer = null;

    if (this._connection) {
      this._connection.destroy();
      this._connection = null;
      this.emit('disconnected', { host: this.host, port: this.port });
    }
  }

  /**
   * Returns the printer name in "host:port" format.
   * @returns {string}
   */
  getPrinterName() {
    return `${this.host}:${this.port}`;
  }
}

module.exports = NetworkPrinter;
