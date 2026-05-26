# Phase 215: One-click install + walkthrough docs — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true)

<domain>
## Phase Boundary

Admin clicks "Install" → flows to Mini PC bridge → MCP/app working in <60s. `/admin/walkthrough` explains how to add a new app/MCP from scratch.

**Effort:** 2 days.
**Requirements:** WIRE-01..05 (5 REQs).
**Depends on:** Phase 211 (install path reliability), Phase 213, Phase 214.

### Success criteria
1. 3 sample MCPs install via one-click in <60s each (WIRE-05).
2. Walkthrough page renders, test-install works for sample (WIRE-04).
3. Doc walkthroughs reviewed by operator (WIRE-03).

### Critical risk (from ROADMAP §3243)
**Vercel-only Next.js cannot directly write to Mini PC.** Install command must travel through either:
- (a) Server5 relay — currently DOWN per CARRY-V41-RELAY-DOWN
- (b) Supabase-mediated channel (Mini PC polls Supabase for install commands)

Phase 211 was supposed to clarify the channel but only shipped 211.1 (defensive HASH guard) — the channel decision was punted.

</domain>

<decisions>
## Implementation Decisions (Claude's discretion under autonomous mode)

### Channel choice: Supabase-mediated polling

Rationale:
- Server5 relay is DOWN (`CARRY-V41-RELAY-DOWN`) and the wider relay-persistence wiring gap (HEARTBEAT-AUDIT from P212-T5) means even when restored, persistence isn't ready.
- Supabase is the existing source-of-truth post v37 cutover. Adding an `install_commands` table fits the existing data model.
- Mini PC livinityd already has Supabase visibility (apps table mirror per Phase 105+). Adding a polling loop is a known pattern.
- Decouples Vercel from Server5 entirely. Cleaner architecture.

**Channel design:**
1. `install_commands` table on Supabase: `{id, user_id, app_id, status (queued|running|ready|failed), instance_name, params (jsonb), result_json (jsonb), created_at, started_at, completed_at}`.
2. `POST /api/admin/install` — admin requests; INSERT row with status=queued. Optional SSE endpoint streams status changes.
3. Mini PC livinityd has a polling loop (new module): every 5s SELECT FROM install_commands WHERE user_id=ME AND status='queued' ORDER BY created_at, UPDATE status=running, do the install, UPDATE status=ready|failed + result_json. → **Out of scope for Vercel-only P215 ship today.** Tracked as CARRY-P215-MINIPC-POLLER.

### Scope discipline (Vercel-side only this session)

P215 ROADMAP has 4 tasks. Honest assessment given the architecture risk + Mini PC side not buildable from this repo state:
- T1 Wire store Install → Phase 211 install path: ship the Supabase side (table + endpoint). Mini PC poller = carry.
- T2 SSE install progress UI: ship an SSE endpoint that reads install_commands status changes. UI consumes it from admin/store or store/[id] detail page. Mini PC side won't update statuses today — but Vercel infrastructure is in place for when poller lands.
- T3 /admin/walkthrough page with 3 guides: ship doc content. Self-contained.
- T4 Embedded test-install button: ship the UI; depends on Mini PC poller for live verification.

**Decision:** ship T1 schema + endpoint, T2 SSE endpoint stub, T3 walkthrough docs. T4 + Mini PC poller = carry.

### Success criteria realism

- WIRE-05 (3 MCPs install via one-click in <60s) — **CANNOT VERIFY IN P215 SCOPE.** Carries to P217 + after CARRY-P215-MINIPC-POLLER.
- WIRE-04 (walkthrough renders + test-install works for sample) — **PARTIAL.** Walkthrough renders ✓. Test-install button exists ✓. Live verification — same carry as WIRE-05.
- WIRE-03 (operator-reviewed walkthroughs) — **OPERATOR ACTION.** P217.

</decisions>

<code_context>
## Existing Code Insights

- `livos/packages/livinityd/source/modules/apps/apps.ts` — install path entry point (Phase 211 hardening). Mini PC side.
- `platform/web/src/app/admin/store/page.tsx` (P214) — operator clicks install here. Or in `/store` detail.
- Existing tables: `install_history` (post-hoc log). Need NEW `install_commands` (queue).

</code_context>

<specifics>
## Specific Ideas

- `install_commands` should reference both `user_id` (which Mini PC will execute) and `app_id` (which app). `instance_name` optional (per-instance installs).
- SSE endpoint should support reconnect via Last-Event-ID.
- Walkthrough docs: 3 sections (Docker app, MCP server, custom non-Docker). Plain markdown content rendered via simple converter.

</specifics>

<deferred>
## Deferred Ideas

- **CARRY-P215-MINIPC-POLLER** — new module in `livos/packages/livinityd/source/modules/install/` that polls Supabase install_commands every 5s and executes via Phase 211 path. ~150-200 LOC. Out of scope for Vercel-only repo state.
- **CARRY-P215-WIRE-05-LIVE** — 3 MCPs install in <60s verification. Requires Mini PC poller.
- **CARRY-P215-WIRE-04-LIVE** — embedded test-install runs end-to-end. Requires Mini PC poller.
- **CARRY-P215-RELAY-PATH** — alternate channel (Server5 relay) for users who don't want Supabase polling. Tracked but not selected.

</deferred>
