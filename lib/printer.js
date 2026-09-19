const { PNG } = require('pngjs');
const iconv = require('iconv-lite');

const PrinterTypes = {
  EPSON: 'epson',
  TANCA: 'tanca',
  STAR: 'star',
  DARUMA: 'daruma',
  BROTHER: 'brother',
};

const BreakLine = {
  NONE: 'NONE',
  CHARACTER: 'CHARACTER',
  WORD: 'WORD',
};

const CharacterSet = {
  PC437_USA: 'PC437_USA',
  PC850_MULTILINGUAL: 'PC850_MULTILINGUAL',
  PC860_PORTUGUESE: 'PC860_PORTUGUESE',
  PC863_CANADIAN_FRENCH: 'PC863_CANADIAN_FRENCH',
  PC865_NORDIC: 'PC865_NORDIC',
  PC851_GREEK: 'PC851_GREEK',
  PC857_TURKISH: 'PC857_TURKISH',
  PC737_GREEK: 'PC737_GREEK',
  ISO8859_7_GREEK: 'ISO8859_7_GREEK',
  WPC1252: 'WPC1252',
  PC866_CYRILLIC2: 'PC866_CYRILLIC2',
  PC852_LATIN2: 'PC852_LATIN2',
  SLOVENIA: 'SLOVENIA',
  PC858_EURO: 'PC858_EURO',
  WPC775_BALTIC_RIM: 'WPC775_BALTIC_RIM',
  PC855_CYRILLIC: 'PC855_CYRILLIC',
  PC861_ICELANDIC: 'PC861_ICELANDIC',
  PC862_HEBREW: 'PC862_HEBREW',
  PC864_ARABIC: 'PC864_ARABIC',
  PC869_GREEK: 'PC869_GREEK',
  ISO8859_2_LATIN2: 'ISO8859_2_LATIN2',
  ISO8859_15_LATIN9: 'ISO8859_15_LATIN9',
  PC1125_UKRANIAN: 'PC1125_UKRANIAN',
  WPC1250_LATIN2: 'WPC1250_LATIN2',
  WPC1251_CYRILLIC: 'WPC1251_CYRILLIC',
  WPC1253_GREEK: 'WPC1253_GREEK',
  WPC1254_TURKISH: 'WPC1254_TURKISH',
  WPC1255_HEBREW: 'WPC1255_HEBREW',
  WPC1256_ARABIC: 'WPC1256_ARABIC',
  WPC1257_BALTIC_RIM: 'WPC1257_BALTIC_RIM',
  WPC1258_VIETNAMESE: 'WPC1258_VIETNAMESE',
  KZ1048_KAZAKHSTAN: 'KZ1048_KAZAKHSTAN',
  JAPAN: 'JAPAN',
  KOREA: 'KOREA',
  CHINA: 'CHINA',
  HK_TW: 'HK_TW',
  TCVN_VIETNAMESE: 'TCVN_VIETNAMESE',
}

class Printer {
  constructor(initConfig) {
    this.buffer = null;
    this.config = null;
    this.printer = null;
    this.types = PrinterTypes;

    switch (initConfig.type) {
      case this.types.STAR:
        const Star = require('../types/star');
        this.printer = new Star();
        break;
      case this.types.TANCA:
        const Tanca = require('../types/tanca');
        this.printer = new Tanca();
        break;
      case this.types.DARUMA:
        const Daruma = require('../types/daruma');
        this.printer = new Daruma();
        break;
      case this.types.BROTHER:
        const Brother = require('../types/brother');
        this.printer = new Brother();
        break;
      default:
        const Epson = require('../types/epson');
        this.printer = new Epson();
        break;
    }

    this.config = {
      type: initConfig.type,
      width: parseInt(initConfig.width) || 48,
      characterSet: initConfig.characterSet,
      removeSpecialCharacters: initConfig.removeSpecialCharacters || false,
      lineCharacter: initConfig.lineCharacter || '-',
      breakLine: initConfig.breakLine || BreakLine.WORD,
      options: initConfig.options,
    };

    // Set initial code page.
    if (this.config.characterSet) this.setCharacterSet(this.config.characterSet);
  }

  cut({ verticalTabAmount = 2 } = {}) {
    for (let i = 0; i < verticalTabAmount; i++) {
      this.append(this.printer.config.CTL_VT);
    }

    this.append(this.printer.config.PAPER_FULL_CUT);
    this.initHardware();
    return this;
  }

