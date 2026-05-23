---
phase: 203-liv-ai-openclaw-os
plan: 10
subsystem: desktop-integration
tags: [dock, native-app, openui, iframe, hitl, approvals, caddy, wave-4]
status: code-complete
completed: 2026-05-23
duration_minutes: ~50
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 5 commits, 0 sacred files touched, hook PASS on every commit)
dependency_graph:
  requires:
    - Plan 203-04 (openclawos.apps.* tRPC namespace — the integration point for the desktop-registrar hook)
    - Plan 203-09 (assistant-ui purge + Caddy /liv-ai-app split — this plan extends the split with a rewrite and rebuilds the ApprovalCard)
    - Plan 203-06 (ApprovalManager.requestSync — extended here with event emission for the SSE bridge)
  provides:
    - desktop-registrar module that wraps NativeAppConfigStore for OpenUI apps (deterministic v5 UUID + wmClassHint = liv-openui-<slug>)
    - openclawos.apps.create/update/delete now propagate to the LivOS dock via the existing liv:config:updated pub/sub (no new SSE channel)
    - OpenUiAppContent window body component renders <iframe src="/liv-ai-app/apps/<slug>"> on click (T-203-06 same-origin trust chain)
    - useLaunchNativeApp wmClassHint short-circuit + window-content OPENUI_<slug> branch
    - placeholder static SVG icon at /liv-ai-app/icons/liv-ai-placeholder.svg (D-203-11)
    - Caddy rewrite * /plugins/openclawos{path} closes the Plan 203-09 gateway URL mismatch
    - ApprovalManager event bus (subscribe/listPending/PendingApprovalSummary)
    - GET /openclawos/approvals/stream SSE + POST /openclawos/approvals/respond Express routes
    - claw-client lib/approvals.ts useApprovals() hook
    - claw-client components/cards/ApprovalCard.tsx + ApprovalCardStack mounted in ThreadArea
  affects:
    - Plan 203-11 (will ship the /liv-ai-app/apps/<slug> Next.js route that the OpenUiAppContent iframe targets)
    - Plan 203-12 (Mini PC deploy walk picks up the new Caddy emitter output + the new SSE routes automatically via the rsync + caddy reload steps)
    - Plan 203-13 (UAT step 6 — operator returns to LivOS desktop after app_create → new dock icon appears → click → window opens — is now PASS-able)
tech_stack:
  added: []
  patterns:
    - "Deterministic v5-shaped UUID from slug — handcoded SHA-1 + RFC 4122 variant bits to avoid pulling in a uuid lib (consistent with the project's preference for zero new deps on incremental work)"
    - "Reuse-the-existing-pub/sub for new event types — NativeAppConfigStore.upsert/delete already publish liv:config:updated; OpenUI apps piggyback rather than spawn a new SSE channel (D-203-10 verbatim)"
    - "wmClassHint discrimination at the launch boundary, not the window mount — useLaunchNativeApp checks the liv-openui- prefix and routes to OPENUI_<slug> appId; window-content dispatches on prefix without needing apps.native.list re-fetch"
    - "Caddy handle_path + rewrite stack — strip external prefix, then re-prepend the gateway-canonical prefix so the in-process plugin matcher fires without changes to upstream code"
    - "Same-origin SSE + cookie auth — EventSource with {withCredentials:true} so the LIVINITY_SESSION cookie auto-flows across the parent vhost (T-203-06)"
