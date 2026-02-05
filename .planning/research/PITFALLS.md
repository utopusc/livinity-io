# Refactoring Pitfalls: Node.js Monorepo Consolidation

Research findings for consolidating LivOS AI daemon implementations (livcoreai, nexus/core, livinityd AI routes) into a single Nexus implementation.

---

## 1. Common Mistakes When Removing Packages from Monorepos

### Pitfall 1.1: Orphaned Workspace References

**Warning Signs:**
- `workspace:*` references in package.json files pointing to removed packages
- Build failures with "package not found in workspace"
- pnpm/npm/yarn install errors

**Current Risk in LivOS:**
```json
// livinityd/package.json currently has:
"@livos/livcoreai": "workspace:*"
```

**Prevention Strategy:**
1. Before removing any package, run:
   ```bash
   # Find all workspace references
   grep -r "workspace:\*" --include="package.json" .
   grep -r "@livos/livcoreai" --include="*.ts" --include="*.tsx" .
   ```
2. Create an import map of all consumers before deletion
3. Update all references BEFORE removing the package
4. Run full build after each package removal

### Pitfall 1.2: Phantom Lock File Entries

**Warning Signs:**
- pnpm-lock.yaml still contains references to removed packages
- Mysterious dependency resolution during install
- Different behavior between fresh install and incremental install

**Prevention Strategy:**
1. After removing a package:
   ```bash
   rm -rf node_modules
   rm pnpm-lock.yaml  # Or yarn.lock / package-lock.json
   pnpm install
   ```
2. Commit the regenerated lock file
3. Verify in CI with fresh install

### Pitfall 1.3: Build Order Dependencies

**Warning Signs:**
- Build works locally but fails in CI
- Race conditions in parallel builds
- "Cannot find module" errors that appear intermittently

**Current Risk in LivOS:**
```json
// Root package.json build order:
"build": "pnpm --filter livinityd build && pnpm --filter @livos/livcoreai build && pnpm --filter ui build"
```

**Prevention Strategy:**
1. Use explicit build dependencies in pnpm-workspace.yaml or package.json
2. Add `dependsOn` in turborepo/nx configuration
3. Test build in clean environment before merging

---

## 2. Safely Refactoring Shared Dependencies

### Pitfall 2.1: Version Mismatches Across Packages

**Warning Signs:**
- Multiple versions of same dependency in lock file
- TypeScript type conflicts between packages
- Runtime "X is not a function" errors

**Current Risk in LivOS:**
Both `@livos/livcoreai` and `@nexus/core` depend on:
- `@anthropic-ai/sdk: ^0.39.0`
- `bullmq: ^5.0.0`
- `ioredis: ^5.4.0`
- `pg: ^8.13.0`
- `winston: ^3.17.0`

**Prevention Strategy:**
1. Use pnpm catalogs or package.json `overrides`:
   ```yaml
   # pnpm-workspace.yaml
   catalog:
     '@anthropic-ai/sdk': ^0.39.0
     bullmq: ^5.0.0
   ```
2. Centralize shared dependencies in a `packages/shared` or root package.json
3. Use `pnpm why <package>` to audit version trees

### Pitfall 2.2: Transitive Dependency Breakage

**Warning Signs:**
- Package A removes dependency X
- Package B implicitly relied on X being hoisted
- Package B breaks after A is updated

**Prevention Strategy:**
1. Use `pnpm --strict-peer-dependencies`
2. Explicitly declare all direct dependencies
3. Run `pnpm ls --depth=0` before and after changes
4. Add dependency validation to CI

### Pitfall 2.3: Peer Dependency Hell

**Warning Signs:**
- "WARN peer dependency" warnings during install
- React hook errors from multiple React versions
- Plugin/SDK version conflicts

**Prevention Strategy:**
1. Pin peer dependencies explicitly
2. Use `pnpm.peerDependencyRules.allowedVersions` for known safe mismatches
3. Test integration with actual runtime, not just type checking

---

## 3. Import/Export Patterns for Shared Code

### Pattern 3.1: Barrel Exports (Recommended)

```typescript
// packages/nexus-core/src/index.ts
export { AIEngine } from './engine';
export { MCPClient } from './mcp/client';
export type { AIConfig, ConversationContext } from './types';

// Consumer
import { AIEngine, MCPClient } from '@nexus/core';
```

**Benefits:**
- Single entry point for consumers
- Easier to refactor internals
- Tree-shakeable with proper configuration

