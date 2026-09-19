const PrinterType = require('./printer-type');

class Epson extends PrinterType {
  constructor() {
    super();
    this.config = require('./epson-config');
  }

  // ------------------------------ Get paper status ------------------------------
  getStatus() {
    // https://www.epson-biz.com/modules/ref_escpos/index.php?content_id=124#gs_lr
    return this.config.TRANSMIT_PAPER_STATUS;
  }

  // ------------------------------ Beep ------------------------------
  // "numberOfBeeps" is the number of beeps from 1 to 9
  // "lengthOfTheSound" is the length of the sound from 1 to 9 (it's not in seconds, it's just the preset value)
  beep(numberOfBeeps = 1, lengthOfTheSound = 1) {
    if (numberOfBeeps < 1 || numberOfBeeps > 9) throw new Error('numberOfBeeps: Value must be between 1 and 9');
    if (lengthOfTheSound < 1 || lengthOfTheSound > 9) throw new Error('lengthOfTheSound: Value must be between 1 and 9');
    return Buffer.concat([
      this.config.BEEP,
      Buffer.from([numberOfBeeps, lengthOfTheSound]),
    ]);
  }

  // ------------------------------ Set text size ------------------------------
  setTextSize(height, width) {
    if (height > 7 || height < 0) throw new Error('setTextSize: Height must be between 0 and 7');
    if (width > 7 || width < 0) throw new Error('setTextSize: Width must be between 0 and 7');
    const x = Buffer.from(`${height}${width}`, 'hex');
    return Buffer.concat([
      Buffer.from([0x1D, 0x21]),
      x,
    ]);
  }

  // ------------------------------ CODE 128 ------------------------------
  code128(data, settings) {
    settings = {
      hriPos: 0,
      hriFont: 0,
      width: 3,
      height: 162,
      ...settings
    };

    const parts = [];

    // Set HRI characters Position, 0-3 (none, top, bottom, top/bottom), default 0 none
    parts.push(Buffer.from([0x1d, 0x48])); // GS H
    parts.push(Buffer.from([settings.hriPos]));

    // Set HRI character font. 0-4, 48-52, 97, 98 (depending on printer, 0 and 1 available on all), default 0
    parts.push(Buffer.from([0x1d, 0x66])); // GS f
    parts.push(Buffer.from([settings.hriFont]));

    // Set width 2-6, default 3
    parts.push(Buffer.from([0x1d, 0x77])); // GS W
    parts.push(Buffer.from([settings.width]));

    // Set height 1 - 255 default 162
    parts.push(Buffer.from([0x1d, 0x68])); // GS h
    parts.push(Buffer.from([settings.height]));

    // Print Barcode
    parts.push(this.config.BARCODE_CODE128);
    parts.push(Buffer.from([data.length + 2]));
    parts.push(Buffer.from([0x7b, 0x42]));

    // Data
    parts.push(Buffer.from(data));

    return Buffer.concat(parts);
  }

  // ------------------------------ QR ------------------------------
  printQR(str, settings) {
    settings = {
      model: 2,
      cellSize: 3,
      correction: 'M',
      ...settings
    };

    const parts = [];

    // Select the QR code model
    if (settings.model === 1) parts.push(this.config.QRCODE_MODEL1);
    else if (settings.model === 3) parts.push(this.config.QRCODE_MODEL3);
    else parts.push(this.config.QRCODE_MODEL2);

    // Set the size of module
    const size = 'QRCODE_CELLSIZE_'.concat(settings.cellSize.toString());
    parts.push(this.config[size]);

    // Select the error correction level
    const correction = 'QRCODE_CORRECTION_'.concat(settings.correction.toUpperCase());
    parts.push(this.config[correction]);

    // Store the data in the symbol storage area
    const s = str.length + 3;
    const lsb = parseInt(s % 256);
    const msb = parseInt(s / 256);
    parts.push(Buffer.from([0x1d, 0x28, 0x6b, lsb, msb, 0x31, 0x50, 0x30]));
    parts.push(Buffer.from(str));

    // Print the symbol data in the symbol storage area
    parts.push(this.config.QRCODE_PRINT);

    return Buffer.concat(parts);
  }

  // ------------------------------ PDF417 ------------------------------
  pdf417(data, settings) {
    settings = {
      correction: 1,
      rowHeight: 3,
      width: 3,
      columns: 0,
      truncated: false,
      ...settings
    };

    const parts = [];

    // Set error correction ratio 1 - 40, default 1
    parts.push(this.config.PDF417_CORRECTION);
    parts.push(Buffer.from([settings.correction]));

    // Set row height 2 - 8, default 3
    parts.push(this.config.PDF417_ROW_HEIGHT);
    parts.push(Buffer.from([settings.rowHeight]));

    // Set width of module 2 - 8, default 3
    parts.push(this.config.PDF417_WIDTH);
    parts.push(Buffer.from([settings.width]));

    // Manually set columns 1 - 30, default auto
    parts.push(this.config.PDF417_COLUMNS);
    parts.push(Buffer.from([settings.columns]));

    // Standard or truncated option
    if (settings.truncated) parts.push(this.config.PDF417_OPTION_TRUNCATED);
    else parts.push(this.config.PDF417_OPTION_STANDARD);

    // Set PDF417 bar code data
    const s = data.length + 3;
    const lsb = parseInt(s % 256);
    const msb = parseInt(s / 256);

    parts.push(Buffer.from([0x1d, 0x28, 0x6b, lsb, msb, 0x30, 0x50, 0x30]));
    parts.push(Buffer.from(data.toString()));

    // Print barcode
    parts.push(Buffer.from(this.config.PDF417_PRINT));

    return Buffer.concat(parts);
  }

