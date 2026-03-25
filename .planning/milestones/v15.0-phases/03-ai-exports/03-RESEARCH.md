# Phase 3: AI Exports - Research

**Researched:** 2026-02-03
**Domain:** TypeScript module exports, monorepo package sharing
**Confidence:** HIGH

## Summary

This phase involves exporting `SubagentManager`, `ScheduleManager`, and `AgentEvent` from the Nexus core package so that LivOS can import them directly instead of relying on its duplicate `@livos/livcoreai` package.

The research reveals that:
1. **All three components exist in Nexus** at `nexus/packages/core/src/` with identical APIs to livcoreai
2. **Current Nexus index.ts is a daemon entry point**, not a library export file - it runs `main()` on import
3. **LivOS livinityd currently imports** `SubagentManager`, `ScheduleManager`, and `AgentEvent` from `@livos/livcoreai`
4. **TypeScript is already configured correctly** with `declaration: true` - `.d.ts` files are generated

**Primary recommendation:** Create a new `lib.ts` entry point in Nexus that re-exports the managers and types, then add package.json `exports` field to expose both the daemon entry and library exports.

## Standard Stack

This phase requires no new libraries - it's restructuring existing TypeScript exports.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7.0 | Type generation via `declaration: true` | Already configured in nexus |
| pnpm workspaces | - | Monorepo package linking | Already used in livos |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | - | - |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate lib.ts | Named exports in index.ts | Would require refactoring daemon startup; lib.ts is cleaner separation |
| package.json exports | Direct file imports | exports field is the modern standard; provides cleaner DX |

## Architecture Patterns

### Recommended Project Structure

The Nexus core package should have:

```
nexus/packages/core/
├── src/
│   ├── index.ts          # Daemon entry point (runs main())
│   ├── lib.ts            # NEW: Library exports for external consumers
│   ├── subagent-manager.ts
│   ├── schedule-manager.ts
│   ├── agent.ts          # Contains AgentEvent
│   └── ...
├── dist/
│   ├── index.js          # Daemon compiled
│   ├── lib.js            # NEW: Library compiled
│   ├── lib.d.ts          # NEW: Type declarations
│   └── ...
└── package.json          # Add exports field
```

### Pattern 1: Dual Entry Points

**What:** Separate daemon startup from library exports using two entry files
**When to use:** When a package serves dual purposes (runnable + importable)
**Example:**

```typescript
// nexus/packages/core/src/lib.ts
// Library exports - safe to import without side effects

// Managers
export { SubagentManager } from './subagent-manager.js';
export type { SubagentConfig, SubagentMessage } from './subagent-manager.js';

export { ScheduleManager } from './schedule-manager.js';
export type { ScheduleJob, ScheduleJobData } from './schedule-manager.js';

// Agent types
export type { AgentEvent, AgentConfig, AgentResult } from './agent.js';
export { AgentLoop } from './agent.js';
```

### Pattern 2: Package.json Exports Field

**What:** Define explicit export paths in package.json for clean imports
**When to use:** When exposing multiple entry points from a single package
**Example:**

```json
// nexus/packages/core/package.json
{
  "name": "@nexus/core",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./lib": {
      "types": "./dist/lib.d.ts",
      "import": "./dist/lib.js"
    }
  }
}
```

### Pattern 3: Re-export with Type-Only Exports

**What:** Use `export type` for types to ensure they're erased at runtime
**When to use:** Always when exporting interfaces/types for external consumption
**Example:**

```typescript
// Correct - type is erased, no runtime import
export type { AgentEvent } from './agent.js';

// Also correct - explicit type export
export { type AgentEvent, AgentLoop } from './agent.js';
```

### Anti-Patterns to Avoid

- **Exporting from index.ts that has side effects:** The current index.ts calls `main()` - importing it starts the daemon
- **Missing .js extension:** ESM requires `.js` extensions in imports even for .ts files
- **Forgetting types field in exports:** Without `types`, TypeScript consumers won't get type hints

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package exports | Manual file imports | `exports` field in package.json | Standard, IDE-supported, versioned |
| Type declarations | Hand-written .d.ts | TypeScript `declaration: true` | Already configured, maintains sync |

**Key insight:** TypeScript's declaration output is already enabled - just need to export the right files.

## Common Pitfalls

### Pitfall 1: Importing Daemon Entry Instead of Library

**What goes wrong:** Consumer imports `@nexus/core` and the daemon starts unexpectedly
**Why it happens:** The main entry point (`index.ts`) contains executable code
**How to avoid:** Create separate `lib.ts` that only exports, add package.json exports
**Warning signs:** Unexpected Redis connections, log output on import

### Pitfall 2: Missing Types in Package Exports

**What goes wrong:** TypeScript consumers see `any` types, no intellisense
**Why it happens:** `exports` field doesn't include `types` condition
**How to avoid:** Always include `types` alongside `import` in exports
**Warning signs:** IDE showing `any` type, no autocomplete

### Pitfall 3: Redis Key Prefix Mismatch

**What goes wrong:** Nexus uses `nexus:subagent:` prefix, livcoreai uses `liv:subagent:`
**Why it happens:** Each package evolved independently with different prefixes
**How to avoid:** Document prefix difference; Phase 4 migration must handle this
**Warning signs:** Data not found after migration, dual keys in Redis

### Pitfall 4: Queue Name Mismatch in ScheduleManager

**What goes wrong:** BullMQ queue names differ: `nexus-schedules` vs `liv-schedules`
**Why it happens:** Hardcoded queue names in each implementation
**How to avoid:** This is a Phase 4 concern; for Phase 3, just note the difference
**Warning signs:** Scheduled jobs don't fire after migration

