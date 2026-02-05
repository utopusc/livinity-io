# Coding Conventions

**Analysis Date:** 2026-02-03

## Naming Patterns

**Files:**
- TypeScript files use kebab-case: `use-color-thief.ts`, `file-store.ts`, `session-manager.ts`
- Test files use `.test.ts` or `.spec.ts` suffix with descriptive prefixes: `files.list.integration.test.ts`, `system.unit.test.ts`
- React components use kebab-case files but PascalCase exports: `file-item-icon.tsx` exports `FileItemIcon`
- Index files (`index.ts`) for barrel exports from directories

**Functions:**
- camelCase for all functions: `createTestLivinityd`, `getCpuTemperature`, `formatErrorMessage`
- React hooks prefixed with `use`: `useColorThief`, `useNavigate`, `useSearchFiles`
- Async functions use descriptive verbs: `fetchData`, `processQueue`, `handleLoad`

**Variables:**
- camelCase for variables: `longestScope`, `directoryListing`, `colorCount`
- UPPER_SNAKE_CASE for constants: `JWT_LOCAL_STORAGE_KEY`, `ERROR_CATEGORIES`, `WA_CHUNK_SIZE`
- Boolean variables prefixed with `is`, `has`, `should`: `isRetryable`, `hasMore`, `shouldRetry`

**Types:**
- PascalCase for types and interfaces: `ToolParameter`, `ChatMessage`, `NexusConfig`
- Schema suffix for Zod schemas: `RetryConfigSchema`, `AgentDefaultsSchema`
- Type suffix for inferred types: `NexusConfig = z.infer<typeof NexusConfigSchema>`

## Code Style

**Formatting:**
- Tool: Prettier
- Config: `livos/packages/ui/.prettierrc.js`
- Tabs for indentation (smart tabs)
- No trailing commas in single-line, trailing commas in multi-line
- Single quotes for strings
- No semicolons (Prettier handles auto-insertion)

**Linting:**
- Tool: ESLint with TypeScript plugin
- Config: `livos/packages/ui/.eslintrc.cjs`
- Key rules:
  - `@typescript-eslint/no-unused-vars`: warn
  - `@typescript-eslint/no-explicit-any`: off (any is allowed)
  - `react/jsx-key`: error
  - `tailwindcss/no-contradicting-classname`: warn
  - `no-mixed-spaces-and-tabs`: off (Prettier handles)

**TypeScript:**
- Target: ES2022
- Module: ES2022
- Strict mode: enabled
- Skip lib check: enabled
- ESM modules with `.js` extension in imports

## Import Organization

**Order (enforced by prettier-plugin-sort-imports):**
1. Third-party modules (React, libraries)
2. Empty line
3. Path alias imports (`@/`)
4. Empty line
5. Relative imports (`../`, `./`)

**Path Aliases:**
- `@/` maps to `src/` in UI package
- `workspace:*` for monorepo package references

**Pattern:**
```typescript
import {useState, useEffect} from 'react'
import {z} from 'zod'

import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {useNavigate} from '@/features/files/hooks/use-navigate'

import {formatItemName} from './utils/format-filesystem-name'
```

## Error Handling

**Patterns:**

1. **Error code extraction** (Nexus style):
```typescript
// nexus/packages/core/src/infra/errors.ts
export function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const errObj = err as { code?: unknown; statusCode?: unknown }
  if (typeof errObj.code === 'string') return errObj.code
  // ... more checks
}
```

2. **Categorized errors**:
```typescript
export const ERROR_CATEGORIES = {
  NETWORK: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'],
  RATE_LIMIT: ['429', 'RATE_LIMITED', 'TOO_MANY_REQUESTS'],
  AUTH: ['401', '403', 'UNAUTHORIZED'],
  SERVER: ['500', '502', '503', '504'],
  CLIENT: ['400', '404', '405', '422'],
}
```

3. **Bracketed error codes** (livinityd style):
```typescript
// Throw with code for machine parsing
throw new Error('[invalid-base]')
throw new Error('[path-not-absolute]')
throw new Error('[does-not-exist]')
```

4. **Try-catch with graceful fallback**:
```typescript
try {
  const rgbArr = colorThief.getPalette(img, colorCount)
  setColors(processColors(rgbArr))
} catch (error) {
  setColors(undefined) // Reset on error
}
```

## Logging

**Framework (Nexus):** Winston
```typescript
// nexus/packages/core/src/logger.ts
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({...})],
});
```

**Framework (livinityd):** Custom chalk-based logger
```typescript
// livos/packages/livinityd/source/modules/utilities/logger.ts
const log = (message = '', {logLevel, error}: LogOptions = {}) => {
  console.log(chalkTemplate`{white {blue [${scope}]} ${message}}`)
  if (error) console.log(error)
}
```

**Patterns:**
- Log structured metadata as objects: `logger.info('Message', { key: value })`
- Log levels: silent, fatal, error, warn, info, debug, trace
- Include context in log messages: `logger.warn('Brain: retrying LLM call', { attempt, maxAttempts })`

## Comments

**When to Comment:**
- Complex algorithms or business logic
- TODO/FIXME markers for future work
- JSDoc for public API functions
- Inline comments for non-obvious behavior

**JSDoc Pattern:**
```typescript
/**
 * Converts an RGB color value to HSL.
 * @param r The red color value (0-255)
 * @param g The green color value (0-255)
 * @param b The blue color value (0-255)
 * @return The HSL representation [h, s, l]
 */
function rgbToHsl(r: number, g: number, b: number) { ... }
```

**TODO Pattern:**
```typescript
// TODO: Re-enable this, we temporarily disable TS here since we broke tests
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
```

## Function Design

**Size:** Functions are generally kept focused and under 50 lines

**Parameters:**
- Use object parameters for 3+ args:
```typescript
interface ThinkOptions {
  prompt: string;
  systemPrompt?: string;
  tier?: ModelTier;
  maxTokens?: number;
}
async think(options: ThinkOptions): Promise<string>
```

**Return Values:**
- Use typed return objects for complex results:
```typescript
interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports
- Export types alongside implementations
- Re-export from index files for clean public API

**Barrel Files:**
```typescript
// index.ts
export { Brain } from './brain.js'
export { Router } from './router.js'
export type { NexusConfig } from './config/schema.js'
```

## Zod Schema Conventions

**Schema naming:** PascalCase with `Schema` suffix
```typescript
export const RetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  attempts: z.number().int().min(1).max(10).default(5),
}).strict().optional()
```

**Input validation in tRPC:**
```typescript
list: publicProcedure
  .input(z.object({
    path: z.string(),
    sortBy: z.enum(['name', 'type', 'modified', 'size']).default('name'),
    limit: z.number().positive().default(100),
  }))
  .query(async ({ctx, input}) => { ... })
```

## React Conventions

**Component structure:**
1. Imports
2. Types/interfaces
3. Component function
4. Hooks at top of component
5. Event handlers
6. Render logic
7. Export

**Hooks pattern:**
```typescript
export function useColorThief(ref: React.RefObject<HTMLImageElement>) {
  const [colors, setColors] = useState<string[] | undefined>()

  useEffect(() => {
    // Effect logic
    return () => { /* cleanup */ }
  }, [dependencies])

  return colors
}
```

---

*Convention analysis: 2026-02-03*
