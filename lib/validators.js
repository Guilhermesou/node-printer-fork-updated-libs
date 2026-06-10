'use strict';

const path = require('path');
const net = require('net');
const { PrinterError, ErrorCodes } = require('./errors');

/**
 * Maximum allowed buffer size for print data (50MB)
 */
const MAX_BUFFER_SIZE = 50 * 1024 * 1024;

/**
 * Validates and sanitizes a file path to prevent path traversal attacks.
 * @param {string} filepath - The file path to validate
 * @returns {string} The resolved, sanitized path
 * @throws {PrinterError} If the path is invalid or points to a restricted location
 */
function sanitizeFilePath(filepath) {
  if (!filepath || typeof filepath !== 'string') {
    throw new PrinterError(
      ErrorCodes.INVALID_PATH,
      'File path must be a non-empty string'
    );
  }

  const resolved = path.resolve(filepath);

  // Block access to sensitive system directories on POSIX
  if (process.platform !== 'win32') {
    const blockedPrefixes = ['/etc', '/proc', '/sys', '/dev', '/boot'];
    for (const blocked of blockedPrefixes) {
      if (resolved.startsWith(blocked + '/') || resolved === blocked) {
        throw new PrinterError(
          ErrorCodes.INVALID_PATH,
          `Access denied to restricted path: ${resolved}`,
          { path: resolved, blockedPrefix: blocked }
        );
      }
    }
  }

  return resolved;
}

/**
 * Validates a printer name to prevent injection attacks.
 * @param {string} name - The printer name to validate
 * @param {Array} [availablePrinters] - Optional list of available printer objects to validate against
 * @returns {string} The validated printer name
 * @throws {PrinterError} If the name is invalid
 */
function validatePrinterName(name, availablePrinters) {
  if (!name || typeof name !== 'string') {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'Printer name must be a non-empty string'
    );
  }

  // Block UNC paths that could enable SSRF on Windows
  if (/^\\\\/.test(name) || /^\/\//.test(name)) {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'UNC paths are not allowed as printer names',
      { printerName: name }
    );
  }

  // If a printers list is provided, validate the name exists
  if (availablePrinters && Array.isArray(availablePrinters)) {
    const exists = availablePrinters.some(p => p.name === name);
    if (!exists) {
      throw new PrinterError(
        ErrorCodes.PRINTER_NOT_FOUND,
        `Printer '${name}' not found in the system`,
        { printerName: name }
      );
    }
  }

  return name;
}

/**
 * Validates that print data does not exceed the maximum buffer size.
 * @param {Buffer|string} data - The data to validate
 * @param {number} [maxSize] - Optional custom max size in bytes
 * @throws {PrinterError} If data exceeds the maximum size
 */
function validateBufferSize(data, maxSize) {
  const limit = maxSize || MAX_BUFFER_SIZE;
  let size = 0;

  if (Buffer.isBuffer(data)) {
    size = data.length;
  } else if (typeof data === 'string') {
    size = Buffer.byteLength(data);
  } else {
    return; // Not a buffer or string, let other validations handle it
  }

  if (size > limit) {
    throw new PrinterError(
      ErrorCodes.BUFFER_OVERFLOW,
      `Data size (${size} bytes) exceeds maximum allowed size (${limit} bytes)`,
      { dataSize: size, maxSize: limit }
    );
  }
}

/**
 * Validates a network host for printer connection.
 * @param {string} host - The host to validate
 * @returns {string} The validated host
 * @throws {PrinterError} If the host is invalid
 */
function validateHost(host) {
  if (!host || typeof host !== 'string') {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'Host must be a non-empty string'
    );
  }

  // Allow valid IP addresses and hostnames
  const isIP = net.isIP(host) !== 0;
  const isValidHostname = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(host) || host === 'localhost';

  if (!isIP && !isValidHostname) {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      `Invalid host format: '${host}'`,
      { host }
    );
  }

  return host;
}

/**
 * Validates a network port number.
 * @param {number} port - The port to validate
 * @returns {number} The validated port
 * @throws {PrinterError} If the port is invalid
 */
function validatePort(port) {
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      `Invalid port number: ${port}. Must be between 1 and 65535.`,
      { port }
    );
  }
  return portNum;
}

module.exports = {
  sanitizeFilePath,
  validatePrinterName,
  validateBufferSize,
  validateHost,
  validatePort,
  MAX_BUFFER_SIZE,
};
