---
phase: 07-security-hardening
plan: 02
subsystem: nexus-api
tags: [security, authentication, api-key, middleware]

dependency-graph:
  requires:
    - 01-01 (config foundation)
    - 06-02 (formatErrorMessage utility)
  provides:
    - Nexus API authentication middleware
    - Protected /api/* endpoints (except /api/health)
  affects:
    - 07-03 (livinityd will use same pattern)
    - Any service calling Nexus API now needs X-API-Key header

tech-stack:
  added: []
  patterns:
    - timingSafeEqual for constant-time comparison
    - Middleware-based authentication
    - Graceful degradation when credentials not configured

key-files:
  created:
    - nexus/packages/core/src/auth.ts
  modified:
    - nexus/packages/core/src/api.ts

decisions:
  - key: auth-middleware-placement
    choice: Health endpoint before auth middleware
    reason: Health checks must remain public for monitoring/load balancers
  - key: graceful-degradation
    choice: Allow requests when LIV_API_KEY not configured
    reason: Development environments may not have keys set
  - key: error-response-format
    choice: JSON error objects with single "error" field
    reason: Consistent with existing Nexus API error responses

metrics:
  duration: 3 min
  completed: 2026-02-04
---

# Phase 7 Plan 2: Nexus API Authentication Summary

**One-liner:** API key middleware for Nexus using timingSafeEqual with public /api/health.

## What Was Built

Added API key authentication to the Nexus API (port 3200) using a timing-safe comparison middleware pattern.

### Components Created

**nexus/packages/core/src/auth.ts**
- `requireApiKey` middleware function
- Reads `LIV_API_KEY` from environment
- Uses `timingSafeEqual` from `node:crypto` to prevent timing attacks
- Returns 401 with `{ error: 'Missing API key' }` or `{ error: 'Invalid API key' }`
- Graceful degradation: logs warning and allows request when `LIV_API_KEY` not set

**nexus/packages/core/src/api.ts (modified)**
- Moved `/api/health` to be the first route (remains public)
- Added `app.use('/api', requireApiKey)` after health check
- All routes after health check now require authentication

### Route Protection Status

| Route Pattern | Protected | Notes |
|---------------|-----------|-------|
| `/api/health` | No | Public for monitoring |
| `/api/apps/*` | Yes | App management |
| `/api/webhook/git` | Yes | Git webhooks |
| `/api/notifications` | Yes | Notification polling |
| `/api/session` | Yes | Session management |
| `/api/status` | Yes | Daemon status |
| `/api/mcp/*` | Yes | MCP server management |
| `/api/nexus/*` | Yes | Nexus configuration |
| `/api/heartbeat/*` | Yes | Heartbeat control |
| `/api/subagents/*` | Yes | Subagent CRUD |
| `/api/schedules/*` | Yes | Schedule management |
| `/api/channels/*` | Yes | Channel management |
| `/api/agent/stream` | Yes | SSE agent streaming |
| `/ws/agent` | No | WebSocket (separate) |

## Technical Details

### Security Properties

1. **Timing-safe comparison:** Uses `timingSafeEqual` which performs comparison in constant time regardless of where characters differ, preventing timing attacks.

2. **Length check first:** Compares buffer lengths before `timingSafeEqual` call since the function requires equal-length inputs.

3. **No key logging:** Error handling logs error messages but never logs the actual API key values.

4. **Graceful degradation:** If `LIV_API_KEY` environment variable is not set, the middleware logs a warning and allows requests through. This prevents broken deployments but clearly indicates the security gap.

### Usage

Clients calling protected Nexus endpoints must include:

```
X-API-Key: <value-of-LIV_API_KEY>
```

### Error Responses

Missing key:
```json
{ "error": "Missing API key" }
```

Invalid key:
```json
{ "error": "Invalid API key" }
```

## Verification

- TypeScript compiles without errors
- `requireApiKey` exported from auth.ts
- api.ts imports and uses requireApiKey
- /api/health defined before auth middleware
- All other /api/* routes defined after auth middleware

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready for 07-03 (livinityd API authentication). The same pattern (auth middleware with timingSafeEqual) will be applied to livinityd's Hono server.

## Commits

| Hash | Description |
|------|-------------|
| b9610ab | feat(07-02): create API key auth middleware for Nexus |
| 417247f | feat(07-02): integrate auth middleware into Nexus API |
