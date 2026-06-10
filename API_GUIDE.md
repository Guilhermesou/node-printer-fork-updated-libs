# API Guide — node-printer-fork-updated-libs

Guia completo de uso da biblioteca após as melhorias de segurança, fluxo de impressão e sistema de filas.

---

## Instalação

```bash
npm install node-printer-fork-updated-libs
```

## Import

```javascript
const printer = require('node-printer-fork-updated-libs');

// Destructuring completo:
const {
  // Core API — comunicação com impressoras do sistema
  getPrinters,
  getPrinter,
  getDefaultPrinterName,
  printDirect,
  printFile,
  getJob,
  setJob,
  getSupportedPrintFormats,
  getSupportedJobCommands,
  getPrinterDriverOptions,
  getSelectedPaperSize,

  // ESC/POS — construtor de comandos para impressoras térmicas
  Printer,
  PrinterTypes,     // { EPSON, TANCA, STAR, DARUMA, BROTHER }
  BreakLine,        // { NONE, CHARACTER, WORD }
  CharacterSet,     // { PC437_USA, WPC1252, PC850_MULTILINGUAL, ... }

  // Rede — impressora TCP/IP
  NetworkPrinter,

  // Fila de impressão
  PrintQueue,
  PrintJob,
  JobState,         // { QUEUED, PROCESSING, COMPLETED, FAILED, RETRYING, CANCELLED }
  Priority,         // { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 }

  // Monitor de jobs
  PrintJobMonitor,

  // Erros tipados
  PrinterError,
  ErrorCodes,
} = require('node-printer-fork-updated-libs');
```

---

## 1. Impressão Direta (Sistema Operacional)

### Listar impressoras

```javascript
const impressoras = getPrinters();
console.log(impressoras);
// [
//   {
//     name: 'EPSON_TM-T20',
//     isDefault: true,
//     status: 'IDLE',
//     statusNormalized: 'IDLE',  // ← normalizado cross-platform
//     options: { ... },
//     jobs: [ ... ]
//   },
//   ...
// ]
```

### Impressora padrão

```javascript
const defaultPrinter = getDefaultPrinterName();
// 'EPSON_TM-T20'
```

### Info de uma impressora

```javascript
const info = getPrinter('EPSON_TM-T20');
console.log(info.status);           // 'IDLE' | 'PRINTING' | 'STOPPED'
console.log(info.statusNormalized); // Normalizado: 'IDLE', 'PAPER_JAM', 'COVER_OPEN', etc.
```

---

### printDirect — Enviar dados crus para a impressora

**Estilo Promise (recomendado):**

```javascript
try {
  const jobId = await printDirect({
    data: Buffer.from('Hello World\n'),
    printer: 'EPSON_TM-T20',
    type: 'RAW',
    docname: 'Teste',
  });
  console.log('Job criado:', jobId);
} catch (err) {
  if (err.code === 'PRINTER_OFFLINE') {
    console.error('Impressora offline:', err.details.printer);
  } else {
    console.error('Erro:', err.message);
  }
}
```

**Estilo Callback (legado, ainda suportado):**

```javascript
printDirect({
  data: Buffer.from('Hello World\n'),
  printer: 'EPSON_TM-T20',
  type: 'RAW',
  success: (jobId) => console.log('Job:', jobId),
  error: (err) => console.error('Erro:', err),
});
```

### printFile — Enviar arquivo para a impressora

Funciona em **todas as plataformas** (POSIX + Windows):

```javascript
try {
  const jobId = await printFile({
    filename: '/path/to/document.pdf',
    printer: 'HP_LaserJet',
    docname: 'Relatório Mensal',
  });
  console.log('Arquivo enviado, job:', jobId);
} catch (err) {
  console.error('Falha:', err.message);
}
```

---

## 2. Impressora ESC/POS (Térmica)

### Construindo um recibo completo

