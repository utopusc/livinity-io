# Nexus Codebase: Technical Debt & Concerns Analysis

**Last Updated**: January 26, 2026
**Scope**: Full codebase analysis across core, mcp-server, worker, whatsapp packages

---

## Executive Summary

The Nexus codebase exhibits **moderate to high technical debt** in several critical areas. Primary concerns center on:
1. **Architectural**: Single-step dispatcher without ReAct-style reasoning, no plugin/modular system
2. **Reliability**: Missing retry logic, timeout handling gaps, polling-based messaging
3. **Security**: Weak shell command filtering, unrestricted file operations
4. **Performance**: 30-second daemon cycle causes latency, polling-based architecture doesn't scale
5. **Fragility**: Regex-based routing, AI classification accuracy issues, memory leaks in cron handler

---

## SEVERITY BREAKDOWN

### 🔴 CRITICAL (Production Risk)

#### 1. Shell Executor Blocklist Can Be Bypassed
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/shell.ts`

**Issue**: The blocklist uses regex patterns that can be trivially bypassed:
- Current patterns: `rm -rf /(?!\w)`, `/mkfs\./, `/fork bomb/`, etc.
- Bypass examples:
  - `rm -rf / ` (trailing space) — pattern expects no word char after `/`
  - `rm -rf/` — no space between flag and path
  - `mkfs.ext4` wrapped in variables: `cmd="mkfs.ext4"; $cmd /dev/sda`
  - Encoded/obfuscated commands not matched by literal regex
  - Chained commands: `echo "safe" && rm -rf /`

**Impact**: User can bypass safety filters and delete files, corrupt system, or execute destructive commands with elevated privileges.

**Recommendation**:
- Replace regex with AST-based command parsing or use `posix-character-class` parsing
- Implement allowlist instead of blocklist (only permit: ls, cat, grep, curl, wget, uptime, ps, top, df, du, free, etc.)
- Use `shellwords` library to properly tokenize and validate command structure
- Run shell executor with minimal permissions (non-root, restricted PATH)
- Add rate limiting per user/session

---

#### 2. File Operations Have No Path Restrictions
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts:295-351` (files handler)

**Issue**: File operations accept arbitrary paths without validation:
```typescript
const { operation, path, content } = intent.params;
// NO checks on path:
const data = await fs.readFile(path, 'utf-8');  // Can read /etc/passwd, /root/.ssh/id_rsa, env files
await fs.writeFile(path, content);              // Can overwrite /etc/hosts, systemd configs, app binaries
await fs.rm(path, { recursive: true });         // Can delete system directories
```

**Impact**:
- Read sensitive files: `/etc/shadow`, `/root/.ssh/`, environment variables, private keys
- Write malicious files: system configs, startup scripts, app code
- Delete critical data: application state, database files, logs

**Recommendation**:
- Implement path allowlist: only permit operations within `/opt/nexus/` and explicitly whitelisted directories
- Use `path.resolve()` and `path.relative()` to prevent `../../../etc/passwd` traversal attacks
- Validate all paths are within expected sandbox before any operation
- Log all file operations with user ID, operation, path, timestamp
- Consider using OS-level sandboxing (chroot, AppArmor, seccomp)

---

#### 3. No Retry Logic or Circuit Breaker
**Files**:
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts` (cycle method)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/mcp-server/src/tools/index.ts` (requestAndPoll function)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/worker/src/index.ts`

**Issue**: Single-attempt execution without retry:
- Router.route() calls fail without retry
- Brain.think() (API calls) fail without backoff
- Worker jobs marked failed immediately, no exponential backoff
- MCP tools poll with fixed 30-35s timeout, no jitter

**Impact**:
- Transient failures (network hiccup, rate limit) = permanent task loss
- No graceful degradation under load
- Lost work during temporary API outages (Gemini API, Redis, Docker)

**Example**: Line 81-86 in daemon.ts stores result in Redis with 120s expiry — if client doesn't poll within window, result is lost.

**Recommendation**:
- Implement exponential backoff with jitter (1s, 2s, 4s, 8s, 16s, 32s base, max 5 retries)
- Add circuit breaker for external APIs (fail fast after 5 consecutive failures for 60s)
- Extend Redis result TTL to 3600s (1 hour) for slow tasks
- Store task state to enable resumption: `nexus:task:{id}:state = {attempt, lastError, nextRetryTime}`
- Log all retries with attempt number and error for debugging

