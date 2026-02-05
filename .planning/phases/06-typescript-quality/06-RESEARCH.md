# Phase 6: TypeScript Quality - Research

**Researched:** 2026-02-04
**Domain:** TypeScript type safety, error handling, monitoring
**Confidence:** HIGH

## Summary

This research investigates the current state of TypeScript type safety and error handling across the Nexus daemon and livinityd modules. The codebase has **moderate type safety issues** with ~116 `any` usages in Nexus core and ~78 `any` usages in livinityd modules. Error handling is generally good (most catch blocks log properly), but there is **one silent error swallowing** case and **no error aggregation/monitoring hooks** for production observability.

The codebase already has good foundations:
- Nexus has a well-designed `infra/errors.ts` module with error categorization, retry logic, and formatting utilities
- Both codebases use Winston/custom loggers consistently
- Most catch blocks do log errors appropriately

**Primary recommendation:** Focus on typing the external API boundaries (JSON responses, external library callbacks), fixing the one silent catch, and adding error aggregation hooks for monitoring.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.x | Type system | Industry standard |
| Zod | 4.x | Runtime validation | Used in both codebases |
| Winston | 3.x | Logging (Nexus) | Production-grade structured logging |
| chalk-template | - | Logging (livinityd) | Developer experience |

### Recommended Additions
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| type-fest | latest | Utility types | Complex type transformations |
| ts-pattern | latest | Exhaustive matching | Error handling switches |

### No New Dependencies Needed
The existing error handling infrastructure in `nexus/packages/core/src/infra/errors.ts` is well-designed and should be extended rather than replaced. No Sentry or external error tracking is needed at this stage - local error aggregation hooks suffice.

## Architecture Patterns

### Current Error Handling Pattern (Good)
```typescript
// Source: nexus/packages/core/src/daemon.ts
try {
  await someOperation();
} catch (err: any) {
  logger.error('Operation failed', { context: 'value', error: err.message });
  // Handle or rethrow appropriately
}
```

### Recommended Pattern: Typed Catch
```typescript
// Replace catch (err: any) with proper typing
try {
  await someOperation();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Operation failed', { context: 'value', error: message });
}
```

### Recommended Pattern: Error Aggregation Hook
```typescript
// Add to nexus/packages/core/src/infra/errors.ts
type ErrorHandler = (error: unknown, context: ErrorContext) => void;

interface ErrorContext {
  module: string;
  operation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

const errorHandlers: ErrorHandler[] = [];

export function registerErrorHandler(handler: ErrorHandler): void {
  errorHandlers.push(handler);
}

export function reportError(error: unknown, context: ErrorContext): void {
  for (const handler of errorHandlers) {
    try {
      handler(error, context);
    } catch {
      // Don't let error handlers break the application
    }
  }
}
```

### Anti-Patterns to Avoid
- **`catch (err: any)`**: Lose type information unnecessarily
- **Silent catch blocks**: `catch (e) {}` - always log or handle
- **`as any` for JSON**: Use proper types or `unknown` with guards

## Inventory: `any` Type Locations

### Nexus Core (`nexus/packages/core/src/`) - 116 occurrences

**High Priority (frequently used, should fix):**

| File | Line | Pattern | Suggested Fix |
|------|------|---------|---------------|
| daemon.ts | 61, 74, 393, 528, 595, 601, 717, 824, 915, 1068, 1090, 1119, 1211, 1236, 1266, 1270, 1317, 1345, 1351, 1360, 1389, 1427, 1431, 1479, 1510, 1538, 1584, 1615, 1635, 1652, 1681, 1697, 1712, 1766, 1811, 1869, 1903, 1949, 1979, 2034, 2044, 2069, 2116, 2134, 2178, 2284, 2356 | `Record<string, any>`, `catch (err: any)`, `as any` | Create interfaces for params, use `unknown` in catches |
| api.ts | 30, 128, 139, 167, 178, 189, 199, 209, 219, 230, 246, 264, 278, 292, 309, 325, 342, 362, 382, 402, 422, 440, 461, 477, 494, 515, 533, 549, 570, 600, 601, 627, 649, 689, 705 | `any[]`, `catch (err: any)`, `as any` | Type API responses, use error utilities |
| mcp-client-manager.ts | 310, 317, 343, 373, 392, 413 | `schema: any`, `propSchema as any`, `catch (err: any)` | Create JSON Schema types |
| schedule-manager.ts | 31, 151 | `as any`, `s: any` | Type Redis options, scheduler response |
| router.ts | 7, 16 | `Record<string, any>`, `data?: any` | Create specific param/data interfaces |

**Medium Priority (less critical):**

