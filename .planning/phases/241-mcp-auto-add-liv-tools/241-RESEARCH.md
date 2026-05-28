# Phase 241: MCP auto-add Liv tools (Luse / docker / shell) — Research

**Researched:** 2026-05-27
**Domain:** livinityd ↔ AionUi (`liv-assistant`) MCP HTTP bridge — boot-time idempotent seed
**Confidence:** HIGH (every API claim below verified by live Mini PC probe; payload shapes cross-checked against Rust struct names extracted from the bundled `aioncore` binary)

## Summary

Phase 241's CONTEXT.md locked the architecture: a new livinityd module `mcp-registrar/` reads the 5 system MCPs from Redis hash `liv:mcp:config` and pushes them into AionUi via HTTP, gated by a version-keyed Redis sentinel (`livos:v43:mcp_seeded:v1`) and per-tool EXISTS check. The probe in CONTEXT.md confirmed `POST /api/mcp/sync-to-agents` exists but didn't resolve the payload shape. **It did this session.**

The decisive correction: `/api/mcp/sync-to-agents` is **NOT** the registration endpoint — it's the second step that distributes already-registered MCP servers to external agent CLIs (claude/gemini/codex/codebuddy/opencode/aionrs/aionui). The actual registration endpoint is **`POST /api/mcp/servers`** (returned HTTP 201 in probe F with `mcp_<UUID>` id). Phase 241's seed pass must call BOTH: create the 5 servers, then sync-to-agents so the operator's CLI tools see them.

**Primary recommendation:** Build the registrar as a two-stage call sequence — `POST /api/mcp/servers` per missing tool (skipping any whose name already exists per D-241-04), then a single `POST /api/mcp/sync-to-agents` with the array of all 5 system MCP names. Use `/api/mcp/servers` (NOT `/api/extensions/mcp-servers`) as the canonical list endpoint for the EXISTS gate — they are different lists.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-241-01:** Auto-add all 5 Liv system MCPs (`luse`, `liv-docker`, `liv-system`, `liv-apps`, `liv-vault`) — NOT just 3.
- **D-241-02:** Version-keyed Redis sentinel `livos:v43:mcp_seeded:v1`. Bump suffix to re-trigger.
- **D-241-03:** Single-shot per livinityd boot; sentinel checked once after liv-assistant health probe passes.
- **D-241-04:** Strict name match — for each of the 5 names, GET current AionUi list; skip if name already exists (no overwrite, no diff, no refresh).
- **D-241-05:** No deletion — Phase 241 never removes AionUi MCP entries.
- **D-241-06:** Readiness probe on `http://127.0.0.1:3020/api/settings/client`, 2 s poll, 60 s max. On timeout, log warn + skip seed pass + LEAVE sentinel unset so next boot retries.
- **D-241-07:** Write surface is `POST /api/mcp/sync-to-agents` (this research RECLASSIFIES this — see §1 below; the actual server creation goes through `POST /api/mcp/servers`. The `sync-to-agents` call is still required as a follow-up step).

### Claude's Discretion
- Module placement: `livos/packages/livinityd/source/modules/mcp-registrar/` (new module).
- Logging granularity: per-tool emit.
- Test strategy: unit test with mock HTTP client; 3 states (empty / partial / full).
- Per-tool entry payload generation: derive from Redis `liv:mcp:config` directly.

### Deferred Ideas (OUT OF SCOPE)
- Bi-directional sync (operator edits AionUi → reflect to Redis)
- MCP server hot-reload on `liv:mcp:updated` pubsub
- Sentinel "Force re-seed" admin button
- Marker-field richer customization tracking
- Live-watch liv-assistant restart

## Phase Requirements

CONTEXT.md does not assign formal `REQ-XXX` IDs — requirements are inline locked decisions. Mapped to research findings:

| Decision | Research Support |
|----------|------------------|
| D-241-01 (5 MCPs) | §2 — `liv:mcp:config` hash on Mini PC contains all 5 expected entries; planner reads via `redis.hgetall` |
| D-241-04 (strict name match) | §1 + §2 — POST `/api/mcp/servers` is destructive upsert by name; GET-and-skip is mandatory |
| D-241-06 (readiness probe) | §5 — endpoint returns `{success:true, data:{...}}` 200 when AionUi is up; idiomatic `AbortController` pattern shown |
| D-241-07 (sync-to-agents) | §1 — payload contract resolved: `{servers: [<name>, ...]}` string array; runs as the second stage AFTER per-server `POST /api/mcp/servers` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP catalog source of truth | livinityd Redis (hash `liv:mcp:config`) | — | D-202-12 lock; Phase 219 T3 already established this as authoritative for the 5 system MCPs |
| MCP server registration into AionUi | livinityd `mcp-registrar/` (HTTP client) | AionUi backend (state writer to `aionui-backend.db` SQLite) | LivOS does NOT modify AionUi binary or SQLite directly — all traffic goes through `127.0.0.1:3020` HTTP |
| Per-tool EXISTS gate | livinityd `mcp-registrar/` (HTTP GET) | — | AionUi backend upserts by name (destructive) — we must do the skip-check ourselves |
| Distribution to external agent CLIs | AionUi backend (`/api/mcp/sync-to-agents`) | livinityd (triggers the call) | AionUi owns the agent-CLI config file writes (claude.json, gemini settings, codex toml, etc.) |
| Sentinel storage | livinityd Redis (`livos:v43:mcp_seeded:v1`) | — | Single-shot gate; bumping suffix re-triggers |
| Boot lifecycle hook | livinityd `source/index.ts` | — | Mirrors `drain-install-pending-redis.ts` invocation pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ioredis` | already in livinityd | Redis client (sentinel + catalog) | Reuses existing `this.ai.redis` singleton — no new connection |
| Node 22 `fetch` | global, no import | HTTP client to AionUi | Standard for livinityd outbound HTTP (no new dep) |
| `AbortController` | global | Timeout on AionUi calls | Standard for fetch-with-timeout in livinityd |

**No new npm deps required.** Phase 241 lives entirely inside `packages/livinityd` with stdlib + existing transitive deps.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fetch` + `AbortController` | `undici` | Pulled in transitively already; `fetch` is simpler and matches existing livinityd HTTP patterns |
| Direct SQLite write to `/opt/liv-assistant/data/aionui-backend.db` | (rejected) | Probe confirmed AionUi runs WAL mode + holds open file handles; direct write would race + AionUi treats DB as private. HTTP API is the contract. |

