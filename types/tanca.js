const PrinterType = require('./printer-type');

class Tanca extends PrinterType {
  constructor() {
    super();
    this.config = require('./tanca-config');
  }

  // ------------------------------ Beep ------------------------------
  beep() {
    return this.config.BEEP;
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

  // ------------------------------ QR ------------------------------
  printQR(str, settings) {
    settings = settings || {};

    const parts = [];

    // Select the QR code model
    if (settings.model) {
      if (settings.model === 1) parts.push(this.config.QRCODE_MODEL1);
      else if (settings.model === 3) parts.push(this.config.QRCODE_MODEL3);
      else parts.push(this.config.QRCODE_MODEL2);
    } else {
      parts.push(this.config.QRCODE_MODEL2);
    }

    // Set the size of module
    if (settings.cellSize) {
      const i = 'QRCODE_CELLSIZE_'.concat(settings.cellSize.toString());
      parts.push(this.config[i]);
    } else {
      parts.push(this.config.QRCODE_CELLSIZE_3);
    }

    // Select the error correction level
    if (settings.correction) {
      const i = 'QRCODE_CORRECTION_'.concat(settings.correction.toUpperCase());
      parts.push(this.config[i]);
    } else {
      parts.push(this.config.QRCODE_CORRECTION_M);
    }

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
    settings = settings || {};

    const parts = [];

    // Set error correction ratio 1 - 40
    parts.push(this.config.PDF417_CORRECTION);
    parts.push(Buffer.from([settings.correction || 0x01]));

    // Set row height 2 - 8
    parts.push(this.config.PDF417_ROW_HEIGHT);
    parts.push(Buffer.from([settings.rowHeight || 0x03]));

    // Set width of module 2 - 8
    parts.push(this.config.PDF417_WIDTH);
    parts.push(Buffer.from([settings.width || 0x03]));

    // Manually set columns 1 - 30, default auto
    parts.push(this.config.PDF417_COLUMNS);
    parts.push(Buffer.from([settings.columns || 0x00]));

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
    settings = settings || {};

    const parts = [];

    // Maxi Mode
    if (settings.mode) {
      if (settings.mode === 2) parts.push(this.config.MAXI_MODE2);
      else if (settings.mode === 3) parts.push(this.config.MAXI_MODE3);
      else if (settings.mode === 5) parts.push(this.config.MAXI_MODE5);
      else if (settings.mode === 6) parts.push(this.config.MAXI_MODE6);
      else parts.push(this.config.MAXI_MODE4);
    } else {
      parts.push(this.config.MAXI_MODE4);
    }

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
    settings = settings || {};

    const parts = [];

    // Set HRI characters Position, 0-3 (none, top, bottom, top/bottom)
    if (settings.hriPos) {
      parts.push(Buffer.from([0x1d, 0x48])); // GS H
      parts.push(Buffer.from([settings.hriPos]));
    } else {
      parts.push(Buffer.from([0x1d, 0x48, 0x00]));
    }

    // Set HRI character font
    if (settings.hriFont) {
      parts.push(Buffer.from([0x1d, 0x66])); // GS f
      parts.push(Buffer.from([settings.hriFont]));
    } else {
      parts.push(Buffer.from([0x1d, 0x66, 0x00]));
    }

    // Set width 2-6, default 3
    if (settings.width) {
      parts.push(Buffer.from([0x1d, 0x77])); // GS W
      parts.push(Buffer.from([settings.width]));
    } else {
      parts.push(Buffer.from([0x1d, 0x77, 0x03]));
    }

    // Set height 1 - 255 default 162
    if (settings.height) {
      parts.push(Buffer.from([0x1d, 0x68])); // GS h
      parts.push(Buffer.from([settings.height]));
    } else {
      parts.push(Buffer.from([0x1d, 0x68, 0xA2]));
    }

    // Print Barcode
    parts.push(Buffer.from([0x1d, 0x6b])); // GS k
    // Select type and bit length of data
    parts.push(Buffer.from([type, data.length]));
    // Data
    parts.push(Buffer.from(data));

    return Buffer.concat(parts);
  }

  // ----------------------------------------------------- PRINT IMAGE BUFFER -----------------------------------------------------
  printImageBuffer(width, height, data) {
    // Get pixel rgba in 2D array
    const pixels = [];
    for (let i = 0; i < height; i++) {
      const line = [];
      for (let j = 0; j < width; j++) {
        const idx = (width * i + j) << 2;
        line.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: data[idx + 3],
        });
      }
      pixels.push(line);
    }

    const imageBufferArray = [];
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < Math.ceil(width / 8); j++) {
        let byte = 0x0;
        for (let k = 0; k < 8; k++) {
          let pixel = pixels[i][j * 8 + k];

          // Image overflow
          if (pixel === undefined) {
            pixel = { a: 0, r: 0, g: 0, b: 0 };
          }

          if (pixel.a > 126) {
            const grayscale = parseInt(0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b);
            if (grayscale < 128) {
              const mask = 1 << (7 - k);
              byte |= mask;
            }
          }
        }
        imageBufferArray.push(byte);
      }
    }

    const imageBuffer = Buffer.from(imageBufferArray);

    // Print raster bit image
    let rasterWidth = width;
    if (rasterWidth % 8 !== 0) {
      rasterWidth += 8;
    }

    return Buffer.concat([
      Buffer.from([0x1d, 0x76, 0x30, 48]),
      Buffer.from([(rasterWidth >> 3) & 0xff]),
      Buffer.from([0x00]),
      Buffer.from([height & 0xff]),
      Buffer.from([(height >> 8) & 0xff]),
      imageBuffer,
    ]);
  }
}

module.exports = Tanca;
