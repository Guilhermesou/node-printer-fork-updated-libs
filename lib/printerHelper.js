'use strict';

const { Printer } = require('./printer');
const { PrinterError, ErrorCodes } = require('./errors');
const { sanitizeFilePath, validatePrinterName, validateBufferSize } = require('./validators');

var printer_helper,
  fs = require('fs'),
  child_process = require('child_process'),
  os = require('os'),
  path = require('path'),
  binding_path = path.resolve(
    __dirname,
    './node-printer-fork-updated-libs.node',
  );

if (fs.existsSync(binding_path)) {
  printer_helper = require(binding_path);
} else {
  printer_helper = require(
    './node-printer-fork-updated-libs_' +
    process.platform +
    '_' +
    process.arch +
    '.node',
  );
}

/** Return all installed printers including active jobs
 */
module.exports.getPrinters = getPrinters;
module.exports.getPrintersAsync = getPrintersAsync;

/** send data to printer
 */
module.exports.printDirect = printDirect;

/// send file to printer
module.exports.printFile = printFile;

/** Get supported print format for printDirect
 */
module.exports.getSupportedPrintFormats =
  printer_helper.getSupportedPrintFormats;

/**
 * Get possible job command for setJob. It depends on os.
 * @return Array of string. e.g.: DELETE, PAUSE, RESUME
 */
module.exports.getSupportedJobCommands = printer_helper.getSupportedJobCommands;

/** get printer info object. It includes all active jobs
 */
module.exports.getPrinter = getPrinter;
module.exports.getPrinterAsync = getPrinterAsync;
module.exports.getSelectedPaperSize = getSelectedPaperSize;
module.exports.getPrinterDriverOptions = getPrinterDriverOptions;

/// Return default printer name
module.exports.getDefaultPrinterName = getDefaultPrinterName;

/** get printer job info object
 */
module.exports.getJob = getJob;
module.exports.setJob = setJob;

module.exports.Printer = Printer;

/**
 * return user defined printer, according to https://www.cups.org/documentation.php/doc-2.0/api-cups.html#cupsGetDefault2 :
 * "Applications should use the cupsGetDests and cupsGetDest functions to get the user-defined default printer,
 * as this function does not support the lpoptions-defined default printer"
 */
function getDefaultPrinterName() {
  var printerName = printer_helper.getDefaultPrinterName();
  if (printerName) {
    return printerName;
  }

  // seems correct posix behaviour
  var printers = getPrinters();
  if (printers && printers.length) {
    for (const printer of printers) {
      if (printer.isDefault === true) {
        return printer.name;
      }
    }
  }

  // printer not found, return nothing(undefined)
}

/** Get printer info with jobs
 * @param printerName printer name to extract the info
 * @return printer object info:
 *		TODO: to enum all possible attributes
 */
function getPrinter(printerName) {
  if (!printerName) {
    printerName = getDefaultPrinterName();
  }
  var printer = printer_helper.getPrinter(printerName);
  correctPrinterinfo(printer);
  return printer;
}

/**
 * Async version of getPrinter. Returns a Promise.
 */