```javascript
const { Printer, PrinterTypes, BreakLine, CharacterSet } = require('node-printer-fork-updated-libs');

const p = new Printer({
  type: PrinterTypes.EPSON,       // 'epson' | 'tanca' | 'star' | 'daruma' | 'brother'
  width: 48,                      // Largura em colunas (48 para 80mm, 32 para 58mm)
  characterSet: CharacterSet.PC850_MULTILINGUAL,
  breakLine: BreakLine.WORD,      // Quebra de linha por palavra
  removeSpecialCharacters: false,
  lineCharacter: '-',
});

// ========== Cabeçalho ==========
p.alignCenter();
p.setTextDoubleHeight();
p.bold(true);
p.println('MINHA LOJA');
p.bold(false);
p.setTextNormal();
p.println('Rua Exemplo, 123');
p.println('CNPJ: 12.345.678/0001-00');
p.drawLine();

// ========== Itens ==========
p.alignLeft();
p.println('CUPOM FISCAL');
p.drawLine();

p.leftRight('1x Produto A', 'R$ 25,90');
p.leftRight('2x Produto B', 'R$ 19,80');
p.leftRight('1x Produto C', 'R$ 45,00');

p.drawLine();

p.bold(true);
p.leftRight('TOTAL', 'R$ 90,70');
p.bold(false);

p.newLine();
p.leftRight('Dinheiro', 'R$ 100,00');
p.leftRight('Troco', 'R$ 9,30');

// ========== QR Code ==========
p.newLine();
p.alignCenter();
p.printQR('https://minha-loja.com.br/nfe/12345', {
  cellSize: 4,
  correction: 'M',
  model: 2,
});

// ========== Código de Barras ==========
p.newLine();
p.printBarcode('7891234567890', 2); // EAN-13

// ========== Rodapé ==========
p.newLine();
p.println('Obrigado pela preferência!');
p.newLine();

// ========== Cortar Papel ==========
p.cut();

// ========== Buffer Final ==========
const buffer = p.getBuffer();
// buffer está pronto para ser enviado à impressora
```

### Métodos disponíveis do Printer

```javascript
// --- Texto ---
p.print('texto sem quebra de linha');
p.println('texto com quebra de linha');
p.newLine();

// --- Formatação ---
p.bold(true);                        // negrito on/off
p.underline(true);                   // sublinhado on/off
p.underlineThick(true);              // sublinhado grosso on/off
p.invert(true);                      // texto invertido (fundo preto, texto branco)
p.upsideDown(true);                  // texto de cabeça para baixo

// --- Tamanho ---
p.setTextNormal();                   // tamanho normal
p.setTextDoubleHeight();             // altura dupla
p.setTextDoubleWidth();              // largura dupla
p.setTextQuadArea();                 // altura + largura dupla
p.setTextSize(3, 3);                 // tamanho custom (0-7, 0-7)

// --- Fonte ---
p.setTypeFontA();                    // fonte A (padrão, maior)
p.setTypeFontB();                    // fonte B (condensada, menor)

// --- Alinhamento ---
p.alignLeft();
p.alignCenter();
p.alignRight();

// --- Layout ---
p.drawLine();                        // linha de separação (usa lineCharacter do config)
p.drawLine('=');                     // linha com caractere custom
p.leftRight('Esquerda', 'Direita');  // texto alinhado nas duas pontas
p.table(['Col1', 'Col2', 'Col3']);   // tabela simples (colunas iguais)
p.tableCustom([                      // tabela custom
  { text: 'Item', align: 'LEFT', width: 0.5, bold: true },
  { text: 'Qtd', align: 'CENTER', width: 0.15 },
  { text: 'R$ 25,90', align: 'RIGHT', width: 0.35 },
]);

// --- Códigos ---
p.printQR('dados', { cellSize: 4, correction: 'M', model: 2 });
p.printBarcode('123456', 73);        // tipo 73 = Code128
p.code128('ABC123', { width: 3, height: 100, text: 2 });
p.pdf417('dados', { correction: 2, width: 3 });
p.maxiCode('dados', { mode: 4 });

// --- Imagem ---
await p.printImage('/path/to/logo.png');
await p.printImageBuffer(pngBuffer);

// --- Hardware ---
p.openCashDrawer();                  // abre a gaveta de dinheiro
p.beep(3, 5);                       // bipa 3 vezes, duração 5
p.cut();                             // corte total
p.partialCut();                      // corte parcial

// --- Buffer ---
p.clear();                           // limpa o buffer
const buf = p.getBuffer();           // obtém o buffer pronto
const txt = p.getText();             // obtém o buffer como string
p.setBuffer(existingBuffer);         // substitui o buffer
p.add(extraBuffer);                  // adiciona buffer extra

// --- Configuração ---
p.setCharacterSet('WPC1252');        // muda o code page
const w = p.getWidth();              // largura em colunas
```

---

## 3. Impressora de Rede (TCP/IP)

### Uso básico

