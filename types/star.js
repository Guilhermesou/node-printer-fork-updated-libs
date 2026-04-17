const PrinterType = require('./printer-type');

class Star extends PrinterType {
  constructor() {
    super();
    this.config = require('./star-config');
  }

  // ------------------------------ QR ------------------------------
  printQR(str, settings) {
    settings = settings || {};

    const parts = [];

    const config = {
      model: this.config.QRCODE_MODEL1,
      correctionLevel: this.config.QRCODE_CORRECTION_M,
      cellSize: this.config.QRCODE_CELLSIZE_4,
    };

    const models = {
      1: this.config.QRCODE_MODEL1,
      2: this.config.QRCODE_MODEL2,
    };

    const correctionLevels = {
      L: this.config.QRCODE_CORRECTION_L,
      M: this.config.QRCODE_CORRECTION_M,
      Q: this.config.QRCODE_CORRECTION_Q,
      H: this.config.QRCODE_CORRECTION_H,
    };

    const cellSizes = {
      1: this.config.QRCODE_CELLSIZE_1,
      2: this.config.QRCODE_CELLSIZE_2,
      3: this.config.QRCODE_CELLSIZE_3,
      4: this.config.QRCODE_CELLSIZE_4,
      5: this.config.QRCODE_CELLSIZE_5,
      6: this.config.QRCODE_CELLSIZE_6,
      7: this.config.QRCODE_CELLSIZE_7,
      8: this.config.QRCODE_CELLSIZE_8,
    };

    if (models[settings.model]) config.model = models[settings.model];
    if (correctionLevels[settings.correctionLevel]) config.correctionLevel = correctionLevels[settings.correctionLevel];
    if (cellSizes[settings.cellSize]) config.cellSize = cellSizes[settings.cellSize];

    // Set QR code model
    parts.push(config.model);

    // Set QR code mistake correction level
    parts.push(config.correctionLevel);

    // Set QR code cell size
    parts.push(config.cellSize);

    // Set QR code cell size (Auto Setting) data
    const s = str.length;
    const lsb = parseInt(s % 256);
    const msb = parseInt(s / 256);

    parts.push(Buffer.from([lsb, msb])); // nL, nH
    parts.push(Buffer.from(str.toString())); // Data
    parts.push(Buffer.from([0x0a])); // NL (new line)

    // Print QR code
    parts.push(this.config.QRCODE_PRINT);

    return Buffer.concat(parts);
  }

  // ------------------------------ PDF417 ------------------------------
  pdf417(data, settings) {
    if (settings) {
      throw new Error('PDF417 settings not yet available for star printers!');
    }

    const parts = [];

    // Set PDF417 bar code size
    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x53, 0x30, 0x00, 0x01, 0x02]));

    // Set PDF417 ECC (security level)
    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x53, 0x31, 0x02]));

    // Set PDF417 module X direction size
    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x53, 0x32, 0x02]));

    // Set PDF417 module aspect ratio
    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x53, 0x33, 0x03]));

    // Set PDF417 bar code data
    const s = data.length;
    const lsb = parseInt(s % 256);
    const msb = parseInt(s / 256);

    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x44]));
    parts.push(Buffer.from([lsb, msb])); // nL, nH
    parts.push(Buffer.from(data.toString())); // Data
    parts.push(Buffer.from([0x0a])); // NL (new line)

    // Print PDF417 bar code
    parts.push(Buffer.from([0x1b, 0x1d, 0x78, 0x50]));

    return Buffer.concat(parts);
  }

  // ------------------------------ CODE128 ------------------------------
  code128(data, settings) {
    const parts = [];

    parts.push(this.config.BARCODE_CODE128);

    // Barcode option
    if (settings) {
      if (settings.text === 1) parts.push(this.config.BARCODE_CODE128_TEXT_1);
      else if (settings.text === 2) parts.push(this.config.BARCODE_CODE128_TEXT_2);
      else if (settings.text === 3) parts.push(this.config.BARCODE_CODE128_TEXT_3);
      else if (settings.text === 4) parts.push(this.config.BARCODE_CODE128_TEXT_4);
    } else {
      parts.push(this.config.BARCODE_CODE128_TEXT_2);
    }

    // Barcode width
    if (settings) {
      if (settings.width === 'SMALL') parts.push(this.config.BARCODE_CODE128_WIDTH_SMALL);
      else if (settings.width === 'MEDIUM') parts.push(this.config.BARCODE_CODE128_WIDTH_MEDIUM);
      else if (settings.width === 'LARGE') parts.push(this.config.BARCODE_CODE128_WIDTH_LARGE);
    } else {
      parts.push(this.config.BARCODE_CODE128_WIDTH_LARGE);
    }

    // Barcode height
    if (settings && settings.height) parts.push(Buffer.from([settings.height]));
    else parts.push(Buffer.from([0x50]));

    // Barcode data
    parts.push(Buffer.from(data.toString()));

    // Append RS(record separator)
    parts.push(Buffer.from([0x1e]));

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

    const parts = [];
    parts.push(Buffer.from([0x1b, 0x30]));

    // v3
    for (let i = 0; i < Math.ceil(height / 24); i++) {
      const imageBufferArray = [];
      for (let y = 0; y < 24; y++) {
        for (let j = 0; j < Math.ceil(width / 8); j++) {
          let byte = 0x0;
          for (let x = 0; x < 8; x++) {
            if ((i * 24 + y < pixels.length) && (j * 8 + x < pixels[i * 24 + y].length)) {
              const pixel = pixels[i * 24 + y][j * 8 + x];
              if (pixel.a > 126) {
                const grayscale = parseInt(0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b);
                if (grayscale < 128) {
                  const mask = 1 << (7 - x);
                  byte |= mask;
                }
              }
            }
          }
          imageBufferArray.push(byte);
        }
      }
      const imageBuffer = Buffer.from(imageBufferArray);
      parts.push(Buffer.from([0x1b, 0x6b, parseInt(imageBuffer.length / 24), 0x00]));
      parts.push(imageBuffer);
      parts.push(Buffer.from('\n'));
    }

    parts.push(Buffer.from([0x1b, 0x7a, 0x01]));

    return Buffer.concat(parts);
  }

  // ------------------------------ BARCODE ------------------------------
  printBarcode(data, type, settings) {
    settings = settings || {};

    const parts = [];

    // ESC b n1 n2 n3 n4 d1...dk RS
    parts.push(Buffer.from([0x1b, 0x62]));

    // n1 - Barcode type selection
    parts.push(Buffer.from([type || 7]));

    // n2 - Under-bar character selection and added line feed selection
    parts.push(Buffer.from([settings.characters || 1]));

    // n3 - Barcode mode selection
    parts.push(Buffer.from([settings.mode || 2]));

    // n4 - Barcode height (dot count)
    parts.push(Buffer.from([settings.height || 150]));

    // d - Barcode data
    parts.push(Buffer.from(data));

    // RS (record separator)
    parts.push(Buffer.from([0x1e]));

    return Buffer.concat(parts);
  }
}

module.exports = Star;