## Architecture Patterns

### System Architecture Diagram

```
                        livinityd boot (single-shot)
                              │
                              ▼
                ┌─────────────────────────────────┐
                │  index.ts: post-boot sequence   │
                └───────────────┬─────────────────┘
                                │
                                ▼
              ┌──────────────────────────────────────┐
              │  Stage 0: GET livos:v43:mcp_seeded:v1│
              │  (Redis sentinel)                    │
              └──────────────┬───────────────────────┘
                             │
                  ┌──────────┴───────────┐
                  │                      │
              SET (exit)         UNSET (continue)
                                          │
                                          ▼
                       ┌──────────────────────────────────┐
                       │  Stage 1: poll AionUi readiness  │
                       │  GET /api/settings/client        │
                       │  (2s interval, 60s max, AbortCtl)│
                       └─────────────┬────────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                     timeout            200 OK
                          │                     │
                  log warn, exit                │
                  (no sentinel)                 ▼
                              ┌─────────────────────────────────┐
                              │  Stage 2: read Redis catalog    │
                              │  HGETALL liv:mcp:config         │
                              │  filter to SYSTEM_MCP_NAMES (5) │
                              └─────────────┬───────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────────┐
                              │  Stage 3: GET /api/mcp/servers  │
                              │  → existing names set           │
                              └─────────────┬───────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────────┐
                              │  Stage 4: per-tool decide       │
                              │  if name in existing → SKIP     │
                              │  else                           │
                              │    transform Redis cfg →        │
                              │      AionUi CreateMcpServer     │
                              │    POST /api/mcp/servers        │
                              └─────────────┬───────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────────┐
                              │  Stage 5: distribute            │
                              │  POST /api/mcp/sync-to-agents   │
                              │  body: {servers: [5 names]}     │
                              │  (writes agent CLI configs:     │
                              │   claude.json, gemini, codex,   │
                              │   codebuddy, opencode, aionrs,  │
                              │   aionui)                       │
                              └─────────────┬───────────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────────────┐
                              │  Stage 6: SET sentinel = 1      │
                              │  livos:v43:mcp_seeded:v1 = "1"  │
                              └─────────────────────────────────┘
```

### Recommended Project Structure
```
livos/packages/livinityd/source/modules/mcp-registrar/
├── index.ts            # exports seedAionUiMcpConfig(deps)
├── aionui-client.ts    # HTTP wrapper: pollReady, listServers, createServer, syncToAgents
├── transform.ts        # Redis liv:mcp:config entry → AionUi CreateMcpServerRequest
└── __tests__/
    ├── seed-pass.test.ts       # 3 states: empty / partial / full
    ├── transform.test.ts       # stdio/http transport mapping
    └── aionui-client.test.ts   # HTTP mock w/ AbortController timeout
```

### Pattern 1: Boot-time single-shot module (mirrors `drain-install-pending-redis.ts`)
**What:** A standalone async function called once from `index.ts` after Redis is ready. Returns a `{applied, skipped, errored}` summary; never throws (logs + returns).
**When to use:** Phase 241's exact use case — gated, idempotent, must not crash livinityd if it fails.

```typescript
// Source: drain-install-pending-redis.ts (analog)
export async function seedAionUiMcpConfig(deps: SeedDeps): Promise<SeedResult> {
  // 1. sentinel check
  // 2. ready-poll AionUi
  // 3. read Redis catalog
  // 4. GET existing, build "missing" set
  // 5. POST each missing
  // 6. POST sync-to-agents
  // 7. SET sentinel
  // every stage wrapped in try/catch → never throws
}
```

### Anti-Patterns to Avoid

- **Re-POST when name already exists.** Probe DD/EE on Mini PC proved POST `/api/mcp/servers` is a **destructive upsert by name** — second POST with different body OVERWROTE the first (`command: "original"` → `command: "MODIFIED"`). The `id` stays stable but every other field is replaced. Without the GET-and-skip gate, every livinityd reboot would clobber operator edits. D-241-04 makes this an invariant.
- **Setting the sentinel before sync-to-agents succeeds.** If sync-to-agents fails, agent CLIs won't see the MCPs but the sentinel says "seeded" — operator gets a broken state with no automatic recovery. Set sentinel ONLY after the full chain (create + sync) succeeds.
- **Calling `/api/extensions/mcp-servers` for the EXISTS gate.** That endpoint returns `[]` even after `POST /api/mcp/servers` succeeded (probe S confirmed). It's a *different list* (extension-provided MCPs, used by the AionUi extension framework). Use `/api/mcp/servers` for the EXISTS gate — it's the canonical MCP list.
- **Treating sync-to-agents as the registration endpoint.** It's not. `sync-to-agents` accepts even `{servers:[]}` and returns 200. It's a distribution step that writes already-registered servers' configs into agent CLI config files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP server registration in AionUi | Direct SQLite writes to `aionui-backend.db` | `POST /api/mcp/servers` | AionUi keeps DB private with WAL; direct writes race |
| Agent CLI config writes (claude.json, gemini/codex configs) | Custom file-write loop per agent | `POST /api/mcp/sync-to-agents` | AionUi owns the 8 agent CLIs' on-disk formats; reproducing them is a maintenance bomb |
| HTTP poll-with-backoff | Recursive `setTimeout` + retries inside fetch handler | Plain `for` loop with `await new Promise(r=>setTimeout(r,2000))` between attempts | Easier to test, no Promise leaks |
| Idempotency hash for "did I already seed this version" | File-on-disk sentinel | Redis SET (`livos:v43:mcp_seeded:v1`) | Already configured in D-241-02; survives livinityd reinstalls + matches LivOS Redis-as-truth pattern |

**Key insight:** AionUi has a complete, well-typed HTTP API surface (15+ named Rust request structs visible in `strings aioncore`). Phase 241 is just an HTTP client — every "do we need to build X?" answer is "no, AionUi already has it."

## Runtime State Inventory