```javascript
const { NetworkPrinter } = require('node-printer-fork-updated-libs');

const net = new NetworkPrinter('192.168.1.100', 9100, {
  timeout: 5000,
  keepAlive: true,            // reutiliza conexão TCP
  keepAliveTimeout: 30000,    // fecha após 30s de inatividade
});

// Verificar se a impressora está acessível
const online = await net.isPrinterConnected();
console.log('Online:', online);

// Enviar dados
await net.execute(buffer);

// Enviar com retry automático
await net.executeWithRetry(buffer, {
  maxRetries: 3,
  retryDelay: 1000,           // backoff exponencial: 1s, 2s, 4s
});

// Fechar conexão quando não precisar mais
net.close();
```

### Combinar ESC/POS + Rede

```javascript
const { Printer, PrinterTypes, NetworkPrinter } = require('node-printer-fork-updated-libs');

// 1. Montar o recibo com ESC/POS
const p = new Printer({ type: PrinterTypes.EPSON, width: 48 });

p.alignCenter();
p.bold(true);
p.println('PEDIDO #1234');
p.bold(false);
p.drawLine();
p.leftRight('1x Hambúrguer', 'R$ 25,00');
p.leftRight('1x Refrigerante', 'R$ 8,00');
p.drawLine();
p.bold(true);
p.leftRight('TOTAL', 'R$ 33,00');
p.bold(false);
p.cut();

const buffer = p.getBuffer();

// 2. Enviar via rede
const net = new NetworkPrinter('192.168.1.100', 9100, {
  timeout: 5000,
  keepAlive: true,
});

try {
  await net.executeWithRetry(buffer, { maxRetries: 3 });
  console.log('Impresso com sucesso!');
} catch (err) {
  console.error('Falha após 3 tentativas:', err.message);
} finally {
  net.close();
}
```

### Status da impressora (ESC/POS DLE EOT)

```javascript
const status = await net.getStatus({ responseTimeout: 2000 });
console.log(status);
// {
//   connected: true,
//   online: true,
//   paperPresent: true,
//   coverClosed: true,
//   raw: <Buffer 16>
// }
```

### Eventos

```javascript
net.on('connected', ({ host, port }) => console.log(`Conectado: ${host}:${port}`));
net.on('sending', ({ size }) => console.log(`Enviando ${size} bytes...`));
net.on('sent', ({ size }) => console.log(`Enviado: ${size} bytes`));
net.on('error', ({ error }) => console.error('Erro:', error.message));
net.on('disconnected', () => console.log('Desconectado'));
```

---

## 4. Combinar ESC/POS + printDirect (impressora USB/local)

```javascript
const { Printer, PrinterTypes, printDirect } = require('node-printer-fork-updated-libs');

const p = new Printer({ type: PrinterTypes.TANCA, width: 48 });

p.println('Teste de impressão');
p.cut();

const jobId = await printDirect({
  data: p.getBuffer(),
  printer: 'TANCA_TP-650',
  type: 'RAW',
  docname: 'Teste',
});

console.log('Job:', jobId);
```

---

## 5. Sistema de Filas (PrintQueue)

### Setup básico

```javascript
const { PrintQueue, Priority, NetworkPrinter, Printer, PrinterTypes } = require('node-printer-fork-updated-libs');

const net = new NetworkPrinter('192.168.1.100', 9100, { keepAlive: true });

const queue = new PrintQueue({
  // Função que realmente imprime — recebe um PrintJob
  printFunction: async (job) => {
    return await net.executeWithRetry(job.data, { maxRetries: 2 });
  },

  concurrency: 1,          // 1 impressão por vez (recomendado para térmicas)
  maxQueueSize: 500,        // máximo de jobs na fila
  maxRetries: 3,            // tentativas antes de falhar definitivamente
  retryDelay: 2000,         // delay base entre retries (exponencial: 2s, 4s, 8s)

  // Deduplicação (opt-in)
  deduplication: true,              // ← ativa detecção de duplicatas
  deduplicationWindowMs: 5000,      // ← janela de 5 segundos
});
```

### Enfileirar jobs

```javascript
// Montar recibo
const p = new Printer({ type: PrinterTypes.EPSON });
p.println('PEDIDO #5678');
p.leftRight('1x Pizza', 'R$ 35,00');
p.cut();

// Enfileirar com prioridade alta
const job = queue.enqueue(p.getBuffer(), {
  priority: Priority.HIGH,
  metadata: { orderId: 5678, type: 'kitchen' },
});

console.log('Job enfileirado:', job.id); // 1

// Enfileirar com prioridade urgente (fura fila)
queue.enqueue(cancelBuffer, {
  priority: Priority.URGENT,
  metadata: { orderId: 5678, type: 'cancel' },
});
```