---

#### 4. setTimeout Memory Leaks in Cron Handler
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts:142-149` (cron handler)

**Issue**:
```typescript
router.register('cron', async (intent) => {
  const { delay, unit } = intent.params;
  const ms = unit === 'hours' ? delay * 3600000 : delay * 60000;
  setTimeout(() => {
    this.addToInbox(`Scheduled check triggered...`, 'cron');
  }, ms);  // ← No tracking, no cleanup, no max timeouts
  return { success: true, message: `Reminder set...` };
});
```

**Issues**:
- Unbounded timers: 1000 users each set a 24-hour cron → 1000 timers in memory
- No cancellation mechanism: Can't cancel scheduled task once set
- Timer refs prevent garbage collection if process holds references
- No persistence: If daemon crashes, all scheduled tasks are lost

**Impact**:
- Memory grows unbounded with concurrent cron requests
- Process won't exit cleanly (pending timers keep event loop alive)
- No audit trail of scheduled tasks

**Recommendation**:
- Remove setTimeout-based cron entirely; use Scheduler (BullMQ) for all recurring tasks
- Add job cancellation endpoint: `router.register('cancel-cron', ...)`
- Persist all scheduled jobs to Redis/database immediately
- Use cron expressions (cron library) instead of raw delay values
- Add health check: log active timer count, warn if > 100

---

### 🟠 HIGH (Performance/Reliability)

#### 5. 30-Second Daemon Cycle Creates Response Latency
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/index.ts:34` + `daemon.ts:47-54`

**Issue**:
```typescript
// Core runs daemon loop every 30s
intervalMs: parseInt(process.env.DAEMON_INTERVAL_MS || '30000')

// Main loop
while (this.running) {
  try {
    await this.cycle();
  } catch (err) {
    logger.error('Daemon cycle error', { error: (err as Error).message });
  }
  await this.sleep(this.config.intervalMs);  // 30s wait between cycles
}
```

**Impact**:
- User submits task → waits up to 30s for daemon to pick it up
- MCP tools poll with 30-35s timeout; latency = 30-35s + network
- Inbox processing is batched; if daemon crashes, entire batch lost
- Not real-time: unsuitable for interactive commands (shell, docker)

**Comparison**:
- Good: 100ms event-driven architecture (would process tasks instantly)
- Current: 30s batch polling (suitable only for async background jobs)

**Recommendation**:
- Replace polling with event-driven architecture:
  - Use Redis Streams with consumer groups instead of LPOP
  - Or use Redis Pub/Sub for notifications + LPOP for processing
  - Or use BullMQ's built-in worker pattern (already partially in use)
- Daemon should subscribe to inbox changes, not poll
- Reduce cycle interval to 1-5s as fallback only
- Add Redis event listener: `redis.subscribe('nexus:inbox:new')`

---

#### 6. AI Classification Accuracy / Regex Router Brittleness
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/router.ts:33-154`

**Issue**: Two-tier classification system with inherent problems:
1. **Rule-based regex**:
   - Line 80-151: 15+ regex patterns with overlapping intent capture
   - Example: `/^docker\s+exec/` vs `/^docker\s+(start|stop|restart)/` — order-dependent
   - Case-sensitive misses: `DOCKER PS` won't match `/^docker\s+(ps|list|listele)/`
   - Fragile: Input `"docker ps list"` matches first pattern only, ignores "list"

2. **AI Classification fallback**:
   - Line 39-67: Calls Gemini Flash to parse intent + params
   - Cost: ~0.01¢ per request (100 requests = $0.001)
   - Latency: ~500-2000ms API call
   - Accuracy: JSON parsing can fail (line 70-74), fallback to generic "ask"

3. **Param extraction**:
   - Regex groups assume perfect structure: `/^docker\s+exec\s+(\S+)\s+(.+)/`
   - If user says `"docker exec my-container ls -la"`, params = `{container: "my-container", cmd: "ls -la"}` ✓
   - If user says `"exec docker my-container ls"`, no match, falls through to AI
   - No validation: `{operation: "unknown"}` could reach handler

**Impact**:
- Inconsistent behavior based on phrasing
- Silent failures when JSON parsing fails (fallback to "ask")
- Cost scales with ambiguous queries

**Examples of failure**:
```
User: "docker ps"              → Matches ✓
User: "docker list"            → No regex match → AI call ✗
User: "list docker containers" → No regex match → AI call ✗
User: "docker   exec  foo bar" → Matches (extra spaces) ✓
User: "docker exec foo 'ls la'" → Doesn't capture quoted arg → AI call ✗
```

**Recommendation**:
- Remove regex router entirely; use AI-only classification (accept the ~2s latency + cost)
- Or: Use proper intent parser library (intents.js, natural.js)
- Or: Implement intent template syntax with slot filling (like Alexa)
- Add fallback: if AI-parsed JSON missing required fields, return error instead of generic "ask"
- Cache common intents (status, logs, docker ps) to skip AI calls
- Log all misclassifications for training/improvement

---

#### 7. Polling-Based Inbox / Request-Response Pattern
**Files**:
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/index.ts:43-58` (1s polling interval)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/mcp-server/src/tools/index.ts:5-29` (requestAndPoll)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/whatsapp/src/index.ts:85-108` (pollForResponse)

