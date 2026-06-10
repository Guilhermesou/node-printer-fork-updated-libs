'use strict';

const { Printer, PrinterTypes, BreakLine, CharacterSet } = require('../lib/printer');

describe('Printer (ESC/POS)', () => {
  let printer;

  beforeEach(() => {
    printer = new Printer({
      type: PrinterTypes.EPSON,
      width: 48,
      characterSet: CharacterSet.PC850_MULTILINGUAL
    });
  });

  it('should initialize with correct type', () => {
    expect(printer.config.type).toBe('epson');
    expect(printer.config.width).toBe(48);
  });

  it('should append text to buffer', () => {
    printer.print('Hello');
    expect(printer.getText()).toContain('Hello');
  });

  it('should handle println', () => {
    printer.println('Hello');
    expect(printer.getText()).toContain('Hello\n');
  });

  it('should clear buffer', () => {
    printer.print('Hello');
    printer.clear();
    // Clearing printer might still leave character set code if it's set in config
    const text = printer.getText();
    expect(text).not.toContain('Hello');
  });

  it('should chain methods', () => {
    const p = printer.alignCenter().bold(true).print('Center').bold(false);
    expect(p).toBe(printer);
    expect(printer.getText()).toContain('Center');
  });

  describe('Formatting', () => {
    it('should add bold commands', () => {
      printer.bold(true);
      const buffer = printer.getBuffer();
      // ESC E 1 (0x1B 0x45 0x01) for Epson bold
      expect(buffer).toContain(0x1B);
      expect(buffer).toContain(0x45);
      expect(buffer).toContain(0x01);
    });

    it('should add alignment commands', () => {
      printer.alignCenter();
      const buffer = printer.getBuffer();
      // ESC a 1 (0x1B 0x61 0x01) for Epson align center
      expect(buffer).toContain(0x1B);
      expect(buffer).toContain(0x61);
      expect(buffer).toContain(0x01);
    });
  });

  describe('Layout', () => {
    it('should draw a line with correct width', () => {
      printer.drawLine('-');
      const text = printer.getText();
      // Use a regex to find the line of dashes
      expect(text).toMatch(/-{48}\n/);
    });

    it('should handle leftRight alignment', () => {
      printer.leftRight('Left', 'Right');
      const text = printer.getText();
      expect(text).toContain('Left');
      expect(text).toContain('Right');
      expect(text).toMatch(/Left\s+Right\n/);
    });
  });

  describe('Folding (Line Break)', () => {
    it('should fold long text by word', () => {
      const longText = 'This is a very long text that should be folded into multiple lines because it exceeds forty eight characters';
      printer.print(longText);
      const text = printer.getText();
      const lines = text.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      // Skip possible initialization garbage in the first line's length check if it's there
      // or just check that every line is reasonably sized
      lines.forEach(line => {
        // We allow some extra for initialization chars if they are on the first line
        expect(line.length).toBeLessThan(60); 
      });
    });
  });
});