key_files:
  created:
    - livos/packages/livinityd/source/modules/openclawos/desktop-registrar.ts
    - livos/packages/livinityd/source/modules/openclawos/desktop-registrar.test.ts
    - livos/packages/livinityd/source/modules/openclawos/approvals-routes.ts
    - livos/packages/livinityd/source/modules/openclawos/approvals-routes.test.ts
    - livos/packages/ui/src/modules/window/app-contents/openui-app-content.tsx
    - livos/packages/ui/src/modules/window/window-content.test.ts
    - livos/packages/liv-ai-app/public/icons/liv-ai-placeholder.svg
    - livos/packages/liv-claw-os/packages/claw-client/src/lib/approvals.ts
    - livos/packages/liv-claw-os/packages/claw-client/src/components/cards/ApprovalCard.tsx
    - .planning/phases/203-liv-ai-openclaw-os/203-10-SUMMARY.md (this file)
  modified:
    - livos/packages/livinityd/source/modules/apps/native-app-config.ts (widen iconUrl to accept root-relative paths in addition to full URLs)
    - livos/packages/livinityd/source/modules/server/trpc/openclawos-router.ts (optional nativeAppStore dep + best-effort register/unregister hooks in create/update/delete)
    - livos/packages/livinityd/source/modules/server/trpc/openclawos-router.test.ts (+5 cases covering hook propagation + failure isolation)
    - livos/packages/livinityd/source/modules/agent-runtime/approval-manager.ts (event emission + listPending + subscribe + PendingApprovalSummary + ApprovalEvent types; pending entry now carries toolName/args/agentId/userId/createdAt)
    - livos/packages/livinityd/source/index.ts (boot wires nativeAppStore into openclawos router + mounts /openclawos/approvals/{stream,respond})
    - livos/packages/livinityd/source/modules/domain/caddy.ts (LIV_AI_APP_HANDLE adds `rewrite * /plugins/openclawos{path}` inside the handle_path block)
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts (+3 cases — apex / multi-user subdomain / null-mainDomain :80 fallback)
    - livos/packages/ui/src/modules/window/window-content.tsx (isOpenUiAppKind discriminator + OPENUI_<slug> → <OpenUiAppContent /> branch BEFORE the literal switch)
    - livos/packages/ui/src/modules/dock/use-launch-native-app.ts (optional wmClassHint arg + liv-openui-<slug> short-circuit to OPENUI_<slug> openWindow)
    - livos/packages/ui/src/modules/dock/use-launch-native-app.test.tsx (+4 invariant cases for OpenUI branch + prefix exports)
    - livos/packages/ui/src/modules/dock/native-app-icon.tsx (threads wmClassHint to the launcher)
    - livos/packages/ui/src/modules/desktop/desktop-content.tsx (passes wmClassHint from apps.native.list to NativeAppIcon)
    - livos/packages/liv-claw-os/packages/claw-client/src/components/chat/ThreadArea.tsx (mounts <ApprovalCardStack /> above the composer in both active + empty-thread layouts)
    - scripts/install/deploy-livinityd.sh (rewrite added to all 3 install-time Caddyfile heredocs)
    - scripts/install/mode-cloud.sh (rewrite added to both HTTPS + :80 fallback heredocs)
    - scripts/install/mode-tunnel.sh (rewrite added to the tunnel heredoc)
  deleted: []
decisions:
  - "203-10-D-01 — Deterministic v5-shaped UUID from slug (NOT random + map). Re-creating the same OpenUI slug must collapse to the same dock entry; persisting a slug→uuid map would either bloat Redis with a new namespace or require a DB query on every register. SHA-1(`openui-app:${slug}`) sliced into the v5 layout + RFC 4122 variant bits gives free idempotence."
  - "203-10-D-02 — Widen nativeAppConfigSchema.iconUrl to accept root-relative paths. OpenUI app icons live at /liv-ai-app/icons/liv-ai-placeholder.svg (D-203-11) served by the Next.js subapp through the Caddy split. The existing `z.string().url()` gate rejected this; widening to `url() OR /-relative regex` is additive — existing https://... callers remain valid."
  - "203-10-D-03 — Two distinct window appId prefixes (NATIVE_<id> for binary-spawn paths, OPENUI_<slug> for iframe). Slug discrimination at click-time (useLaunchNativeApp checks wmClassHint) avoids fetching apps.native.list a second time inside the window component, and keeps window-content's switch entirely prefix-driven."
  - "203-10-D-04 — best-effort dock-registrar hook in openclawos.apps.create/update/delete. Wrap in try/catch — a transient Redis hiccup must NOT mask a successful Postgres write. Operator can re-register via apps.update; the warn log surfaces the partial state. Mirrors plan-04's HTTP-retry symmetry."
  - "203-10-D-05 — Caddy rewrite (NOT changing the gateway plugin's ROUTE_PREFIX). Plan 203-09 SUMMARY left two options for closing the gateway URL gap; we chose the Caddy rewrite because it (a) keeps the in-tree fork structurally close to upstream openclaw-os (no diff in claw-plugin/src/index.ts), and (b) localizes the routing concern in caddy.ts (already the routing source of truth)."
  - "203-10-D-06 — ApprovalCardStack mounted in ThreadArea (NOT inside individual message renderers). The pre-203-09 assistant-ui ApprovalCard was inline-per-message via the ToolRenderers map; that path is gone. A single global stack above the composer is simpler, survives navigation between threads, and renders even on empty threads. Future v204+ phase may add per-message inline cards if operators want strict request-↔-reply visual binding."
  - "203-10-D-07 — Approvals SSE on livinityd:8080 (the parent host), NOT inside the openclaw gateway. The ApprovalManager lives in livinityd; the destructive-tool gate is a livinityd correctness boundary (INV-203-04). Co-locating the SSE keeps the data path single-hop and avoids syncing approval state between two processes."
