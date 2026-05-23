---
phase: 203-liv-ai-openclaw-os
plan: 09
subsystem: ui
tags: [next.js, assistant-ui, purge, caddy, routing, phase-202-preservation]

requires:
  - phase: 203-08
    provides: "@mastra/* purge complete — backend chat-route moved to agent-runtime/ and the in-process Mastra Agent factory is gone; this frees the Next.js subapp to drop its assistant-ui chat surface without leaving a half-wired UI."
  - phase: 203-05
    provides: "Caddy /openclawos/handshake bridge + /liv-ai-app/* → :18789 routing emitted by LIV_AI_APP_HANDLE in caddy.ts; this plan extends that constant with a second handle for the Next.js subapp."
  - phase: 202-04
    provides: "components/agents/AgentsSidebar.tsx + Phase 202 dashboard surfaces (components/agents/**, components/settings/**, src/lib/agents/**) — these are native fetch + tRPC, no assistant-ui dependency."

provides:
  - "Zero @assistant-ui/* packages in liv-ai-app/package.json (3 deps removed: @assistant-ui/react, @assistant-ui/react-ai-sdk, @assistant-ui/react-markdown)."
  - "Zero @assistant-ui imports across the subapp (chat surface deleted: 39 files including app/assistant.tsx, components/assistant-ui/**, src/lib/tool-ui/**, src/lib/liv-ai/**, src/lib/openui/**, plus 8 top-level component shims)."
  - "Phase 202 dashboard preserved: app/agents/{page,layout,[id]/page,new/page}, app/settings/{page,layout}, all components/agents/** + components/settings/** + components/ui/** intact."
  - "Next.js subapp build PASS — 5 functional routes (`/`, `/agents`, `/agents/[id]`, `/agents/new`, `/settings`) + `/_not-found`."
  - "Caddy /liv-ai-app split: openclawos sub-prefix → :18789 (claw-gateway, prefix stripped via handle_path), bare prefix → :3010 (Next.js subapp)."
  - "Caddy unit tests PASS (39/39) covering both Phase 203-05 handshake ordering and new Phase 203-09 split assertions."

affects:
  - "Phase 203-10 (claw-client ApprovalCard) — gateway in-process router needs to accept '/' as the canonical entry now that handle_path strips '/liv-ai-app/openclawos' before forwarding (was previously /plugins/openclawos per claw-plugin ROUTE_PREFIX)."
  - "Phase 203-12 (Mini PC deploy walk) — pre-existing livos-app-liv-ai.service unit needs to be re-enabled (was set to be retired pre-203-09; now keeps Phase 202 dashboard reachable through Caddy)."

tech-stack:
  added: []
  patterns:
    - "Caddy handle_path for prefix-stripping reverse proxy: lets the openclaw gateway live under a sub-prefix without leaking the prefix into its in-process router."
    - "Sub-prefix specificity routing: longer-prefix handle wins over shorter-prefix handle on the same vhost — confirmed via unit test assertions on (/liv-ai-app/openclawos → :18789) vs (/liv-ai-app/* → :3010)."

key-files:
  created: []
  modified:
    - "livos/packages/liv-ai-app/package.json — dropped @assistant-ui/* + ai deps (4 lines removed)"
    - "livos/pnpm-lock.yaml — regenerated, 150 lines removed"
    - "livos/packages/liv-ai-app/app/page.tsx — rewritten as redirect('/agents') stub"
    - "livos/packages/liv-ai-app/app/layout.tsx — metadata title 'assistant-ui Starter App' → 'Liv AI'"
    - "livos/packages/liv-ai-app/tsconfig.json — removed stale path aliases for tool-ui/liv-ai/openui"
    - "livos/packages/livinityd/source/modules/domain/caddy.ts — LIV_AI_APP_HANDLE split into handle_path + @livaiSubapp"
    - "livos/packages/livinityd/source/modules/domain/caddy.test.ts — 5 updated + 3 new tests (39 total PASS)"
    - "scripts/install/deploy-livinityd.sh — 3 bootstrap heredocs patched (tunnel/local-lan/cloud)"
    - "scripts/install/mode-cloud.sh — 2 heredocs (HTTPS + :80 fallback)"
    - "scripts/install/mode-tunnel.sh — tunnel-mode heredoc"
  deleted:
    - "livos/packages/liv-ai-app/app/assistant.tsx (entry chat shell)"
    - "livos/packages/liv-ai-app/components/assistant-ui/{thread,threadlist-sidebar,composer-trigger-popover}.tsx"
    - "livos/packages/liv-ai-app/components/{thread-list,tool-fallback,tool-group,markdown-text,reasoning,attachment,tooltip-icon-button}.tsx (7 files)"
    - "livos/packages/liv-ai-app/src/lib/tool-ui/** (13 files: approval-card, chart, code-block, code-diff, data-table, geo-map, geo-map-impl, image-gallery, item-carousel, link-preview, running-header, sources, tool-fallback, weather-widget)"
    - "livos/packages/liv-ai-app/src/lib/liv-ai/** (9 files: composer, mention-adapter, model-picker, models, redact-args, redact-args.test, slash-adapter, slash-commands, thread-list-adapter, tool-renderers, use-approve-mutation)"
    - "livos/packages/liv-ai-app/src/lib/openui/{openui-renderer,openui-components}.tsx"

