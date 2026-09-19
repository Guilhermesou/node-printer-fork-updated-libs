/**
 * Base class for all printer type drivers.
 * Subclasses should override methods they support.
 * Unimplemented methods throw errors instead of silently returning null.
 */
class PrinterType {
  constructor() {
    this.buffer = null;
    this.config = null;
  }

  /**
   * Common append implementation shared by all drivers.
   * Concatenates buffer data.
   * @param {Buffer} appendBuffer - Data to append
   */
  append(appendBuffer) {
    if (this.buffer) {
      this.buffer = Buffer.concat([this.buffer, appendBuffer]);
    } else {
      this.buffer = appendBuffer;
    }
  }

  /**
   * Common printImage implementation for PNG files.
   * Reads a PNG file and delegates to printImageBuffer.
   * @param {string} image - Path to PNG file
   * @returns {Buffer} The image command buffer
   */
  async printImage(image) {
    const fs = require('fs');
    const { PNG } = require('pngjs');
    fs.accessSync(image);
    const data = fs.readFileSync(image);
    const png = PNG.sync.read(data);
    return this.printImageBuffer(png.width, png.height, png.data);
  }

  beep() {
    throw new Error(`'beep' is not supported by ${this.constructor.name} printer type`);
  }

  setTextSize(height, width) {
    throw new Error(`'setTextSize' is not supported by ${this.constructor.name} printer type`);
  }

  printQR(str, settings) {
    throw new Error(`'printQR' is not supported by ${this.constructor.name} printer type`);
  }

  pdf417(data, settings) {
    throw new Error(`'pdf417' is not supported by ${this.constructor.name} printer type`);
  }

  code128(data, settings) {
    throw new Error(`'code128' is not supported by ${this.constructor.name} printer type`);
  }

  maxiCode(data, settings) {
    throw new Error(`'maxiCode' is not supported by ${this.constructor.name} printer type`);
  }

  printBarcode(data, type, settings) {
    throw new Error(`'printBarcode' is not supported by ${this.constructor.name} printer type`);
  }

  printImageBuffer(width, height, data) {
    throw new Error(`'printImageBuffer' is not supported by ${this.constructor.name} printer type`);
  }
}

module.exports = PrinterType;