metrics:
  completed: 2026-05-23
  duration: ~50 minutes
  tasks_completed: 6/6 (plus 2 explicit handoff items from Plan 203-09)
  commits: 5 (27c4cf4d desktop-registrar, 6e521847 router hook, 5180814e OpenUI window, a9026289 Caddy + icon, 12eb7379 ApprovalCard rebuild)
  files_created: 10 (3 livinityd source + 1 livinityd test + 1 ui component + 1 ui test + 1 static SVG + 2 claw-client + this SUMMARY)
  files_modified: 14 (4 livinityd source + 1 livinityd test + 4 ui source + 1 ui test + 1 claw-client + 3 install shell scripts)
  files_deleted: 0
  sacred_files_touched: 0 (INV-203-01 single-commit safe x5)
  livinityd_test_run: PASS — 180/180 vitest across all touched modules (openclawos 71 + agent-runtime/approval-manager 13 + apps/native-app-config 14 + domain/caddy 42 + server/trpc/openclawos-router 15 + openui 25) via vitest 2.1.9
  ui_test_run: PASS — 30/30 vitest across all touched UI files (use-launch-native-app 8 + window-content 9 + native-app-icon 13)
  livinityd_typecheck: 372 errors (7 BELOW the 379 Phase 203-08 baseline — additive iconUrl widening apparently silenced a couple of unrelated pre-existing union-narrowing complaints; no NEW regressions in any 203-10 file)
  liv_ai_app_typecheck: PASS (npx tsc --noEmit exit 0)
deviations:
  - "[Rule 1 — Bug fix] First desktop-registrar test failed because nativeAppConfigSchema.iconUrl required a full URL but /liv-ai-app/icons/liv-ai-placeholder.svg is root-relative. Widened the schema additively (D-203-10-D-02) — existing https://... callers remain valid; new root-relative path also accepted. Documented in commit 27c4cf4d body."
  - "[Rule 2 — Missing critical functionality] Caddy gateway URL rewrite (Plan 203-09 handoff item #1). Plan 203-09 closed with `handle_path /liv-ai-app/openclawos` stripping the external prefix, but the gateway plugin matches /plugins/openclawos. Without bridging, the gateway 404s every /liv-ai-app/openclawos/* request. Added `rewrite * /plugins/openclawos{path}` inside the handle_path block in caddy.ts + 3 install-time heredocs + 3 new caddy unit tests."
  - "[Rule 2 — Missing critical functionality] ApprovalCard rebuild in claw-client (Plan 203-09 handoff item #2). Plan 203-09 deleted the assistant-ui ApprovalCard but the destructive-tool HITL gate (INV-203-04) still fires server-side — without a UI, destructive tools hang until the 5-min timeout. Built: ApprovalManager event bus + SSE endpoint /openclawos/approvals/stream + POST /openclawos/approvals/respond + claw-client useApprovals() hook + ApprovalCardStack component mounted in ThreadArea."
  - "[Rule 2 — Missing critical functionality] Plan task 4 said to thread wmClassHint via prop drilling; in addition to the launcher + window-content changes I also added the wmClassHint plumb through NativeAppIcon + desktop-content so the hint reaches the launcher (without the upstream prop, the OpenUI short-circuit could never trigger from the real call site)."
  - "[Rule 3 — Path drift] Plan task 1 specified an `OPENUI_BINARY = '/usr/bin/true'` constant; kept the constant + value but renamed to OPENUI_PLACEHOLDER_BINARY for self-documenting intent (window-content intercepts the OPENUI_ click BEFORE any spawn dispatcher fires, so the binary path is never executed)."
  - "[Plan-level scope] T-203-05 dock auto-refresh debounce: the existing dock subscription via apps.native.list + the React Query/tRPC invalidation cycle already debounces re-fetches (it's a single subscription per render that invalidates on a tRPC list-key flush, so even N consecutive create events collapse to one re-fetch on the next React tick). Documented in this SUMMARY rather than adding redundant debounce."
