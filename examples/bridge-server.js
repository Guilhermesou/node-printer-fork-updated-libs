'use strict';

/**
 * Example: Running a Printer Bridge Server
 * 
 * This server allows an external Next.js app (or any browser) to print
 * directly to local USB or Network printers via standard HTTP/JSON.
 */

const { PrinterServer, PrinterTypes } = require('../lib');

const server = new PrinterServer({
  port: 9001,
  host: '0.0.0.0', // Listen on all interfaces
  apiKey: 'secret-token-123' // Optional: adds security
});

server.listen().then(() => {
  console.log('--------------------------------------------------');
  console.log('Printer Bridge Server is active!');
  console.log('Port: 9001');
  console.log('API Key: secret-token-123');
  console.log('--------------------------------------------------');
}).catch(err => {
  console.error('Failed to start server:', err);
});

// To stop server:
// server.close();