### Monitorar eventos

```javascript
queue.on('enqueued', (job) => {
  console.log(`📋 Job #${job.id} enfileirado (prioridade: ${job.priority})`);
});

queue.on('processing', (job) => {
  console.log(`🖨️  Imprimindo job #${job.id}... (tentativa ${job.attempts})`);
});

queue.on('completed', (job) => {
  console.log(`✅ Job #${job.id} concluído`);
});

queue.on('retrying', (job, error) => {
  console.log(`🔄 Job #${job.id} retry: ${error.message}`);
});

queue.on('failed', (job, error) => {
  console.error(`❌ Job #${job.id} falhou após ${job.attempts} tentativas: ${error.message}`);
});

queue.on('duplicate-rejected', ({ hash, timeSinceLastMs }) => {
  console.warn(`🔁 Duplicata rejeitada (${timeSinceLastMs}ms atrás)`);
});

queue.on('drained', () => {
  console.log('📭 Fila vazia, todos os jobs processados');
});
```

### Controles da fila

```javascript
// Pausa (jobs em processamento terminam, novos não iniciam)
queue.pause();

// Retomar
queue.resume();

// Cancelar um job específico (antes de processar)
queue.cancel(job.id);

// Re-enfileirar todos os jobs que falharam
const count = queue.retryFailed();
console.log(`${count} jobs re-enfileirados`);

// Status da fila
console.log(queue.getStatus());
// { queued: 3, processing: 1, completed: 12, failed: 0, paused: false, destroyed: false }

// Detalhes de todos os jobs
console.log(queue.getJobs());
// { queued: [...], processing: [...], completed: [...], failed: [...] }

// Buscar job específico
const myJob = queue.getJob(42);

// Limpar histórico
queue.clearHistory();

// Destruir fila (cancela tudo, remove listeners)
queue.destroy();
```

### Callbacks por job (alternativa a eventos)

```javascript
queue.enqueue(buffer, {
  priority: Priority.NORMAL,
  onSuccess: (result) => {
    console.log('Este job específico foi impresso!');
  },
  onError: (error) => {
    console.error('Este job específico falhou:', error.message);
  },
});
```

---

## 6. Monitor de Jobs (OS Spooler)

Monitora o status real do job no spooler do sistema operacional:

```javascript
const { PrintJobMonitor, printDirect } = require('node-printer-fork-updated-libs');
const printerHelper = require('node-printer-fork-updated-libs');

const monitor = new PrintJobMonitor(printerHelper);

// Enviar impressão e monitorar
const jobId = await printDirect({
  data: buffer,
  printer: 'HP_LaserJet',
  type: 'RAW',
});

// Aguardar conclusão (polling do spooler)
const result = await monitor.waitForCompletion('HP_LaserJet', jobId, {
  timeout: 30000,      // máximo 30 segundos
  pollInterval: 500,   // checa a cada 500ms
});

if (result.success) {
  console.log('✅ Impresso com sucesso! Status:', result.status);
} else {
  console.error('❌ Falha:', result.error);
}

// Ou checar status sem esperar
const status = monitor.getJobStatus('HP_LaserJet', jobId);
console.log(status);
// { found: true, status: ['PRINTING'], job: { ... } }
```

---

## 7. Tratamento de Erros

Todos os erros são instâncias de `PrinterError` com códigos tipados:

```javascript
const { PrinterError, ErrorCodes } = require('node-printer-fork-updated-libs');

try {
  await printDirect({ data: buffer, printer: 'IMPRESSORA_INEXISTENTE' });
} catch (err) {
  if (err instanceof PrinterError) {
    switch (err.code) {
      case ErrorCodes.PRINTER_NOT_FOUND:
        console.error('Impressora não encontrada');
        break;
      case ErrorCodes.PRINTER_OFFLINE:
        console.error('Impressora parada:', err.details.status);
        break;
      case ErrorCodes.CONNECTION_TIMEOUT:
        console.error('Timeout de conexão');
        break;
      case ErrorCodes.CONNECTION_REFUSED:
        console.error('Conexão recusada');
        break;
      case ErrorCodes.BUFFER_OVERFLOW:
        console.error('Dados muito grandes (máx 50MB)');
        break;
      case ErrorCodes.INVALID_PATH:
        console.error('Caminho de arquivo inválido');
        break;
      case ErrorCodes.QUEUE_FULL:
        console.error('Fila cheia');
        break;
      case ErrorCodes.PRINT_FAILED:
        console.error('Impressão falhou');
        break;
      default:
        console.error(`Erro [${err.code}]:`, err.message);
    }
  }
}
```

### Todos os códigos de erro disponíveis

```
CONNECTION_TIMEOUT    — Timeout ao conectar na impressora
CONNECTION_REFUSED    — Conexão recusada pela impressora
CONNECTION_LOST       — Conexão perdida durante operação
RESPONSE_TIMEOUT      — Timeout esperando resposta da impressora