**Issue**: Results retrieved via polling with fixed timeouts:
```typescript
// From index.ts: pulls inbox every 1s
setInterval(async () => {
  const item = await redis.rpop('nexus:inbox');
  // ...
}, 1000);

// From MCP tools: polls for result every 500ms for 30-60s
for (let i = 0; i < maxIterations; i++) {
  const answer = await redis.get(`nexus:answer:${requestId}`);
  if (answer) return answer;
  await new Promise(r => setTimeout(r, 500));
}
```

**Impact**:
- 500ms polling interval = up to 500ms extra latency per response
- Multiple requests = multiple threads polling = N×500ms delays
- Redis load: 2x polling per second (inbox pull + result check)
- Doesn't scale: 100 concurrent requests = 100 polling threads
- Race condition: Multiple daemons could pop same inbox item

**Recommendation**:
- Replace with Redis Streams + consumer groups:
  ```typescript
  const group = 'nexus-daemons';
  await redis.xgroup('CREATE', 'nexus:inbox', group, '0-0').catch(() => {});
  const messages = await redis.xreadgroup('GROUP', group, 'daemon-1', 'STREAMS', 'nexus:inbox', '>');
  ```
- Use Redis Pub/Sub for result notifications:
  ```typescript
  redis.publish(`nexus:result:${requestId}`, result);
  ```
- Enable Pub/Sub listener on client side:
  ```typescript
  subscriber.subscribe(`nexus:result:${requestId}`);
  ```

---

#### 8. No Agent Loop / ReAct-Style Reasoning
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/router.ts:156-175` (route method)

**Issue**: Single-step dispatcher, no reasoning loop:
```typescript
async route(intent: Intent): Promise<TaskResult> {
  const handler = this.handlers.get(intent.action);
  if (handler) {
    return handler(intent);  // Execute immediately
  }
  // Fallback: Ask brain
  const response = await this.brain.think({...});
  return { success: true, message: response };
}
```

**Problems**:
- No intermediate steps: `"list all Docker containers and show top 3 by CPU"` → single handler call
- AI output not validated: If brain returns JSON, it's assumed correct
- No error recovery: If handler fails, no retry or alternative strategy
- Can't handle multi-step tasks without external orchestration

**Examples**:
- User: `"check if nexus-firecrawl is running, restart if not"`
  - Requires: docker inspect, conditional check, docker start
  - Current: Falls through to "ask" (AI has no exec capability)

- User: `"run tests and if they fail, show me the logs"`
  - Requires: run tests, check result, conditional logs
  - Current: No conditional logic available

**Recommendation**:
- Implement ReAct agent loop:
  ```
  1. Parse task: "restart nexus-firecrawl if not running"
  2. Plan: [inspect container, check status, optionally restart]
  3. Execute step 1: docker inspect nexus-firecrawl
  4. Evaluate: Container state = "exited"
  5. Execute step 2: docker restart nexus-firecrawl
  6. Return result
  ```
- Use Brain to generate multi-step action plans
- Add action validation: Before executing, ask AI if next step is appropriate
- Implement error callbacks: `handler.onError(() => askBrainForAlternative())`

---

#### 9. No Plugin/Modular Skill System
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts:106-352` (all handlers hard-coded)