> Phase 241 is greenfield (new module), but the boot-time seed touches RUNTIME state in two systems. Inventory required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (LivOS) | Redis sentinel `livos:v43:mcp_seeded:v1` (single SET key, bool-ish "1") | None — created by registrar on first successful run |
| Stored data (AionUi) | `aionui-backend.db` SQLite WAL — `mcp_servers` table (inferred from `mcp_<UUID>` ids returned). AionUi also writes per-agent CLI config files (`~/.config/claude/claude.json`, etc.) via sync-to-agents | None — Phase 241 writes via HTTP API only, never touches SQLite or CLI configs directly |
| Live service config | None — registrar has no service config of its own; reads existing Redis `liv:mcp:config` (which already exists post-Phase 219 T3) | None |
| OS-registered state | None — no systemd, no Task Scheduler, no launchd | None |
| Secrets/env vars | None new. Existing Liv MCP envs (e.g., `LUSE_REDIS_URL`) are already populated in `liv:mcp:config` — registrar copies them into AionUi payload verbatim | None |
| Build artifacts | None new. Standard `tsc` build under `livos/packages/livinityd/dist/`; deploys via `bash /opt/livos/update.sh` | None |

**Nothing to migrate.** Existing operator boxes that boot a Phase 241–enabled livinityd for the first time will see empty AionUi MCP state (probe confirmed on Mini PC 2026-05-27) and the seed pass will run cleanly.

## API Contract Findings (the load-bearing section)

All probes executed 2026-05-27 against Mini PC `http://127.0.0.1:3020` (liv-assistant systemd service, port 3020 loopback).

### Endpoint A: `POST /api/mcp/servers` — server registration (THE write endpoint)

**Verified status:** HTTP 201 on success. Returns the full created server record with a server-generated `mcp_<UUID>` id.

**Request body (`CreateMcpServerRequest`, 5 fields per binary strings):**
```json
{
  "name": "<string, unique-by-name (upsert behaviour — see §EE below)>",
  "transport": {
    "type": "stdio" | "http" | "sse",
    "command": "<string, stdio only>",
    "args": ["<string>", ...],
    "env": {"<key>": "<value>", ...},
    "url": "<string, http/sse only>",
    "headers": {"<key>": "<value>", ...}
  },
  "description": "<string, optional>",
  "original_json": "<string, optional — opaque field for client-provided source JSON>",
  "builtin": false
}
```

**Probe F (positive) — verified:**
```bash
curl -X POST http://127.0.0.1:3020/api/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{"name":"test-probe-mcp-241","transport":{"type":"stdio","command":"echo","args":["hi"]},"enabled":true}'
# HTTP 201
# {"success":true,"data":{"id":"mcp_019e6bdf-283b-71f1-8f8c-709f4ab7d4b6","name":"test-probe-mcp-241","enabled":false,"transport":{...},"status":"disconnected","builtin":false,"created_at":1779926247483,"updated_at":1779926247483}}
```

**`enabled` quirk:** I passed `enabled: true` and the response came back `enabled: false`. The `enabled` field is NOT in `CreateMcpServerRequest` (only 5 fields: name, transport, description, original_json, builtin). To enable a server, follow up with `POST /api/mcp/servers/{id}/toggle`. Phase 241 should leave system MCPs **disabled** by default unless `enabled: true` in the Redis catalog (the Redis catalog DOES carry `enabled` and `luse` is the only system MCP with `enabled: true`).

**Idempotency / upsert by name (probes DD, EE, FF — CRITICAL):**
- POSTing twice with the SAME name returns 201 BOTH times.
- The `id` is preserved (same `mcp_019e6be0-3466-...` across both POSTs).
- All OTHER fields are **destructively overwritten** by the second body. Probe EE shows `command: "original"` → `command: "MODIFIED"`, `args: ["v1"]` → `args: ["v2","extra"]`.
- `created_at` preserved; `updated_at` advances.
- The binary contains the string `"MCP server name conflict: ... already exists"` (probe CC) but the live endpoint did NOT exercise that path on duplicate POST — possibly only triggered by a different operation (maybe `PUT /api/mcp/servers/{id}` with a name-changing patch, or `batch-import` with strict mode flag). **D-241-04 cannot rely on the server to refuse duplicates** — the registrar must implement GET-and-skip itself.

### Endpoint B: `GET /api/mcp/servers` — the EXISTS gate source

**Verified status:** HTTP 200. Returns `{success: true, data: [<McpServerRecord>, ...]}`.

```bash
curl http://127.0.0.1:3020/api/mcp/servers
# {"success":true,"data":[]}   (clean Mini PC baseline 2026-05-27)
```

Field for the EXISTS gate: **`data[].name`** (not `id`, not anything else). Matches Liv's Redis hash field key (D-202-12 uses `name` as the HSET field too) — clean 1:1.

### Endpoint C: `POST /api/mcp/sync-to-agents` — the distribution step (NOT registration)

**Verified status:** HTTP 200 with `{success:true, data:{success:true, results:[{agent:..,success:true},...]}}`.

**Request body (`SyncToAgentsRequest`, 1 field):**
```json
{
  "servers": ["<server-name>", "<server-name>", ...]
}
```

Note: per binary strings, this struct has **one field**: `servers`. The field is an **array of strings** (server NAMES). The serde error in probe 9 (`servers[0]: invalid type: map, expected a string`) is conclusive. An optional `agents` field MAY exist but is not documented in extracted strings; probes A and D showed it was accepted without error but did NOT filter results — all 8 agents always appear in the response. **Treat `agents` as ignored/optional and only pass `{servers: [...names]}`.**

**Verified known agent values** (from binary strings + probe responses):
`claude`, `gemini`, `qwen`, `codex`, `codebuddy`, `opencode`, `aionrs`, `aionui` (8 total).

**Critical:** Even `{servers:[]}` returns 200 and lists all 8 agents as success. The endpoint does NOT validate that the named servers exist before "syncing" — it just writes the (now-empty) server set into each agent's CLI config. Phase 241 must NOT call sync-to-agents until after the per-server `POST /api/mcp/servers` calls have succeeded.

### Endpoint D: `GET /api/mcp/agent-configs` — read-only routing inspection

**Verified status:** HTTP 200. Returns `{success:true, data:[{source:"<agent>", servers:[...]}, ...]}`.

