# Node Printer (Modern Fork) 🚀

Native printer bindings for **Node.js**, **Electron**, and **NW.js** on **macOS**, **Windows**, and **Linux**.

This is a modernized fork of the original `node-printer`, rewritten to use **N-API (node-addon-api)** for better stability, performance, and long-term compatibility with modern Node.js versions (v16 to v24+).

---

## 💎 Key Modern Improvements (Before vs After)

| Feature | Legacy (Original) | **Modern (This Fork)** |
|:--- |:--- |:--- |
| **Node.js Integration** | Deprecated `NAN` (V8-specific) | **N-API (Version-independent)** |
| **Performance** | Synchronous/Blocking (Freezes UI) | **Fully Asynchronous (Non-blocking)** |
| **JS API Style** | Callbacks only | **Native Promises (async/await ready)** |
| **Thermal Printing** | Simple threshold (flat images) | **Floyd-Steinberg Dithering** (Gray simulation) |
| **Canvas Integration** | None (requires file conversion) | **Direct ImageData/Pixels Support** |
| **Sintax** | Positional arguments | **Fluent/Chaining API** |

---

## 📦 Installation

```bash
npm install @guilherme_souza/node-printer-updated-fork
# or
yarn add @guilherme_souza/node-printer-updated-fork
```

---

## 🚀 Core API Usage (Async/Await)

The new API is fully non-blocking. It moves heavy I/O tasks to background threads.

### Get Printers & Status
```javascript
const printer = require('@guilherme_souza/node-printer-updated-fork');

async function listPrinters() {
  // Non-blocking call! Returns a Promise
  const printers = await printer.getPrintersAsync();
  console.log(printers);
}
```

### Direct Printing (Jobs)
```javascript
const buffer = Buffer.from("Hello World");

await printer.printDirect({
  data: buffer,
  printer: "My_Thermal_Printer",
  type: "RAW",
  success: (jobId) => console.log("Job created:", jobId),
  error: (err) => console.error(err)
});
```

---

## 🧾 POS & Thermal Printing (Advanced Support)

Built specifically to improve the experience of developers building Points of Sale (POS) and Receipt systems.

### 1. Fluent Chaining API
You can now build receipts using a single chain:
```javascript
const { Printer, PrinterTypes } = require('@guilherme_souza/node-printer-updated-fork');

const pos = new Printer({ type: PrinterTypes.EPSON });

pos.initHardware()
   .alignCenter()
   .bold(true)
   .println("MY AWESOME STORE")
   .bold(false)
   .alignLeft()
   .println("Item 1 ......... $10.00")
   .println("Item 2 ......... $25.00")
   .drawLine()
   .bold(true)
   .println("TOTAL: $35.00")
   .cut();

const buffer = pos.getBuffer();
// send buffer using printDirect...
```

### 2. High-Quality Images (Dithering)
Instead of printing flat "all or nothing" black/white images, we use the **Floyd-Steinberg** algorithm to simulate shades of gray on thermal paper.

### 3. Canvas & JS Image Integration
Print directly from a browser-like Canvas (using `node-canvas` or similar) by passing the raw pixel data:

```javascript
const ctx = canvas.getContext('2d');
const { data, width, height } = ctx.getImageData(0, 0, 300, 300);

// No need to save to PNG first!
await pos.printImagePixels(data, width, height);
```

---

## 🛠 Features

- **Network Printers:** Support for TCP/IP printing via `NetworkPrinter`.
- **Printer Bridge Server (HTTP/REST):** Ideal for Electron apps with external URLs. Run a local server to bridge Web and Hardware:
  ```javascript
  const { PrinterServer } = require('@guilherme_souza/node-printer-updated-fork');
  const server = new PrinterServer({ port: 9001 });
  await server.listen();
  // Now your web app can POST to http://localhost:9001/print
  ```
- **Auto-discovery:** Scan your local network to find printers automatically:
  ```javascript
  const { NetworkPrinter } = require('@guilherme_souza/node-printer-updated-fork');
  const printers = await NetworkPrinter.discover();
  // returns [{ host: '192.168.1.50', port: 9100 }, ...]
  ```
- **Cross-Platform:** Native wrappers for Windows (Spooler API) and POSIX (CUPS).
- **Driver Options:** Retrieve paper sizes and driver-specific options natively ([POSIX]).
- **Job Monitoring:** Monitor job status and cancel/pause/resume tasks.

---

## 📝 Authors & Contributors

This project is a continuation of the great work done by the original authors and contributors.

### Original Author:
- **Ion Lupascu**, ionlupascu@gmail.com (http://program-support.co.uk/)
- **Klemen Kastelic**, klemen.kast@gmail.com (http://kastelic.net/)

### Key Contributors:
- **Thiago Lugli**, @thiagoelg (Maintaining the project for years)
- **Eko Eryanto**, @ekoeryanto (Prebuild and CI integration)
- **Guilherme Souza**, @guilhermesou (Modernization, N-API Migration, POS improvements)

---

## 📄 License
[The MIT License (MIT)](http://opensource.org/licenses/MIT)

Feel free to download, test and propose new features!