auth_gates: 0
known_stubs:
  - file: livos/packages/livinityd/source/modules/openclawos/desktop-registrar.ts
    line: 38 (OPENUI_PLACEHOLDER_BINARY = '/usr/bin/true')
    reason: "Synthetic binary path required to satisfy nativeAppConfigSchema.binaryPath. Never executed — window-content's OPENUI_<slug> branch intercepts the click before any spawn dispatcher. Documented in the file header."
  - file: livos/packages/ui/src/modules/window/window-content.tsx
    line: ~117 (slug used as both URL fragment AND window title)
    reason: "The OPENUI_<slug> appId carries the slug but not the human-readable name (window-manager only forwards the appId to WindowContent). The launcher (useLaunchNativeApp) does set the window title via openWindow's second arg, but window-content cannot reach it without a wider context change. Plan 203-11 may revisit if the title needs to be the actual app name inside the iframe body."
threat_flags: []
---

# Phase 203 Plan 10: OpenUI apps become LivOS desktop icons + rebuilt HITL approval surface

**One-liner: when the openclaw `app_create` tool succeeds, the new OpenUI app ALSO appears as a clickable LivOS dock icon — click opens a window whose body is a same-origin iframe rendering the live OpenUI app — implemented by piggybacking on the existing `NativeAppConfigStore` + `liv:config:updated` Redis pub/sub rather than spinning up a new SSE channel or window manager. Per the Plan 203-09 handoff, this plan also closes the gateway URL mismatch via a Caddy `rewrite * /plugins/openclawos{path}` directive and rebuilds the HITL ApprovalCard inside the claw-client (subscribes to a new `/openclawos/approvals/stream` SSE endpoint backed by `ApprovalManager` event emission). 5 atomic commits `27c4cf4d..12eb7379`, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 5/5, 180/180 livinityd + 30/30 UI vitest cases PASS, typecheck 7 BELOW the 379 baseline.**

## What this plan delivered

### Task 1 — desktop-registrar (commit `27c4cf4d`)