  partialCut({ verticalTabAmount = 2 } = {}) {
    for (let i = 0; i < verticalTabAmount; i++) {
      this.append(this.printer.config.CTL_VT);
    }

    this.append(this.printer.config.PAPER_PART_CUT);
    this.initHardware();
    return this;
  }

  initHardware() {
    this.append(this.printer.config.HW_INIT);
    return this;
  }

  getWidth() {
    return parseInt(this.config.width);
  }

  getText() {
    return this.buffer ? this.buffer.toString() : '';
  }

  getBuffer() {
    return this.buffer || Buffer.alloc(0);
  }

  setBuffer(newBuffer) {
    this.buffer = Buffer.from(newBuffer);
  }

  clear() {
    this.buffer = null;
    if (this.config.characterSet) {
      this.setCharacterSet(this.config.characterSet);
    }
    return this;
  }

  add(buffer) {
    this.append(buffer);
  }

  print(text) {
    text = text || '';
    if (this.config.breakLine != BreakLine.NONE) { // Break lines
      text = this._fold(text, this.config.width, this.config.breakLine == BreakLine.CHARACTER).join("\n");
    }
    this.append(text.toString());
    return this;
  }

  println(text) {
    this.print(text);
    this.append('\n');
    return this;
  }

  printVerticalTab() {
    this.append(this.printer.config.CTL_VT);
    return this;
  }

  bold(enabled) {
    if (enabled) this.append(this.printer.config.TXT_BOLD_ON);
    else this.append(this.printer.config.TXT_BOLD_OFF);
    return this;
  }

  underline(enabled) {
    if (enabled) this.append(this.printer.config.TXT_UNDERL_ON);
    else this.append(this.printer.config.TXT_UNDERL_OFF);
    return this;
  }

  underlineThick(enabled) {
    if (enabled) this.append(this.printer.config.TXT_UNDERL2_ON);
    else this.append(this.printer.config.TXT_UNDERL_OFF);
    return this;
  }

  upsideDown(enabled) {
    if (enabled) this.append(this.printer.config.UPSIDE_DOWN_ON);
    else this.append(this.printer.config.UPSIDE_DOWN_OFF);
    return this;
  }

  invert(enabled) {
    if (enabled) this.append(this.printer.config.TXT_INVERT_ON);
    else this.append(this.printer.config.TXT_INVERT_OFF);
    return this;
  }

  openCashDrawer() {
    if (this.config.type === this.types.STAR) {
      this.append(this.printer.config.CD_KICK);
    } else {
      this.append(this.printer.config.CD_KICK_2);
      this.append(this.printer.config.CD_KICK_5);
    }
    return this;
  }

  alignCenter() {
    this.append(this.printer.config.TXT_ALIGN_CT);
    return this;
  }

  alignLeft() {
    this.append(this.printer.config.TXT_ALIGN_LT);
    return this;
  }

  alignRight() {
    this.append(this.printer.config.TXT_ALIGN_RT);
    return this;
  }

  setTypeFontA() {
    this.append(this.printer.config.TXT_FONT_A);
    return this;
  }

  setTypeFontB() {
    this.append(this.printer.config.TXT_FONT_B);
    return this;
  }

  setTextNormal() {
    this.append(this.printer.config.TXT_NORMAL);
    return this;
  }

  setTextDoubleHeight() {
    this.append(this.printer.config.TXT_2HEIGHT);
    return this;
  }

  setTextDoubleWidth() {
    this.append(this.printer.config.TXT_2WIDTH);
    return this;
  }

  setTextQuadArea() {
    this.append(this.printer.config.TXT_4SQUARE);
    return this;
  }

  setTextSize(height, width) {
    this.append(this.printer.setTextSize(height, width));
    return this;
  }

  // ----------------------------------------------------- NEW LINE -----------------------------------------------------
  newLine() {
    this.append(this.printer.config.CTL_LF);
    return this;
  }

  // ----------------------------------------------------- DRAW LINE -----------------------------------------------------
  drawLine(character = this.config.lineCharacter) {
    for (let i = 0; i < this.config.width; i++) {
      this.append(Buffer.from(character));
    }
    this.newLine();
    return this;
  }

  // ----------------------------------------------------- LEFT RIGHT -----------------------------------------------------
  leftRight(left, right) {
    this.append(left.toString());
    const width = this.config.width - left.toString().length - right.toString().length;
    for (let i = 0; i < width; i++) {
      this.append(Buffer.from(' '));
    }
    this.append(right.toString());
    this.newLine();
    return this;
  }

