'use strict';

const http = require('http');
const url = require('url');
const printerHelper = require('./printerHelper');
const { Printer } = require('./printer');
const NetworkPrinter = require('./network');
const { PrinterError, ErrorCodes } = require('./errors');

/**
 * PrinterServer provides an HTTP REST API bridge to interact with local and network printers.
 * Ideal for multi-device environments or Electron apps using external web URLs.
 */
class PrinterServer {
  /**
   * @param {object} [options]
   * @param {number} [options.port=9001]
   * @param {string} [options.host='localhost']
   * @param {string} [options.apiKey] - Optional shared secret for simple authentication
   * @param {object} [options.logger] - Custom logger
   */
  constructor(options = {}) {
    this.port = options.port || 9001;
    this.host = options.host || 'localhost';
    this.apiKey = options.apiKey || null;
    this.logger = options.logger || console;
    this.server = null;
  }

  /**
   * Starts the HTTP server.
   * @returns {Promise<void>}
   */
  listen() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      this.server.on('error', (err) => {
        this.logger.error('PrinterServer error:', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        this.logger.info(`PrinterServer running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stops the server.
   */
  close() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Main request handler
   * @private
   */
  async _handleRequest(req, res) {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check
    if (this.apiKey) {
      const providedKey = req.headers['x-api-key'] || url.parse(req.url, true).query.apiKey;
      if (providedKey !== this.apiKey) {
        return this._sendResponse(res, 401, { error: 'Unauthorized' });
      }
    }

    const { pathname } = url.parse(req.url);

    try {
      if (req.method === 'GET' && pathname === '/printers') {
        return await this._handleGetPrinters(req, res);
      }

      if (req.method === 'POST' && pathname === '/print') {
        return await this._handlePostPrint(req, res);
      }

      if (req.method === 'GET' && pathname === '/status') {
        return await this._handleGetStatus(req, res);
      }

      this._sendResponse(res, 404, { error: 'Not Found' });
    } catch (error) {
      this.logger.error(`Error handling ${req.method} ${pathname}:`, error);
      this._sendResponse(res, 500, { error: error.message });
    }
  }

  /**
   * GET /printers
   * @private
   */
  async _handleGetPrinters(req, res) {
    const localPrinters = printerHelper.getPrinters();
    
    // We can also trigger a quick network discovery if requested
    const query = url.parse(req.url, true).query;
    let networkPrinters = [];
    
    if (query.discover === 'true') {
      networkPrinters = await NetworkPrinter.discover({ timeout: 1000 });
    }

    this._sendResponse(res, 200, {
      local: localPrinters,
      network: networkPrinters
    });
  }

  /**
   * POST /print
   * @private
   */
  async _handlePostPrint(req, res) {
    const body = await this._readRequestBody(req);
    const { target, type, commands, raw, options } = body;

    if (!target) {
      return this._sendResponse(res, 400, { error: 'Target printer not specified' });
    }

    let buffer;

    // 1. Prepare Buffer
    if (raw) {
      buffer = Buffer.from(raw, 'base64');
    } else if (commands && Array.isArray(commands)) {
      const printerBuilder = new Printer({
        type: type || 'epson',
        ...options
      });

      for (const cmd of commands) {
        if (typeof printerBuilder[cmd.action] === 'function') {
          // Some actions might be async (like printImage)
          const result = printerBuilder[cmd.action](cmd.value, cmd.settings);
          if (result instanceof Promise) await result;
        }
      }
      buffer = printerBuilder.getBuffer();
    } else {
      return this._sendResponse(res, 400, { error: 'No print data provided (raw or commands)' });
    }

    // 2. Execute Print
    try {
      if (typeof target === 'string') {
        // Local Printer
        printerHelper.printDirect({
          data: buffer,
          printer: target,
          type: 'RAW',
          success: (jobId) => this._sendResponse(res, 200, { success: true, jobId }),
          error: (err) => this._sendResponse(res, 500, { error: err.message })
        });
      } else if (target.host) {
        // Network Printer
        const netPrinter = new NetworkPrinter(target.host, target.port, target.options);
        await netPrinter.execute(buffer);
        this._sendResponse(res, 200, { success: true });
      } else {
        throw new Error('Invalid target format');
      }
    } catch (error) {
      this._sendResponse(res, 500, { error: error.message });
    }
  }

  /**
   * GET /status?printer=NAME or host=IP
   * @private
   */
  async _handleGetStatus(req, res) {
    const query = url.parse(req.url, true).query;
    
    if (query.host) {
      const netPrinter = new NetworkPrinter(query.host, query.port || 9100);
      const status = await netPrinter.getStatus();
      return this._sendResponse(res, 200, status);
    }

    if (query.printer) {
      try {
        const info = printerHelper.getPrinter(query.printer);
        return this._sendResponse(res, 200, {
          name: info.name,
          status: info.status,
          jobs: info.jobs || []
        });
      } catch (e) {
        return this._sendResponse(res, 404, { error: 'Local printer not found' });
      }
    }

    this._sendResponse(res, 400, { error: 'Specify printer name or host IP' });
  }

  _readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
    });
  }

  _sendResponse(res, statusCode, data) {
    if (res.writableEnded) return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

module.exports = PrinterServer;
