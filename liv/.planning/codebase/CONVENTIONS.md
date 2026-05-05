# Nexus Codebase Conventions

This document outlines the coding standards, patterns, and conventions used throughout the Nexus project.

## TypeScript Configuration

### Compiler Settings

- **Target**: ES2022
- **Module System**: ES2022 (native ESM)
- **Module Resolution**: bundler
- **Strict Mode**: Enabled (`strict: true`)

All TypeScript is compiled to modern JavaScript with full type safety.

**File**: `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": false
  }
}
```

## Import/Export Style

### ESM with `.js` Extensions

All imports use ES modules with explicit `.js` file extensions (required for ESM in Node.js):

```typescript
// CORRECT - always use .js extension
import { Brain } from './brain.js';
import { Router } from './router.js';
import { logger } from './logger.js';
import type Redis from 'ioredis';

// Import dotenv for environment setup
import 'dotenv/config';
```

**Why**: ESM in Node.js requires explicit file extensions for local module resolution.

### Namespace Imports

Namespace imports for module organization:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
```

### Type-Only Imports

Use `type` keyword for TypeScript types to enable tree-shaking:

```typescript
import type Redis from 'ioredis';
import type { DockerManager } from './docker-manager.js';
```

## Naming Conventions

### Classes

- **PascalCase**: `Brain`, `Router`, `Daemon`, `DockerManager`, `ShellExecutor`, `Scheduler`
- Descriptive, noun-based names
- Suffix with functional role when needed: `Manager`, `Executor`, `Job`

**Examples from codebase**:
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/brain.ts` → `Brain`
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/router.ts` → `Router`
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts` → `Daemon`
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/docker-manager.ts` → `DockerManager`
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/shell.ts` → `ShellExecutor`

### Methods

- **camelCase**: `execute()`, `register()`, `classify()`, `route()`, `startContainer()`, `stopContainer()`
- Verb-based for actions: `start`, `stop`, `execute`, `process`, `register`
- Getter/setter patterns for properties

### Constants

- **UPPER_SNAKE_CASE** for module-level constants
- **camelCase** for local constants

```typescript
// Module-level constant
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,
  /mkfs\./,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}/,
];

const MAX_OUTPUT = 10_000;
const DEFAULT_TIMEOUT = 30_000;
const PROTECTED = ['nexus-firecrawl', 'nexus-redis-firecrawl'];
```

### Variables & Fields

- **camelCase** for all variables and properties
- **Private fields**: Prefix with underscore if desired, but TypeScript `private` keyword preferred

```typescript
private config: DaemonConfig;
private running = false;
private cycleCount = 0;
private inbox: InboxItem[] = [];
private handlers: Map<string, Handler> = new Map();
```

### Interfaces & Types

- **PascalCase**: `Intent`, `TaskResult`, `DaemonConfig`, `InboxItem`, `ThinkOptions`
- Use `interface` for object shapes, `type` for unions or aliases

```typescript
interface Intent {
  type: string;
  action: string;
  params: Record<string, any>;
  source: 'mcp' | 'whatsapp' | 'cron' | 'daemon' | 'webhook';
  raw: string;
}

interface TaskResult {
  success: boolean;
  message: string;
  data?: any;
}

type Handler = (intent: Intent) => Promise<TaskResult>;
```

## Error Handling

### Try/Catch with Logger

All error handling uses try/catch blocks with Winston logger:

```typescript
try {
  const result = await shell.execute(cmd);
  // ... success handling
} catch (err) {
  logger.error('Shell error', { error: (err as Error).message });
  return { success: false, message: `Shell error: ${(err as Error).message}` };
}
```

**Pattern**:
1. Try block executes operation
2. Catch block logs error using `logger.error()`
3. Return structured error result
4. Always cast error as `(err as Error).message`

### Logger Usage

Winston logger imported from `./logger.js` in each package:

```typescript
import { logger } from './logger.js';

// Log levels: info, warn, error, debug
logger.info('Operation started', { param1: value });
logger.warn('Deprecated action', { oldParam: 'new' });
logger.error('Fatal error', { error: err.message });
```

**Logger Configuration** (`packages/core/src/logger.ts`):
```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: '/opt/nexus/logs/nexus.log',
      maxsize: 10_000_000,
      maxFiles: 5
    }),
  ],
});
```

## Handler Registration Pattern

Handlers are registered on startup using the router registration method:

```typescript
// In Daemon.registerHandlers()
router.register('shell', async (intent) => {
  const cmd = intent.params.cmd;
  if (!cmd) return { success: false, message: 'No command provided.' };

  try {
    const result = await shell.execute(cmd);
    return {
      success: result.code === 0,
      message: `Exit code: ${result.code}\n${output}`,
      data: result,
    };
  } catch (err) {
    return { success: false, message: `Shell error: ${(err as Error).message}` };
  }
});
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts`

**Handler Map Pattern**:
```typescript
private handlers: Map<string, Handler> = new Map();

register(action: string, handler: Handler) {
  this.handlers.set(action, handler);
  logger.info(`Router: registered handler for "${action}"`);
}

async route(intent: Intent): Promise<TaskResult> {
  const handler = this.handlers.get(intent.action);
  if (handler) {
    logger.info(`Routing: ${intent.action}`, { source: intent.source });
    return handler(intent);
  }
  // ... fallback to AI
}
```

## Dependency Injection via Config Objects

Dependencies are injected through constructor config objects (not individual parameters):

