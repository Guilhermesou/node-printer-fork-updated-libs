'use strict';

const { sanitizeFilePath, validatePrinterName, validateBufferSize, validateHost, validatePort } = require('../lib/validators');
const { PrinterError, ErrorCodes } = require('../lib/errors');
const path = require('path');

describe('Validators', () => {
  describe('sanitizeFilePath', () => {
    it('should resolve a valid relative path', () => {
      const input = './test.txt';
      const result = sanitizeFilePath(input);
      expect(result).toBe(path.resolve(input));
    });

    it('should throw ErrorCodes.INVALID_PATH for empty or non-string input', () => {
      expect(() => sanitizeFilePath('')).toThrow(PrinterError);
      expect(() => sanitizeFilePath(null)).toThrow(PrinterError);
      expect(() => sanitizeFilePath(123)).toThrow(PrinterError);
    });

    if (process.platform !== 'win32') {
      it('should throw ErrorCodes.INVALID_PATH for restricted POSIX paths', () => {
        expect(() => sanitizeFilePath('/etc/passwd')).toThrow(/Access denied/);
        expect(() => sanitizeFilePath('/etc')).toThrow(/Access denied/);
        expect(() => sanitizeFilePath('/proc/self/cmdline')).toThrow(/Access denied/);
      });
    }
  });

  describe('validatePrinterName', () => {
    it('should return the name for a valid string', () => {
      expect(validatePrinterName('My Printer')).toBe('My Printer');
    });

    it('should throw ErrorCodes.INVALID_ARGUMENT for empty or non-string input', () => {
      expect(() => validatePrinterName('')).toThrow(PrinterError);
      expect(() => validatePrinterName(null)).toThrow(PrinterError);
    });

    it('should throw ErrorCodes.INVALID_ARGUMENT for UNC-like paths', () => {
      expect(() => validatePrinterName('\\\\server\\printer')).toThrow(/UNC paths are not allowed/);
      expect(() => validatePrinterName('//server/printer')).toThrow(/UNC paths are not allowed/);
    });

    it('should validate against availablePrinters list if provided', () => {
      const available = [{ name: 'P1' }, { name: 'P2' }];
      expect(validatePrinterName('P1', available)).toBe('P1');
      expect(() => validatePrinterName('P3', available)).toThrow(PrinterError);
    });
  });

  describe('validateBufferSize', () => {
    it('should not throw for small buffers', () => {
      expect(() => validateBufferSize(Buffer.alloc(100))).not.toThrow();
    });

    it('should throw ErrorCodes.BUFFER_OVERFLOW for large buffers', () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);
      expect(() => validateBufferSize(largeBuffer)).toThrow(PrinterError);
    });

    it('should allow custom max size', () => {
      const buffer = Buffer.alloc(100);
      expect(() => validateBufferSize(buffer, 50)).toThrow(PrinterError);
    });
  });

  describe('validateHost', () => {
    it('should allow valid IP addresses', () => {
      expect(validateHost('127.0.0.1')).toBe('127.0.0.1');
      expect(validateHost('192.168.1.1')).toBe('192.168.1.1');
    });

    it('should allow valid hostnames', () => {
      expect(validateHost('localhost')).toBe('localhost');
      expect(validateHost('printer.local')).toBe('printer.local');
    });

    it('should throw for invalid formats', () => {
      expect(() => validateHost('invalid host!')).toThrow(PrinterError);
      expect(() => validateHost('')).toThrow(PrinterError);
    });
  });

  describe('validatePort', () => {
    it('should allow valid port numbers', () => {
      expect(validatePort(9100)).toBe(9100);
      expect(validatePort('80')).toBe(80);
    });

    it('should throw for invalid port numbers', () => {
      expect(() => validatePort(0)).toThrow(PrinterError);
      expect(() => validatePort(65536)).toThrow(PrinterError);
      expect(() => validatePort('abc')).toThrow(PrinterError);
    });
  });
});