| File | Line | Pattern | Suggested Fix |
|------|------|---------|---------------|
| docker-manager.ts | 126, 139 | `Promise<Record<string, any>>`, `m: any` | Create Docker inspection types |
| heartbeat-runner.ts | 210, 231, 401 | `catch (err: any)` | Use error utilities |
| brain.ts | 173 | `catch (err: any)` | Use error utilities |
| session-manager.ts | 191, 208, 234, 252, 295 | `catch (err: any)` | Use error utilities |
| agent.ts | 325, 543 | `catch (err: any)` | Use error utilities |
| channels/discord.ts | 122, 136, 199, 227 | `catch (err: any)` | Use error utilities |
| channels/telegram.ts | 110, 132, 183, 203, 222 | `catch (err: any)` | Use error utilities |
| channels/index.ts | 36, 86, 112, 140, 171 | `catch (err: any)` | Use error utilities |
| skill-loader.ts | 112, 132, 279, 315, 365, 373 | `catch (err: any)`, `Record<string, any>`, `as any` | Create skill types |
| skill-generator.ts | 162, 171 | `catch (err: any)` | Use error utilities |
| config/manager.ts | 131, 137 | `as any` | Use proper generic types |
| shell.ts | 41, 43 | `(error as any).code`, `(error as any).killed` | Create shell error interface |