**Risks:**
- Can increase bundle size if not tree-shaken
- Circular dependency potential

### Pattern 3.2: Deep Imports (Use Sparingly)

```typescript
// When barrel export causes circular dependencies
import { specificHelper } from '@nexus/core/utils/specific-helper';
```

**When to Use:**
- Circular dependency resolution
- Code splitting boundaries
- Performance-critical paths

### Pattern 3.3: Package Exports Field (Modern Approach)

```json
// package.json
{
  "exports": {
    ".": "./src/index.ts",
    "./mcp": "./src/mcp/index.ts",
    "./types": "./src/types/index.ts"
  }
}
```

**Benefits:**
- Explicit public API surface
- Prevents deep imports into internals
- Better tree-shaking

### Anti-Pattern: Relative Cross-Package Imports

```typescript
// NEVER DO THIS
import { helper } from '../../other-package/src/utils';

// ALWAYS use package name
import { helper } from '@nexus/other-package';
```

---

## 4. Testing Strategies During Major Refactoring

### Strategy 4.1: Characterization Tests (Golden Master)

Before refactoring, capture current behavior:

```typescript
// __tests__/characterization/ai-responses.test.ts
describe('AI Engine Characterization', () => {
  it('should produce consistent output for known inputs', async () => {
    const engine = new AIEngine(testConfig);
    const result = await engine.process(KNOWN_INPUT);
    expect(result).toMatchSnapshot();
  });
});
```

**Purpose:** Detect unintended behavior changes during refactoring.

### Strategy 4.2: Contract Tests

Define interface contracts before consolidation:

```typescript
// packages/shared/contracts/ai-engine.contract.ts
export interface AIEngineContract {
  chat(message: string, context: Context): Promise<Response>;
  executeSkill(name: string, params: unknown): Promise<SkillResult>;
}

// Test both old and new implementations against contract
describe.each([
  ['livcoreai', oldImplementation],
  ['nexus/core', newImplementation],
])('%s implements AIEngineContract', (name, impl) => {
  it('should handle chat requests', async () => {
    // Test contract compliance
  });
});
```

### Strategy 4.3: Incremental Migration with Feature Flags

```typescript
// config/feature-flags.ts
export const AI_ENGINE_VERSION = process.env.AI_ENGINE_VERSION || 'legacy';

// Usage
const engine = AI_ENGINE_VERSION === 'nexus'
  ? new NexusEngine()
  : new LegacyEngine();
```

**Rollout Plan:**
1. Deploy with flag off (0% traffic)
2. Enable for internal testing (1%)
3. Gradual rollout (10% -> 50% -> 100%)
4. Remove legacy code after stable period

### Strategy 4.4: Integration Test Isolation

```typescript
// Test setup that works with both implementations
beforeEach(async () => {
  // Use test containers or mocks for external services
  redis = await new RedisContainer().start();
  postgres = await new PostgresContainer().start();

  // Configure engine to use test infrastructure
  engine = createEngine({
    redis: redis.getConnectionUrl(),
    postgres: postgres.getConnectionString(),
  });
});
```

---

## 5. Migration Patterns for Breaking Changes

### Pattern 5.1: Facade Pattern (Adapter Layer)

```typescript
// packages/livcoreai-compat/src/index.ts
// Provides old API surface backed by new implementation

import { NexusEngine } from '@nexus/core';

/** @deprecated Use @nexus/core directly */
export class LivcoreAI {
  private nexus: NexusEngine;

  constructor(config: LegacyConfig) {
    // Transform legacy config to new format
    this.nexus = new NexusEngine(transformConfig(config));
  }

  /** @deprecated Use nexus.chat() instead */
  async sendMessage(msg: string): Promise<string> {
    const result = await this.nexus.chat(msg);
    return result.content; // Transform to legacy response format
  }
}
```

**Timeline:**
1. Week 1-2: Create facade, update consumers to use facade
2. Week 3-4: Update consumers to use new API directly
3. Week 5: Remove facade

### Pattern 5.2: Version-Based Migration

```typescript
// Support multiple API versions during transition
app.post('/api/v1/chat', legacyHandler);  // Keep during transition
app.post('/api/v2/chat', newHandler);     // New implementation

// Deprecation headers
legacyHandler.use((req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Mar 2026 00:00:00 GMT');
  next();
});
```

### Pattern 5.3: Codemod for Automated Migration

