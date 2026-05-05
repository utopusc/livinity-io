# Nexus Testing Patterns

This document describes the testing strategy, frameworks, and execution patterns used in the Nexus project.

## Testing Framework

### Playwright for E2E Testing

The project uses **Playwright** as the end-to-end testing framework, executed via worker jobs.

**Package**: `@playwright/test` (implied by test job configuration)

**Worker Job Handler** (`C:/Users/hello/Desktop/Projects/contabo/nexus/packages/worker/src/jobs/test.ts`):

```typescript
import { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

export class TestJob {
  static async process(job: Job): Promise<{ success: boolean; message: string; data?: any }> {
    const { command, path, timeout = 120000 } = job.data;

    const testCmd = command || `npx playwright test ${path || ''}`;
    logger.info(`Running test: ${testCmd}`);

    try {
      const { stdout, stderr } = await execAsync(testCmd, {
        cwd: job.data.cwd || '/opt/nexus',
        timeout,
        env: { ...process.env, CI: 'true' },
      });

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      const passed = !stderr || stderr.includes('passed');

      logger.info(`Test result: ${passed ? 'PASSED' : 'FAILED'}`, { outputLen: output.length });

      return {
        success: passed,
        message: passed ? 'All tests passed' : 'Some tests failed',
        data: { output: output.substring(0, 5000), command: testCmd },
      };
    } catch (err: any) {
      logger.error(`Test error: ${err.message}`);
      return {
        success: false,
        message: `Test failed: ${err.message}`,
        data: { stdout: err.stdout?.substring(0, 3000), stderr: err.stderr?.substring(0, 3000) },
      };
    }
  }
}
```

## Test Execution Patterns

### Worker-Based Test Execution

Tests are executed via **BullMQ worker jobs** with job queue persistence:

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/worker/src/index.ts`

```typescript
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { TestJob } from './jobs/test.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const jobHandlers: Record<string, (job: Job) => Promise<any>> = {
  test: TestJob.process,
  // ... other job types
};

const worker = new Worker(
  'nexus-jobs',
  async (job: Job) => {
    const handler = jobHandlers[job.name];
    if (!handler) {
      logger.warn(`No handler for job: ${job.name}`);
      return { success: false, message: `Unknown job type: ${job.name}` };
    }

    logger.info(`Processing job: ${job.name}`, { id: job.id, data: job.data });
    const result = await handler(job);
    logger.info(`Job completed: ${job.name}`, { id: job.id, success: result.success });

    // Store result in Redis for retrieval
    await connection.set(
      `nexus:result:${job.id}`,
      JSON.stringify(result),
      'EX',
      3600 // expire in 1 hour
    );

    return result;
  },
  { connection, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  logger.error(`Job failed: ${job?.name}`, { id: job?.id, error: err.message });
});

worker.on('completed', (job) => {
  logger.info(`Job done: ${job.name}`, { id: job.id });
});
```

### Test Job Configuration

Test jobs accept configuration parameters:

```typescript
// Minimal - use default Playwright test discovery
{
  name: 'test'  // Uses: npx playwright test
}

// With custom command
{
  name: 'test',
  command: 'npx playwright test --project=chromium'
}

// With specific test path
{
  name: 'test',
  path: 'tests/auth.spec.ts'
}

// With working directory
{
  name: 'test',
  cwd: '/opt/nexus/apps/ui'
}

// With custom timeout (default 120000ms = 2 minutes)
{
  name: 'test',
  timeout: 180000  // 3 minutes
}
```

### Test Invocation

#### Via Router Classification

Tests can be triggered via natural language routing:

```typescript
// In Router.ruleBasedClassify()
if (/^(test|testleri? (calistir|bas))/.test(lower)) {
  return { type: 'direct_execute', action: 'test', params: {}, source, raw: input };
}

// In Turkish: "test" or "testleri calistir" (run tests)
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/router.ts`

#### Via Handler Routing

Test handler registered in Daemon:

```typescript
// In Daemon.registerHandlers()
router.register('test', async (intent) => {
  // Intent triggers test job via scheduler or direct worker call
  const result = await TestJob.process(intent);
  return result;
});
```

#### Via API Webhook

Git webhooks can trigger tests:

```typescript
// In createApiServer()
app.post('/api/webhook/git', async (req, res) => {
  const payload = req.body;
  const ref = payload.ref || '';
  const commits = payload.commits || [];
  logger.info(`Git webhook: ${ref}, ${commits.length} commits`);
  daemon.addToInbox(`New commit pushed to ${ref}. Run tests.`, 'webhook');
  res.json({ ok: true, message: 'Webhook received' });
});
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/api.ts`

## Test Output Handling

### Result Storage

Test results are stored in Redis with 1-hour expiration:

```typescript
await connection.set(
  `nexus:result:${job.id}`,
  JSON.stringify(result),
  'EX',
  3600 // expire in 1 hour
);
```

Results are truncated to 5KB for storage efficiency:

```typescript
data: {
  output: output.substring(0, 5000),  // 5KB max
  command: testCmd
}
```

### Result Structure

Tests return standardized result objects:

```typescript
{
  success: boolean,  // true if stderr is empty or contains 'passed'
  message: string,   // 'All tests passed' or 'Some tests failed'
  data: {
    output: string,     // First 5000 chars of stdout + stderr
    command: string,    // The full test command run
    stdout?: string,    // Only in error case
    stderr?: string     // Only in error case
  }
}
```

### Exit Codes

- `0` - Success (all tests passed)
- `1` - General failure
- `124` - Timeout (command exceeded timeout duration)
- `> 124` - Other error codes from process

## Docker Container for Testing

### Playwright Container

The daemon can provision a dedicated Playwright container for E2E tests:

```typescript
// In DockerManager.startTool()
const toolConfigs = {
  playwright: {
    Image: 'mcr.microsoft.com/playwright:v1.49.1-noble',
    name: 'nexus-playwright',
    HostConfig: {
      Memory: 2 * 1024 * 1024 * 1024,    // 2GB
      ShmSize: 1024 * 1024 * 1024,        // 1GB shared memory
      NetworkMode: 'host',
    },
    Cmd: ['sleep', 'infinity'],
  },
};
```

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/docker-manager.ts`