PRINTER_NOT_FOUND     — Impressora não encontrada no sistema
PRINTER_OFFLINE       — Impressora parada/offline (detectado no pre-flight)
PAPER_OUT             — Sem papel
COVER_OPEN            — Tampa aberta

PRINT_FAILED          — Impressão falhou
JOB_CANCELLED         — Job cancelado
JOB_TIMEOUT           — Job excedeu tempo máximo

INVALID_DATA          — Dados inválidos (null, tipo errado)
BUFFER_OVERFLOW       — Buffer excede 50MB
UNSUPPORTED_FORMAT    — Formato não suportado
INVALID_PATH          — Caminho de arquivo inválido/perigoso
INVALID_ARGUMENT      — Argumento inválido

QUEUE_FULL            — Fila de impressão cheia
QUEUE_PAUSED          — Fila destruída

NOT_SUPPORTED         — Operação não suportada na plataforma
```

---

## 8. Exemplo Completo — Sistema de PDV

```javascript
const {
  Printer, PrinterTypes, NetworkPrinter,
  PrintQueue, Priority,
  PrinterError, ErrorCodes,
} = require('node-printer-fork-updated-libs');

// ==================== SETUP ====================

const kitchenPrinter = new NetworkPrinter('192.168.1.101', 9100, {
  keepAlive: true,
  timeout: 5000,
});

const cashierPrinter = new NetworkPrinter('192.168.1.102', 9100, {
  keepAlive: true,
  timeout: 5000,
});

const kitchenQueue = new PrintQueue({
  printFunction: (job) => kitchenPrinter.executeWithRetry(job.data, { maxRetries: 2 }),
  concurrency: 1,
  maxRetries: 3,
  retryDelay: 2000,
  deduplication: true,
  deduplicationWindowMs: 3000,
});

const cashierQueue = new PrintQueue({
  printFunction: (job) => cashierPrinter.executeWithRetry(job.data, { maxRetries: 2 }),
  concurrency: 1,
  maxRetries: 3,
  retryDelay: 2000,
});

// Logging centralizado
for (const [name, q] of [['COZINHA', kitchenQueue], ['CAIXA', cashierQueue]]) {
  q.on('completed', (job) => console.log(`[${name}] ✅ Job #${job.id}`));
  q.on('failed', (job, err) => console.error(`[${name}] ❌ Job #${job.id}: ${err.message}`));
  q.on('retrying', (job) => console.log(`[${name}] 🔄 Retry job #${job.id}`));
}

// ==================== FUNÇÕES DE NEGÓCIO ====================

function buildKitchenTicket(order) {
  const p = new Printer({ type: PrinterTypes.EPSON, width: 48 });

  p.setTextDoubleHeight();
  p.bold(true);
  p.alignCenter();
  p.println(`PEDIDO #${order.number}`);
  p.setTextNormal();
  p.bold(false);
  p.println(order.type === 'delivery' ? '🛵 DELIVERY' : '🍽️ MESA ' + order.table);
  p.drawLine('=');

  for (const item of order.items) {
    p.setTextDoubleHeight();
    p.bold(true);
    p.println(`${item.qty}x ${item.name}`);
    p.setTextNormal();
    p.bold(false);
    if (item.notes) p.println(`   OBS: ${item.notes}`);
  }

  p.drawLine('=');
  p.println(new Date().toLocaleString('pt-BR'));
  p.cut();

  return p.getBuffer();
}

function buildReceipt(order) {
  const p = new Printer({ type: PrinterTypes.EPSON, width: 48 });

  p.alignCenter();
  p.bold(true);
  p.println('RESTAURANTE EXEMPLO');
  p.bold(false);
  p.println('CNPJ: 12.345.678/0001-00');
  p.drawLine();

  for (const item of order.items) {
    p.leftRight(`${item.qty}x ${item.name}`, `R$ ${(item.price * item.qty).toFixed(2)}`);
  }

  p.drawLine();
  p.bold(true);
  p.leftRight('TOTAL', `R$ ${order.total.toFixed(2)}`);
  p.bold(false);
  p.newLine();
  p.println('Obrigado!');
  p.newLine();
  p.printQR(`https://nfe.example.com/${order.number}`, { cellSize: 4 });
  p.cut();

  return p.getBuffer();
}

