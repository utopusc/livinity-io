# Phase 7: Security Hardening - Research

**Researched:** 2026-02-04
**Domain:** API Authentication & Secret Rotation
**Confidence:** HIGH

## Summary

This phase adds API key authentication to two internal services (memory service on port 3300, Nexus API on port 3200) and rotates production secrets that were exposed during development. The research covers standard patterns for Express.js API key authentication middleware and secret rotation procedures.

The codebase already has authentication patterns in LivOS's livinityd (JWT-based auth, proxy tokens) that can be referenced but not reused directly since the internal services use simple Express.js apps. The recommended approach is a simple middleware that validates `X-API-Key` header against a configured secret, following industry-standard patterns.

For secret rotation, three secrets need rotation: `GEMINI_API_KEY`, `JWT_SECRET`, and `LIV_API_KEY`. The GEMINI_API_KEY must be regenerated through Google AI Studio. The JWT_SECRET and LIV_API_KEY can be regenerated using `openssl rand -hex 32`.

**Primary recommendation:** Implement a simple API key middleware for both services that reads from the `LIV_API_KEY` environment variable, validates via `X-API-Key` header with constant-time comparison, and returns 401 for missing/invalid keys. Keep health endpoints public.

## Standard Stack

No new libraries required. This phase uses existing Express.js middleware patterns.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Express.js middleware | Built-in | Route-level authentication | Already in codebase, no dependencies |
| crypto.timingSafeEqual | Node.js built-in | Constant-time comparison | Prevents timing attacks |
| openssl | System | Secret generation | Cryptographically secure |

### No Additional Dependencies Needed

The existing Express.js setup provides everything needed. Do NOT install passport, passport-headerapikey, or api-key-auth packages - these add unnecessary complexity for simple internal service auth.

**Rationale:** These services only need to verify a single API key. Passport is designed for user authentication with multiple strategies. A simple middleware is more appropriate and easier to maintain.

## Architecture Patterns

### Pattern 1: Simple API Key Middleware

**What:** Express middleware that validates X-API-Key header
**When to use:** Internal service-to-service authentication
**Example:**

```typescript
// Source: Industry standard pattern
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

const API_KEY = process.env.LIV_API_KEY;

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // Skip auth if no API key is configured (dev mode)
  if (!API_KEY) {
    console.warn('[Auth] No LIV_API_KEY configured - authentication disabled');
    return next();
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    return res.status(401).json({ error: 'Missing API key' });
  }

  // Constant-time comparison to prevent timing attacks
  const keyBuffer = Buffer.from(API_KEY);
  const providedBuffer = Buffer.from(providedKey);

  if (keyBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(keyBuffer, providedBuffer)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
```

### Pattern 2: Selective Route Protection

**What:** Apply authentication to specific routes, keep health endpoints public
**When to use:** Services that need public health checks but protected APIs
**Example:**

```typescript
// Source: Express.js best practice
const app = express();

// Public routes (no auth)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected routes (require API key)
app.use(requireApiKey);  // All routes below this require auth
app.post('/add', ...);
app.post('/search', ...);
app.get('/memories/:userId', ...);
```

### Pattern 3: Header Extraction Fallback

**What:** Accept API key from multiple sources (header preferred, query as fallback)
**When to use:** When supporting legacy clients or testing tools
**Example:**

```typescript
// Source: Industry pattern from LogRocket
const apiKey = req.headers['x-api-key'] || req.query.api_key;
```

**Note:** For this phase, only support `X-API-Key` header. Query parameters expose keys in logs.

### Anti-Patterns to Avoid

- **String comparison with ===:** Vulnerable to timing attacks. Use `timingSafeEqual`.
- **Logging the API key:** Even partial logging exposes secrets. Log only "authentication failed".
- **Query parameter auth:** Keys appear in URLs, server logs, browser history.
- **Multiple API keys per service:** Unnecessary complexity. One shared key is sufficient for internal services.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Constant-time comparison | `if (key === providedKey)` | `crypto.timingSafeEqual()` | Timing attack protection |
| Random key generation | `Math.random().toString()` | `openssl rand -hex 32` | Cryptographically secure |
| Key rotation state machine | Custom workflow | Manual rotation with checklist | Overkill for single-server setup |

**Key insight:** This is a simple single-server deployment. Enterprise secret management (Vault, AWS Secrets Manager) and automated rotation are deferred to v2.

## Common Pitfalls

### Pitfall 1: Timing Attacks via String Comparison

**What goes wrong:** Direct string comparison (`===`) leaks information about how many characters match via response timing
**Why it happens:** JavaScript string comparison short-circuits on first mismatch
**How to avoid:** Always use `crypto.timingSafeEqual()` for secret comparison
**Warning signs:** Variable response times for different invalid keys

### Pitfall 2: Breaking Health Checks