## Code Examples

### Creating lib.ts Export File

```typescript
// Source: Verified from nexus/packages/core/src/*.ts analysis
// nexus/packages/core/src/lib.ts

/**
 * @nexus/core library exports
 *
 * Import classes and types for external use:
 *   import { SubagentManager, ScheduleManager } from '@nexus/core/lib';
 *   import type { AgentEvent } from '@nexus/core/lib';
 */

// ── Managers ────────────────────────────────────────────────
export { SubagentManager } from './subagent-manager.js';
export type { SubagentConfig, SubagentMessage } from './subagent-manager.js';

export { ScheduleManager } from './schedule-manager.js';
export type { ScheduleJob, ScheduleJobData } from './schedule-manager.js';

// ── Agent Loop ──────────────────────────────────────────────
export { AgentLoop } from './agent.js';
export type { AgentEvent, AgentConfig, AgentResult } from './agent.js';

// ── Optional: Additional exports consumers may need ─────────
export { LoopRunner } from './loop-runner.js';
export { logger } from './logger.js';
```

### Updated package.json

```json
// Source: TypeScript handbook exports pattern
// nexus/packages/core/package.json
{
  "name": "@nexus/core",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./lib": {
      "types": "./dist/lib.d.ts",
      "import": "./dist/lib.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

### Consumer Import Pattern

```typescript
// Source: How livinityd will import after Phase 3
// livos/packages/livinityd/source/modules/ai/index.ts

import {
  SubagentManager,
  ScheduleManager,
  type AgentEvent,
} from '@nexus/core/lib';
// Note: This requires workspace linking in Phase 4
// For Phase 3, we're just preparing the exports
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single index.ts entry | exports field in package.json | Node 12.7+ (2019) | Better tree-shaking, clearer API |
| Wildcard exports | Explicit export paths | TypeScript 4.7+ (2022) | Type safety in module resolution |

**Deprecated/outdated:**
- `typings` field in package.json: Use `types` instead
- `module` field: ESM now uses `exports` with `import` condition

## Open Questions

1. **Redis prefix compatibility**
   - What we know: Nexus uses `nexus:` prefix, livcoreai uses `liv:`
   - What's unclear: Should exports be configurable or is migration handled in Phase 4?
   - Recommendation: Document as known difference; handle in Phase 4 migration

2. **BullMQ queue name**
   - What we know: Queue names are hardcoded (`nexus-schedules` vs `liv-schedules`)
   - What's unclear: Whether existing scheduled jobs will carry over
   - Recommendation: Phase 4 concern; for now, just export as-is

3. **Workspace linking**
   - What we know: pnpm workspaces can link cross-directory packages
   - What's unclear: Whether nexus is in livos pnpm workspace
   - Recommendation: Check in Phase 4 planning; Phase 3 is just preparing exports

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `nexus/packages/core/src/*.ts`
- Direct code inspection of `livos/packages/livcoreai/src/*.ts`
- Direct code inspection of `livos/packages/livinityd/source/modules/ai/index.ts`

### Secondary (MEDIUM confidence)
- TypeScript handbook module resolution (training knowledge, widely stable)
- Node.js package.json exports field documentation (training knowledge, stable since Node 12)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external research needed, internal codebase analysis
- Architecture: HIGH - Standard TypeScript/Node patterns, verified against codebase
- Pitfalls: HIGH - Identified from actual code differences between nexus and livcoreai

**Research date:** 2026-02-03
**Valid until:** 60 days (stable internal architecture, no external dependencies)

---

## Appendix: Key File Locations

### Nexus (source of truth)

| Component | File |
|-----------|------|
| SubagentManager | `nexus/packages/core/src/subagent-manager.ts` |
| ScheduleManager | `nexus/packages/core/src/schedule-manager.ts` |
| AgentEvent | `nexus/packages/core/src/agent.ts` (line 10-14) |
| Package config | `nexus/packages/core/package.json` |
| TypeScript config | `nexus/packages/core/tsconfig.json` (extends `../../tsconfig.base.json`) |

### LivOS (consumer)

| Component | File |
|-----------|------|
| AI Module (imports managers) | `livos/packages/livinityd/source/modules/ai/index.ts` |
| Current livcoreai package | `livos/packages/livcoreai/` (duplicate to be deleted in Phase 4) |

### Interface Comparison

**SubagentManager** - IDENTICAL interface in both packages:
- `create(config)`, `get(id)`, `list()`, `update(id, updates)`
- `recordRun(id, result)`, `delete(id)`
- `addMessage(id, message)`, `getHistory(id, limit)`, `getHistoryContext(id, limit)`
- `getScheduledAgents()`, `getLoopAgents()`

**ScheduleManager** - IDENTICAL interface in both packages:
- `constructor(redis)`, `onJob(handler)`, `start()`, `stop()`
- `addSchedule(schedule)`, `removeSchedule(subagentId)`
- `addDelayedJob(subagentId, task, delayMs)`, `listSchedules()`

**AgentEvent** - IDENTICAL type in both packages:
```typescript
export interface AgentEvent {
  type: 'thinking' | 'chunk' | 'tool_call' | 'observation' | 'final_answer' | 'error' | 'done';
  turn?: number;
  data?: unknown;
}
```

**Key Difference:** Redis key prefixes
- Nexus: `nexus:subagent:`, `nexus:subagents`, `nexus:subagent_history:`, queue `nexus-schedules`
- LivOS: `liv:subagent:`, `liv:subagents`, `liv:subagent_history:`, queue `liv-schedules`