// ==================== USO ====================

async function processOrder(order) {
  // 1. Enviar para cozinha (prioridade alta)
  const kitchenBuffer = buildKitchenTicket(order);
  kitchenQueue.enqueue(kitchenBuffer, {
    priority: Priority.HIGH,
    metadata: { orderId: order.number },
  });

  // 2. Enviar recibo para o caixa
  const receiptBuffer = buildReceipt(order);
  cashierQueue.enqueue(receiptBuffer, {
    priority: Priority.NORMAL,
    metadata: { orderId: order.number },
  });

  console.log(`Pedido #${order.number} enfileirado nas duas impressoras`);
}

// Exemplo
processOrder({
  number: 1234,
  type: 'table',
  table: 5,
  items: [
    { name: 'X-Burger', qty: 2, price: 25.90, notes: 'Sem cebola' },
    { name: 'Coca-Cola 600ml', qty: 2, price: 8.00 },
    { name: 'Batata Frita', qty: 1, price: 15.00 },
  ],
  total: 82.80,
});

// ==================== SHUTDOWN GRACEFUL ====================

process.on('SIGTERM', () => {
  console.log('Desligando...');
  kitchenQueue.destroy();
  cashierQueue.destroy();
  kitchenPrinter.close();
  cashierPrinter.close();
});
```

---

## Compatibilidade

| Feature | macOS / Linux | Windows |
|---|:---:|:---:|
| `getPrinters()` | ✅ | ✅ |
| `getPrinter()` | ✅ | ✅ |
| `getDefaultPrinterName()` | ✅ | ✅ |
| `getPrinterDriverOptions()` | ✅ | ⚠️ Parcial |
| `printDirect()` | ✅ | ✅ |
| `printFile()` | ✅ | ✅ (novo!) |
| `getJob()` / `setJob()` | ✅ | ✅ |
| `NetworkPrinter` | ✅ | ✅ |
| `PrintQueue` | ✅ | ✅ |
| `Printer` (ESC/POS) | ✅ | ✅ |

### Drivers ESC/POS suportados

| Driver | QR | Barcode | Code128 | PDF417 | MaxiCode | Imagem | Beep |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Epson | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tanca | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Star | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Brother | ✅ | ✅ | — | — | — | ✅ | — |
| Daruma | — | — | — | — | — | — | ✅ |

> Chamadas a recursos não suportados pelo driver agora lançam um erro descritivo em vez de falhar silenciosamente.

---

## 9. Printer Bridge Server (HTTP/REST)

Ideal para aplicações Electron que carregam URLs externas ou ambientes onde vários dispositivos precisam imprimir em uma única máquina host.

### Iniciando o Servidor (No processo Main do Electron)

```javascript
const { PrinterServer } = require('node-printer-fork-updated-libs');

const server = new PrinterServer({
  port: 9001,
  host: '0.0.0.0',       // Permite conexões externas se necessário
  apiKey: 'minha-chave', // Opcional: segurança extra
});

await server.listen();
console.log('Bridge de Impressão online!');
```

### Consumindo via Frontend (Next.js / Browser)

**1. Listar impressoras disponíveis:**

```javascript
const response = await fetch('http://localhost:9001/printers');
const { local, network } = await response.json();
// local: lista de impressoras USB/Sistema
// network: lista de impressoras IP (se discover=true for passado na query)
```

**2. Enviar impressão estruturada:**

```javascript
await fetch('http://localhost:9001/print', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'minha-chave'
  },
  body: JSON.stringify({
    target: 'EPSON_TM-T20', // Nome da impressora local ou { host, port } para rede
    type: 'epson',
    commands: [
      { action: 'alignCenter' },
      { action: 'bold', value: true },
      { action: 'text', value: 'RECIBO DE VENDA\n' },
      { action: 'bold', value: false },
      { action: 'drawLine' },
      { action: 'leftRight', value: '1x Cafe', settings: 'R$ 5,00' },
      { action: 'cut' }
    ]
  })
});
```

**3. Enviar dados brutos (Base64):**

Se você já tem o buffer gerado:

```javascript
await fetch('http://localhost:9001/print', {
  method: 'POST',
  body: JSON.stringify({
    target: 'EPSON_TM-T20',
    raw: btoa('Dados brutos aqui...') // ou Buffer.toString('base64')
  })
});
```
