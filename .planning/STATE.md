---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: Server5 platform.apps.suna row updated (env-override fix shipped); scripts/suna-insert.sql synced; Mini PC redeploy + browser smoke test deferred to user-walk
last_updated: "2026-05-04T20:17:01.747Z"
last_activity: "2026-05-04 — 64-04 reached `## CHECKPOINT REACHED` (commit `d5b9efc4`)"
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 31
  completed_plans: 20
  percent: 65
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v31.0 Liv Agent Reborn — Nexus → Liv rename + Suna-only UI overhaul + Bytebot computer use
**Last shipped milestone:** v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) — closed 2026-05-04 via `--accept-debt`
**Next action:** Walk Steps A + B documented in `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-SUNA-FIX-EVIDENCE.md` (Mini PC redeploy + Suna "Navigate to google.com" smoke test). Then re-invoke `/gsd-execute-phase 64` to close out 64-04, or move to Phase 65 (NOT autonomous — see v31-DRAFT.md line 177).

## Current Position

Phase: 64 (v30.5 Final Cleanup) — in progress, 4/5 plans complete
Plans complete: 64-01 (compat matrix), 64-02 (UAT matrix), 64-03 (R-series matrix), 64-05 (quick-task triage)
Plan paused: 64-04 (Suna sandbox fix) — Tasks 1+2 partial-deferred to user-walk; Task 3 = checkpoint:human-verify (browser smoke test)
Status: Server5 platform.apps.suna row updated (env-override fix shipped); scripts/suna-insert.sql synced; Mini PC redeploy + browser smoke test deferred to user-walk
Last activity: 2026-05-04 — 64-04 reached `## CHECKPOINT REACHED` (commit `d5b9efc4`)

## Phase 64 Outstanding Items (user-walk required)

1. **64-04 Step A** — Single batched SSH session to Mini PC (commands documented in `64-SUNA-FIX-EVIDENCE.md` Step 1/2): live diagnose → in-place compose patch → restart kortix-api → reachability gate
2. **64-04 Step B** — Browser smoke test: visit `https://suna.bruce.livinity.io/`, type "Navigate to google.com and tell me what you see", confirm agent describes Google homepage
3. **64-02 deferred** — 11 of 14 v29.3-v29.5 carryforward UATs are `needs-human-walk`; 1 `failed` (Phase 49 fail2ban regression). See `64-UAT-MATRIX.md` for the full list and walk steps.

## Phase 66 Progress (Liv Design System v1) — 4/5 plans complete

- **66-01 ✅** liv-tokens.css + Inter Variable + JetBrains Mono + Tailwind type scale + glass/grain/glow utilities. Commits `887ca00c`/`94b0a556`/`b4186d3a`. Build clean (vite 38.73s). 1 documented 1px body shift (15px vs legacy 14px per D-11). SUMMARY: `66-01-SUMMARY.md`.
- **66-02 ✅** 5 motion primitives (`FadeIn`, `GlowPulse`, `SlideInPanel`, `TypewriterCaret`, `StaggerList`) + barrel export under `livos/packages/ui/src/components/motion/`. Commits `d3a63dd0`/`9f9b1c31`/`e9f48930`. D-09 honored (no motion-primitives/ rewrites). Vite build clean. DESIGN-05 marked complete.
- **66-03 ✅** shadcn liv-* variants — `liv-primary` (Button), `liv-status-running` (Badge), `liv-elevated` (Card), new `slider.tsx` with `liv-slider`. Added `@radix-ui/react-slider ^1.3.6`. Commits `63d2a14c`/`ff20f731`/`d525cb5c`. Build clean.
- **66-04 ✅** `LivIcons` typed Tabler map at `livos/packages/ui/src/icons/liv-icons.ts` — 10 tool-category mappings. Commits `5209f475`/`ef6bdb16`. DESIGN-06 marked complete.
- **66-05 ◆ HUMAN-VERIFY CHECKPOINT** — `/playground/liv-design-system` route + 561-line component shipped (Tasks 1+2). Commits `f71ee445`/`fc822b4c`/`b7305f7d`. **Task 3 = WOW differential A/B walk** — user must visit playground in browser, side-by-side compare with current `/ai-chat`, judge if v31 visual identity is "visibly distinct + brand new" per v31-DRAFT line 257. Walk steps in `66-05-SUMMARY.md`.