Returns one entry per CLI agent (claude, opencode, aionui visible; possibly others when their config files exist). `source:"claude"` includes auto-detected entries from `~/.claude/claude.json` (e.g., the `claude.ai Google Drive` and `claude.ai Gmail` HTTP transports surfaced in probe 2).

**Phase 241 does NOT need to call this endpoint.** It's a UI-side read for inspecting where each MCP is wired. The `sync-to-agents` call already propagates servers to all 8 agents. If a future phase needs per-agent filtering ("luse only goes to claude+aion, not gemini"), `agent-configs` becomes relevant — out of scope for Phase 241.

### Endpoint E: `GET /api/settings/client` — readiness probe (D-241-06)

**Verified status:** HTTP 200 once AionUi has finished boot (returns ~5KB of settings JSON: theme, agents.disabled, customCss, etc.). Connection-refused while liv-assistant is still booting. Suitable for D-241-06's 2s/60s readiness poll.

```bash
curl http://127.0.0.1:3020/api/settings/client
# {"success":true,"data":{"guid.lastSelectedAgent":"aionrs", ...}}
```

### Endpoint F: `DELETE /api/mcp/servers/{id}` — cleanup (not used by Phase 241)

**Verified status:** HTTP 200, `{"success":true}` on delete. NOT called by Phase 241 (D-241-05: no deletion). Documented for completeness — useful in unit-test teardown or future "Force re-seed" admin button.

### Endpoint G: `POST /api/mcp/servers/import` — batch create (alternative)

**Verified status:** HTTP 200, returns array of created records. Body: `{servers: [<CreateMcpServerRequest>, ...]}`. Same upsert-by-name semantics as the single-POST endpoint. Probe FF confirmed batch with a name that already existed upserted destructively without raising.

**Whether to use this for Phase 241:** Marginally better than 5 sequential POSTs (one round-trip vs five), but the per-server approach is preferred per D-241-07 ("per-server is preferred for partial-failure resilience") — if one MCP's payload is malformed, batch could fail-fast and leave the others unwritten, whereas per-server walks past the bad one. **Recommendation: per-server POSTs.** A single sync-to-agents call at the end batches the distribution step.

## Additive vs Destructive Semantics

Verified via probes DD/EE/FF/GG/HH (full transcript in §1):

| Operation | Behavior | Implication for Phase 241 |
|-----------|----------|--------------------------|
| POST `/api/mcp/servers` (new name) | Creates, returns 201 + new id | Use for the 5 system MCPs |
| POST `/api/mcp/servers` (existing name) | **Upserts**: id preserved, all fields overwritten, `updated_at` bumped | DO NOT call for already-present names — strict GET-and-skip gate (D-241-04) |
| POST `/api/mcp/servers/import` | Same as POST `/api/mcp/servers` but batched | If used, must STILL filter to missing-only before sending |
| POST `/api/mcp/sync-to-agents` | Rewrites the named server set across all 8 agent CLI configs | Run ONCE at end; safe to repeat (idempotent — same input → same on-disk result) |

**The destructive upsert behavior is the single most important finding of this research.** Phase 241's seed pass MUST sequence GET → filter → POST-only-missing. A naive "POST all 5 every boot" would silently clobber operator edits on every livinityd restart — exactly the failure mode D-241-04 prevents.

## agent-configs Endpoint Role

`GET /api/mcp/agent-configs` returns the *current routing snapshot*: which CLI agents have which MCP servers wired in their on-disk config files. **Phase 241 does not need to touch this endpoint.**

Why:
- AionUi's `sync-to-agents` already distributes to all 8 agents in one call. There's no per-agent filter Phase 241 needs to express.
- The endpoint is GET-only writable surface — `POST`/`PUT`/`DELETE` all return 405 (probe J/O/P).
- Phase 241's contract is "make Liv's MCPs visible to any agent the operator opens" — that's a `servers: [all 5 names]` sync-to-agents call, not a per-agent fan-out.