**Issue**: All handlers are hard-coded in daemon.ts; no plugin architecture:
```typescript
// New feature = edit daemon.ts, add handler, restart daemon
router.register('shell', async (intent) => { /* code */ });
router.register('docker', async (intent) => { /* code */ });
router.register('docker-manage', async (intent) => { /* code */ });
// ... 10+ more handlers inline
```

**Impact**:
- Can't add handlers without restarting daemon (downtime)
- Can't disable handler without code change
- No skill versioning: Old handler always active
- Handlers share same process: One bad handler crashes entire daemon
- No async skill loading: Binary on/off
- Hard to test individual handlers in isolation
- Code maintainability: daemon.ts is 368 lines of handler logic

**Recommendation**:
- Implement plugin/skill system:
  ```typescript
  class SkillPlugin {
    async init(router: Router) { /* register handlers */ }
    async execute(intent: Intent) { /* ... */ }
    async validate(intent: Intent): Promise<boolean> { /* ... */ }
    async unload() { /* cleanup */ }
  }
  ```
- Load skills from `/opt/nexus/skills/*.skill.ts` at startup
- Add skill registry with metadata: `{name, version, requires, handlers}`
- Enable skill enable/disable via Redis config without restart
- Run heavy skills in worker processes (already using for jobs)
- Cache skill validation results

---

### 🟡 MEDIUM (Code Quality / Maintainability)

#### 10. No Retry Logic in Brain (Gemini API Calls)
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/brain.ts:28-42`

**Issue**:
```typescript
async think(options: ThinkOptions): Promise<string> {
  const { prompt, systemPrompt, tier = 'flash', maxTokens = 1024 } = options;
  if (tier === 'none') return '';
  try {
    const modelName = GEMINI_MODELS[tier] || GEMINI_MODELS.flash;
    return await this.geminiCall(modelName, prompt, systemPrompt, maxTokens);
  } catch (err) {
    logger.error('Brain.think error', { tier, error: (err as Error).message });
    throw err;  // ← Immediately throws, no retry
  }
}
```

**Impact**:
- Transient Gemini API errors (rate limit, timeout) fail immediately
- No exponential backoff
- Task fails instead of retrying after 10 seconds

**Recommendation**:
- Add retry loop with exponential backoff (3 attempts: 1s, 2s, 4s)
- Catch specific errors: handle `429` (rate limit) vs `500` (server error) differently
- Add max concurrent API calls queue (rate limit locally to avoid 429)

---

#### 11. No Input Validation / Injection Risks
**Files**:
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/daemon.ts` (all intent.params assumed safe)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/shell.ts:25-52` (command not validated before exec)

**Issue**: Intent params come from untrusted sources (MCP client, WhatsApp, webhook) and used directly:
```typescript
// daemon.ts line 154-169 (shell handler)
const cmd = intent.params.cmd;  // ← No validation!
const result = await shell.execute(cmd);

