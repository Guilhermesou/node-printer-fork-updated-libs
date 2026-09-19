const PrinterType = require('./printer-type');

class Daruma extends PrinterType {
  constructor() {
    super();
    this.config = require('./daruma-config');
  }

  // ------------------------------ Beep ------------------------------
  beep() {
    return this.config.BEEP;
  }
}

module.exports = Daruma;
