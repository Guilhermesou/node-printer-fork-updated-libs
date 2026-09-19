'use strict';

const printerHelper = require('./printerHelper');
const { Printer, PrinterTypes, BreakLine, CharacterSet } = require('./printer');
const NetworkPrinter = require('./network');
const { PrinterError, ErrorCodes } = require('./errors');
const { PrintQueue, PrintJob, JobState, Priority } = require('./queue');
const { PrintJobMonitor } = require('./job-monitor');
const PrinterServer = require('./server');

module.exports = {
  // Core API (from printerHelper)
  getPrinters: printerHelper.getPrinters,
  getPrinter: printerHelper.getPrinter,
  getDefaultPrinterName: printerHelper.getDefaultPrinterName,
  getPrinterDriverOptions: printerHelper.getPrinterDriverOptions,
  getSelectedPaperSize: printerHelper.getSelectedPaperSize,
  printDirect: printerHelper.printDirect,
  printFile: printerHelper.printFile,
  getSupportedPrintFormats: printerHelper.getSupportedPrintFormats,
  getSupportedJobCommands: printerHelper.getSupportedJobCommands,
  getJob: printerHelper.getJob,
  setJob: printerHelper.setJob,

  // ESC/POS Printer builder
  Printer,
  PrinterTypes,
  BreakLine,
  CharacterSet,

  // Network
  NetworkPrinter,

  // Queue system
  PrintQueue,
  PrintJob,
  JobState,
  Priority,

  // Job monitoring
  PrintJobMonitor,

  // Server / Bridge
  PrinterServer,

  // Errors
  PrinterError,
  ErrorCodes,
};