// shell.ts line 37-38
exec(command, { cwd: this.cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, ...)
// command is not validated, just blocked list-checked
```

**Impact**:
- Command injection: `cmd: "cat /etc/passwd && shell:evil"`
- Path traversal in file ops: `path: "../../../../etc/passwd"`
- Integer overflow: `delay: 999999999` (sets timeout for 31 years)
- Null/undefined injection: `intent.params = null` crashes handlers

**Recommendation**:
- Validate all intent.params against schema (Zod is already imported in MCP tools)
- Define intent schemas: `shell: {cmd: string (maxLength 1000)}`
- Validate early in classify() or route()
- Add sanitization: HTML escape, quote shell args, normalize paths

---

#### 12. No Rate Limiting / Denial of Service
**Files**:
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/index.ts:43-58` (inbox processing loop)
- `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/api.ts` (webhooks)

**Issue**: No rate limits on inbox submission or API endpoints:
```typescript
// From api.ts: webhook can be called unlimited times
app.post('/api/webhook/git', async (req, res) => {
  daemon.addToInbox(`New commit pushed to ${ref}...`, 'webhook');
  res.json({ ok: true });
});

// From index.ts: inbox processes all items without rate limiting
while (this.inbox.length > 0) {
  const item = this.inbox.shift()!;
  await this.config.router.classify(...);  // AI call per item
  await this.config.router.route(...);     // Execution
}
```

**Impact**:
- DoS: Attacker floods webhook with 1000 requests → 1000 AI calls → $0.01 cost
- Resource exhaustion: Rapid task submission fills memory
- Cascading failure: One slow task blocks entire cycle

**Recommendation**:
- Add rate limiting middleware (express-rate-limit):
  - Per IP: 10 requests/minute to /api/webhook/git
  - Per user: 100 tasks/hour via MCP
- Add task queue backpressure: Reject if inbox > 1000 items
- Add Gemini API rate limiter: Max 100 API calls/minute
- Add timeout enforcement: Long-running tasks timeout after 5 minutes

---

#### 13. No Error Context in Logs
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/logger.ts`

**Issue**: Winston logger setup is minimal:
```typescript
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
    new winston.transports.File({ filename: '/opt/nexus/logs/nexus.log', maxsize: 10_000_000, maxFiles: 5 }),
  ],
});
```

**Problems**:
- No request ID propagation: Can't trace single request through multiple logs
- No stack traces in error logs (only message)
- No duration tracking: Can't identify slow operations
- No correlation ID for distributed tracing

**Recommendation**:
- Add correlation IDs: Include in all logs for single request
- Add error handling: Log error.stack, not just error.message
- Add duration logging: `logger.info('Task completed', {duration: endTime - startTime})`
- Add structured logging: Separate fields for request/task/user context

---

#### 14. No Environment Validation at Startup
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/index.ts:12-35`

**Issue**: No validation of required environment variables:
```typescript
async function main() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {...});
  const shell = new ShellExecutor(process.env.SHELL_CWD || '/opt/nexus');
  const apiPort = parseInt(process.env.API_PORT || '3200');

  // No checks:
  // - GEMINI_API_KEY might be undefined (causes Brain to fail)
  // - REDIS_URL might be wrong (causes silent Redis reconnection loop)
  // - API_PORT might not be available (causes crash on listen)
}
```

**Impact**:
- Silent failures: Brain calls fail without clear error
- Misleading errors: "Redis error" instead of "REDIS_URL not set"
- No startup validation: Daemon crashes 5 minutes into production

**Recommendation**:
- Add env validation at startup:
  ```typescript
  const requiredEnvs = ['GEMINI_API_KEY', 'REDIS_URL'];
  const missing = requiredEnvs.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
  ```
- Use zod or joi to validate env schema
- Log all env vars (excluding secrets) at startup

---