**What goes wrong:** Adding auth middleware breaks external health monitoring (PM2, uptime checks)
**Why it happens:** Middleware applied to all routes including /health
**How to avoid:** Register public endpoints BEFORE auth middleware
**Warning signs:** PM2/process manager reports service as unhealthy

### Pitfall 3: Forgetting to Update Callers

**What goes wrong:** Service starts requiring auth, but callers don't send X-API-Key
**Why it happens:** Auth added to service without coordinating with callers
**How to avoid:** Update all callers in same phase, verify with integration test
**Warning signs:** 401 errors in logs after deployment

### Pitfall 4: Stale Secrets After Rotation

**What goes wrong:** Old secrets still cached in memory, services not restarted
**Why it happens:** Changed .env but didn't restart PM2/services
**How to avoid:** Explicit service restart after rotation, verify with curl
**Warning signs:** Old API key still works after rotation

### Pitfall 5: Missing Environment Variable

**What goes wrong:** Service crashes on startup because LIV_API_KEY is undefined
**Why it happens:** Environment variable not loaded or misspelled
**How to avoid:** Graceful degradation (warn but continue) or explicit startup check
**Warning signs:** Service fails to start after adding auth middleware

## Code Examples

### Memory Service Auth Middleware

```typescript
// Source: nexus/packages/memory/src/auth.ts (new file)
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

const API_KEY = process.env.LIV_API_KEY;

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // Graceful degradation: warn but allow if no key configured
  if (!API_KEY) {
    console.warn('[Memory] LIV_API_KEY not configured - running without authentication');
    return next();
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    console.warn('[Memory] Request missing X-API-Key header');
    return res.status(401).json({ error: 'Missing API key', hint: 'Provide X-API-Key header' });
  }

  try {
    const keyBuffer = Buffer.from(API_KEY, 'utf8');
    const providedBuffer = Buffer.from(providedKey, 'utf8');

    // Must be same length for timingSafeEqual
    if (keyBuffer.length !== providedBuffer.length) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!timingSafeEqual(keyBuffer, providedBuffer)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  } catch (err) {
    console.error('[Memory] Auth error:', err);
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
```

### Integrating Auth in Memory Service

```typescript
// Source: nexus/packages/memory/src/index.ts (modification)
import { requireApiKey } from './auth.js';

// ... existing code ...

const app = express();
app.use(express.json({ limit: '10mb' }));

// PUBLIC: Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', db: DB_PATH });
});

// PROTECTED: All other routes require API key
app.use(requireApiKey);

// ... rest of routes (add, search, memories, etc.) ...
```

### Integrating Auth in Nexus API

```typescript
// Source: nexus/packages/core/src/api.ts (modification)
import { requireApiKey } from './auth.js';

export function createApiServer({ daemon, redis, brain, toolRegistry, ... }: ApiDeps) {
  const app = express();
  app.use(express.json());

  // PUBLIC: Health check (no auth required)
  app.get('/api/health', async (_req, res) => {
    const uptime = process.uptime();
    const redisOk = await redis.ping().catch(() => 'FAIL');
    res.json({ status: 'ok', uptime: Math.floor(uptime), redis: redisOk === 'PONG' ? 'ok' : 'error' });
  });

  // PROTECTED: All other API routes
  app.use('/api', requireApiKey);

  // ... rest of existing routes ...
}
```

### Secret Rotation Script

```bash
#!/bin/bash
# Source: Secret rotation best practice

# Generate new secrets
NEW_JWT_SECRET=$(openssl rand -hex 32)
NEW_LIV_API_KEY=$(openssl rand -hex 32)

echo "New JWT_SECRET: $NEW_JWT_SECRET"
echo "New LIV_API_KEY: $NEW_LIV_API_KEY"

# Instructions:
# 1. Update livos/.env with new values
# 2. Generate new GEMINI_API_KEY at https://aistudio.google.com/app/apikey
# 3. Restart all services: pm2 restart all
# 4. Verify services are running: pm2 status
# 5. Test authentication: curl -H "X-API-Key: $NEW_LIV_API_KEY" http://localhost:3300/health
```

### Testing Auth with curl

```bash
# Test without API key (should fail)
curl http://localhost:3300/add -X POST \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","content":"test"}'
# Expected: {"error":"Missing API key"}

# Test with API key (should succeed)
curl http://localhost:3300/add -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"userId":"test","content":"test"}'
# Expected: {"success":true,"id":"mem_..."}

# Health check (always public)
curl http://localhost:3300/health
# Expected: {"status":"ok","version":"2.0.0",...}
```

## Service-to-Service Communication

### Current Callers of Memory Service

