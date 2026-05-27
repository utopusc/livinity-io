# Phase 241: MCP auto-add Liv tools (Luse / docker / shell) — Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

livinityd auto-registers Liv's system MCP servers into **AionUi's** MCP config on liv-assistant first boot, so any agent the operator opens inside Liv AI (Claude Code, Aion CLI, OpenCode, OpenClaw, Gemini) sees Liv's tools (computer-use, docker, system, apps, vault) in its tool-discovery surface.

**Scope:**
- New livinityd `mcp-registrar/` module
- First-boot detection of liv-assistant
- Idempotent injection via AionUi's MCP HTTP API
- Operator-customized entries preserved across livinityd restarts

**Not in scope (deferred to other phases):**
- New tools beyond the 5 existing system MCPs (would be its own phase)
- AionUi MCP tab UI changes (AionUi owns its UI)
- Per-tool documentation polish for agent discovery (Phase 242 covers Luse docs)
- One-click install of CLIs (Phase 240, depends on this phase's API surface)
- Onboarding wizard CLI Tools step (Phase 239)

</domain>

<probe_findings>
## Probe Findings (Mini PC 2026-05-27 — before discussion)

Settled the foundational "does AionUi have an MCP system?" question with a live probe:

**AionUi MCP endpoints (Mini PC `http://127.0.0.1:3020`):**

| Endpoint | GET | POST | PUT/PATCH/DELETE |
|----------|-----|------|------------------|
| `/api/extensions/mcp-servers` | 200 (returns `{data: []}` — empty) | 405 | 405 |
| `/api/mcp/agent-configs` | 200 | 405 | 405 |
| `/api/mcp/servers` | 200 | (not tested) | (not tested) |
| `/api/mcp/sync-to-agents` | 405 | **400 (endpoint exists, expects payload)** | 405 |
| `/api/extensions` | 200 | (not tested) | (not tested) |

**Key resolution: write surface = `POST /api/mcp/sync-to-agents`** — returned 400 on empty body (vs 405 on every other write candidate), meaning the endpoint accepts POST and expects a JSON payload. Research must discover the exact payload shape (single bulk push vs per-server push; whether the call is additive or destructive).

**Storage:** no on-disk MCP JSON found under `/opt/liv-assistant/data/` (greppped for `mcpServers|mcp_servers`). Config likely lives in `aionui-backend.db` (SQLite). The only file with extension-state is `extension-states.json` (Phase 241 should not need to touch it directly — go through the HTTP API).

**Current AionUi MCP state:** empty `[]` — clean baseline for first injection.

**Liv side already exists:** `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` defines 5 system MCPs in `SYSTEM_MCP_NAMES` (`luse`, `liv-docker`, `liv-system`, `liv-apps`, `liv-vault`) backed by Redis hash `liv:mcp:config`. Phase 241 reads from THIS catalog and pushes to AionUi.

</probe_findings>

<decisions>
## Implementation Decisions

### Tool Scope
- **D-241-01:** Auto-add **all 5 Liv system MCPs** (`luse`, `liv-docker`, `liv-system`, `liv-apps`, `liv-vault`) — not just the 3 ROADMAP-named ones. ROADMAP wording predates Phase 219 T3 which already locked the 5-server system set. Aligns with `SYSTEM_MCP_NAMES` in `mcp-config-router.ts` so the same delete-forbidden invariant on the Liv side covers the injected set on the AionUi side.

### Idempotency / Sentinel
- **D-241-02:** **Version-keyed Redis sentinel** — `livos:v43:mcp_seeded:v1` (boolean). Bumping the version suffix (`:v2`, `:v3`) triggers a re-seed pass; this is how v44+ can add new Liv MCPs without manual flag deletion. Each seed pass still per-tool EXISTS-checks via AionUi GET (D-241-04) so a bumped version doesn't clobber operator entries.
- **D-241-03:** **Single-shot per livinityd boot** — sentinel checked once at livinityd start, after liv-assistant health check passes. If seeded, no further action. If not seeded, run the seed pass and set the sentinel.

### Customization Preservation
- **D-241-04:** **Strict name match** — for each of the 5 system MCPs, GET `/api/extensions/mcp-servers` (or whichever endpoint returns the current list), check if an entry with that `name` already exists. If yes → skip (do not overwrite, do not refresh, do not diff). If no → POST to inject. This is the simplest operator-safe reading of `D-241-OPERATOR-SAFE`: anything the operator already touched (including renaming or rebuilding from scratch with our name) is sacred.
- **D-241-05:** **No deletion** — Phase 241 never removes entries from AionUi's MCP config. If a future Liv version drops a system MCP, the AionUi-side entry stays orphaned (operator can remove it manually). This avoids the "Liv update silently broke my custom workflow" failure mode.

### Activation Trigger
- **D-241-06:** livinityd detects "liv-assistant is up and ready" via HTTP health poll on `http://127.0.0.1:3020/api/settings/client` (already known reachable from Phase 238.3). Backoff: poll every 2s for up to 60s. If still unreachable, log warning and skip seed pass (sentinel NOT set → retry on next livinityd boot). This is more reliable than systemd `After=liv-assistant.service` ordering because liv-assistant's tsx bootstrap is slow.

### Write Path
- **D-241-07:** Use `POST /api/mcp/sync-to-agents` — confirmed-existing write endpoint per probe. Research must discover the exact payload shape (single bulk array of 5 servers vs 5 individual POST calls). Planner picks whichever the API supports; per-server is preferred for partial-failure resilience.

### Claude's Discretion
- **TypeScript module shape** — placement under `livos/packages/livinityd/source/modules/mcp-registrar/` (new module, mirrors existing `modules/mcp/` convention). Exports a single `seedAionUiMcpConfig(deps)` function called from `livinityd/source/index.ts` post-boot hook.
- **Logging granularity** — per-tool emit (`mcp-registrar: luse → injected`, `mcp-registrar: liv-docker → already present, skipping`) into the existing livinityd log stream.
- **Test strategy** — unit test the registrar with a mock AionUi HTTP client (returning the 3 states: empty / partial / full). No live Mini PC dep in unit tests.
- **Per-tool entry payload generation** — derive from `liv:mcp:config` Redis hash directly (single source of truth — D-202-12); do not duplicate the 5 server specs in the registrar module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Liv-side MCP catalog (single source of truth)
- `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` — defines `SYSTEM_MCP_NAMES`, Redis hash `liv:mcp:config`, lock D-202-12 (Phase 219 T3 source for the 5 system MCPs). Read for the exact server config shape: `{name, transport, command?, args?, url?, env?, enabled}`.
- `livos/packages/livinityd/source/modules/mcp/local/liv-system/index.ts` — concrete example of a Liv system MCP server (read to understand how the 5 are spawned).
- `scripts/install/seeds/mcp-servers.json` — seed file format (Phase 219 T2 export). Reference for the value shape stored in the Redis hash.

### AionUi-side write API (research target)
- `http://127.0.0.1:3020/api/mcp/sync-to-agents` (POST) — confirmed write endpoint, payload shape TBD by research. Probe results in this CONTEXT.md `<probe_findings>`.
- `http://127.0.0.1:3020/api/extensions/mcp-servers` (GET) — current MCP list endpoint, returns `{success, data: []}`. Use for the per-tool EXISTS gate (D-241-04).
- `http://127.0.0.1:3020/api/mcp/agent-configs` (GET) — per-agent MCP routing, may matter for "which agents see which MCPs" semantics. Research must clarify.

### Prior phase context (load-bearing)
- `.planning/RESUME-HERE.md` — v43 full handoff, includes the 10 critical learnings (Caddy `replace_response` is NOT installed; AionUi's index.html does NOT regenerate; etc.)
- `.planning/STATE.md` "Previous Position (v43 — Phase 238.10)" — sacred SHA, deploy patterns, operator preferences
- ROADMAP.md Phase 240 / 242 cross-references — Phase 240 hard-depends on the API surface 241 exposes; Phase 242 ships docs that reference these MCP tools

### Operator preferences (applied throughout)
- `feedback_minipc_is_owncloud_primary` — Mini PC is the ONLY deploy target
- `feedback_ssh_rate_limit` — batch read-only commands into ONE ssh invocation
- `feedback_full_autonomous_no_questions` — when operator says "soru sorma", override planner cautious gates
- `feedback_autonomous` — test-driven, A-Z without interrupting

### Sacred + deploy invariants
- Pre-commit hook gates sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) — Phase 241 does not touch this file
- Mini PC sacred sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` — verify UNCHANGED across Phase 241 deploys
- Deploy via `bash /opt/livos/update.sh` (NEVER PM2 — see MEMORY.md)
- `livos.service` + `liv-core` + `liv-worker` + `liv-memory` + `liv-assistant` + `caddy` — all 6 must stay active post-deploy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`liv:mcp:config` Redis hash** — already contains the 5 system MCPs in canonical JSON form. Registrar reads via `redis.hgetall` and reuses these payloads directly (no duplication).
- **`SYSTEM_MCP_NAMES` Set** (`mcp-config-router.ts:67`) — same constant defines which tools the Phase 241 registrar processes. Import + iterate.
- **`McpConfigRedisClient` interface** (`mcp-config-router.ts:74-93`) — minimal Redis surface the registrar needs (`hgetall`, `hget`). Reuse for type safety.
- **livinityd HTTP client patterns** — existing modules already make outbound HTTP calls (e.g., Caddy admin API in `modules/domain/caddy-state.ts`). Match the same fetch/error-handling pattern.

### Established Patterns
- **Boot-time hooks in `livinityd/source/index.ts`** — existing pattern for one-shot startup actions (drain-install-pending-redis.ts is the closest analog). Phase 241 registrar plugs in here with a sentinel-gated invocation.
- **English error messages** (D-202-21 / INV-202-05) — applies to any new log lines and error throws in the registrar.
- **Backend additive only** (INV-202-02) — Phase 241 lives entirely in livinityd; no changes to UI packages.
- **`update.sh` deploy** — Phase 241 ships via standard `bash /opt/livos/update.sh` flow (git pull → install → build → systemctl restart livos). No new install-script steps needed.

### Integration Points
- **Boot trigger:** `livinityd/source/index.ts` — add `await seedAionUiMcpConfig(deps)` after the existing post-boot sequence
- **Module location:** `livos/packages/livinityd/source/modules/mcp-registrar/` (new directory, mirrors `modules/mcp/`, `modules/jwt.ts` convention)
- **Redis client:** reuses livinityd's existing ioredis singleton (no new connection needed)
- **AionUi base URL:** `http://127.0.0.1:3020` (Mini PC localhost — same as Phase 238.3 helper)

</code_context>

<specifics>
## Specific Ideas

- **Operator's framing (the decisive question of this session):** "AionUI in hali hazırda mcp server'ı var mı? Var ise direkt onu kullanalım, bizim MCP'leri oraya taşıyalım." → This locked the architecture: do NOT build a parallel MCP framework, do NOT make livinityd a MCP proxy. Use AionUi's own MCP system and bridge our existing 5 system MCPs into it.
- **The "5 not 3" correction:** ROADMAP's "Luse / docker / shell" phrasing reflects an earlier mental model. Phase 219 T3 already locked 5 system MCPs (`SYSTEM_MCP_NAMES`). Phase 241 mirrors that 5-set exactly, not the older 3-set. ROADMAP wording is descriptive, the Liv catalog is authoritative.
- **Read the Redis catalog, don't hardcode:** The registrar module must NEVER hardcode the 5 server names or their payloads. Read from `liv:mcp:config` so the single source of truth stays in the existing router (D-202-12).

</specifics>

<deferred>
## Deferred Ideas

- **Bi-directional sync** — operator edits AionUi MCP entry → livinityd reflects it back to `liv:mcp:config`. Out of scope; current model is one-shot push at first boot.
- **MCP server hot-reload** — when livinityd updates `liv:mcp:config` (e.g., operator adds a new MCP via `/settings → MCP` tab), it does NOT propagate to AionUi until next livinityd boot. Could be a future enhancement (subscribe to `liv:mcp:updated` pubsub channel — see `mcp-config-router.ts:61`).
- **Sentinel version bump UX** — currently requires manual Redis key bump (`DEL livos:v43:mcp_seeded:v1`). A future "Force re-seed" admin button could surface this. Deferred to v44+.
- **Marker field for richer customization tracking** — D-241-04 chose strict name match for simplicity. If operators report "I want to add a tool with the same name as a Liv one, but my version", a future phase could introduce the `_livos_seeded: true` marker field approach.
- **Live-watch liv-assistant restart** — currently Phase 241 only seeds at livinityd boot. If liv-assistant is restarted independently (e.g., for an upstream upgrade), the seed pass doesn't re-run. AionUi keeps its DB so this should be fine, but a future enhancement could `systemctl status liv-assistant` watcher.

</deferred>

---

*Phase: 241-mcp-auto-add-liv-tools*
*Context gathered: 2026-05-27*