```typescript
// Daemon receives all dependencies in config object
interface DaemonConfig {
  brain: Brain;
  router: Router;
  dockerManager: DockerManager;
  shell: ShellExecutor;
  scheduler: Scheduler;
  redis: Redis;
  intervalMs: number;
}

export class Daemon {
  private config: DaemonConfig;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  async start() {
    await this.config.scheduler.start();
    // Use config.brain, config.router, config.shell, etc.
  }
}
```

**Usage**:
```typescript
const daemon = new Daemon({
  brain,
  router,
  dockerManager,
  shell,
  scheduler,
  redis,
  intervalMs: parseInt(process.env.DAEMON_INTERVAL_MS || '30000'),
});
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/index.ts`

## Bilingual Support (Turkish + English)

The codebase supports both Turkish and English language commands:

### Rule-Based Classification

Commands recognized in both languages:

```typescript
// Turkish examples
if (/^(durum|status|ne durumdayiz)/.test(lower)) {
  return { type: 'status_check', action: 'status', params: {}, source, raw: input };
}

if (/^(test|testleri? (calistir|bas))/.test(lower)) {
  return { type: 'direct_execute', action: 'test', params: {}, source, raw: input };
}

if (/^(tara|scrape|kazı):?\s+(.+)/.test(lower)) {
  const url = input.replace(/^(tara|scrape|kazı):?\s+/i, '').trim();
  return { type: 'direct_execute', action: 'scrape', params: { url }, source, raw: input };
}

if (/^(hatirla|remember):?\s+(.+)/.test(lower)) {
  const content = input.replace(/^(hatirla|remember):?\s+/i, '').trim();
  return { type: 'direct_execute', action: 'remember', params: { content }, source, raw: input };
}

// System info in Turkish and English
if (/^(sysinfo|sistem|system|ram|cpu|disk|network|uptime|mem|bellek|hafiza)/.test(lower)) {
  const topic = lower.match(/^(sysinfo|sistem|system|ram|cpu|disk|network|uptime|mem|bellek|hafiza)/)?.[1] || 'all';
  return { type: 'system_monitor', action: 'sysinfo', params: { topic }, source, raw: input };
}

// Files: dosya/file operations
if (/^(dosya|file)\s+(oku|read|yaz|write|listele|list|sil|delete|mkdir|stat)\s+(.+)/.test(lower)) {
  const match = input.match(/^(dosya|file)\s+(\w+)\s+(.+)/i);
  return { type: 'file_operation', action: 'files',
    params: { operation: match![2].toLowerCase(), path: match![3].trim() }, source, raw: input };
}
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/router.ts`

### Language Keys in Commands

- `durum` / `status` - system status
- `test` / `testleri calistir` - run tests
- `log` / `loglar` - logs
- `tara` / `scrape` / `kazı` - web scraping
- `hatirla` / `remember` - memory storage
- `leadgen` / `lead` - lead generation
- `komut` / `shell` / `run` - shell execution
- `dosya` / `file` - file operations
- `bellek` / `hafiza` / `ram` - memory info
- `servis` / `service` - service management

### Regex Patterns

Turkish language regex patterns use Turkish characters and keywords:
```typescript
if (/(\d+)\s*(saat|dakika|dk|min|hour).*?(kontrol|check|bak)/.test(lower)) {
  // Handle time-based reminders in Turkish or English
}
```

## Async/Await Pattern

All asynchronous operations use async/await:

```typescript
async function main() {
  logger.info('Nexus starting...');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redis.on('connect', () => logger.info('Redis connected'));

  const daemon = new Daemon({ /* config */ });

  await daemon.start();
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
```

## Module Structure

Each package follows this structure:

```
packages/[name]/
├── src/
│   ├── index.ts          # Entry point
│   ├── logger.ts         # Winston logger setup
│   ├── *.ts              # Feature files
│   └── types/            # Type definitions
├── dist/                 # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Environment Variables

Configuration via environment variables (loaded by `dotenv`):

```typescript
import 'dotenv/config';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const apiPort = parseInt(process.env.API_PORT || '3200');
const logLevel = process.env.LOG_LEVEL || 'info';
const interval = parseInt(process.env.DAEMON_INTERVAL_MS || '30000');
```

Common variables:
- `REDIS_URL` - Redis connection string
- `API_PORT` - API server port
- `MCP_PORT` - MCP server port
- `LOG_LEVEL` - Winston log level
- `DAEMON_INTERVAL_MS` - Daemon cycle interval
- `SHELL_CWD` - Default shell working directory
- `GEMINI_API_KEY` - Google Gemini API key
- `FIRECRAWL_URL` - Firecrawl service endpoint
- `NEXUS_URL` - Nexus daemon HTTP endpoint

## File Size Limits

Output and file operations respect size limits:

```typescript
const MAX_OUTPUT = 10_000;        // 10KB max shell output
const MAX_FILE_READ = 10_000;     // 10KB max file content
const MAX_LOG_TAIL = 20;          // 20 lines of logs
```

## Result Object Standard

All handler results follow this structure:

```typescript
interface TaskResult {
  success: boolean;      // Operation succeeded
  message: string;       // User-friendly message
  data?: any;           // Optional structured data
}
```

Usage:
```typescript
return {
  success: true,
  message: `Operation completed successfully`,
  data: { output, duration, processId }
};
```

## Nowrap on Line Length

Code follows semantic line breaks rather than strict column limits. Lines may exceed 100 characters for readability.