```javascript
// codemods/migrate-livcoreai-imports.js
export default function transformer(file, api) {
  const j = api.jscodeshift;

  return j(file.source)
    .find(j.ImportDeclaration, {
      source: { value: '@livos/livcoreai' }
    })
    .replaceWith(path => {
      return j.importDeclaration(
        path.node.specifiers,
        j.literal('@nexus/core')
      );
    })
    .toSource();
}
```

Usage:
```bash
npx jscodeshift -t codemods/migrate-livcoreai-imports.js packages/
```

---

## 6. Backwards Compatibility Strategies

### Strategy 6.1: Semantic Versioning Discipline

```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes (API signature changes, removed features)
MINOR: New features, backwards compatible
PATCH: Bug fixes only
```

**For this migration:**
- livcoreai: Bump to 2.0.0 (breaking: deprecated)
- nexus/core: Bump MINOR for new features from livcoreai

### Strategy 6.2: Deprecation Warnings

```typescript
/**
 * @deprecated Since v2.0.0. Use `@nexus/core` AIEngine.chat() instead.
 * Will be removed in v3.0.0.
 */
export function sendAIMessage(msg: string): Promise<string> {
  console.warn(
    '[DEPRECATION] sendAIMessage is deprecated. ' +
    'Migrate to @nexus/core AIEngine.chat(). ' +
    'See: https://docs.livos.dev/migration-guide'
  );
  return newImplementation(msg);
}
```

### Strategy 6.3: Runtime Compatibility Checks

```typescript
// Check for breaking environment changes
function validateEnvironment() {
  const required = ['ANTHROPIC_API_KEY', 'REDIS_URL'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `See migration guide: https://docs.livos.dev/v2-migration`
    );
  }

  // Check for renamed variables
  if (process.env.OLD_VAR_NAME && !process.env.NEW_VAR_NAME) {
    console.warn(
      'OLD_VAR_NAME is deprecated. Please rename to NEW_VAR_NAME.'
    );
    process.env.NEW_VAR_NAME = process.env.OLD_VAR_NAME;
  }
}
```

### Strategy 6.4: Database Migration Compatibility

```typescript
// Ensure data format compatibility during transition
interface LegacyConversation {
  id: string;
  messages: string;  // JSON string
}

interface NewConversation {
  id: string;
  messages: Message[];  // Proper array
}

// Migration function with backwards compatibility
function loadConversation(id: string): NewConversation {
  const data = db.get(id);

  // Handle both formats during transition
  if (typeof data.messages === 'string') {
    return {
      ...data,
      messages: JSON.parse(data.messages),
    };
  }

  return data as NewConversation;
}
```

---

## 7. Event-Driven Architecture: Replacing Polling with Pub/Sub

### Pattern 7.1: Redis Pub/Sub for Real-Time Updates

**Before (Polling):**
```typescript
// Anti-pattern: Polling for status updates
setInterval(async () => {
  const status = await getTaskStatus(taskId);
  if (status === 'complete') {
    handleCompletion(taskId);
  }
}, 1000);
```

**After (Pub/Sub):**
```typescript
import Redis from 'ioredis';

// Publisher (in task worker)
const publisher = new Redis();

async function completeTask(taskId: string, result: unknown) {
  await saveResult(taskId, result);
  await publisher.publish(`task:${taskId}:complete`, JSON.stringify(result));
}

// Subscriber (in API server)
const subscriber = new Redis();

function subscribeToTask(taskId: string): Promise<TaskResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscriber.unsubscribe(`task:${taskId}:complete`);
      reject(new Error('Task timeout'));
    }, 30000);

    subscriber.subscribe(`task:${taskId}:complete`);
    subscriber.on('message', (channel, message) => {
      if (channel === `task:${taskId}:complete`) {
        clearTimeout(timeout);
        subscriber.unsubscribe(channel);
        resolve(JSON.parse(message));
      }
    });
  });
}
```

### Pattern 7.2: BullMQ for Job Queues (Already in Use)

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';

const aiQueue = new Queue('ai-tasks', { connection: redis });
const queueEvents = new QueueEvents('ai-tasks', { connection: redis });

// Producer
async function queueAITask(task: AITask): Promise<string> {
  const job = await aiQueue.add('process', task);
  return job.id;
}

// Real-time job events (no polling!)
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed:`, returnvalue);
  notifyClient(jobId, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
  notifyClient(jobId, { error: failedReason });
});