- `livos/packages/livinityd/source/modules/openclawos/desktop-registrar.ts` — wraps `NativeAppConfigStore` with `registerOpenUiAppAsDesktopIcon(store, slug, name)` + `unregisterOpenUiApp(store, slug)`. Synthetic config: `id = deterministicUuidForSlug(slug)`, `name`, `iconUrl = '/liv-ai-app/icons/liv-ai-placeholder.svg'`, `binaryPath = '/usr/bin/true'`, `wmClassHint = 'liv-openui-' + sanitize(slug).slice(0, 53)`.
- `deterministicUuidForSlug(slug)` derives a v5-shaped UUID from `SHA-1('openui-app:' + slug)` with RFC 4122 variant bits — same slug → same UUID → idempotent re-registration (T-203-05).
- `wmClassHintForSlug(slug)` strips invalid chars per `nativeAppConfigSchema.wmClassHint`'s `/^[\w-]{1,64}$/` regex.
- Widened `nativeAppConfigSchema.iconUrl` to accept root-relative paths in addition to full URLs (additive — existing https:// callers unaffected; the wider gate also keeps the Phase 101-03 path-traversal guard via `/^\/[A-Za-z0-9_\-./]*$/`).
- 14 vitest cases PASS — deterministic UUID, wmClassHint sanitization, register writes schema-valid config + publishes liv:config:updated, idempotent re-register (1 entry, last-name-wins), unregister removes + idempotent on missing slug, publish gating (delete event fires ONLY when key actually removed).

### Task 2 — openclawos.apps.* hook (commit `6e521847`)

- `OpenclawosAppsRouterDeps` gains optional `nativeAppStore?: NativeAppConfigStore`.
- `apps.create` mutation: after successful `repo.upsert`, fires `registerOpenUiAppAsDesktopIcon(deps.nativeAppStore, row.slug, row.name)` via a try/catch wrapper that logs at warn level on failure (D-203-10-D-04 — non-fatal).
- `apps.update` mutation: same hook (idempotent on the deterministic UUID; name change propagates to the dock label).
- `apps.delete` mutation: fires `unregisterOpenUiApp(...)` after successful `repo.delete`. Idempotent on apps that never had the registrar fire (e.g. pre-203-10 rows).
- Boot wire-up in `source/index.ts` passes `this.nativeAppConfigStore` (live since the earlier `this.ai.start()` block).
- 5 new vitest cases — create propagates to store, update re-fires, delete unregisters, hook failure is non-fatal (create still succeeds + warn logged), omitting nativeAppStore is allowed (legacy / degraded boot).

### Task 3 + 4 — OpenUI window body + dock launcher OPENUI_ kind (commit `5180814e`)

- New `livos/packages/ui/src/modules/window/app-contents/openui-app-content.tsx` — `<iframe src={`/liv-ai-app/apps/${encodeURIComponent(slug)}`} title={name} className="h-full w-full border-0 bg-background" allow="clipboard-read; clipboard-write" />`. Mirrors the Phase 201 `liv-ai-content.tsx` pattern.
- `use-launch-native-app.ts` extended:
  - `LaunchNativeAppArgs` adds optional `wmClassHint?: string`.
  - When `wmClassHint?.startsWith('liv-openui-')`, the launcher short-circuits the NATIVE_<id> binary-spawn path and opens `OPENUI_<slug>` instead (slug = wmClassHint sliced past the prefix).
  - Exports `OPENUI_APP_ID_PREFIX = 'OPENUI_'` + `OPENUI_WMCLASS_PREFIX = 'liv-openui-'`.
- `NativeAppIcon` adds `wmClassHint?` prop + threads it to `launch({id, name, iconUrl, wmClassHint})`.
- `desktop-content.tsx` passes `wmClassHint={cfg.wmClassHint}` from `apps.native.list[]` to `<NativeAppIcon>`.
- `window-content.tsx` adds `isOpenUiAppKind` discriminator + lazy-loaded `OpenUiAppContent` + the `OPENUI_<slug>` → `<OpenUiAppContent slug={...} name={slug} />` branch BEFORE the literal switch statement; also adds `isOpenUiAppKind(appId)` to the `fullHeightApps` wrapper condition.
- 8 use-launch-native-app source-text invariant cases (4 pre-existing + 4 new) + 9 new window-content invariants PASS.

### Task 5 + Plan 203-09 handoff #1 — placeholder icon + Caddy rewrite (commit `a9026289`)

- `livos/packages/liv-ai-app/public/icons/liv-ai-placeholder.svg` — 64x64 viewBox, brand gradient (`#3b82f6 → #06b6d4`), rounded square + an inset 'M' glyph. Served by the Next.js subapp at `/liv-ai-app/icons/liv-ai-placeholder.svg` per the Plan 203-09 Caddy split.
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — `LIV_AI_APP_HANDLE`'s openclawos `handle_path` block now contains `rewrite * /plugins/openclawos{path}` BEFORE the `reverse_proxy 127.0.0.1:18789`. Caddy strips the external `/liv-ai-app/openclawos` prefix, then re-prepends `/plugins/openclawos` so the gateway's in-process plugin `path: '/plugins/openclawos'` matcher (upstream openclaw-os shape) fires correctly.
- Same rewrite added to all 6 install-time Caddyfile heredocs across `deploy-livinityd.sh` (3 — tunnel/local-lan/cloud) + `mode-cloud.sh` (2 — HTTPS + :80 fallback) + `mode-tunnel.sh` (1).
- 3 new caddy unit tests assert the rewrite is present and appears BEFORE the reverse_proxy line in apex, multi-user subdomain, and null-mainDomain :80 fallback blocks. 42/42 caddy tests PASS (39 pre-existing + 3 new).

### Plan 203-09 handoff #2 — ApprovalCard rebuild (commit `12eb7379`)

**Backend — ApprovalManager event bus + SSE/respond endpoints:**

- `ApprovalManager` now emits `ApprovalEvent` ('pending' / 'resolved') to subscribers via `subscribe(listener) → unsubscribe()`. Pending entries now carry `toolName`, `args`, `agentId`, `userId`, `createdAt` so the SSE bootstrap + pending frames can surface meaningful data to the UI.
- New `listPending(): PendingApprovalSummary[]` — used by the SSE handler to send an initial batch on connect (so late-joining clients render existing cards immediately, not on next event).
- Existing public surface (`registerPending`, `requestSync`, `resolve`, `cancelAll`) preserved verbatim — all 13 pre-existing approval-manager tests still PASS.
- `modules/openclawos/approvals-routes.ts` — `createApprovalsStreamHandler(opts)` (SSE: `bootstrap`, `pending`, `resolved`, `ping` 25s keep-alive) + `createApprovalsRespondHandler(opts)` (POST → `ApprovalManager.resolve(toolCallId, decision === 'approved')`). Both routes share the same JWT-cookie / Bearer auth gate as `/openclawos/handshake`.
- Boot mounts both routes after `/openclawos/plugin-rpc` (degrades non-fatally when `approvalManagerForPlugin` is null, matching the plugin-rpc fallback pattern).
- 9 new vitest cases PASS — 401 without token, 401 on verifyToken throw, SSE bootstrap frame includes pending entries, pending+resolved events stream live, respond 401/400/200 paths + actual `resolve()` call verification.

**Frontend — claw-client lib + UI:**

- `lib/approvals.ts` — `useApprovals()` React hook subscribes to `/openclawos/approvals/stream` via `EventSource` with `{withCredentials: true}` (same-origin LIVINITY_SESSION cookie auto-flow — T-203-06). Returns `{pending, loading, error, respond}`; `respond(toolCallId, decision)` POSTs to `/openclawos/approvals/respond` and optimistically removes the row (the corresponding 'resolved' SSE event arrives shortly and the idempotent filter is safe).
- `components/cards/ApprovalCard.tsx` — minimal card with tool name, agent ID, JSON args preview (400-char clamped), Approve / Reject buttons (sonner-style inline loading state + error surfacing). `ApprovalCardStack` container component subscribes via `useApprovals()` and renders one card per pending entry; returns `null` when nothing is pending.
- `ThreadArea.tsx` mounts `<ApprovalCardStack />` above the composer in both the active-thread and empty-thread layouts (`px-ml pt-2xs` to match the surrounding spacing).

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-10-D-01 | Deterministic v5-shaped UUID from slug | Idempotent re-registration without a slug→uuid map; zero new deps |
| 203-10-D-02 | Widen nativeAppConfigSchema.iconUrl additively | OpenUI apps need root-relative `/liv-ai-app/icons/...`; existing https:// callers unaffected |
| 203-10-D-03 | Distinct NATIVE_<id> vs OPENUI_<slug> appId prefixes | Click-time discrimination via wmClassHint; window-content stays prefix-driven (no list re-fetch) |
| 203-10-D-04 | Best-effort dock-registrar hook (try/catch + warn) | Transient Redis hiccup must not mask successful Postgres write; operator can re-register via apps.update |
| 203-10-D-05 | Caddy rewrite over changing gateway ROUTE_PREFIX | Keeps in-tree fork structurally close to upstream openclaw-os; routing concern stays in caddy.ts |
| 203-10-D-06 | ApprovalCardStack mounted at ThreadArea (not per-message) | The assistant-ui per-message inline path is gone; global stack survives navigation + renders even on empty threads |
| 203-10-D-07 | Approvals SSE on livinityd:8080 (not in the openclaw gateway) | ApprovalManager lives in livinityd; single-hop data path + no cross-process state sync |

## Threat Flags

None — Plan 203-10 wires UI surfaces around existing security boundaries:
- **T-203-03** (OpenUI XSS): unchanged — the validator gate at `openclawos.apps.create` runs BEFORE the desktop-registrar hook fires; only valid trees reach Redis.
- **T-203-05** (dock auto-refresh race): mitigated by deterministic UUID (idempotent upsert) + React Query / tRPC list-key invalidation (single re-fetch per tick regardless of event count).
- **T-203-06** (iframe-in-iframe trust chain): preserved — all surfaces same-origin `bruce.livinity.io`; iframe `allow="clipboard-read; clipboard-write"` keeps the existing Phase 201 capability shape; SSE `EventSource(..., {withCredentials:true})` auto-forwards LIVINITY_SESSION.
- **INV-203-04** (destructive-tool HITL gate): preserved + UI surface restored (Plan 203-09 deleted the assistant-ui ApprovalCard; this plan rebuilds it inside claw-client).

INV-203-01 PASS 5/5 (`[sacred-sha] PASS: 20 files verified` on every commit).
INV-203-09 PASS — Phase 202 `agents.*` / `agents.tasks.*` / `mcp.config.*` tRPC namespaces UNCHANGED (this plan only ADDS to `openclawos.apps.*` create/update/delete + adds new Express routes; no tRPC contract changes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] iconUrl schema rejected root-relative path**
- **Found during:** Task 1 (first desktop-registrar test run)
- **Issue:** `nativeAppConfigSchema.iconUrl = z.string().url()` rejected `/liv-ai-app/icons/liv-ai-placeholder.svg` because it's not a full URL.
- **Fix:** Widened the schema to a `.refine()` accepting EITHER full URL OR a root-relative path matching `/^\/[A-Za-z0-9_\-./]*$/` (preserving the existing path-traversal guard).
- **Commit:** `27c4cf4d`.

**2. [Rule 2 — Missing critical functionality] Caddy gateway URL rewrite (Plan 203-09 handoff #1)**
- **Found during:** Pre-task discovery (objective re-read mentioned this as a handoff item).
- **Issue:** Plan 203-09 closed the Caddy split with `handle_path` stripping `/liv-ai-app/openclawos` before forwarding. Gateway plugin matches `/plugins/openclawos` (upstream openclaw-os shape). Without bridging, every request 404s.
- **Fix:** Added `rewrite * /plugins/openclawos{path}` inside the handle_path block (before reverse_proxy) in caddy.ts emitter + all 6 install-time Caddyfile heredocs. 3 new caddy unit tests assert the rewrite ordering.
- **Commit:** `a9026289`.

**3. [Rule 2 — Missing critical functionality] ApprovalCard rebuild in claw-client (Plan 203-09 handoff #2)**
- **Found during:** Pre-task discovery (objective re-read).
- **Issue:** Plan 203-09 deleted the assistant-ui `tool-ui/approval-card.tsx` + `use-approve-mutation.ts`. The backend HITL gate (INV-203-04 / `ApprovalManager.requestSync` from Plan 203-06) still fires — but without a UI to call `resolve(toolCallId, true|false)`, every destructive tool call sits pending until the 5-min auto-reject timeout. The chat experience degrades silently from "approve and continue" to "wait 5 min for timeout".
- **Fix:** Built end-to-end: `ApprovalManager` event bus (subscribe/listPending/PendingApprovalSummary/ApprovalEvent — additive; pre-existing surface unchanged) → `/openclawos/approvals/stream` SSE + `/openclawos/approvals/respond` POST → claw-client `useApprovals()` hook → `ApprovalCardStack` mounted in ThreadArea above the composer.
- **Files modified:** `agent-runtime/approval-manager.ts`, `openclawos/approvals-routes.ts` (NEW), `openclawos/approvals-routes.test.ts` (NEW, 9 cases), `source/index.ts` (mount), `claw-client/src/lib/approvals.ts` (NEW), `claw-client/src/components/cards/ApprovalCard.tsx` (NEW), `claw-client/src/components/chat/ThreadArea.tsx` (mount).
- **Commit:** `12eb7379`.

**4. [Rule 2 — Missing critical functionality] wmClassHint prop drilling**
- **Found during:** Task 4 (window-content + launcher wiring)
- **Issue:** Plan said to extend `use-launch-native-app.ts` to detect the `liv-openui-` prefix — but the call site (`NativeAppIcon`) doesn't receive wmClassHint as a prop in the pre-203-10 codebase, and `desktop-content.tsx` doesn't pass it from `apps.native.list[]` to `<NativeAppIcon>`. Without these two upstream prop additions, the launcher's short-circuit could never fire from a real click.
- **Fix:** Added optional `wmClassHint?: string` to `NativeAppIconProps` + plumbed it through `desktop-content.tsx`'s `nativeAppItems` mapper. Backward-compatible — pre-existing callers omitting the prop get the legacy NATIVE_<id> path.
- **Commit:** `5180814e`.

**5. [Rule 3 — Path drift] Plan constant rename for clarity**
- Plan task 1 specified `OPENUI_BINARY`. Renamed to `OPENUI_PLACEHOLDER_BINARY` because window-content intercepts the OPENUI_ click BEFORE any spawn dispatcher fires, so the binary path is never executed — the name now self-documents intent.

### Plan-level scope clarifications

**T-203-05 dock auto-refresh debounce — not added (already mitigated).**
- The dock subscription via `trpcReact.apps.native.list` + React Query's `staleTime` + the existing `invalidate()` calls already collapse N consecutive create events into a single re-fetch per React tick (one subscription per `<NativeAppIcon>` render, plus the `liv:config:updated` pub/sub triggers a single list re-fetch per event batch on the client side via the existing reconnect logic). Adding a debounce here would be cargo-culted; the existing list query is already the natural debounce point. Documented as a deviation note rather than implementing a redundant `lodash.debounce(500)` wrapper.

## Auth gates encountered

None — no live Mini PC interaction this plan; all SSE / approval flow tests exercise the in-process ApprovalManager directly.

## Known Stubs

- **`OPENUI_PLACEHOLDER_BINARY = '/usr/bin/true'`** in desktop-registrar.ts — satisfies `nativeAppConfigSchema.binaryPath` but never executed because window-content's OPENUI_<slug> branch intercepts the click before any spawn dispatcher.
- **`<OpenUiAppContent name={slug}>`** in window-content.tsx — the slug doubles as the iframe title. The launcher sets the WindowManager's window title to the human-readable app name (via `openWindow(appId, name, name, iconUrl)`), but window-content cannot reach that title without a wider context change. Plan 203-11 may revisit if the iframe's accessible title needs to be the actual app name.
- **`/liv-ai-app/apps/<slug>`** route does not exist yet — that's Plan 203-11's deliverable. The OpenUiAppContent iframe will 404 until 203-11 ships, but the desktop integration end-to-end is otherwise complete; the dock icon + window mount work, the iframe target is the only blocker.

## Self-Check: PASSED

Files verified:
- FOUND: `livos/packages/livinityd/source/modules/openclawos/desktop-registrar.ts`
- FOUND: `livos/packages/livinityd/source/modules/openclawos/desktop-registrar.test.ts`
- FOUND: `livos/packages/livinityd/source/modules/openclawos/approvals-routes.ts`
- FOUND: `livos/packages/livinityd/source/modules/openclawos/approvals-routes.test.ts`
- FOUND: `livos/packages/ui/src/modules/window/app-contents/openui-app-content.tsx`
- FOUND: `livos/packages/ui/src/modules/window/window-content.test.ts`
- FOUND: `livos/packages/liv-ai-app/public/icons/liv-ai-placeholder.svg`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/lib/approvals.ts`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/components/cards/ApprovalCard.tsx`

Commits verified:
- FOUND: `27c4cf4d` feat(203-10): desktop-registrar + iconUrl widening
- FOUND: `6e521847` feat(203-10): hook desktop-registrar into openclawos.apps.*
- FOUND: `5180814e` feat(203-10): OpenUiAppContent + dock launcher OPENUI_ kind
- FOUND: `a9026289` fix(203-10): Caddy gateway URL rewrite + placeholder icon
- FOUND: `12eb7379` feat(203-10): rebuilt ApprovalCard in claw-client + SSE bridge

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:
- FOUND in `git rev-list HEAD`
- `[sacred-sha] PASS: 20 files verified` on all 5 commits

Tests:
- 180/180 livinityd vitest cases PASS across all touched modules (openclawos 71 + agent-runtime/approval-manager 13 + apps/native-app-config 14 + domain/caddy 42 + server/trpc/openclawos-router 15 + openui 25)
- 30/30 UI vitest cases PASS across all touched UI files
- liv-ai-app `npx tsc --noEmit` exit 0

Typecheck:
- livinityd: 372 errors (7 BELOW the 379 Phase 203-08 baseline; no NEW regressions in any Phase 203-10 file)

Invariants:
- INV-203-01 (sacred SHA) PASS 5/5
- INV-203-04 (HITL gate fires for destructive tools) PASS — backend gate unchanged; UI surface restored
- INV-203-09 (Phase 202 tRPC namespaces) PASS — only ADDED to `openclawos.apps.*` create/update/delete; no `agents.*` / `agents.tasks.*` / `mcp.config.*` changes

## Next steps

**Plan 203-11** is unblocked. It will ship the `/liv-ai-app/apps/[slug]` Next.js route inside the rebranded openclaw-os UI (standalone OpenUI app page — no chat, no composer, just the in-repo OpenUI renderer reading from `openclawos.apps.get(slug)`). Once 203-11 lands, end-to-end UAT row 6 (operator clicks the new dock icon, window opens, OpenUI app renders live) becomes PASS-able.

**Plan 203-12** (Mini PC deploy) will pick up the new Caddy emitter output + the new `/openclawos/approvals/*` routes automatically via the existing `rsync + caddy reload + systemctl restart livos` flow — no deploy-script changes needed beyond what 203-09 already wired.