## Phase 66 Outstanding Items (user-walk required)

1. **66-05 Step 1** — Start UI dev server: `pnpm --filter ui dev` (port 3000) OR deploy to Mini PC: `ssh ... bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'`
2. **66-05 Step 2** — Visit `/playground/liv-design-system` (logged-in route), walk all 6 sections (Color tokens / Typography / Motion primitives / Glass-grain-glow / shadcn variants / Icon map)
3. **66-05 Step 3** — Side-by-side A/B vs current `/ai-chat` route. Verdict: `approved` / `approved with notes: <notes>` / `failed: <reason>`

## Phase 67 Progress (Liv Agent Core Rebuild) — 2/4 plans complete (Wave 1 done)

- **CONTEXT.md ✅** 26 locked decisions (D-01..D-26); ToolCallSnapshot shape locked (D-12) — unblocks P68/P69 design
- **PLANs ✅** 4 plans, 3 waves, 1828 LOC of plans:
  - 67-01 (W1): RunStore Redis lifecycle (4-key schema + 24h TTL + Pub/Sub tail) ✅ — commits `a00523ca` (RED) + `eccbb8d8` (GREEN); SUMMARY at `67-01-SUMMARY.md`; CORE-01 + CORE-02 marked complete; 7/7 tsx tests pass; build clean; sacred SHA `4f868d31...` unchanged
  - 67-04 (W1): useLivAgentStream Zustand hook (reconnect-after, snapshot dedupe) ✅ — commits `599f7a9a` (types + hook) + `02dab648` (44 tests); SUMMARY at `67-04-SUMMARY.md`; 44/44 vitest pass; vite build clean (33.03s); sacred SHA unchanged; CORE-07 satisfied
  - 67-02 (W2): LivAgentRunner composition wrapper (sacred file untouched) — pending
  - 67-03 (W3): SSE endpoint + POST /start + POST /control + index.ts mount — pending
- **EXECUTE in progress** — Wave 1 done (67-01 + 67-04 in parallel, ~20 min wall-clock combined); Wave 2 (67-02) ready to start; Wave 3 (67-03) blocked on 67-02 + 67-04 (already shipped).

### P67 Decisions Logged

- **67-01:** idx assignment via INCR sidecar counter (`liv:agent_run:{runId}:idx`), atomic, race-free; chosen over LLEN+RPUSH per plan action step 3.
- **67-01:** tail Pub/Sub channel publishes chunk INDEX (decimal string) — subscribers re-read full chunk via `getChunks(idx)`. Narrow channel + automatic late-subscriber backfill via single LRANGE.
- **67-01:** Test backend = ioredis-mock (preferred path); REDIS_URL fallback wired but unused. ioredis-mock@^8.9.0 + @types/ioredis-mock@^8.2.5 added to @nexus/core devDeps.
- **67-01:** RunStore re-exported from BOTH `nexus/packages/core/src/index.ts` (package main) AND `lib.ts` (`@nexus/core/lib` subpath) — covers both import styles in the wild.
- **67-04:** Single Zustand store with `Map<conversationId, ConversationStreamState>` chosen over factory-per-conversationId — simpler subscription model, leaner bundle, matches existing UI store pattern (`environment-store.ts`).
- **67-04:** Frontend types redeclared in `liv-agent-types.ts` (NOT imported from `@nexus/core`) — `@nexus/core` is server-only and not a UI dep; D-NO-NEW-DEPS honored. D-12 lock comment makes drift detectable in single grep.
- **67-04:** Tests use pure-helper extraction + smoke + source-text invariants + MockEventSource (no `@testing-library/react`, no `msw`) — D-NO-NEW-DEPS established by Phase 25/30/33/38/62 precedent overrides plan's RTL+msw scaffold preference. Substantive logic (`applyChunk`, `nextBackoffMs`, `buildStreamUrl`) extracted to top-level pure helpers and tested directly. Deferred RTL test plan (ULA1-ULA5) captured in test file header for future lift.
- **67-04:** UI auth source = `localStorage.getItem(JWT_LOCAL_STORAGE_KEY)` from `@/modules/auth/shared` (`'jwt'` key) — mirrors existing `trpc/trpc.ts:33` pattern. EventSource gets JWT via `?token=` query param (T-67-04-01 mitigation, EventSource cannot set custom headers).
- **67-04:** `autoStart` semantics: re-opens stream with `?after={lastSeenIdx}` IF runId exists AND not in terminal state; does NOT auto-POST `/start`. Handles "user refreshes mid-run" — ROADMAP P67 success criterion #1.