  // ----------------------------------------------------- TABLE -----------------------------------------------------
  table(data) {
    const cellWidth = this.config.width / data.length;
    for (let i = 0; i < data.length; i++) {
      this.append(data[i].toString());
      const spaces = cellWidth - data[i].toString().length;
      for (let j = 0; j < spaces; j++) {
        this.append(Buffer.from(' '));
      }
    }
    this.newLine();
    return this;
  }

  // ----------------------------------------------------- TABLE CUSTOM -----------------------------------------------------
  // Options: text, align, width, bold
  tableCustom(data) {
    let cellWidth = this.config.width / data.length;
    const secondLine = [];
    let secondLineEnabled = false;

    for (let i = 0; i < data.length; i++) {
      let tooLong = false;
      const obj = data[i];
      obj.text = obj.text.toString();

      if (obj.width) {
        cellWidth = this.config.width * obj.width;
      } else if (obj.cols) {
        cellWidth = obj.cols;
      }

      if (obj.bold) {
        this.bold(true);
      }

      // If text is too wide go to next line
      if (cellWidth < obj.text.length) {
        tooLong = true;
        obj.originalText = obj.text;
        obj.text = obj.text.substring(0, cellWidth - 1);
      }

      if (obj.align == 'CENTER') {
        const spaces = (cellWidth - obj.text.toString().length) / 2;
        for (let j = 0; j < spaces; j++) {
          this.append(Buffer.from(' '));
        }
        if (obj.text != '') this.append(obj.text);
        for (let j = 0; j < spaces - 1; j++) {
          this.append(Buffer.from(' '));
        }
      } else if (obj.align == 'RIGHT') {
        const spaces = cellWidth - obj.text.toString().length;
        for (let j = 0; j < spaces; j++) {
          this.append(Buffer.from(' '));
        }
        if (obj.text != '') this.append(obj.text);
      } else {
        if (obj.text != '') this.append(obj.text);
        const spaces = cellWidth - obj.text.toString().length;
        for (let j = 0; j < spaces; j++) {
          this.append(Buffer.from(' '));
        }
      }

      if (obj.bold) {
        this.bold(false);
      }

      if (tooLong) {
        secondLineEnabled = true;
        obj.text = obj.originalText.substring(cellWidth - 1);
        secondLine.push(obj);
      } else {
        obj.text = '';
        secondLine.push(obj);
      }
    }

    this.newLine();
    // Print the second line
    if (secondLineEnabled) {
      this.tableCustom(secondLine);
    }
    return this;
  }

  // ----------------------------------------------------- BEEP -----------------------------------------------------
  beep(numberOfBeeps, lengthOfTheSound) {
    this.append(this.printer.beep(numberOfBeeps, lengthOfTheSound));
    return this;
  }

  // ----------------------------------------------------- PRINT QR -----------------------------------------------------
  printQR(data, settings) {
    this.append(this.printer.printQR(data, settings));
    return this;
  }

  // ----------------------------------------------------- PRINT BARCODE -----------------------------------------------------
  printBarcode(data, type, settings) {
    this.append(this.printer.printBarcode(data, type, settings));
    return this;
  }

  // ----------------------------------------------------- PRINT MAXICODE -----------------------------------------------------
  maxiCode(data, settings) {
    this.append(this.printer.maxiCode(data, settings));
    return this;
  }

  // ----------------------------------------------------- PRINT CODE128 -----------------------------------------------------
  code128(data, settings) {
    this.append(this.printer.code128(data, settings));
    return this;
  }

  // ----------------------------------------------------- PRINT PDF417 -----------------------------------------------------
  pdf417(data, settings) {
    this.append(this.printer.pdf417(data, settings));
    return this;
  }

  // ----------------------------------------------------- PRINT IMAGE -----------------------------------------------------
  async printImage(image) {
    const fs = require('fs');
    const path = require('path');

    if (!image || typeof image !== 'string') {
      throw new Error('Image path must be a non-empty string.');
    }

    // Resolve and validate path
    const resolvedPath = path.resolve(image);

    // Check if file exists
    fs.accessSync(resolvedPath, fs.constants.R_OK);

    // Check for file type
    if (path.extname(resolvedPath).toLowerCase() !== '.png') {
      throw new Error('Image printing supports only PNG files.');
    }

    const response = await this.printer.printImage(resolvedPath);
    this.append(response);
    return response;
  }