Resource allocation:
- Memory: 2GB
- Shared memory: 1GB (for browser processes)
- Network: host mode

## Unit Testing Setup

### Current State

**No dedicated unit test framework is configured** (no Jest, Vitest, or Mocha).

The project relies on:
1. **TypeScript strict mode** for compile-time type safety
2. **Playwright E2E tests** for integration testing
3. **Manual testing** via handler invocation

### If Unit Tests Needed

To add unit tests, follow this pattern:

**Option 1: Jest**
```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

**Option 2: Vitest**
```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

## CI/CD Integration

### No Dedicated CI Pipeline

The project does **not have a GitHub Actions or GitLab CI pipeline**.

### Manual Execution Flow

1. **Local Development**
   ```bash
   npm run dev:core      # Daemon in watch mode
   npm run dev:worker    # Worker in watch mode
   npm run build         # Build all packages
   ```

2. **Webhook-Triggered Testing**
   - Git webhook → API `/api/webhook/git`
   - Daemon adds message to inbox
   - Router classifies as test action
   - Worker processes test job
   - Result stored in Redis

3. **Manual Test Run**
   ```bash
   npx playwright test
   # or via MCP/API
   POST /api/inbox { "message": "test", "source": "mcp" }
   ```

### Build Scripts

**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/package.json`

```json
{
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:core": "npm run dev -w packages/core",
    "dev:mcp": "npm run dev -w packages/mcp-server",
    "dev:whatsapp": "npm run dev -w packages/whatsapp",
    "dev:worker": "npm run dev -w packages/worker",
    "dev:memory": "npm run dev -w packages/memory"
  }
}
```

Each package builds with TypeScript:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

## Test Environment

### Environment Variables for Testing

Tests run with `CI=true` environment variable:

```typescript
const { stdout, stderr } = await execAsync(testCmd, {
  cwd: job.data.cwd || '/opt/nexus',
  timeout,
  env: { ...process.env, CI: 'true' },  // Signal CI environment
});
```

### Logging During Tests

All test execution is logged via Winston:

```typescript
logger.info(`Running test: ${testCmd}`);
logger.info(`Test result: ${passed ? 'PASSED' : 'FAILED'}`, { outputLen: output.length });
logger.error(`Test error: ${err.message}`);
```

Logs are written to:
- Console output
- File: `/opt/nexus/logs/worker.log` (rotated, max 10MB, 3 files)

## Deployment & Infrastructure Testing

### Docker Compose for Services

**File**: `deploy/docker-compose.yml`

Infrastructure includes:
- Redis (job queue and caching)
- Firecrawl (web scraping service)
- Playwright container (E2E testing)

### Health Checks

API health endpoints for verification:

```typescript
// In createApiServer()
app.get('/api/health', async (_req, res) => {
  const uptime = process.uptime();
  const redisOk = await redis.ping().catch(() => 'FAIL');
  res.json({ status: 'ok', uptime: Math.floor(uptime), redis: redisOk === 'PONG' ? 'ok' : 'error' });
});

app.get('/mcp/health', (_, res) => res.json({ status: 'ok', sessions: Object.keys(transports).length }));
```

## Job Monitoring

### Worker Status

Monitor job processing with worker event handlers:

```typescript
worker.on('failed', (job, err) => {
  logger.error(`Job failed: ${job?.name}`, { id: job?.id, error: err.message });
});

worker.on('completed', (job) => {
  logger.info(`Job done: ${job.name}`, { id: job.id });
});
```

### Result Retrieval

Retrieve test results from Redis:

```typescript
const result = await redis.get(`nexus:result:${jobId}`);
if (result) {
  const parsed = JSON.parse(result);
  console.log(parsed.success ? 'PASSED' : 'FAILED');
  console.log(parsed.message);
}
```

## Future Testing Enhancements

### Recommended Additions

1. **Unit Testing Framework** (Vitest recommended for ESM)
2. **Integration Tests** for API endpoints
3. **GitHub Actions Pipeline** for automated testing on push
4. **Test Coverage Reports** (c8 or nyc)
5. **Contract Testing** for MCP server
6. **Performance Benchmarking** for critical paths