| Caller | Location | How to Update |
|--------|----------|---------------|
| LivOS AiModule | livos/packages/livinityd/source/modules/ai/ | Add X-API-Key header to fetch calls |
| Nexus Daemon | nexus/packages/core/src/daemon.ts | If direct HTTP calls exist, add header |

### Current Callers of Nexus API

| Caller | Location | How to Update |
|--------|----------|---------------|
| LivOS Server Proxy | livos/packages/livinityd/source/modules/server/index.ts | Already has proxy token auth |
| MCP Server | nexus/packages/mcp-server/ | May need X-API-Key for internal calls |

**Note:** LivOS already proxies /api/mcp to Nexus with LIVINITY_PROXY_TOKEN verification. This existing auth is sufficient for browser requests. The X-API-Key is for direct service-to-service calls.

## Environment Variables

### Secrets That Need Rotation (SEC-04)

| Variable | Current Value | Action | Where to Regenerate |
|----------|---------------|--------|---------------------|
| `GEMINI_API_KEY` | AIzaSy...hm20 | Revoke old, create new | https://aistudio.google.com/app/apikey |
| `JWT_SECRET` | 574509...9b5a | Generate new | `openssl rand -hex 32` |
| `LIV_API_KEY` | d3952b...9ad2 | Generate new | `openssl rand -hex 32` |

### New Environment Variables

None required. `LIV_API_KEY` already exists and is documented in `.env.example` from Phase 2.

### .env.example Updates

Verify these descriptions are accurate after implementation:

```bash
# Required: Internal API authentication key
# Used for service-to-service authentication (memory service, Nexus API)
# Generate with: openssl rand -hex 32
LIV_API_KEY=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No internal auth | API key middleware | This phase | Prevents unauthorized access |
| Secrets in .env | Secrets in .env (same) | N/A | Single-server, no secret manager needed |
| Manual string comparison | timingSafeEqual | Security best practice | Timing attack prevention |

**Deferred to v2:**
- HashiCorp Vault integration
- Automated secret rotation
- JWT-based service tokens
- mTLS between services

## Open Questions

1. **Should ANTHROPIC_API_KEY also be rotated?**
   - What we know: Not present in current .env
   - What's unclear: Whether it's used elsewhere
   - Recommendation: Skip unless found during implementation

2. **Should Redis password be rotated?**
   - What we know: Redis URL has password `LivRedis2024!`
   - What's unclear: Impact on existing connections
   - Recommendation: Include in rotation, restart Redis after

3. **What about the MCP Server (port 3100)?**
   - What we know: Has separate process on port 3100
   - What's unclear: Whether it needs same auth
   - Recommendation: Add auth middleware for consistency

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of nexus/packages/memory/src/index.ts
- Direct codebase analysis of nexus/packages/core/src/api.ts
- Direct codebase analysis of livos/packages/livinityd/source/modules/server/index.ts
- Phase 2 research document (.planning/phases/02-security-foundation/02-RESEARCH.md)

### Secondary (MEDIUM confidence)
- [Understanding API key authentication in Node.js - LogRocket](https://blog.logrocket.com/understanding-api-key-authentication-node-js/) - X-API-Key patterns
- [Understanding the x-api-key Header in Node.js - W3Tutorials](https://www.w3tutorials.net/blog/xapikey-header-nodejs/) - Header handling
- [Google Cloud Secret Manager - Rotation Recommendations](https://cloud.google.com/secret-manager/docs/rotation-recommendations) - Rotation best practices

### Tertiary (LOW confidence)
- [Secrets management & rotation strategies - Medium](https://medium.com/@rajesh.sgr/secrets-management-rotation-strategies-76eec21a6a36) - Rotation workflow ideas

## Metadata

**Confidence breakdown:**
- API key middleware pattern: HIGH - Well-established Express.js pattern
- Secret rotation: HIGH - Standard procedures with openssl
- Service integration: MEDIUM - Need to verify all callers during implementation

**Research date:** 2026-02-04
**Valid until:** 2026-05-04 (stable security patterns)

## Checklist for Planner

The planner should create tasks for:

1. [ ] Create auth middleware module for memory service (SEC-05)
2. [ ] Integrate auth middleware in memory service index.ts (SEC-05)
3. [ ] Create auth middleware module for Nexus API (SEC-06)
4. [ ] Integrate auth middleware in Nexus api.ts (SEC-06)
5. [ ] Add auth to MCP server if applicable (SEC-06)
6. [ ] Update all callers to include X-API-Key header
7. [ ] Generate new JWT_SECRET (SEC-04)
8. [ ] Generate new LIV_API_KEY (SEC-04)
9. [ ] Revoke old GEMINI_API_KEY and create new (SEC-04)
10. [ ] Update Redis password if applicable (SEC-04)
11. [ ] Restart all services after secret rotation
12. [ ] Verify authentication works with curl tests
13. [ ] Update .env.example if any documentation needs clarification