// Consumer
const worker = new Worker('ai-tasks', async (job) => {
  return await processAIRequest(job.data);
}, { connection: redis });
```

### Pattern 7.3: EventEmitter for In-Process Events

```typescript
import { EventEmitter } from 'events';
import { TypedEmitter } from 'tiny-typed-emitter';

interface AIEngineEvents {
  'task:started': (taskId: string) => void;
  'task:progress': (taskId: string, progress: number) => void;
  'task:completed': (taskId: string, result: unknown) => void;
  'task:failed': (taskId: string, error: Error) => void;
}

class AIEngine extends TypedEmitter<AIEngineEvents> {
  async process(task: AITask): Promise<void> {
    this.emit('task:started', task.id);

    try {
      for await (const chunk of this.streamResponse(task)) {
        this.emit('task:progress', task.id, chunk.progress);
      }
      this.emit('task:completed', task.id, result);
    } catch (error) {
      this.emit('task:failed', task.id, error);
    }
  }
}

// Usage
const engine = new AIEngine();
engine.on('task:completed', (taskId, result) => {
  // React to completion without polling
});
```

### Pattern 7.4: WebSocket for Client Notifications

```typescript
import { WebSocket, WebSocketServer } from 'ws';

class NotificationHub {
  private wss: WebSocketServer;
  private clients: Map<string, Set<WebSocket>> = new Map();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    const userId = this.authenticateUser(req);

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(ws);

    ws.on('close', () => {
      this.clients.get(userId)?.delete(ws);
    });
  }

  // Called from event handlers, not polling loops
  notifyUser(userId: string, event: string, data: unknown) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const message = JSON.stringify({ event, data });
    for (const client of userClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

// Integration with Redis Pub/Sub for distributed systems
subscriber.on('message', (channel, message) => {
  const [_, userId, event] = channel.split(':');
  notificationHub.notifyUser(userId, event, JSON.parse(message));
});
```

### Pattern 7.5: Server-Sent Events (SSE) for Streaming

```typescript
// Lighter weight than WebSocket for server->client only
app.get('/api/stream/:taskId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const taskId = req.params.taskId;

  // Subscribe to Redis for this task
  const subscriber = new Redis();
  subscriber.subscribe(`task:${taskId}:progress`);

  subscriber.on('message', (channel, message) => {
    res.write(`data: ${message}\n\n`);
  });

  // Cleanup on client disconnect
  req.on('close', () => {
    subscriber.unsubscribe(`task:${taskId}:progress`);
    subscriber.quit();
  });
});
```

---

## Checklist Before Starting Refactoring

### Pre-Migration Checklist

- [ ] Map all import dependencies (`grep -r "@livos/livcoreai"`)
- [ ] Identify all API consumers (internal and external)
- [ ] Create characterization tests for current behavior
- [ ] Document current environment variables and config
- [ ] Audit database schemas that may need migration
- [ ] Set up feature flags infrastructure
- [ ] Create rollback plan

### During Migration Checklist

- [ ] One package at a time, full test suite after each
- [ ] Keep old package available via compatibility layer
- [ ] Update documentation with each change
- [ ] Monitor error rates in staging
- [ ] Communicate breaking changes to team

### Post-Migration Checklist

- [ ] Remove compatibility layers after transition period
- [ ] Clean up feature flags
- [ ] Delete deprecated packages from workspace
- [ ] Regenerate lock file from clean slate
- [ ] Update CI/CD pipelines
- [ ] Archive old documentation
- [ ] Performance benchmark comparison

---

## LivOS-Specific Recommendations

Given the current structure:

1. **Phase 1: Create Nexus Facade**
   - Keep `@livos/livcoreai` as a thin facade over `@nexus/core`
   - Update `livinityd` to use facade (no immediate changes needed)

2. **Phase 2: Direct Integration**
   - Add `@nexus/core` as dependency to `livinityd`
   - Update imports one module at a time
   - Run full test suite after each module

3. **Phase 3: Remove Legacy**
   - Remove `@livos/livcoreai` from workspace
   - Update `pnpm-workspace.yaml`
   - Clean install and test

4. **Event Architecture Migration**
   - Identify all polling loops in `livinityd`
   - Convert to BullMQ events (already a dependency)
   - Add WebSocket/SSE for real-time UI updates

---

*Last Updated: 2026-02-03*
*Research compiled for LivOS AI consolidation project*