**Other Nexus Packages:**
| Package | File | Line | Pattern |
|---------|------|------|---------|
| mcp-server | tools/index.ts | 9 | `Record<string, any>` |
| memory | index.ts | 166, 255, 288, 300, 320, 339 | `catch (err: any)` |
| worker | index.ts | 14 | `Record<string, (job: Job) => Promise<any>>` |
| worker | jobs/*.ts | various | `data?: any`, `catch (err: any)` |

### livinityd Modules (`livos/packages/livinityd/source/modules/`) - 78 occurrences

**High Priority:**

| File | Line | Pattern | Suggested Fix |
|------|------|---------|---------------|
| ai/routes.ts | 105, 136, 159, 264, 308, 355, 381, 415, 438, 473, 499, 538, 566, 590, 619, 653, 680 | `catch (error: any)` | Use error utilities or `unknown` |
| ai/index.ts | 141, 194, 219 | `event: any`, `catch (error: any)` | Create event types |
| cli-client.ts | 39, 59, 62, 85, 92, 93 | `: any`, `Record<string, any>`, `procedure: any` | Create CLI types |
| server/index.ts | 38, 405 | `Promise<any>`, `as any` | Type handler returns |
| files/files.ts | 981, 984 | `options as any`, `file as any` | Check fs-extra types |
| apps/app.ts | 24, 485 | `data: any`, `{[key: string]: any}` | Create YAML and widget types |
| apps/app-repository.ts | 186 | `a: any, b: any` | Type sort callback |
| utilities/file-store.ts | 76, 83 | `store as any` | Type property access |
| utilities/docker-pull.ts | 24, 34 | `output: any`, `event: any` | Create Docker types |

**Medium Priority:**

| File | Line | Pattern |
|------|------|---------|
| widgets/routes.ts | 98 | `{[key: string]: any}` |
| jwt.ts | 57 | `as any` |
| domain/dns-check.ts | 50 | `catch (err: any)` |
| migration/migration.ts | 176 | `as any` |
| startup-migrations/index.ts | 14, 125 | `data: any`, `compose as any` |
| system/factory-reset.ts | 83, 110, 120, 174 | `(err as any).message` |
| utilities/logger.ts | 15, 33 | `error?: any` |
| files/network-storage.ts | 284 | `as any` |
| server/trpc/*.ts | various | `Promise<any>` |
| apps/legacy-compat/*.ts | various | `options as any` |

**Test Files (Lower Priority):**
Multiple test files use `any` for mocking - these are acceptable but could be improved.

## Inventory: Problematic Catch Blocks

### Silent Error Swallowing (CRITICAL)

| File | Line | Code | Impact |
|------|------|------|--------|
| `livos/packages/livinityd/source/modules/files/network-storage.ts` | 106 | `} catch (error) {}` | Network share mount failures silently ignored |

**Context:** This is inside a loop that checks mounted shares. The error is swallowed completely, making debugging network mount issues very difficult.

**Recommended Fix:**
```typescript
} catch (error) {
  this.logger.verbose(`Share check failed for ${share.mountPath}: ${error instanceof Error ? error.message : String(error)}`);
}
```

### Catch Blocks That Could Be Improved

Most catch blocks in both codebases DO log errors properly. However, they use `catch (err: any)` which loses type safety. The recommended pattern is:

```typescript
// Before
} catch (err: any) {
  logger.error('Failed', { error: err.message });
}

// After
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Failed', { error: message });
}
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error categorization | Custom error codes | `infra/errors.ts` | Already has ERROR_CATEGORIES, isRetryableError, etc. |
| Error message extraction | Manual type checking | `formatErrorMessage()` | Handles all edge cases |
| Retry logic | Custom retry loops | `infra/retry.ts` | Already has exponential backoff |
| JSON Schema to types | Manual interfaces | Zod `.infer<>` | Already using Zod |

**Key insight:** The Nexus codebase already has excellent error infrastructure. Don't create new utilities - extend and use the existing ones.

## Common Pitfalls

### Pitfall 1: Over-Typing External APIs
**What goes wrong:** Creating complex interfaces for JSON responses that change frequently
**Why it happens:** Desire for complete type coverage
**How to avoid:** Use `unknown` with runtime guards for external data, or keep types minimal
**Warning signs:** Types that need frequent updates when external APIs change

### Pitfall 2: Breaking Working Code
**What goes wrong:** Refactoring `any` to strict types causes runtime errors
**Why it happens:** `any` was masking actual type mismatches
**How to avoid:** Add runtime validation when tightening types
**Warning signs:** Tests fail after type changes

### Pitfall 3: Type Gymnastics
**What goes wrong:** Complex conditional types that are hard to understand
**Why it happens:** Trying to make types "perfect"
**How to avoid:** Prefer simple interfaces over complex type computations
**Warning signs:** Types that require `// @ts-ignore` or `as unknown as X`

## Code Examples

### Example 1: Replacing `catch (err: any)`
```typescript
// Before (daemon.ts pattern)
} catch (err: any) {
  logger.error('Operation failed', { error: err.message });
}

// After
import { formatErrorMessage } from './infra/errors.js';

} catch (err) {
  logger.error('Operation failed', { error: formatErrorMessage(err) });
}
```

### Example 2: Typing Record Parameters
```typescript
// Before (router.ts)
interface RouteContext {
  params: Record<string, any>;
}

// After
interface RouteContext<T extends Record<string, unknown> = Record<string, unknown>> {
  params: T;
}

// Usage
interface DeployParams {
  appName: string;
  environment: string;
}

function handleDeploy(ctx: RouteContext<DeployParams>) {
  console.log(ctx.params.appName); // Typed!
}
```

### Example 3: Error Aggregation Hook
```typescript
// Add to nexus/packages/core/src/infra/errors.ts

export interface ErrorContext {
  module: string;
  operation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

type ErrorHandler = (error: unknown, context: ErrorContext) => void;

const errorHandlers: Set<ErrorHandler> = new Set();

export function registerErrorHandler(handler: ErrorHandler): () => void {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

export function reportError(error: unknown, context: ErrorContext): void {
  for (const handler of errorHandlers) {
    try {
      handler(error, context);
    } catch {
      // Silent - don't let error handlers break the app
    }
  }
}

// Usage in daemon.ts
import { reportError, formatErrorMessage } from './infra/errors.js';

} catch (err) {
  const message = formatErrorMessage(err);
  logger.error('Scheduled job execution error', { subagentId: data.subagentId, error: message });
  reportError(err, {
    module: 'scheduler',
    operation: 'executeJob',
    severity: 'high',
    metadata: { subagentId: data.subagentId },
  });
}
```

### Example 4: Typing External Library Callbacks
```typescript
// Before (docker-manager.ts)
mounts: info.Mounts?.map((m: any) => `${m.Source} -> ${m.Destination}`),

// After
interface DockerMount {
  Type: string;
  Source: string;
  Destination: string;
  Mode: string;
  RW: boolean;
  Propagation: string;
}

interface DockerContainerInfo {
  Mounts?: DockerMount[];
  // ... other fields
}

const info = await this.docker.getContainer(name).inspect() as DockerContainerInfo;
mounts: info.Mounts?.map((m) => `${m.Source} -> ${m.Destination}`),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `catch (e: any)` | `catch (e: unknown)` | TS 4.0 (2020) | Better type safety in catch blocks |
| Type assertions | Type guards | Best practice | Runtime safety |
| `any` for JSON | Zod validation | 2022+ | Runtime + compile-time safety |

**Deprecated/outdated:**
- Using `@types/X` when library has built-in types
- `ts-ignore` over `ts-expect-error`

## Open Questions

Things that couldn't be fully resolved:

1. **pm2 Process Type**
   - What we know: Used for `pm2.list()` results, typed as `any`
   - What's unclear: Exact pm2 type definitions
   - Recommendation: Use `@types/pm2` or define minimal interface

2. **MCP JSON Schema Types**
   - What we know: External MCP schemas have complex structures
   - What's unclear: Whether there are official TypeScript types
   - Recommendation: Use `json-schema` types or keep minimal

3. **Dockerode Types**
   - What we know: `@types/dockerode` is installed
   - What's unclear: Why `as any` is used in some places
   - Recommendation: Investigate if types are incomplete

## Sources

### Primary (HIGH confidence)
- Codebase analysis via Grep/Read tools
- TypeScript documentation (built-in knowledge)

### Secondary (MEDIUM confidence)
- Current error handling patterns observed in code
- Zod usage patterns in existing codebase

## Metadata

**Confidence breakdown:**
- `any` inventory: HIGH - direct code analysis
- Catch block inventory: HIGH - direct code analysis
- Error patterns: HIGH - examined existing infrastructure
- Recommendations: MEDIUM - based on TypeScript best practices

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable domain)