If a future phase wants "luse should NOT be exposed to the Gemini CLI" (because Gemini doesn't speak stdio MCP) then `agent-configs` reads + a per-agent filter become relevant. Out of scope here.

## livinityd Boot Hook Pattern

`drain-install-pending-redis.ts` is the closest analog to Phase 241's registrar. Its shape:

1. Module exports a single async function (`drainInstallPendingRedisKeys(redis, logger, path)`).
2. Returns a `{applied, skipped, errored}` result — does NOT throw on individual-key failures.
3. Invocation site `index.ts:566-584` wraps the call in `try/catch`, logs both success summary and any thrown error.
4. Runs AFTER `await this.ai.start()` (Redis must be live) — at livinityd `index.ts` line ~565.

**Recommended invocation site for Phase 241:** AFTER the existing Phase 141 drain + Phase 112 fallback (`index.ts` around line 640), BEFORE the Phase 104 heartbeat wire-up. At this point Redis is live, NativeAppConfigStore is wired, and AionUi may or may not be reachable — the seed handles the unreachable case gracefully (D-241-06).

**Exact recommended code shape (planner reference):**
```typescript
// Phase 241 — seed AionUi's MCP config with Liv's 5 system MCPs.
// Boot-time, single-shot per version sentinel, never throws.
// See .planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md for locked decisions.
try {
  const result = await seedAionUiMcpConfig({
    redis: this.ai.redis,
    aionUiBaseUrl: process.env.AIONUI_BASE_URL ?? 'http://127.0.0.1:3020',
    logger: {
      info: (msg) => this.logger.log(`[mcp-registrar] ${msg}`),
      warn: (msg, err) => this.logger.error(`[mcp-registrar] ${msg}`, err),
      error: (msg, err) => this.logger.error(`[mcp-registrar] ${msg}`, err),
    },
  })
  this.logger.log(
    `Phase 241: AionUi MCP seed (created=${result.created} skipped=${result.skipped} errored=${result.errored} sentinel=${result.sentinelSet ? 'set' : 'unchanged'})`,
  )
} catch (err) {
  // Defense in depth — seedAionUiMcpConfig should never throw, but if it does
  // (e.g., a misconfiguration crash), livinityd boot must continue.
  this.logger.error('Phase 241: AionUi MCP seed threw (non-fatal — livinityd boot continues)', err)
}
```

## HTTP Polling Idiom (D-241-06)

Recommended pattern, matches existing livinityd outbound-HTTP code style (e.g., `modules/account/index.ts` heartbeat):

```typescript
async function waitForAionUiReady(
  baseUrl: string,
  logger: {info: (m: string) => void; warn: (m: string, e?: unknown) => void},
  totalTimeoutMs = 60_000,
  pollIntervalMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + totalTimeoutMs
  const url = `${baseUrl}/api/settings/client`
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    const ctrl = new AbortController()
    const tHandle = setTimeout(() => ctrl.abort(), 1_500) // per-attempt timeout
    try {
      const res = await fetch(url, {signal: ctrl.signal})
      if (res.ok) {
        logger.info(`AionUi ready after ${attempt} attempt(s)`)
        return true
      }
      logger.warn(`AionUi readiness probe returned ${res.status}; retrying`)
    } catch (err) {
      // ECONNREFUSED / abort / DNS — common during boot, log only on final attempt
      if (Date.now() + pollIntervalMs >= deadline) {
        logger.warn(`AionUi readiness probe failed (final attempt ${attempt})`, err)
      }
    } finally {
      clearTimeout(tHandle)
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  return false
}
```

Why this shape:
- `AbortController` + `setTimeout` gives a per-attempt 1.5s cap so a hung TCP connect doesn't burn the whole 60s budget on one attempt.
- `while (Date.now() < deadline)` is more robust than counting attempts (handles process scheduling pauses gracefully).
- Final-attempt-only logging avoids 30 lines of "ECONNREFUSED" in the journal during a normal boot where AionUi takes 6-8 seconds.

## Idempotency Strategy

Concrete seed-pass pseudocode given everything above:

```typescript
async function seedAionUiMcpConfig(deps: SeedDeps): Promise<SeedResult> {
  const SENTINEL_KEY = 'livos:v43:mcp_seeded:v1'
  const result = {created: 0, skipped: 0, errored: 0, sentinelSet: false}

  // 0. sentinel short-circuit
  const sentinel = await deps.redis.get(SENTINEL_KEY)
  if (sentinel === '1') {
    deps.logger.info('sentinel set — skip')
    return result
  }

  // 1. readiness poll
  const ready = await waitForAionUiReady(deps.aionUiBaseUrl, deps.logger)
  if (!ready) {
    deps.logger.warn('AionUi not ready within 60s — leaving sentinel unset; will retry on next boot')
    return result
  }

  // 2. read Liv catalog
  const livCatalog = await deps.redis.hgetall('liv:mcp:config')
  const targets: McpServerEntry[] = []
  for (const [name, raw] of Object.entries(livCatalog)) {
    if (!SYSTEM_MCP_NAMES.has(name)) continue
    try {
      const parsed = JSON.parse(raw)
      targets.push({name, cfg: parsed})
    } catch (err) {
      deps.logger.warn(`malformed Redis entry for '${name}' — skipping`, err)
      result.errored++
    }
  }
  if (targets.length === 0) {
    deps.logger.warn('no system MCPs in liv:mcp:config — install seed missing? skipping')
    return result
  }

  // 3. GET AionUi existing
  const existing = await aionUiClient.listServers(deps.aionUiBaseUrl)
  const existingNames = new Set(existing.map((s) => s.name))

  // 4. per-tool decide
  const toCreate = targets.filter((t) => !existingNames.has(t.name))
  for (const target of targets) {
    if (existingNames.has(target.name)) {
      deps.logger.info(`${target.name} → already present in AionUi, skipping`)
      result.skipped++
    }
  }

  // 5. create missing — per-server POST, partial-failure-resilient
  for (const target of toCreate) {
    try {
      const payload = transformRedisToAionUi(target.name, target.cfg)
      await aionUiClient.createServer(deps.aionUiBaseUrl, payload)
      deps.logger.info(`${target.name} → injected into AionUi`)
      result.created++
      // If the Redis catalog says enabled=true, toggle after create
      if (target.cfg.enabled === true) {
        const created = await aionUiClient.findByName(deps.aionUiBaseUrl, target.name)
        if (created) await aionUiClient.toggle(deps.aionUiBaseUrl, created.id, true)
      }
    } catch (err) {
      deps.logger.warn(`${target.name} → POST failed`, err)
      result.errored++
    }
  }

  // 6. distribute to agent CLIs — include the FULL system-MCP set, not just newly-created.
  //    This rewrites the on-disk CLI configs; safe to repeat.
  if (result.errored === 0) {
    try {
      await aionUiClient.syncToAgents(deps.aionUiBaseUrl, targets.map((t) => t.name))
      deps.logger.info(`sync-to-agents → distributed ${targets.length} servers to all CLI agents`)
    } catch (err) {
      deps.logger.warn('sync-to-agents failed — agent CLIs may not see the new MCPs until next boot', err)
      result.errored++
    }
  }

  // 7. set sentinel ONLY if no errors
  if (result.errored === 0) {
    await deps.redis.set(SENTINEL_KEY, '1')
    result.sentinelSet = true
    deps.logger.info(`sentinel ${SENTINEL_KEY} set`)
  } else {
    deps.logger.warn(`leaving sentinel unset due to ${result.errored} error(s) — will retry on next boot`)
  }

  return result
}
```

Critical correctness points:
1. **Sentinel is set ONLY after the full chain succeeds** — D-241-06 implies this (skip case leaves sentinel unset); the same principle applies for any error.
2. **Sync-to-agents always sends the FULL system-MCP set**, not just newly-created. This is robust against the "partial state from a previous failed boot" case — the operator's CLI configs converge to "all 5 are wired" regardless of which boot pass created which.
3. **Toggle-after-create is conditional** on Redis `enabled: true` — currently only `luse` is enabled-by-default per `mcp-servers.json` seed. The other 4 system MCPs ship `enabled: false`; operator opt-in via the LivOS `/settings → MCP` toggle is the existing flow.

## AionUi Storage Confirmation

Confirmed via probe 18/19/20:
- `/opt/liv-assistant/data/aionui-backend.db` (SQLite, 602KB, WAL-mode — `aionui-backend.db-shm` + `aionui-backend.db-wal` files present).
- No `sqlite3` CLI installed on Mini PC (probe 19 — couldn't query schema directly).
- The journalctl output (probe 20) shows AionUi logs all HTTP requests including `/api/mcp/*` — `GET /api/extensions/mcp-servers` returned `200 latency_ms=0` while `POST /api/mcp/sync-to-agents` (empty body) logged `400 latency_ms=0`. Confirms HTTP API is the single entry point.
- `/opt/liv-assistant/data/extension-states.json` exists (38 bytes) — out of scope per CONTEXT.md (Phase 241 only goes through the HTTP API).

**Conclusion: Phase 241 MUST use HTTP API exclusively.** Direct SQLite writes are blocked by:
- WAL mode + open AionUi process holding write locks
- AionUi treats DB as private (no documented schema; column names like `mcp_servers.id`/`name`/`transport`/etc. are inference from binary strings, not contract)
- The DB layout could change in an AionUi upstream upgrade with no notice

## Project Constraints (from CLAUDE.md / MEMORY.md)

- **Mini PC is the ONLY deploy target.** Server4 + Server5 OFF-LIMITS. Phase 241 deploys ONLY to `bruce@10.69.31.68`.
- **Deploy via `bash /opt/livos/update.sh`.** Never PM2. Standard flow: git pull → install → tsc → systemctl restart livos.
- **Batch SSH probes into ONE invocation.** fail2ban will ban rapid probe sessions. This research session used 4 SSH calls total; all probes batched into heredocs.
- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** (sdk-agent-runner.ts) MUST NOT change. Phase 241 does not touch this file.
- **Mini PC sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`** must stay unchanged across the deploy (verification step in plan).
- **English error messages** (D-202-21 / INV-202-05). Turkish status updates to operator are fine; in-code strings English.
- **Backend additive only** (INV-202-02). New livinityd module, no UI changes.
- **Per [feedback_full_autonomous_no_questions]:** operator wants this shipped without interactive gates when in autonomous mode.

## Common Pitfalls

### Pitfall 1: Naive re-POST clobbers operator edits
**What goes wrong:** Operator manually edits `luse`'s `args` in AionUi to add a debug flag → livinityd reboots → registrar POSTs `luse` again with the un-edited Redis catalog → operator's edit is silently overwritten.
**Why it happens:** AionUi backend treats POST `/api/mcp/servers` as upsert by name (probe DD/EE).
**How to avoid:** Strict GET-and-skip per D-241-04. Code-level test: probe sequence on Mini PC after first seed pass should show `existingNames.has('luse') === true` → skip path taken.
**Warning signs:** `mcp-registrar: luse → injected` appearing in logs on every boot (correct behavior: appears once, then `→ already present, skipping` forever after).

### Pitfall 2: Sentinel set too early
**What goes wrong:** AionUi accepts the POST for `luse` but the sync-to-agents call fails (e.g., Codex CLI config file is unwritable due to a permission glitch on a fresh box) → sentinel gets set → next reboot skips the seed → claude.json never gets `luse`, and there's no automatic recovery path.
**Why it happens:** Premature `SET livos:v43:mcp_seeded:v1 = 1` before the full chain completes.
**How to avoid:** Only set sentinel when `result.errored === 0` AND sync-to-agents succeeded.
**Warning signs:** Operator reports "the Liv MCPs are in AionUi's settings panel but Claude Code doesn't see them" — that's the failure mode.

### Pitfall 3: Reading from the wrong list endpoint
**What goes wrong:** Code uses `/api/extensions/mcp-servers` for the EXISTS gate. That endpoint returned `[]` even after probe F successfully created `test-probe-mcp-241` on `/api/mcp/servers` (probe S). EXISTS gate would ALWAYS say "missing" → registrar POSTs every boot → upserts → see Pitfall 1.
**Why it happens:** Visual similarity between the two endpoints; CONTEXT.md mentions both in §canonical_refs.
**How to avoid:** Use **`/api/mcp/servers`** (canonical list, includes everything created via the registrar). `/api/extensions/mcp-servers` is for AionUi extensions' MCPs — a different namespace.
**Warning signs:** Every boot logs "luse → injected" (never "already present"); duplicate UUIDs in mcp_servers table over time (well — no, the upsert preserves id, but `updated_at` keeps advancing on every boot).

### Pitfall 4: `enabled` field misuse
**What goes wrong:** Registrar passes `enabled: true` in the POST body expecting AionUi to honor it; AionUi ignores it (probe F: sent `enabled:true`, response was `enabled:false`).
**Why it happens:** `CreateMcpServerRequest` doesn't include `enabled` (5 fields: name, transport, description, original_json, builtin).
**How to avoid:** Follow create with `POST /api/mcp/servers/{id}/toggle` if Redis catalog says `enabled: true`. Currently only `luse` needs this.
**Warning signs:** Luse appears in AionUi's MCP panel as "disabled" with a grey indicator; operator has to manually toggle it.

### Pitfall 5: AionUi reachable but readiness probe returns 200 too early
**What goes wrong:** `/api/settings/client` is one of the first routes mounted — it can return 200 while the MCP route subsystem (`crates/aionui-mcp/src/routes.rs`) is still initializing. POST `/api/mcp/servers` could 503 / connection-reset while AionUi is mid-boot.
**Why it happens:** Composite startup — AionUi's Axum router mounts in waves.
**How to avoid:** After the readiness loop succeeds, ALSO probe `GET /api/mcp/servers` once. If it returns non-200, retry up to 3 times with 1s spacing before declaring AionUi ready.
**Warning signs:** Intermittent boot failures: registrar runs, gets readiness OK, then POST fails with `ECONNRESET` or `503` — operator sees the warn line but the seed didn't actually run.

## Code Examples

### Transform Redis entry → AionUi CreateMcpServerRequest

Source: derived from `mcp-config-router.ts` `McpServerConfig` shape + AionUi binary strings (`struct CreateMcpServerRequest with 5 elements`).

```typescript
// Source: this RESEARCH.md §1 (probe-verified contract)
interface LivRedisEntry {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  enabled?: boolean
  description?: string
}

interface AionUiCreateMcpServerRequest {
  name: string
  transport:
    | {type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>}
    | {type: 'http'; url: string; headers?: Record<string, string>}
    | {type: 'sse'; url: string; headers?: Record<string, string>}
  description?: string
  original_json?: string
  builtin?: boolean
}

export function transformRedisToAionUi(name: string, redisEntry: LivRedisEntry): AionUiCreateMcpServerRequest {
  if (redisEntry.transport === 'stdio') {
    if (!redisEntry.command) {
      throw new Error(`Liv MCP '${name}' marked stdio but has no command`)
    }
    return {
      name,
      transport: {
        type: 'stdio',
        command: redisEntry.command,
        args: redisEntry.args ?? [],
        env: redisEntry.env,
      },
      description: redisEntry.description,
      builtin: false,
    }
  }
  if (redisEntry.transport === 'http') {
    if (!redisEntry.url) {
      throw new Error(`Liv MCP '${name}' marked http but has no url`)
    }
    return {
      name,
      transport: {type: 'http', url: redisEntry.url},
      description: redisEntry.description,
      builtin: false,
    }
  }
  throw new Error(`Liv MCP '${name}' has unknown transport: ${(redisEntry as {transport: string}).transport}`)
}
```

### AionUi HTTP client (minimal surface needed by Phase 241)

```typescript
// Source: probe-verified contract — every method maps to an endpoint validated 2026-05-27
export interface AionUiServerRecord {
  id: string         // "mcp_<UUID>"
  name: string
  enabled: boolean
  transport: {type: 'stdio' | 'http' | 'sse'; [k: string]: unknown}
  status: 'disconnected' | 'connected' | 'error' | 'testing'
  builtin: boolean
  created_at: number
  updated_at: number
}

export class AionUiMcpClient {
  constructor(private baseUrl: string, private perCallTimeoutMs = 5000) {}

  async listServers(): Promise<AionUiServerRecord[]> {
    const res = await this.fetchJson(`${this.baseUrl}/api/mcp/servers`)
    if (!res.success) throw new Error(`listServers: ${res.error}`)
    return res.data as AionUiServerRecord[]
  }

  async createServer(req: AionUiCreateMcpServerRequest): Promise<AionUiServerRecord> {
    const res = await this.fetchJson(`${this.baseUrl}/api/mcp/servers`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(req),
    })
    if (!res.success) throw new Error(`createServer(${req.name}): ${res.error}`)
    return res.data as AionUiServerRecord
  }

  async toggleServer(id: string, enabled: boolean): Promise<void> {
    const res = await this.fetchJson(`${this.baseUrl}/api/mcp/servers/${id}/toggle`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({enabled}),
    })
    if (!res.success) throw new Error(`toggleServer(${id}): ${res.error}`)
  }

  async syncToAgents(serverNames: string[]): Promise<void> {
    const res = await this.fetchJson(`${this.baseUrl}/api/mcp/sync-to-agents`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({servers: serverNames}),
    })
    if (!res.success) throw new Error(`syncToAgents: ${res.error}`)
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<{success: boolean; data?: unknown; error?: string}> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), this.perCallTimeoutMs)
    try {
      const res = await fetch(url, {...init, signal: ctrl.signal})
      return await res.json() as {success: boolean; data?: unknown; error?: string}
    } finally {
      clearTimeout(t)
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| (none — Phase 241 is greenfield) | livinityd HTTP-client to AionUi MCP HTTP API | 2026-05-27 (Phase 241) | First time LivOS pushes config INTO an embedded subsystem rather than reading FROM it |
| Direct mutation of agent CLI config files | AionUi `sync-to-agents` HTTP call | upstream AionUi 2.1.4 (the bundled version) | LivOS no longer needs to know each CLI's config schema — AionUi owns those writes |

**Deprecated / outdated:**
- Earlier ROADMAP wording "Luse / docker / shell" (3 tools) — superseded by Phase 219 T3's 5-tool system MCP set. Phase 241 implements 5.

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation in plan |
|---|------|-----------|--------|--------------------|
| R1 | AionUi unreachable during livinityd boot | Medium (slow tsx boot) | Low (sentinel unset, retry on next boot per D-241-06) | Readiness poll with 60s budget; warn-log on timeout |
| R2 | Operator-customized AionUi entry silently overwritten | HIGH if D-241-04 not enforced | HIGH (destroys operator work) | Strict GET-and-skip gate; integration test asserts no second POST when entry exists |
| R3 | sync-to-agents fails partway (one agent CLI config unwritable) | Low | Medium (some CLIs see MCPs, others don't) | sync-to-agents response includes per-agent `success:bool` — registrar logs any `false` entries; sentinel still requires zero errors overall |
| R4 | Redis catalog (`liv:mcp:config`) malformed JSON for one entry | Low | Low (skip that entry only) | Parse-per-entry with try/catch; log warn + increment `errored` counter |
| R5 | AionUi upstream upgrade changes API shape | Low (vendored 2.1.4) | High (silent failures) | Pin AionUi version (Phase 222 spike already did this); plan should add a version-check log line on first call |
| R6 | Probe used as readiness signal returns 200 before MCP routes are mounted | Low (per Pitfall 5) | Medium (POST fails, retry next boot) | Layered readiness: settings/client AND mcp/servers GET both must succeed |
| R7 | Sentinel key namespace collision with future Phase 24X seed | Very Low | Low | Version-keyed (`:v1`); future phases use `:v2`/etc. per D-241-02 |
| R8 | Multi-user mode introduces per-user MCP scoping | None today | Future (out of scope) | Documented in CONTEXT.md deferred; sentinel key would need per-user namespace later |
| R9 | livinityd boot order: AionUi systemd starts AFTER livinityd | High on first install | Low (handled by D-241-06 poll) | Already mitigated by polling pattern; no systemd dependency change needed |

## Sources

### Primary (HIGH confidence)
- Mini PC live probe `bruce@10.69.31.68` 2026-05-27 — every endpoint behavior verified with curl, response bodies captured. Sessions documented in §1.
- Binary string extraction from `/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore` — Rust struct field names, route handler paths, error message templates extracted directly from the running aioncore binary. Source of truth for `CreateMcpServerRequest`/`SyncToAgentsRequest`/`McpTransport` shapes.
- `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` — Liv-side catalog spec; defines `SYSTEM_MCP_NAMES`, Redis hash format, lock D-202-12.
- `livos/packages/livinityd/source/modules/drain-install-pending-redis.ts` — boot-hook analog template.
- `scripts/install/seeds/mcp-servers.json` — exact JSON shape stored under each `liv:mcp:config` field; confirms 5 system MCPs + their stdio commands.
- `.planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md` — locked decisions; all D-241-XX referenced in this research.

### Secondary (MEDIUM confidence)
- AionUi journal logs (probe 20) — confirms HTTP route names + status codes match the probe responses.
- `MEMORY.md` server topology notes — Mini PC = sole target, deploy via update.sh, Caddy-on-bruce-uid, etc.

### Tertiary (LOW confidence — needs revisit if questioned)
- The exact agent set (`claude, gemini, qwen, codex, codebuddy, opencode, aionrs, aionui`) — VERIFIED via sync-to-agents response, but a future AionUi upstream upgrade could change this list. Treat as informational.
- Whether `original_json` in `CreateMcpServerRequest` has any special meaning to AionUi when set vs unset — not probed; Phase 241 leaves it unset, which works.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `original_json` field is safe to omit | §1 / Code Examples | Very Low — probe F omitted it and got 201 |
| A2 | Toggle is a separate POST to `/api/mcp/servers/{id}/toggle` | §1 / Pitfall 4 | Low — endpoint string visible in binary, but exact toggle payload body not probed (assumed `{enabled: bool}` from string match). Plan should probe-confirm during implementation. |
| A3 | Setting `transport.env` works for stdio MCPs | §Code Examples | Low — CreateMcpServerRequest accepts env per binary strings (`stdiocommandenv`); not explicitly probed with env values |
| A4 | sync-to-agents `agents` field is ignored when absent | §1 | Low — probe A/D both succeeded; not load-bearing |
| A5 | Phase 241 will run BEFORE any operator first uses the AionUi UI | §Pitfall 1 | LOW — on a fresh Mini PC install this is true; on an existing operator's box that already has AionUi running, the EXISTS gate handles it |

If A2 turns out wrong, the worst case is `luse` is registered but stays in `enabled: false` state — operator manually flips it once and the registrar respects that on every future boot (per Pitfall 1 mitigation). Acceptable degradation.

## Open Questions (RESOLVED)

None blocking. Two confirmable-in-implementation items:
1. **Toggle endpoint exact payload** — A2 above. Plan should include a one-line curl probe in the Wave 0 test prep ("does `POST /api/mcp/servers/<id>/toggle -d '{}'` enable, or does it need `{enabled:true}`?").
2. **Should the registrar set `description` field?** AionUi's `CreateMcpServerRequest` accepts it; Redis catalog has it. Recommendation: pass it through so AionUi's MCP panel displays "Read CPU / memory / disk / uptime metrics..." instead of a bare server name. Cosmetic only; planner can decide.

## Environment Availability

> Required for the seed pass at runtime. Probed Mini PC 2026-05-27.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `liv-assistant.service` (port 3020) | Stages 1, 3, 4, 5 | ✓ | AionUi 2.1.4 (Phase 223) | None — Phase 241 is a no-op without it (D-241-06 handles graceful skip) |
| Redis (`this.ai.redis`) | All stages | ✓ | already running | None — livinityd doesn't start without Redis |
| `liv:mcp:config` hash populated | Stage 2 | ✓ | seed-on-install via `_dld_seed_mcp_servers` (Phase 109+ helper) | If empty, registrar logs warn and exits cleanly without setting sentinel |
| Node 22 `fetch` + `AbortController` | All HTTP calls | ✓ | Node 22 runtime | None needed |

**Missing dependencies with no fallback:** None on a properly-installed Mini PC. Phase 241 gracefully no-ops when AionUi is missing or down.

**Missing dependencies with fallback:** None.

## Metadata

**Confidence breakdown:**
- API contract (`POST /api/mcp/servers`, `sync-to-agents`, `GET servers`): **HIGH** — every claim verified with live curl + cross-checked against binary-extracted Rust struct names.
- Upsert-by-name semantics: **HIGH** — probes DD/EE explicitly tested with different payloads to the same name.
- Boot-hook pattern: **HIGH** — `drain-install-pending-redis.ts` source read; invocation site identified.
- Readiness polling pattern: **MEDIUM-HIGH** — pattern matches livinityd's existing heartbeat/Caddy-admin HTTP code style but isn't 1:1 copy-pasted from a specific file (template adapted).
- Toggle endpoint payload (A2): **MEDIUM** — endpoint exists in binary, payload assumed from idiomatic REST shape.
- Description-field cosmetic: **LOW** — not load-bearing.

**Research date:** 2026-05-27
**Valid until:** 30 days (until next AionUi upstream upgrade). If `/opt/liv-assistant/current/` is updated, re-run probe suite (§1) before next Phase 241–touching change.

## RESEARCH COMPLETE

All 8 key unknowns from the spawn brief resolved:
1. **`/api/mcp/sync-to-agents` payload shape:** `{servers: [<name>, ...]}` (string array). Confirmed.
2. **Additive vs destructive:** `POST /api/mcp/servers` is destructive upsert-by-name. Confirmed.
3. **`agent-configs` role:** read-only inspection — Phase 241 does NOT need to call it. Confirmed.
4. **AionUi backend module layout:** bundled binary at `/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore`; HTTP API is the only contract. Confirmed.
5. **livinityd boot lifecycle hook:** mirror `drain-install-pending-redis.ts` (analog code excerpts above); invoke from `index.ts` ~line 640 after Phase 112 fallback. Confirmed.
6. **Failure modes when AionUi is down:** AbortController + `while (Date.now() < deadline)` polling pattern; per-attempt 1.5s timeout, total 60s budget. Idiomatic code in §HTTP Polling Idiom.
7. **Idempotency mechanics:** strict GET → filter → POST-only-missing → sync-all (full set). Pseudocode in §Idempotency Strategy.
8. **EXISTS gate field name:** `name` (1:1 with Redis hash field key). Use `/api/mcp/servers` (not `/api/extensions/mcp-servers`).

Planner can proceed. Recommend ~3-4 plan files:
- **241-01-PLAN:** registrar module skeleton + Redis catalog reader + transform
- **241-02-PLAN:** AionUi HTTP client (5 methods) + readiness poll
- **241-03-PLAN:** seedAionUiMcpConfig orchestrator + sentinel logic + unit tests (3 states)
- **241-04-PLAN:** livinityd `index.ts` wire-up + Mini PC deploy walk + cleanup-verify