#### 15. Missing Request ID Propagation in MCP
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/mcp-server/src/tools/index.ts:5-29`

**Issue**: requestAndPoll generates random request ID but doesn't validate response:
```typescript
async function requestAndPoll(...): Promise<string> {
  const requestId = `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Random component: collision risk with high frequency requests

  // No validation:
  for (let i = 0; i < maxIterations; i++) {
    const answer = await redis.get(`nexus:answer:${requestId}`);
    if (answer) return answer;  // ← What if returned answer is corrupted?
  }
}
```

**Impact**:
- Request ID collisions (unlikely but possible with high frequency)
- No way to cancel/timeout request server-side
- Lost requests if daemon crashes during processing

**Recommendation**:
- Use cryptographic request ID: `crypto.randomUUID()`
- Store request metadata: `nexus:request:{id} = {action, params, createdAt, expiresAt}`
- Clean up expired requests: `redis.expire(key, 3600)`
- Add cancellation support: `DELETE /api/request/{id}` endpoint

---

### 🔵 LOW (Minor Issues)

#### 16. No Health Check for External Dependencies
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/api.ts:52-56` (health endpoint)

**Issue**: Health check only verifies Redis, not Gemini API or Docker:
```typescript
app.get('/api/health', async (_req, res) => {
  const uptime = process.uptime();
  const redisOk = await redis.ping().catch(() => 'FAIL');
  res.json({ status: 'ok', uptime: Math.floor(uptime), redis: redisOk === 'PONG' ? 'ok' : 'error' });
  // Missing: Gemini API status, Docker socket status, worker status
});
```

**Recommendation**:
- Add dependency health checks:
  ```typescript
  const geminiOk = await brain.think({prompt: 'test'}).then(() => 'ok').catch(() => 'error');
  const dockerOk = await dockerManager.list().then(() => 'ok').catch(() => 'error');
  ```
- Return 503 (Service Unavailable) if any critical dependency fails
- Add detailed health endpoint for monitoring

---

#### 17. Hardcoded Container Image Versions
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/core/src/docker-manager.ts:17-18`

**Issue**:
```typescript
Image: 'mcr.microsoft.com/playwright:v1.49.1-noble',
// Fixed version; outdated after update
```

**Recommendation**:
- Move to environment variables or config file
- Add version update mechanism
- Use container registry tags: `v1.49-latest` instead of fixed version

---

#### 18. Worker Job Results Expire Too Quickly
**File**: `C:/Users/hello/Desktop/Projects/contabo/nexus/packages/worker/src/index.ts:35-40`

**Issue**:
```typescript
await connection.set(
  `nexus:result:${job.id}`,
  JSON.stringify(result),
  'EX',
  3600 // expire in 1 hour
);
```

**Impact**: If client doesn't retrieve result within 1 hour, data is lost.

**Recommendation**:
- Extend to 24 hours for long-running jobs
- Use Redis Streams instead (persists across restarts)
- Store results in permanent database (PostgreSQL) for audit trail

---

---

## SUMMARY TABLE

| Issue | Severity | File(s) | Impact | Effort |
|-------|----------|---------|--------|--------|
| Shell blocklist bypass | CRITICAL | shell.ts | RCE, data loss | Medium |
| File path no restrictions | CRITICAL | daemon.ts | Data theft, overwrite | Medium |
| No retry logic | CRITICAL | daemon.ts, router.ts, worker | Task loss on transient error | Medium |
| setTimeout memory leaks | CRITICAL | daemon.ts | Memory leak, OOM | Low |
| 30s daemon cycle | HIGH | index.ts, daemon.ts | 30s latency | High |
| Regex router brittleness | HIGH | router.ts | Incorrect intent classification | Medium |
| Polling-based inbox | HIGH | index.ts, tools/index.ts | Latency, doesn't scale | High |
| No agent loop | HIGH | router.ts | Can't handle multi-step tasks | High |
| No plugin system | HIGH | daemon.ts | Can't add features without restart | High |
| Brain no retry | MEDIUM | brain.ts | API failures | Low |
| No input validation | MEDIUM | daemon.ts, shell.ts | Injection risk | Medium |
| No rate limiting | MEDIUM | api.ts, index.ts | DoS risk, cost overrun | Low |
| Poor error logging | MEDIUM | logger.ts | Hard to debug | Low |
| No env validation | MEDIUM | index.ts | Cryptic startup errors | Low |
| Missing request ID propagation | MEDIUM | tools/index.ts | Collision risk | Low |
| No dependency health check | LOW | api.ts | Incomplete monitoring | Low |
| Hardcoded image versions | LOW | docker-manager.ts | Maintenance burden | Low |
| Job results expire too quickly | LOW | worker/index.ts | Data loss after 1 hour | Low |

---

## RECOMMENDED PRIORITY ORDER

1. **Week 1**: Fix shell blocklist (CRITICAL security) + add path validation (CRITICAL security)
2. **Week 2**: Add retry logic to router/brain/worker (CRITICAL reliability)
3. **Week 3**: Remove setTimeout cron, move to Scheduler (CRITICAL memory)
4. **Week 4**: Replace polling with Redis Streams (HIGH performance)
5. **Month 2**: Redesign router with AI-only or proper intent parser (HIGH correctness)
6. **Month 2**: Add input validation everywhere (MEDIUM security)
7. **Month 3**: Implement plugin system (HIGH maintainability)
8. **Month 3**: Implement ReAct agent loop (HIGH capability)

---

## QUICK WINS (Low Effort, High Impact)

1. Add `Math.random() > 0.05` sampling to Brain calls to reduce cost/latency (5 min)
2. Add correlation IDs to logger (30 min)
3. Add environment variable validation (15 min)
4. Add health check for Gemini API (30 min)
5. Increase worker job result TTL to 24 hours (5 min)
6. Add rate limiting middleware to API (1 hour)

---

**Generated**: 2026-01-26
**Analysis Scope**: Full source code review
**Status**: Actionable — Ready for prioritization and assignment