key-decisions:
  - "Page stub: app/page.tsx redirects to /agents (option b from PLAN Task 3) — cleanest path for dev port-direct fallback; the openclaw gateway owns /liv-ai-app/* in production."
  - "Caddy split: handle_path strips the /liv-ai-app/openclawos prefix before forwarding to :18789 so the gateway's in-process router sees '/' instead of a project-specific URL — keeps the gateway code unaware of the parent vhost shape."
  - "Conservative dep purge: only @assistant-ui/* + ai (0 imports remain) per PLAN Task 4 spec. Orphans leaflet/react-leaflet/recharts/remark-gfm/@types/leaflet (formerly used by deleted tool-ui charts/maps) NOT removed — out of scope, defer to a future cleanup pass."

patterns-established:
  - "Subapp + gateway prefix coexistence via handle_path: model for any future case where a Next.js dashboard and an embedded full-page gateway share a URL prefix (vault/, openclawos/, etc.)."

requirements-completed: [REQ-203-03]

duration: 17min
completed: 2026-05-23
---

# Phase 203 Plan 09: Purge @assistant-ui from liv-ai-app Summary

**Deleted 39 chat-surface files + 3 @assistant-ui/* deps from the Next.js subapp; kept Phase 202 /agents + /settings dashboard intact via a Caddy handle_path split that routes /liv-ai-app/openclawos to the openclaw gateway and /liv-ai-app/* to the Next.js subapp.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-23T21:12:00Z
- **Completed:** 2026-05-23T21:29:46Z
- **Tasks:** 6 (all PLAN tasks + 1 Rule 2 deviation for Caddy routing split)
- **Files modified:** 10
- **Files deleted:** 39

## Accomplishments

- Purged `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown`, and the now-unused `ai` package from `liv-ai-app/package.json`; regenerated lockfile (-150 lines).
- Deleted the entire chat surface: `app/assistant.tsx`, `components/assistant-ui/`, the 8 top-level chat component shims, `src/lib/tool-ui/`, `src/lib/liv-ai/`, `src/lib/openui/` — 39 files, 5,473 lines removed.
- Rewrote `app/page.tsx` as a `redirect('/agents')` stub; updated `app/layout.tsx` metadata title.
- Phase 202 dashboard fully preserved: `app/agents/{page,layout,[id]/page,new/page}.tsx`, `app/settings/{page,layout}.tsx`, all of `components/agents/**`, `components/settings/**`, `components/ui/**`, `src/lib/agents/**`, `src/lib/settings/**` untouched.
- `pnpm --filter liv-ai-app build` PASS — Next.js 16.2.6 Turbopack reports the expected 5 functional routes (`/`, `/agents`, `/agents/[id]` dynamic, `/agents/new`, `/settings`) plus `/_not-found`.
- Caddy `LIV_AI_APP_HANDLE` constant + 3 bootstrap shell heredocs (`deploy-livinityd.sh`, `mode-cloud.sh`, `mode-tunnel.sh`) split routing: `handle_path /liv-ai-app/openclawos[/*]` → `:18789` (strips prefix), `@livaiSubapp path /liv-ai-app /liv-ai-app/*` → `:3010`. All 39 caddy unit tests PASS.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PASS on all 4 commits (INV-203-01).

## Task Commits

1. **Task 1: Inventory imports** — no commit (read-only verification; confirmed zero Phase 202 surface depends on doomed code; only false-positive hit was a comment in `AgentEditForm.tsx`).
2. **Task 2: Delete chat surface files** — `1edbe9fe` (refactor) — 39 files deleted, 5,473 lines removed; tsconfig stale path aliases dropped.
3. **Task 3: Rewrite app/page.tsx as stub redirect** — `265d49d0` (refactor) — page redirects to /agents; layout metadata title updated.
4. **Task 4: Remove @assistant-ui/* deps + reinstall** — `afc12ad0` (chore) — package.json + pnpm-lock.yaml.
5. **Task 5 / Deviation Rule 2: Split Caddy /liv-ai-app routing** — `8940cbed` (fix) — caddy.ts + 3 bootstrap shell scripts + caddy.test.ts (39 tests PASS).
6. **Task 6: Build PASS + final commit** — folded into the metadata commit below.

**Plan metadata commit:** appended after this SUMMARY write.

## Files Created/Modified

See the `key-files` frontmatter block above for the full list. Summary:

- **Modified:** 10 files (package.json, lockfile, tsconfig.json, layout.tsx, page.tsx, caddy.ts, caddy.test.ts, 3 install shell scripts)
- **Deleted:** 39 files (entire chat surface — assistant-ui, tool-ui, liv-ai, openui subtrees + top-level component shims)
- **Created:** 0

## Decisions Made

1. **page.tsx as redirect, not deletion.** PLAN Task 3 offered (a) delete entirely vs (b) stub redirect. Chose (b) so dev port-direct (`localhost:3010/`) lands on `/agents` rather than a 404. Single-line `redirect('/agents')`.
2. **Caddy handle_path over rewrite.** Used Caddy's built-in `handle_path` (which strips the matched prefix automatically) for the openclawos sub-route instead of a manual `uri strip_prefix` directive. Simpler, fewer moving parts, idiomatic.
3. **Conservative dep purge scope.** PLAN Task 4 spec explicitly lists `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown`, `assistant-stream`, `@ai-sdk/openai`, `@ai-sdk/anthropic`. Of those only the three `@assistant-ui/*` were present; also removed `ai` (zero imports remained after Task 2). Did NOT remove now-orphaned `leaflet`, `react-leaflet`, `recharts`, `remark-gfm`, `@types/leaflet` — these were tool-ui chart/map/markdown deps but were not on the PLAN's explicit purge list. Deferred to a future cleanup pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Split Caddy `/liv-ai-app` routing**

- **Found during:** Pre-Task 2 discovery / objective re-read.
- **Issue:** The PLAN frontmatter `files_modified` list did not include any Caddy file, but the existing `LIV_AI_APP_HANDLE` in `livos/packages/livinityd/source/modules/domain/caddy.ts` routes the ENTIRE `/liv-ai-app/*` prefix to the openclaw gateway on `:18789`. After this plan, the Phase 202 dashboard (which INV-203-09 mandates be preserved) lives at `/liv-ai-app/agents` and `/liv-ai-app/settings` on the Next.js subapp (`:3010`). Without a routing split, those routes would all 404 through the openclaw gateway in production. The PLAN's done criterion "Phase 202 routes /agents, /agents/[id], /agents/new, /settings still build + render" would PASS for the build but FAIL for actual end-to-end reachability.
- **Fix:** Split `LIV_AI_APP_HANDLE` into two handles. The openclaw sub-prefix `/liv-ai-app/openclawos[/*]` uses Caddy's `handle_path` directive (auto-strips the prefix) → `:18789`. The catch-all `/liv-ai-app /liv-ai-app/*` uses the named matcher `@livaiSubapp` → `:3010`. Patched the three install-time bootstrap heredocs (`scripts/install/deploy-livinityd.sh` — tunnel/local-lan/cloud branches; `scripts/install/mode-cloud.sh` — HTTPS + :80 fallback; `scripts/install/mode-tunnel.sh`) so first-boot Caddyfiles also reflect the split. Updated `caddy.test.ts`: 5 Phase 203-05 assertions migrated to the new matcher shape + 3 new Phase 203-09 split tests added (handle_path routes to :18789 + strips prefix; @livaiSubapp routes to :3010; multi-user subdomain carries both).
- **Files modified:** `livos/packages/livinityd/source/modules/domain/caddy.ts`, `livos/packages/livinityd/source/modules/domain/caddy.test.ts`, `scripts/install/deploy-livinityd.sh`, `scripts/install/mode-cloud.sh`, `scripts/install/mode-tunnel.sh`.
- **Verification:** `npx vitest run source/modules/domain/caddy.test.ts` → 39/39 PASS. Next.js subapp build still PASS with the expected 5 routes.
- **Committed in:** `8940cbed`.

---

**Total deviations:** 1 auto-fixed (1 missing-critical routing)
**Impact on plan:** Necessary for the plan's own "must_haves.truths" item "Phase 202 routes /agents, /agents/[id], /agents/new, /settings still build + render" to actually be reachable in production. No scope creep — minimal surgical patches to keep INV-203-09 (Phase 202 surfaces preserved) intact.

## Issues Encountered

- The PLAN's Task 5 done criterion expects an `app/agents/[id]/page.tsx` file. Initial PowerShell file-listing (`Get-ChildItem -Path 'app\agents'`) appeared to miss the `[id]` directory because square brackets in the path needed quoting; resolved by switching to a `bash ls` cross-check, which confirmed the file exists and the Next.js build correctly emits `ƒ /agents/[id]` as a dynamic route.

## User Setup Required

None — no external service configuration required. The new Caddy split takes effect on the next `caddy reload` (handled automatically by `domain.activate` flow) or on next install-time bootstrap.

## Next Phase Readiness

**Ready for Plan 203-10 (claw-client ApprovalCard wiring):**

- Subapp side of the assistant-ui purge is COMPLETE. The ApprovalCard UI that previously rendered inline in the assistant-ui thread is GONE; Plan 203-10 is responsible for surfacing the approval gate inside the openclaw claw-client.
- Caddy routing already routes `/liv-ai-app/openclawos[/*]` to the gateway with prefix stripped — Plan 203-10 only needs to ensure the gateway's in-process router serves the claw-client at `/` (after strip). Currently the gateway is documented to mount at `/plugins/openclawos` per `claw-plugin/src/index.ts ROUTE_PREFIX`; Plan 203-10 needs to either change ROUTE_PREFIX or add a `/` → `/plugins/openclawos` rewrite inside the gateway.

**Handoff notes (HANDOFF: ApprovalCard migration):**

- Pre-203-09 ApprovalCard lived at `livos/packages/liv-ai-app/src/lib/tool-ui/approval-card.tsx` (now deleted). It was rendered inline as part of the assistant-ui ToolRenderers map.
- The contract was: when the agent emitted a tool call requiring approval, the renderer rendered the card; user clicked approve/reject; the result flowed back via `useApproveMutation` (also deleted, lived at `src/lib/liv-ai/use-approve-mutation.ts`).
- Plan 203-10 will rebuild this inside the claw-client at `livos/packages/liv-claw-os/packages/claw-client/src/` using whatever generative-UI primitives the claw-client already exposes. The HITL approval backend (livinityd tRPC `agents.respondToApproval` mutation, per Phase 198 → still present after Phase 203-08 since chat-route moved to agent-runtime/) is unchanged — only the UI rendering surface migrated.

**Wave 3 of 4 status:** Plans 203-08 (backend Mastra purge) and 203-09 (frontend assistant-ui purge) both closed. Wave 4 begins with Plan 203-10.

## Self-Check: PASSED

Files verified:
- FOUND: `livos/packages/liv-ai-app/app/page.tsx` (redirect stub)
- FOUND: `livos/packages/liv-ai-app/app/layout.tsx`
- FOUND: `livos/packages/liv-ai-app/package.json` (no @assistant-ui/*)
- FOUND: `livos/packages/liv-ai-app/tsconfig.json` (no stale aliases)
- FOUND: `livos/packages/livinityd/source/modules/domain/caddy.ts` (split LIV_AI_APP_HANDLE)
- FOUND: `livos/packages/livinityd/source/modules/domain/caddy.test.ts` (39 tests PASS)
- MISSING (as intended): `livos/packages/liv-ai-app/app/assistant.tsx`
- MISSING (as intended): `livos/packages/liv-ai-app/components/assistant-ui/`
- MISSING (as intended): `livos/packages/liv-ai-app/src/lib/{tool-ui,liv-ai,openui}/`

Commits verified:
- FOUND: `1edbe9fe` refactor(203-09): delete chat surface files
- FOUND: `265d49d0` refactor(203-09): rewrite app/page.tsx as redirect
- FOUND: `afc12ad0` chore(203-09): remove @assistant-ui/* + ai deps
- FOUND: `8940cbed` fix(203-09): split Caddy /liv-ai-app routing

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:
- FOUND in `git rev-list HEAD`
- Pre-commit hook PASSED on all 4 commits

---
*Phase: 203-liv-ai-openclaw-os*
*Completed: 2026-05-23*