## Phase 68 Progress (Side Panel + Tool View Dispatcher) — 1/7 plans complete (Wave 1)

- **68-01 ✅** useLivToolPanelStore Zustand store + isVisualTool helper. Commits `3676aba5` (feat) + `8e9a0653` (test). SUMMARY at `68-01-SUMMARY.md`. PANEL-01 + PANEL-02 + PANEL-03 marked complete. 22/22 vitest pass (381ms); pnpm --filter ui build clean (35.32s); sacred SHA `4f868d31...` unchanged. Visual-tool regex `/^(browser-|computer-use-|screenshot)/` honors STATE.md line 79 lock. NO persist (CONTEXT D-09 — in-memory only).
- **68-02..68-07** — pending (LivToolPanel chrome, dispatcher, GenericToolView, InlineToolPill, Cmd+I shortcut, integration test).

### P68 Decisions Logged

- **68-01:** VISUAL_TOOL_PATTERN extracted as exported const (not just inline regex) — improves grep-discoverability of the locked product decision (STATE.md line 79). isVisualTool helper exported as a free function so tests hammer it deterministically (CONTEXT D-05).
- **68-01:** Local re-declaration of ToolCallSnapshot in store file per CONTEXT D-14 — P67-04 has its own re-declaration in `liv-agent-types.ts` but `@nexus/core` UI export not yet shipped; aligning here when P67 ships package exports.
- **68-01:** 22 vitest tests > 12 minimum — auto-open behavior is the locked product decision; algorithm density justified. All 6 handleNewSnapshot D-11 branches + dedupe + 4 open() edge cases (tail-live, toolId-manual, missing-id fallback, empty-snapshots) covered.

## v31.0 Milestone Summary

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns verbatim (side panel + per-tool views + browser/computer-use display). Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory, agent marketplace.

**Source plan:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown user-validated 2026-05-04).

**13 phases (P64-P76):**

- P64 v30.5 Final Cleanup (Suna sandbox fix + 14 carryforward UATs + Phase 63 walks + external client matrix)
- P65 Liv Rename Foundation (~5,800 occurrences across 250+ TS files)
- P66 Liv Design System v1 (color tokens, motion primitives, typography, shadcn liv-* variants)
- P67 Liv Agent Core Rebuild (Redis SSE relay, ToolCallSnapshot, LivAgentRunner)
- P68 Side Panel + Tool View Dispatcher (Suna pattern; auto-open ONLY for browser-*/computer-use-*)
- P69 Per-Tool Views Suite (9 components Suna-derived + inline tool pill)
- P70 Composer + Streaming UX Polish (auto-grow, slash menu, welcome screen)
- P71 Computer Use Foundation (Bytebot desktop image + react-vnc + app gateway auth)
- P72 Computer Use Agent Loop (16 Bytebot tools + system prompt + NEEDS_HELP UI)
- P73 Reliability Layer (ContextManager 75% threshold, BullMQ queue, reconnectable runs)
- P74 F2-F5 Carryover (token cadence, tool_result, Caddy timeout, identity)
- P75 Reasoning Cards + Memory (Postgres tsvector FTS, pinned messages)
- P76 Agent Marketplace + Onboarding Tour (8-10 seed agents, 9-step interactive tour)

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Locked decisions for v31 entry:**