  // ----------------------------------------------------- PRINT IMAGE BUFFER -----------------------------------------------------
  async printImageBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('printImageBuffer requires a Buffer argument.');
    }
    const png = PNG.sync.read(buffer);
    const buff = this.printer.printImageBuffer(png.width, png.height, png.data);
    this.append(buff);
    return buff;
  }

  /**
   * Print pixels as an image (useful for Canvas ImageData)
   * @param {Buffer|Uint8Array} data - RGBA pixel data
   * @param {number} width 
   * @param {number} height 
   */
  async printImagePixels(data, width, height) {
    if (!data || !width || !height) {
      throw new Error('printImagePixels requires data, width and height.');
    }
    const buff = this.printer.printImageBuffer(width, height, data);
    this.append(buff);
    return buff;
  }

  /**
   * @deprecated Use Object.assign() or spread operator instead.
   */
  mergeObjects(obj1, obj2) {
    return Object.assign({}, obj1, obj2);
  }

  // ------------------------------ Set character set ------------------------------
  setCharacterSet(characterSet) {
    const buffer = this.printer.config[`CODE_PAGE_${characterSet}`];
    if (buffer) {
      this.append(buffer);
      this.config.codePage = characterSet;
    } else {
      throw new Error(`Code page not recognized: '${characterSet}'`);
    }
  }

  // ------------------------------ Append ------------------------------
  append(text) {
    if (typeof text === 'string') {
      // Remove special characters.
      if (this.config.removeSpecialCharacters) {
        const unorm = require('unorm');
        const combining = /[\u0300-\u036F]/g;
        text = unorm.nfkd(text).replace(combining, '');
      }

      let endBuff = null;
      for (const char of text) {
        let code = char;
        if (!/^[\x00-\x7F]$/.test(char)) {
          // Test if the active code page can print the current character.
          try {
            code = iconv.encode(char, this.printer.config.CODE_PAGES[this.config.codePage]);
          } catch (e) {
            // Probably encoding not recognized.
            console.error(e);
            code = '?';
          }

          if (code.toString() === '?') {
            // Character not available in active code page, now try all other code pages.
            for (const tmpCodePageKey of Object.keys(this.printer.config.CODE_PAGES)) {
              const tmpCodePage = this.printer.config.CODE_PAGES[tmpCodePageKey];

              try {
                code = iconv.encode(char, tmpCodePage);
              } catch (e) {
                // Probably encoding not recognized.
                console.error(e);
              }

              if (code.toString() !== '?') {
                // We found a match, change active code page.
                this.config.codePage = tmpCodePageKey;
                code = Buffer.concat([this.printer.config[`CODE_PAGE_${tmpCodePageKey}`], code]);
                break;
              }
            }
          }
        }

        endBuff = endBuff ? Buffer.concat([endBuff, Buffer.from(code)]) : Buffer.from(code);
      }
      text = endBuff;
    }

    // Append buffer
    if (text) {
      if (this.buffer) {
        this.buffer = Buffer.concat([this.buffer, text]);
      } else {
        this.buffer = text;
      }
    }
  }

  // ------------------------------ Fold ------------------------------
  /**
   * This function splits text input into multiple lines. Returns array of lines
   * @param {string} text - text to split into lines
   * @param {number} lineSize - maximum allowed character count in one line
   * @param {boolean} breakWord - Break word or character
   * @param {array} lineArray - Array of lines passed for recursion
   * @returns {array} Array of lines
  */
  _fold(text, lineSize, breakWord, lineArray) {
    text = String(text);
    lineArray = lineArray || [];
    if (text.length <= lineSize) {
      lineArray.push(text);
      return lineArray;
    }
    let line = text.substring(0, lineSize);
    if (!breakWord) {
      // Insert newlines anywhere
      lineArray.push(line);
      return this._fold(text.substring(lineSize), lineSize, breakWord, lineArray);
    } else {
      // Attempt to insert newlines after whitespace
      const lastSpaceRgx = /\s(?!.*\s)/;
      const idx = line.search(lastSpaceRgx);
      let nextIdx = lineSize;
      if (idx > 0) {
        line = line.substring(0, idx);
        nextIdx = idx;
      }
      lineArray.push(line);
      return this._fold(text.substring(nextIdx), lineSize, breakWord, lineArray);
    }
  }
}

module.exports = {
  printer: Printer,
  types: PrinterTypes,
  printerTypes: PrinterTypes,
  breakLine: BreakLine,
  characterSet: CharacterSet,
  Printer,
  PrinterTypes,
  BreakLine,
  CharacterSet
};
