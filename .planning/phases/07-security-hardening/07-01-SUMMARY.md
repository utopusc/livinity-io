---
phase: 07-security-hardening
plan: 01
subsystem: memory-service
tags: [security, authentication, api-key, middleware]

dependency-graph:
  requires: []
  provides: [memory-auth-middleware, protected-memory-endpoints]
  affects: [07-02, 07-03]

tech-stack:
  added: []
  patterns: [api-key-auth, timing-safe-comparison, graceful-degradation]

key-files:
  created:
    - nexus/packages/memory/src/auth.ts
  modified:
    - nexus/packages/memory/src/index.ts

decisions:
  - id: SEC-MEM-01
    choice: "timingSafeEqual for API key comparison"
    reason: "Prevents timing attacks that could leak key information"
  - id: SEC-MEM-02
    choice: "Graceful degradation when LIV_API_KEY not configured"
    reason: "Allows development without auth setup while warning operators"
  - id: SEC-MEM-03
    choice: "Health endpoint remains public"
    reason: "Required for load balancers and monitoring systems"

metrics:
  duration: 2 min
  completed: 2026-02-04
---

# Phase 7 Plan 1: Memory Service Authentication Summary

**One-liner:** API key authentication middleware for memory service using constant-time comparison.

## What Was Done

### Task 1: Create auth middleware module
Created `nexus/packages/memory/src/auth.ts` with:
- `requireApiKey` middleware function
- `timingSafeEqual` from `node:crypto` for constant-time comparison
- Graceful degradation: warns but allows if `LIV_API_KEY` not configured
- Returns 401 with helpful hints for missing/invalid keys
- Buffer length check before timingSafeEqual (required by the API)

### Task 2: Integrate auth middleware into memory service
Modified `nexus/packages/memory/src/index.ts`:
- Added import for `requireApiKey` from `./auth.js`
- Placed `app.use(requireApiKey)` after `/health` endpoint
- Route order ensures:
  - `/health` - PUBLIC (line 131)
  - `requireApiKey` - AUTH BARRIER (line 136)
  - `/add`, `/search`, `/memories/:userId`, `/memories/:id`, `/reset`, `/stats` - PROTECTED

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| nexus/packages/memory/src/auth.ts | Created | +61 |
| nexus/packages/memory/src/index.ts | Modified | +5, -1 |

## Key Code

**auth.ts - Constant-time comparison:**
```typescript
import { timingSafeEqual } from 'node:crypto';

const expectedBuffer = Buffer.from(LIV_API_KEY, 'utf8');
const providedBuffer = Buffer.from(providedKey, 'utf8');

if (expectedBuffer.length !== providedBuffer.length) {
  res.status(401).json({ error: 'Invalid API key' });
  return;
}

if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
  res.status(401).json({ error: 'Invalid API key' });
  return;
}
```

**index.ts - Middleware placement:**
```typescript
// Health check (public - no auth required)
app.get('/health', (req, res) => { ... });

// Auth middleware - all routes below this require X-API-Key header
app.use(requireApiKey);

// Protected routes below...
```

## Commits

| Hash | Type | Description |
|------|------|-------------|
| af63ddb | feat | Create auth middleware for memory service |
| e4bc0b7 | feat | Integrate auth middleware into memory service |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. auth.ts exports requireApiKey - PASS
2. auth.ts uses timingSafeEqual - PASS
3. index.ts imports requireApiKey - PASS
4. index.ts uses requireApiKey middleware - PASS
5. /health endpoint before auth middleware - PASS (line 131 before line 136)

## Notes

- Pre-existing TypeScript errors in memory/index.ts related to missing type declarations for better-sqlite3 and ioredis (not introduced by this plan)
- The auth middleware pattern established here will be reused in 07-02 (nexus API) and 07-03 (AI service)

## Next Phase Readiness

Ready for:
- 07-02: Nexus API authentication (same pattern)
- 07-03: AI service authentication (same pattern)
- 07-04: Security documentation