- ONLY Suna UI patterns (NO Hermes UI per user direction 2026-05-04)
- Side panel auto-opens ONLY for `browser-*`/`computer-use-*` tools (Suna behavior)
- Bytebot: desktop image only (Apache 2.0); agent code NOT used
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged Bytebot containers accepted (Mini PC single-user constraint)
- Sacred file old "UNTOUCHED" rule retired (was stale memory; current SHA `9f1562be...` after 25 normal commits since v22 era)

## Hard Constraints (carry forward from v30.0)

- **D-NO-BYOK** — Subscription only, no Anthropic API key path
- **BROKER_FORCE_ROOT_HOME** — Use `/root/.claude/.credentials.json` for subscription auth
- **D-NO-SERVER4** — Mini PC + Server5 are the only deploy targets
- **Side panel auto-open behavior** — ONLY for `browser-*` and `computer-use-*` tool patterns

## Deferred Items (from v30.0 close — mapped into v31 phases)

| Category | Item | Status | v31 Destination |
|----------|------|--------|-----------------|
| verification | Phase 60 (Public Endpoint) — VERIFICATION.md | human_needed | P64 (v30.5 final cleanup) |
| verification | Phase 62 (Usage Tracking + Settings UI) — VERIFICATION.md | human_needed | P64 |
| uat_gap | Phase 63 (Mandatory Live Verification) | unknown | P64 |
| quick_task | 260425-sfg / 260425-v1s / 260425-x6q (3 v28.0 hot-patches) | resolved (P64-05, all already-resolved) | — |
| infra | F7 Suna marketplace sandbox network blocker | open | P71 (Computer Use Foundation) |
| infra | F2 Token-level streaming cadence | open | P74 |
| infra | F3 Multi-turn tool_result protocol | open | P74 |
| infra | F4 Caddy timeout for long agentic sessions | open | P74 |
| infra | F5 Identity preservation across turns | open | P74 |
| uat_carry | 14 carryover UATs from v29.3-v29.5 | deferred | P64 |

## Server / Infra Reference (carry from v30.0)

### Mini PC (`bruce@10.69.31.68`)

- Code: `/opt/livos/packages/{livinityd,ui,config}/` + `/opt/nexus/packages/{core,worker,mcp-server,memory}/` (P65 will migrate `/opt/nexus/` → `/opt/liv/`)
- Deploy: `sudo bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds, restarts services)
- 4 systemd services: `livos liv-core liv-worker liv-memory` (already Liv-prefix ✓)
- Subscription creds: `/root/.claude/.credentials.json` (works) vs `/home/bruce/.claude/.credentials.json` (org-disabled)
- Env: `BROKER_FORCE_ROOT_HOME=true` set on services → broker uses /root creds
- claude CLI: `/home/bruce/.local/bin/claude` v2.1.126
- fail2ban: aggressive — batch SSH calls, never `iptables -F` (kills tunnel)

### Server5 (`root@45.137.194.102`)

- `livinity.io` relay (NO LivOS install, NEVER deploy LivOS code here)
- Caddy v2.11.2 with `caddy-ratelimit` + `caddy-dns/cloudflare` modules
- Caddyfile: `/etc/caddy/Caddyfile`, backup `caddy.bak.20260503-070012`
- Relay (Node) at port 4000, pm2 process `relay` (id 18)
- DNS: Cloudflare (manual dashboard, no IaC) — `api.livinity.io` A → 45.137.194.102
- Hosts public app store at `apps.livinity.io` — PostgreSQL `platform.apps` table (26 apps as of 2026-05-03)

### Server4 (`root@45.137.194.103`)

- **OFF-LIMITS — NEVER touch**, NOT user's server, deferred forever