  // ------------------------------ MAXI CODE ------------------------------
  maxiCode(data, settings) {
    settings = {
      mode: 4,
      ...settings
    };

    const parts = [];

    // Maxi Mode
    if (settings.mode === 2) parts.push(this.config.MAXI_MODE2);
    else if (settings.mode === 3) parts.push(this.config.MAXI_MODE3);
    else if (settings.mode === 5) parts.push(this.config.MAXI_MODE5);
    else if (settings.mode === 6) parts.push(this.config.MAXI_MODE6);
    else parts.push(this.config.MAXI_MODE4);

    // Setup size of MaxiCode data
    const s = data.length + 3;
    const lsb = parseInt(s % 256);
    const msb = parseInt(s / 256);

    // Send Data
    parts.push(Buffer.from([0x1d, 0x28, 0x6b, lsb, msb, 0x32, 0x50, 0x30]));
    parts.push(Buffer.from(data.toString()));

    // Print barcode
    parts.push(this.config.MAXI_PRINT);

    return Buffer.concat(parts);
  }

  // ------------------------------ BARCODE ------------------------------
  printBarcode(data, type, settings) {
    settings = {
      hriPos: 0,
      hriFont: 0,
      width: 3,
      height: 162,
      ...settings
    };

    const parts = [];

    // Set HRI characters Position, 0-3 (none, top, bottom, top/bottom)
    parts.push(Buffer.from([0x1d, 0x48])); // GS H
    parts.push(Buffer.from([settings.hriPos]));

    // Set HRI character font. 0-4, 48-52, 97, 98
    parts.push(Buffer.from([0x1d, 0x66])); // GS f
    parts.push(Buffer.from([settings.hriFont]));

    // Set width 2-6, default 3
    parts.push(Buffer.from([0x1d, 0x77])); // GS W
    parts.push(Buffer.from([settings.width]));

    // Set height 1 - 255 default 162
    parts.push(Buffer.from([0x1d, 0x68])); // GS h
    parts.push(Buffer.from([settings.height]));

    // Print Barcode
    parts.push(Buffer.from([0x1d, 0x6b])); // GS k

    // Select type and bit length of data
    if (type === 73) {
      parts.push(Buffer.from([type, data.length + 2]));
      parts.push(Buffer.from([0x7b, 0x42]));
    } else {
      parts.push(Buffer.from([type, data.length]));
    }

    // Data
    parts.push(Buffer.from(data));

    return Buffer.concat(parts);
  }

  // https://reference.epson-biz.com/modules/ref_escpos/index.php?content_id=88
  printImageBuffer(width, height, data) {
    // 1. Convert to Grayscale and Buffer handling
    // We create a float array for dithering errors
    const grayscaleData = new Float32Array(width * height);
    
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const idx = (width * i + j) << 2;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // If transparent, treat as white (255)
        if (a < 127) {
          grayscaleData[width * i + j] = 255;
        } else {
          // Standard Luma conversion
          grayscaleData[width * i + j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
      }
    }

    // 2. Floyd-Steinberg Dithering
    const threshold = 127;
    const bitmask = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = grayscaleData[idx];
        const newPixel = oldPixel < threshold ? 0 : 255;
        bitmask[idx] = newPixel === 0 ? 1 : 0; // 1 is black in ESC/POS

        const error = oldPixel - newPixel;

        // Distribute error to neighbors
        if (x + 1 < width) grayscaleData[idx + 1] += (error * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) grayscaleData[idx + width - 1] += (error * 3) / 16;
          grayscaleData[idx + width] += (error * 5) / 16;
          if (x + 1 < width) grayscaleData[idx + width + 1] += (error * 1) / 16;
        }
      }
    }

    // 3. Pack bits into bytes for ESC/POS
    const rasterWidthBytes = Math.ceil(width / 8);
    const imageBuffer = Buffer.alloc(rasterWidthBytes * height, 0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (bitmask[y * width + x]) {
          const byteIdx = y * rasterWidthBytes + (x >> 3);
          const bitIdx = 7 - (x % 8);
          imageBuffer[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    // 4. ESC/POS Header (GS v 0)
    // 1D 76 30 m xL xH yL yH d1...dk
    const header = Buffer.from([
      0x1d, 0x76, 0x30, 0, // Mode 0 (Normal)
      rasterWidthBytes & 0xff,
      (rasterWidthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff
    ]);

    return Buffer.concat([header, imageBuffer]);
  }
}

module.exports = Epson;