function getPrinterAsync(printerName) {
  if (!printerName) {
    printerName = getDefaultPrinterName();
  }
  if (printer_helper.getPrinterAsync) {
    return printer_helper.getPrinterAsync(printerName).then(function(printer) {
      correctPrinterinfo(printer);
      return printer;
    });
  } else {
    // Fallback if not available natively
    try {
      return Promise.resolve(getPrinter(printerName));
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

/** Get printer driver options includes advanced options like supported paper size
 * @param printerName printer name to extract the info (default printer used if printer is not provided)
 * @return printer driver info:
 */
function getPrinterDriverOptions(printerName) {
  if (!printerName) {
    printerName = getDefaultPrinterName();
  }

  return printer_helper.getPrinterDriverOptions(printerName);
}

/** Finds selected paper size pertaining to the specific printer out of all supported ones in driver_options
 * @param printerName printer name to extract the info (default printer used if printer is not provided)
 * @return selected paper size
 */
function getSelectedPaperSize(printerName) {
  var driver_options = getPrinterDriverOptions(printerName);
  var selectedSize = '';
  if (driver_options && driver_options.PageSize) {
    Object.keys(driver_options.PageSize).forEach(function (key) {
      if (driver_options.PageSize[key]) selectedSize = key;
    });
  }
  return selectedSize;
}

function getJob(printerName, jobId) {
  return printer_helper.getJob(printerName, jobId);
}

function setJob(printerName, jobId, command) {
  return printer_helper.setJob(printerName, jobId, command);
}

function getPrinters() {
  var printers = printer_helper.getPrinters();
  if (printers && printers.length) {
    for (const printer of printers) {
      correctPrinterinfo(printer);
    }
  }
  return printers;
}

/**
 * Async version of getPrinters. Returns a Promise.
 */
function getPrintersAsync() {
  if (printer_helper.getPrintersAsync) {
    return printer_helper.getPrintersAsync().then(function(printers) {
      if (printers && printers.length) {
        for (const printer of printers) {
          correctPrinterinfo(printer);
        }
      }
      return printers;
    });
  } else {
    // Fallback if not available natively (old addon binaries)
    return Promise.resolve(getPrinters());
  }
}

// Map Windows-specific status names to normalized cross-platform names
var STATUS_NORMALIZATION = {
  'WAITING': 'IDLE',
  'PAPER-JAM': 'PAPER_JAM',
  'PAPER-OUT': 'PAPER_OUT',
  'DOOR-OPEN': 'COVER_OPEN',
  'NO-TONER': 'NO_TONER',
  'NOT-AVAILABLE': 'OFFLINE',
  'OUT-OF-MEMORY': 'OUT_OF_MEMORY',
  'OUTPUT-BIN-FULL': 'OUTPUT_BIN_FULL',
  'USER-INTERVENTION': 'USER_INTERVENTION',
  'WARMING-UP': 'WARMING_UP',
  'POWER-SAVE': 'POWER_SAVE',
  'MANUAL-FEED': 'MANUAL_FEED',
  'IO-ACTIVE': 'IO_ACTIVE',
  'PENDING-DELETION': 'PENDING_DELETION',
  'SERVER-UNKNOWN': 'SERVER_UNKNOWN',
  'TONER-LOW': 'TONER_LOW',
  'PAGE-PUNT': 'PAGE_PUNT',
  'BLOCKED-DEVQ': 'BLOCKED',
};

function correctPrinterinfo(printer) {
  if (printer.status || !printer.options || !printer.options['printer-state']) {
    return;
  }

  var status = printer.options['printer-state'];
  // Add posix status
  if (status === '3') {
    status = 'IDLE';
  } else if (status === '4') {
    status = 'PRINTING';
  } else if (status === '5') {
    status = 'STOPPED';
  }

  // correct date type
  for (const k in printer.options) {
    if (
      /time$/.test(k) &&
      printer.options[k] &&
      !(printer.options[k] instanceof Date)
    ) {
      printer.options[k] = new Date(printer.options[k] * 1000);
    }
  }

  printer.status = status;

  // Normalize platform-specific status arrays (Windows returns arrays of status flags)
  if (Array.isArray(printer.status)) {
    printer.statusNormalized = printer.status.map(function (s) {
      return STATUS_NORMALIZATION[s] || s;
    });
  } else if (typeof printer.status === 'string') {
    printer.statusNormalized = STATUS_NORMALIZATION[printer.status] || printer.status;
  }
}

/*
 print raw data. This function supports both callback and Promise styles.

 Parameters (object style - recommended):
   data - String|Buffer, mandatory, data to send to the printer
   printer - String, optional, name of the printer (default printer if missing)
   docname - String, optional, name of document shown in printer status
   type - String, optional, data type: RAW, TEXT, PDF, etc.
   options - Object, optional, CUPS options as key-value pairs
   success - Function, optional, callback on success (receives jobId)
   error - Function, optional, callback on error (receives Error)

 Returns a Promise if success/error callbacks are not provided.

 @example
 // Promise style (recommended)
 const jobId = await printDirect({ data: buffer, printer: 'myPrinter' });

 // Callback style (legacy)
 printDirect({
   data: buffer,
   printer: 'myPrinter',
   success: (jobId) => console.log('Job:', jobId),
   error: (err) => console.error(err),
 });
 */
function printDirect(parameters) {
  var data, printer, docname, type, options, success, error;

  if (arguments.length === 1 && typeof parameters === 'object' && parameters !== null) {
    data = parameters.data;
    printer = parameters.printer;
    docname = parameters.docname;
    type = parameters.type;
    options = parameters.options || {};
    success = parameters.success;
    error = parameters.error;
  } else if (arguments.length > 1) {
    // Deprecated positional arguments
    process.emitWarning(
      'Positional arguments in printDirect are deprecated. Use an options object instead.',
      'DeprecationWarning',
      'NODEPRINTER001'
    );
    data = parameters;
    printer = arguments[1];
    type = arguments[2];
    docname = arguments[3];
    options = arguments[4];
    success = arguments[5];
    error = arguments[6];
  } else {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'printDirect requires an options object as argument'
    );
  }

  // If no callbacks provided, return a Promise
  if (!success && !error) {
    return new Promise(function (resolve, reject) {
      _executePrintDirect(data, printer, docname, type, options, resolve, reject);
    });
  }

  // Ensure callbacks are always functions to avoid crashes
  var onSuccess = typeof success === 'function' ? success : function () { };
  var onError = typeof error === 'function' ? error : function (err) { throw err; };

  _executePrintDirect(data, printer, docname, type, options, onSuccess, onError);
}

/**
 * Internal implementation of printDirect.
 * @private
 */
function _executePrintDirect(data, printer, docname, type, options, success, error) {
  // Validate data
  if (!data) {
    return error(new PrinterError(
      ErrorCodes.INVALID_DATA,
      'The "data" parameter is required'
    ));
  }

  if (!Buffer.isBuffer(data) && typeof data !== 'string') {
    return error(new PrinterError(
      ErrorCodes.INVALID_DATA,
      '"data" must be a string or Buffer'
    ));
  }

  // Validate buffer size
  try {
    validateBufferSize(data);
  } catch (e) {
    return error(e);
  }

  if (!type) {
    type = 'RAW';
  }

  // Set default printer name
  if (!printer) {
    printer = getDefaultPrinterName();
  }

  if (!printer) {
    return error(new PrinterError(
      ErrorCodes.PRINTER_NOT_FOUND,
      'No printer specified and no default printer found'
    ));
  }

  type = type.toUpperCase();

  if (!docname) {
    docname = 'node print job';
  }

  if (!options) {
    options = {};
  }

  // Pre-flight: check if the printer exists and is not stopped/offline
  try {
    var printerInfo = getPrinter(printer);
    if (printerInfo) {
      var printerStatus = printerInfo.statusNormalized || printerInfo.status;
      if (printerStatus === 'STOPPED' || printerStatus === 'OFFLINE') {
        return error(new PrinterError(
          ErrorCodes.PRINTER_OFFLINE,
          'Printer "' + printer + '" is ' + printerStatus + '. Check the printer status before printing.',
          { printer: printer, status: printerStatus }
        ));
      }
    }
  } catch (_preflight) {
    // Pre-flight is best-effort — continue even if it fails
  }

  if (printer_helper.printDirect) {
    // call C++ binding
    try {
      var res = printer_helper.printDirect(
        data,
        printer,
        docname,
        type,
        options,
      );
      if (res && typeof res.then === 'function') {
        res.then(function(jobId) {
          success(jobId);
        }).catch(function(err) {
          error(err);
        });
      } else if (res) {
        success(res);
      } else {
        error(new PrinterError(
          ErrorCodes.PRINT_FAILED,
          'printDirect returned an empty result. The print job may not have been created.',
          { printer: printer, docname: docname, type: type }
        ));
      }
    } catch (e) {
      error(e);
    }
  } else {
    error(new PrinterError(
      ErrorCodes.NOT_SUPPORTED,
      'printDirect is not supported on this platform'
    ));
  }
}

/**
 * Send a file to the printer. Supports both callback and Promise styles.
 *
 * @param {object} parameters
 * @param {string} parameters.filename - Path to the file to print (mandatory)
 * @param {string} [parameters.docname] - Document name shown in printer status
 * @param {string} [parameters.printer] - Printer name (default printer if missing)
 * @param {object} [parameters.options] - CUPS options
 * @param {Function} [parameters.success] - Success callback (receives jobId)
 * @param {Function} [parameters.error] - Error callback (receives Error)
 * @returns {Promise|void} Returns a Promise if callbacks are not provided
 */
function printFile(parameters) {
  if (arguments.length !== 1 || typeof parameters !== 'object' || parameters === null) {
    throw new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'printFile requires an options object as argument'
    );
  }

  var filename = parameters.filename;
  var docname = parameters.docname;
  var printer = parameters.printer;
  var options = parameters.options || {};
  var success = parameters.success;
  var error = parameters.error;

  // If no callbacks provided, return a Promise
  if (!success && !error) {
    return new Promise(function (resolve, reject) {
      _executePrintFile(filename, docname, printer, options, resolve, reject);
    });
  }

  // Ensure callbacks are always functions
  var onSuccess = typeof success === 'function' ? success : function () { };
  var onError = typeof error === 'function' ? error : function (err) { throw err; };

  _executePrintFile(filename, docname, printer, options, onSuccess, onError);
}

/**
 * Internal implementation of printFile.
 * @private
 */
function _executePrintFile(filename, docname, printer, options, success, error) {
  if (!filename) {
    return error(new PrinterError(
      ErrorCodes.INVALID_ARGUMENT,
      'The "filename" parameter is required'
    ));
  }

  // Sanitize file path to prevent path traversal
  try {
    filename = sanitizeFilePath(filename);
  } catch (e) {
    return error(e);
  }

  // Verify the file exists
  try {
    fs.accessSync(filename, fs.constants.R_OK);
  } catch (e) {
    return error(new PrinterError(
      ErrorCodes.INVALID_PATH,
      `File not found or not readable: ${filename}`,
      { filename: filename }
    ));
  }

  // Try to define default printer name
  if (!printer) {
    printer = getDefaultPrinterName();
  }

  if (!printer) {
    return error(new PrinterError(
      ErrorCodes.PRINTER_NOT_FOUND,
      'No printer specified and no default printer found'
    ));
  }

  // Set filename if docname is missing
  if (!docname) {
    docname = path.basename(filename);
  }

  if (printer_helper.printFile) {
    // call C++ binding
    try {
      var res = printer_helper.printFile(filename, docname, printer, options);

      if (res && typeof res.then === 'function') {
        res.then(function(jobId) {
          success(jobId);
        }).catch(function(err) {
          error(err);
        });
      } else {
        // Robust validation: jobId must be a positive integer AND the string
        // representation must match (prevents CUPS errors like '401 Unauthorized'
        // from being parsed as jobId 401)
        var jobId = parseInt(res, 10);
        if (typeof res === 'number' && res > 0) {
          success(res);
        } else if (Number.isInteger(jobId) && jobId > 0 && String(jobId) === String(res).trim()) {
          success(jobId);
        } else {
          error(new PrinterError(
            ErrorCodes.PRINT_FAILED,
            'Failed to print file: ' + String(res),
            { filename: filename, printer: printer }
          ));
        }
      }
    } catch (e) {
      error(e);
    }
  } else {
    // Fallback for platforms where printFile is not natively supported (e.g. Windows).
    // Read the file and delegate to printDirect.
    try {
      var fileData = fs.readFileSync(filename);
      _executePrintDirect(
        fileData,
        printer,
        docname,
        'RAW',
        options,
        success,
        error
      );
    } catch (e) {
      error(new PrinterError(
        ErrorCodes.PRINT_FAILED,
        'Failed to read file for printing: ' + e.message,
        { filename: filename, printer: printer }
      ));
    }
  }
}
