# Phase 241: MCP auto-add Liv tools — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 241-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 241-mcp-auto-add-liv-tools
**Areas discussed:** Foundational architecture probe, Tool scope, Sentinel granularity, Customization preservation

---

## Foundational Architecture Probe

**Trigger:** Operator asked (literal Turkish): "AIonUI in hali hazirda mcp server i var mi var ise direkt onu kullanalim bizim mcp leri oraya tasiyalim?" — "Does AionUI already have an MCP server? If so, let's use it directly and move our MCPs there."

**Action:** Single batched SSH probe to Mini PC tested AionUi's HTTP MCP endpoints, write-method support, and on-disk config storage.

**Findings:**
- `GET /api/extensions/mcp-servers` → 200, `{data: []}` (empty)
- `POST /api/mcp/sync-to-agents` → 400 (endpoint exists, expects payload)
- All other write endpoints → 405 (method not allowed)
- No JSON MCP config under `/opt/liv-assistant/data/` (config in SQLite `aionui-backend.db`)
- Liv side already has `liv:mcp:config` Redis hash with 5 system MCPs

**Locked architecture:** Use AionUi's `/api/mcp/sync-to-agents` POST as write surface; mirror Liv's 5-MCP catalog (read from Redis hash, do not duplicate).

---

## Area 1 — Tool Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 5-tool full system set | luse + liv-docker + liv-system + liv-apps + liv-vault (matches `SYSTEM_MCP_NAMES` Phase 219 T3) | ✓ |
| 3-tool ROADMAP set | Only luse + liv-docker + liv-system (sticks to ROADMAP wording) | |
| `enabled:true` subset | All entries in `liv:mcp:config` where `enabled=true` (operator-curated) | |

**User's choice:** 5-tool full system set.

**Notes:** Recommended option (first). Aligns the AionUi-side set with the existing `SYSTEM_MCP_NAMES` invariant; the ROADMAP "3 tools" wording predates Phase 219 T3 which already locked 5.

---

## Area 2 — Sentinel Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Version-keyed | `livos:v43:mcp_seeded:v1` — bump suffix to trigger re-seed (clean upgrade path) | ✓ |
| Per-tool | Separate key per server — partial retry on AionUi rejections | |
| Single boolean | Single `livos:v43:mcp_seeded` — simplest, no upgrade path | |

**User's choice:** Version-keyed.

**Notes:** Recommended option (first). Future v44/v45 MCP additions just bump the version suffix and trigger a clean re-seed pass.

---

## Area 3 — Customization Preservation

| Option | Description | Selected |
|--------|-------------|----------|
| Strict name match | Any AionUi entry with matching `name` → skip (no overwrite, no refresh, no diff) | ✓ |
| Marker field | livinityd entries carry `_livos_seeded: true` — operator-removable signal | |
| Content diff | Deep-compare with seed payload; refresh if matches, leave if differs | |

**User's choice:** Strict name match.

**Notes:** Recommended option (first). Simplest reading of D-241-OPERATOR-SAFE: anything the operator touched is sacred. Phase 241 never overwrites, never refreshes, never deletes — it only adds the missing ones.

---

## Claude's Discretion

- Module placement: `livos/packages/livinityd/source/modules/mcp-registrar/` (new module convention mirror)
- Logging granularity: per-tool emit lines (injected vs already present)
- Test strategy: unit-test with mock AionUi HTTP client; no live Mini PC dep in unit tests
- Per-tool payload derivation: read from `liv:mcp:config` directly (single source of truth)
- AionUi readiness detection: HTTP poll `127.0.0.1:3020/api/settings/client` every 2s, up to 60s timeout
- Bulk vs per-server POST to `/api/mcp/sync-to-agents`: planner picks based on what the API supports (per-server preferred for partial-failure resilience)

## Deferred Ideas

- Bi-directional sync (AionUi → Liv reflection)
- MCP hot-reload (subscribe to `liv:mcp:updated` pubsub)
- Sentinel version-bump UX (admin "Force re-seed" button)
- Marker field for richer customization tracking
- Live-watch liv-assistant restart
