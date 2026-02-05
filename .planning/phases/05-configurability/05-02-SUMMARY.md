---
phase: 05-configurability
plan: 02
subsystem: frontend-infrastructure
tags: [vite, pm2, environment-variables, build-time-constants]

dependency-graph:
  requires:
    - 01-01 (config package patterns)
    - 02-01 (.env.example with VITE_ and LIVOS_ variables)
  provides:
    - configurable frontend marketplace URL
    - configurable frontend backend URL
    - configurable PM2 paths
  affects:
    - deployment configurations
    - custom installation paths

tech-stack:
  patterns:
    - vite define block for build-time constants
    - declare const for TypeScript global awareness
    - CommonJS template literals for path interpolation

key-files:
  modified:
    - livos/packages/ui/vite.config.ts
    - livos/packages/ui/src/modules/window/app-contents/app-store-routes/marketplace-app-window.tsx
    - livos/ecosystem.config.cjs

decisions:
  - id: frontend-build-constants
    choice: "Use Vite define block with __MARKETPLACE_URL__ pattern"
    rationale: "Cleaner than import.meta.env for constants, string replacement at build time"
  - id: origin-check-dynamic
    choice: "Derive marketplace origin from URL at runtime"
    rationale: "Maintains security while supporting custom marketplace URLs"

metrics:
  duration: "3 minutes"
  completed: "2026-02-04"
---

# Phase 5 Plan 02: Frontend and Infrastructure Path Configuration Summary

**One-liner:** VITE_ environment variables for frontend URLs, LIVOS_ variables for PM2 paths with sensible defaults.

## What Was Done

### Task 1: Frontend Environment Variables

Modified `livos/packages/ui/vite.config.ts`:
- Added `define` block with `__MARKETPLACE_URL__` build-time constant
- Proxy target now reads `VITE_BACKEND_URL` with `https://livinity.cloud` fallback

Modified `livos/packages/ui/src/modules/window/app-contents/app-store-routes/marketplace-app-window.tsx`:
- Added TypeScript `declare const __MARKETPLACE_URL__: string`
- Replaced hardcoded URL with build-time constant
- Origin check now dynamically derives from `MARKETPLACE_URL` instead of hardcoded string

### Task 2: PM2 Path Configuration

Modified `livos/ecosystem.config.cjs`:
- Added path variables at top:
  ```javascript
  const LIVOS_BASE = process.env.LIVOS_BASE_DIR || '/opt/livos';
  const LIVOS_DATA = process.env.LIVOS_DATA_DIR || `${LIVOS_BASE}/data`;
  const LIVOS_LOGS = process.env.LIVOS_LOGS_DIR || `${LIVOS_BASE}/logs`;
  ```
- All `cwd` paths use `${LIVOS_BASE}`
- All data directory references use `${LIVOS_DATA}`
- All log file paths use `${LIVOS_LOGS}`
- Python interpreter path also uses `${LIVOS_BASE}`

## Key Patterns

### Build-Time Constants (Vite)
```typescript
// vite.config.ts
define: {
  __MARKETPLACE_URL__: JSON.stringify(
    process.env.VITE_MARKETPLACE_URL || 'https://apps.livinity.io'
  ),
},

// Component file
declare const __MARKETPLACE_URL__: string;
const MARKETPLACE_URL = __MARKETPLACE_URL__;
```

### Dynamic Origin Validation
```typescript
const marketplaceOrigin = new URL(MARKETPLACE_URL).origin;
if (event.origin !== marketplaceOrigin) return;
```

### Path Variables (CommonJS)
```javascript
const LIVOS_BASE = process.env.LIVOS_BASE_DIR || '/opt/livos';
cwd: `${LIVOS_BASE}/packages/livinityd`,
```

## Verification Results

| Check | Result |
|-------|--------|
| VITE_ references in vite.config.ts | 2 (VITE_BACKEND_URL, VITE_MARKETPLACE_URL) |
| Hardcoded domains in marketplace-app-window.tsx | 0 |
| LIVOS_ references in ecosystem.config.cjs | 3 (BASE_DIR, DATA_DIR, LOGS_DIR) |
| vite.config.ts TypeScript check | Pass (no errors in modified files) |
| ecosystem.config.cjs syntax check | Pass |

## Commits

| Hash | Description |
|------|-------------|
| b81ee16 | feat(05-02): replace hardcoded frontend domains with VITE_ variables |
| 71c71cf | feat(05-02): replace hardcoded paths in PM2 ecosystem config |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Plan 05-02 complete. Frontend and infrastructure files now use environment variables with sensible defaults, supporting:
- Custom marketplace instances
- Custom backend URLs
- Non-standard installation paths
