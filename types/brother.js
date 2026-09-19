const PrinterType = require("./printer-type");

class Brother extends PrinterType {
  constructor() {
    super();
    this.config = require("./brother-config");
  }

  // ------------------------------ Set text size ------------------------------
  setTextSize(height, width) {
    if (height > 144 || height < 0)
      throw new Error("setTextSize: Height must be between 0 and 144");
    return Buffer.concat([
      Buffer.from([0x1b, 0x58, 0x00]),
      Buffer.from([height]),
      Buffer.from([0x00]),
    ]);
  }

  // ------------------------------ BARCODE ------------------------------
  printBarcode(data, type, settings) {
    settings = settings || {};

    const parts = [];

    // Data
    parts.push(Buffer.from([0x1b, 0x69]));

    //type
    parts.push(Buffer.from(type));
    //character below barcode
    parts.push(Buffer.from(settings.hri));
    //width
    parts.push(Buffer.from(settings.width));
    //height
    parts.push(Buffer.from("h"));

    if (settings.height < 255) {
      parts.push(
        Buffer.from(
          (settings.height.toString(16) + "").length < 2
            ? "0" + settings.height.toString(16)
            : settings.height.toString(16),
          "hex"
        )
      );
      parts.push(Buffer.from([0x00]));
    } else {
      const h = settings.height - 256;
      parts.push(
        Buffer.from(
          (h.toString(16) + "").length < 2
            ? "0" + h.toString(16)
            : h.toString(16),
          "hex"
        )
      );
      parts.push(Buffer.from([0x01]));
    }

    if (type === "tb" || type === "tc") {
      parts.push(Buffer.from(settings.o));
      parts.push(Buffer.from(settings.c));
    }
    //Parentheses deletion
    parts.push(Buffer.from(settings.e));
    //ratio between thick and thin bars
    parts.push(Buffer.from(settings.z));
    //equalize bar lengths
    parts.push(Buffer.from(settings.f));
    parts.push(Buffer.from([0x42]));
    //data
    parts.push(Buffer.from(data));
    //end
    parts.push(Buffer.from([0x5c]));

    return Buffer.concat(parts);
  }

  printQR(str, settings) {
    settings = settings || {};

    const parts = [];

    parts.push(Buffer.from([0x1b, 0x69, 0x51]));
    //Cell size
    parts.push(
      Buffer.from(
        (settings.cellSize.toString(16) + "").length < 2
          ? "0" + settings.cellSize.toString(16)
          : settings.cellSize.toString(16),
        "hex"
      )
    );

    //Symbol type
    parts.push(Buffer.from([0x02]));
    //Structured Append setting
    parts.push(Buffer.from([0x00]));
    // Code number
    parts.push(Buffer.from([0x00]));
    //Number of partitions
    parts.push(Buffer.from([0x00]));
    //Parity data
    parts.push(Buffer.from([0x00]));
    //Error correction level
    parts.push(Buffer.from([0x02]));
    //Data input method
    parts.push(Buffer.from([0x00]));
    //data
    parts.push(Buffer.from(str));
    parts.push(Buffer.from([0x5c, 0x5c, 0x5c]));

    return Buffer.concat(parts);
  }

  // ----------------------------------------------------- PRINT IMAGE BUFFER -----------------------------------------------------
  printImageBuffer(width, height, data) {
    const parts = [];
    parts.push(Buffer.from([0x1b, 33, 0x10]));

    // Get pixel rgba in 2D array
    const pixels = [];
    for (let i = 0; i < width; i++) {
      const line = [];
      for (let j = 0; j < height; j++) {
        const idx = (width * j + i) << 2;
        line.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: data[idx + 3],
        });
      }
      pixels.push(line);
    }

    for (let j = 0; j < Math.ceil(height / 48); j++) {
      const imageBufferArray = [];
      for (let i = 0; i < width; i++) {
        for (let g = 0; g < 6; g++) {
          let byte = 0x0;
          for (let k = 0; k < 8; k++) {
            let pixel = pixels[i][j * 48 + g * 8 + k];

            // Image overflow
            if (pixel === undefined) {
              pixel = { a: 0, r: 0, g: 0, b: 0 };
            }

            if (pixel.a > 126) {
              const grayscale = parseInt(
                0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b
              );
              if (grayscale < 128) {
                const mask = 1 << (7 - k);
                byte |= mask;
              }
            }
          }
          imageBufferArray.push(byte);
        }
      }

      parts.push(Buffer.from([0x1b, 0x2a, 72, width, 0x0]));
      parts.push(Buffer.from(imageBufferArray));
      parts.push(Buffer.from([0x0a]));
    }

    return Buffer.concat(parts);
  }

  SetInternationalCharacterSet(n) {
    return Buffer.concat([
      Buffer.from([0x1b, 0x52, n]),
    ]);
  }
}

module.exports = Brother;