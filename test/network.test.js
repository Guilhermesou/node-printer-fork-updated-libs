'use strict';

const Net = require('net');
const NetworkPrinter = require('../lib/network');
const { PrinterError, ErrorCodes } = require('../lib/errors');

jest.mock('net');

describe('NetworkPrinter', () => {
  let printer;
  let mockSocket;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      write: jest.fn((data, encoding, callback) => callback()),
      destroy: jest.fn(),
      setTimeout: jest.fn(),
      connect: jest.fn(),
      emit: jest.fn(),
      destroyed: false
    };
    
    Net.connect.mockReturnValue(mockSocket);
    Net.Socket.mockImplementation(() => mockSocket);
    
    printer = new NetworkPrinter('127.0.0.1', 9100, { timeout: 100 });
    // Add dummy error listener to prevent "unhandled error" crashes when emitting 'error'
    printer.on('error', () => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should check connection correctly', async () => {
    Net.connect.mockImplementation((opts, cb) => {
      setImmediate(cb);
      return mockSocket;
    });

    const connected = await printer.isPrinterConnected();
    expect(connected).toBe(true);
    expect(Net.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: '127.0.0.1', port: 9100 }),
      expect.any(Function)
    );
  });

  it('should handle connection timeout', async () => {
    Net.connect.mockImplementation((opts, cb) => {
      // Simulate timeout by calling timeout listener
      return mockSocket;
    });

    // Manually trigger timeout on mockSocket
    const promise = printer.execute(Buffer.from('test'));
    
    // Find the timeout listener
    const timeoutHandler = mockSocket.once.mock.calls.find(call => call[0] === 'timeout')[1];
    timeoutHandler();

    await expect(promise).rejects.toThrow(PrinterError);
    await expect(promise).rejects.toMatchObject({ code: ErrorCodes.CONNECTION_TIMEOUT });
  });

  it('should send data successfully', async () => {
    Net.connect.mockImplementation((opts, cb) => {
      setImmediate(cb);
      return mockSocket;
    });

    await printer.execute(Buffer.from('Hello'));
    expect(mockSocket.write).toHaveBeenCalledWith(
      Buffer.from('Hello'),
      null,
      expect.any(Function)
    );
  });

  it('should support keep-alive', async () => {
    printer = new NetworkPrinter('127.0.0.1', 9100, { keepAlive: true });
    
    Net.connect.mockImplementation((opts, cb) => {
      setImmediate(cb);
      return mockSocket;
    });

    await printer.execute(Buffer.from('One'));
    await printer.execute(Buffer.from('Two'));

    // Should only connect once
    expect(Net.connect).toHaveBeenCalledTimes(1);
    expect(mockSocket.write).toHaveBeenCalledTimes(2);
  });

  it('should retry on failure', async () => {
    Net.connect
      .mockImplementationOnce((opts, cb) => {
        // First time fails
        const errHandler = mockSocket.once.mock.calls.find(call => call[0] === 'error')[1];
        setImmediate(() => errHandler(new Error('Refused')));
        return mockSocket;
      })
      .mockImplementationOnce((opts, cb) => {
        // Second time succeeds
        setImmediate(cb);
        return mockSocket;
      });

    await printer.executeWithRetry(Buffer.from('Retry'), { maxRetries: 1, retryDelay: 10 });
    
    expect(Net.connect).toHaveBeenCalledTimes(2);
  });
});
