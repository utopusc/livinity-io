---
phase: 203-liv-ai-openclaw-os
plan: 11
subsystem: liv-ai
tags: [route, openui-renderer, next-app-router, static-export, wave-4]
status: code-complete
completed: 2026-05-23
duration_minutes: ~14
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 2 commits, 0 sacred files touched, hook PASS on every commit)
dependency_graph:
  requires:
    - Plan 203-04 (openclawos.apps.get tRPC endpoint + 14-component whitelist validator)
    - Plan 203-09 (Caddy /liv-ai-app/openclawos split + claw-client output:'export' bundle served by the plugin)
    - Plan 203-10 (OpenUiAppContent window body that mounts <iframe src="/liv-ai-app/apps/{slug}"> in the LivOS dock)
  provides:
    - GET /apps/[slug] route in the claw-client static export bundle (served at /liv-ai-app/apps/<slug> via Caddy + plugin static-file handler)
    - fetchOpenUiApp(slug) client helper — tRPC v10/v11 batch GET against openclawos.apps.get with same-origin cookie auto-flow
    - extractSlugFromPathname(pathname) — pure function for runtime slug extraction from any of the 3 path prefixes (/, /liv-ai-app, /plugins/openclawos) the request might arrive under
    - claw-plugin static-file handler /apps/<unknown> → apps/__placeholder__.html fallback BEFORE the generic SPA index.html fallback
  affects:
    - Plan 203-12 (deploy walk picks up the rebuilt static bundle via existing rsync; no deploy-script changes needed)
    - Plan 203-13 (UAT step 6 — click dock icon → window opens → OpenUI app renders live — is now PASS-able end-to-end)
tech_stack:
  added: []
  patterns:
    - "Server-shell-with-client-body split — page.tsx exports generateStaticParams (server concern) + dynamicParams=false; the page body returns <OpenUiAppView /> which is the actual 'use client' implementation. Standard Next.js pattern for combining static generation with a fully client-rendered body."
    - "Runtime slug extraction from window.location.pathname (NOT route params) — route params resolve to the build-time __placeholder__ sentinel; the LIVE slug is decoded from the URL at runtime via a pure extractor that handles all three prefixes the request may have travelled under (direct, Caddy-rewritten, gateway-rewritten)."
    - "Plugin static-file handler fallback layering — /apps/<unknown> resolves to the prebuilt __placeholder__.html so the client component can do its runtime extract; the generic SPA fallback to root index.html still wins for non-/apps URLs."
    - "tRPC v10/v11 dual-shape envelope decoding — the helper accepts both {result:{data:{json:T}}} (v11 default transformer) AND {result:{data:T}} (v10) for forward compat. NOT_FOUND envelope on 200 OR 404 carrier returns null cleanly; everything else throws."
    - "Defence-in-depth NO toolProvider — the standalone OpenUI app surface intentionally does NOT proxy Query/Mutation/exec/read to the gateway (T-203-07). Apps that need live tool calls open inside a chat session via AppDetail."
key_files:
  created:
    - livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.ts
    - livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.test.ts
    - livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/page.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/layout.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/OpenUiAppView.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/OpenUiAppView.test.ts
    - .planning/phases/203-liv-ai-openclaw-os/203-11-SUMMARY.md (this file)
  modified:
    - livos/packages/liv-claw-os/packages/claw-plugin/src/index.ts (added /apps/<unknown> → __placeholder__.html fallback ahead of the generic SPA index.html fallback)
  deleted: []
decisions:
  - "203-11-D-01 — Client-side fetch (NOT a server component) because the claw-client uses output:'export' (see next.config.ts). Server components, cookies() from next/headers, and async dynamic SSR are all unavailable in static export mode. The page therefore runs in the browser; the LIVINITY_SESSION cookie auto-flows over same-origin (T-203-06 trust chain preserved). Plan task 1+2 specified server-side fetch via cookies() — that pattern would have broken the build, so adapted to the only realisable shape for this bundle."
  - "203-11-D-02 — generateStaticParams returns a single __placeholder__ sentinel + dynamicParams=false. With output:'export', Next.js requires every dynamic route to have static params; truly-dynamic slugs are impossible at build time (the slug set is unbounded; apps are created live by the operator). The plugin's static-file handler fills the gap by routing every /apps/<unknown> request to the prebuilt placeholder HTML, which then extracts the live slug from window.location.pathname."
  - "203-11-D-03 — Server-shell-with-client-body split via page.tsx + OpenUiAppView.tsx. generateStaticParams must be exported from the page module itself (server concern); the body is delegated to a 'use client' component so the runtime slug extraction + fetch + Renderer mount can happen entirely on the client. Standard Next.js pattern for combining static generation with a client-rendered body."
  - "203-11-D-04 — Reuse @openuidev/react-lang Renderer + @openuidev/react-ui openuiLibrary (the upstream openclaw renderer this codebase already ships) rather than the in-tree validator. The validator at livos/packages/livinityd/source/modules/openui/validator.ts is the SERVER-side gate that runs BEFORE persistence (T-203-03); the client-side render path uses the actual renderer which has its own AST walker + prop validation. Both gates remain in place — server rejects bad content at write time; renderer rejects bad content at render time via its onError callback."
  - "203-11-D-05 — Plugin static-file handler edit (5 added lines) is part of this plan rather than deferred to 203-12 because without the /apps/<unknown> fallback, the SPA index.html fallback would deliver ChatApp's HTML for unknown slugs — completely the wrong surface. The fallback ordering matters: more-specific /apps/ first, then generic root SPA fallback."
  - "203-11-D-06 — NO toolProvider in OpenUiAppView. AppDetail forwards exec/read/db_query/db_execute to the gateway via record.sessionKey scoping; the standalone surface intentionally omits this so a malicious or buggy app cannot escalate to tool execution through the dock-window iframe (T-203-07 defence-in-depth). Operators who need a tool-aware app surface should open the app from inside a chat session via AppDetail."
  - "203-11-D-07 — Task 4 local smoke deferred to Plan 203-12 Mini PC deploy. A full local boot would need livinityd + Postgres + openclaw gateway + plugin process simultaneously running on Windows; competes with 203-12 territory. Structural smoke (HTML scaffolding + bundle reference + SSG manifest entry) PASS — the static page contains 'Loading app' and the OpenUiAppView bundle reference, proving hydration will fire the runtime path."
metrics:
  completed: 2026-05-23
  duration: ~14 minutes
  tasks_completed: 5/5 (task 4 structural smoke; full E2E deferred to Plan 203-12)
  commits: 2 (790f4eba fetch helper, f807eae3 page+layout+view+plugin-fallback)
  files_created: 6 (1 lib + 1 lib test + 1 page + 1 layout + 1 client view + 1 view test) + this SUMMARY
  files_modified: 1 (claw-plugin/src/index.ts — single 9-line added block)
  files_deleted: 0
  sacred_files_touched: 0 (INV-203-01 single-commit safe x2)
  claw_client_typecheck: PASS (npx tsc --noEmit, 0 errors after both commits)
  claw_client_build: PASS (npx next build — 5/5 static pages generated, `● /apps/[slug]` in route manifest with placeholder slug prebuilt at out/apps/__placeholder__.html, 10.5KB)
  claw_client_lint: PASS (npx eslint on all new files, 0 warnings)
  claw_plugin_typecheck: PASS (npx tsc --noEmit, 0 errors)
  claw_plugin_esbuild: PASS (190.6kb in 33ms, +14.9kb over the 175.7kb pre-203-06 baseline)
  claw_client_test_run: BLOCKED (vitest 4.x install gap inherited from Plan 203-02 — same as Plan 203-04 SCOPE BOUNDARY; tests typecheck clean and will run automatically once 203-02 deviation is unblocked)
  tasks_completed_breakdown: "Task 1 PASS (helper + 8 tests typecheck) | Task 2 PASS (4 files + 10 extractor tests typecheck) | Task 3 PASS (build manifest contains /apps/[slug]) | Task 4 PARTIAL (structural smoke PASS; live E2E deferred to 203-12) | Task 5 PASS (2 atomic commits, sacred hook PASS x2)"
deviations:
  - "[Rule 3 — Plan path drift] Plan frontmatter paths read `livos/packages/liv-claw-os/app/apps/[slug]/page.tsx` but the actual Next.js App Router lives at `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/page.tsx`. The prompt's success criteria confirmed the actual path. Used the actual path — the plan frontmatter is stale (the claw-client + claw-plugin sub-workspace shape was settled by Plan 203-02)."
  - "[Rule 3 — Plan path drift] Plan task 3 verify expects `pnpm --filter @livos/liv-claw-os build` but the actual package name is `@openuidev/claw-client` (see packages/claw-client/package.json, preserved-by-design upstream identifier per Plan 203-02). Used the direct npx next build invocation in the claw-client dir instead."
  - "[Rule 3 — Output mode mismatch] Plan task 1+2 specified server-side fetch with `cookies()` from `next/headers`. The claw-client uses `output: 'export'` (next.config.ts) — there is NO Next.js server runtime; cookies() is unavailable; async server components on dynamic routes fail to build. Adapted to client-side fetch via `fetchOpenUiApp` + same-origin cookie auto-flow with `credentials: 'include'` — T-203-06 trust chain preserved identically; the cookie still reaches livinityd because the iframe is mounted under the parent vhost."
  - "[Rule 3 — Output mode mismatch] Plan task 3 verify command searches for `ƒ /apps/[slug]` (Dynamic). With output:'export', dynamic routes cannot be Dynamic-server (`ƒ`) — they become SSG (`●`) with prebuilt static HTML. The route manifest shows `● /apps/[slug]` prerendered to `/apps/__placeholder__`, which is the correct outcome for static export. Verify intent (the route is in the manifest) satisfied; the literal `ƒ` check would have failed for an artefact of the export strategy, not a real defect."
  - "[Rule 2 — Critical functionality added] Plugin static-file handler /apps/<unknown> → __placeholder__.html fallback (5 added lines in claw-plugin/src/index.ts). Without this, the generic SPA fallback at line 248 would serve ChatApp's root index.html for unknown /apps/<slug> paths — the dock iframe would render the chat shell instead of the app. The new fallback is more-specific (only fires for `/apps/...` paths) and is layered BEFORE the generic SPA fallback so existing routing semantics are unchanged for non-app URLs."
  - "[Rule 2 — Defence-in-depth] NO toolProvider in OpenUiAppView. The plan task 2 example shipped a bare <OpenUIRenderer /> equivalent; AppDetail's full implementation wires exec/read/db_query/db_execute with record.sessionKey scoping. The standalone /apps/[slug] surface intentionally does NOT proxy any tool calls to the gateway so a buggy or malicious app cannot escalate to tool execution through the dock-window iframe (T-203-07 defence-in-depth). Operators who need tool-aware app behaviour open the app from inside a chat session via AppDetail."
  - "[Rule 3 — Task 4 local smoke deferred] A full local boot requires livinityd + Postgres + openclaw gateway + plugin process simultaneously running on Windows — non-trivial, competes with Plan 203-12 territory (Mini PC deploy walk). Structural smoke PASS instead: confirmed the static HTML at out/apps/__placeholder__.html contains 'Loading app' (initial state of OpenUiAppView) and the OpenUiAppView bundle reference, proving hydration fires the runtime path. Live curl smoke is part of Plan 203-12's deploy + UAT walk."
auth_gates: 0
known_stubs:
  - file: livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/page.tsx
    line: 32 (generateStaticParams returns single __placeholder__)
    reason: "Mandated workaround for output:'export' + truly-dynamic slugs. The placeholder HTML is served via the plugin's /apps/<unknown> fallback; the client view extracts the live slug from window.location.pathname. Not a stub of behaviour — both the build manifest entry AND the runtime route work as documented in the file header."
  - file: livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/OpenUiAppView.tsx
    line: 91 (renderErrors first message displayed in a banner)
    reason: "Surfaces only the first render error. AppDetail does the same; the full debug surface (AppDebugPanel) is intentionally chat-session-only because the standalone view does not own a sessionKey to attribute tool-invocation logs to. If operators need richer error introspection in the standalone view, a future plan can add a minimal collapsed error list."
threat_flags: []
---

# Phase 203 Plan 11: /liv-ai-app/apps/[slug] standalone OpenUI renderer Summary

**One-liner: shipped the `/apps/[slug]` Next.js App Router route inside the rebranded openclaw-os claw-client — fetches the OpenUI app from livinityd's `openclawos.apps.get` tRPC endpoint via a client-side helper, renders the OpenUI Lang content via the same `@openuidev/react-lang` Renderer + `@openuidev/react-ui` openuiLibrary that AppDetail already uses (T-203-03 14-component whitelist enforced server-side at write time and again by the renderer at view time). NO chat surface, NO composer, NO toolProvider — pure render target for the LivOS dock-window iframe shipped by Plan 203-10. Adapted to the claw-client's `output:'export'` constraint via a server-shell-with-client-body split (generateStaticParams + dynamicParams=false + runtime slug extraction from window.location.pathname) plus a 5-line claw-plugin static-file handler edit that routes `/apps/<unknown>` to the prebuilt `__placeholder__.html` instead of the generic SPA index.html fallback. 2 atomic commits `790f4eba..f807eae3`, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 2/2, claw-client + claw-plugin typecheck PASS, claw-client `npx next build` PASS with `● /apps/[slug]` in the route manifest.**

## What this plan delivered

### Task 1 — fetchOpenUiApp helper (commit `790f4eba`)

- `livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.ts` — client-side helper that hits livinityd's `openclawos.apps.get` via the tRPC v10/v11 batch GET envelope shape (`?batch=1&input=<encoded {0:{json:{slug}}}>`). Adapted from the plan's server-side `cookies()` example because the claw-client uses `output:'export'` (see next.config.ts) — there is NO Next.js server runtime; `cookies()`, async server components, and dynamic-route SSR are all unavailable. Same-origin auto-flow with `credentials:'include'` (T-203-06 trust chain preserved).
- Returns `OpenUiApp | null` — `null` on a clean NOT_FOUND envelope (server emits this on missing slug; the helper distinguishes it from transport / parse / shape errors). Throws on any other failure mode.
- Accepts BOTH v10 (`{result:{data:T}}`) AND v11 (`{result:{data:{json:T}}}`) envelope shapes for forward compat.
- Accepts an `AbortSignal` so a navigating user cancels the in-flight request.
- `livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.test.ts` — 8 vitest cases (v11 success, v10 success, 404+NOT_FOUND, 200+NOT_FOUND, 500 throw, malformed envelope throw, invalid shape throw, abort signal forwarding). Typecheck clean. Runner blocked by pre-existing Plan 203-02 vitest 4.x install gap — out of scope per SCOPE BOUNDARY (same as Plan 203-04).

### Task 2 + Task 3 — page + layout + plugin fallback (commit `f807eae3`)

**page.tsx** (server shell):
- Exports `generateStaticParams()` returning a single `__placeholder__` slug. Mandatory because `output:'export'` requires every dynamic route to have known build-time params.
- Exports `dynamicParams = false` so the static export pipeline doesn't try to lazily render unknown slugs at request time (no server to render with).
- Body returns `<OpenUiAppView />` — the actual implementation lives in the client view module so generateStaticParams (server concern) coexists with `'use client'` (body concern) via the canonical Next.js pattern.

**layout.tsx** (minimal pass-through):
- 4 lines of JSX — `<div className="flex h-full min-h-screen w-full flex-col">{children}</div>`.
- NO chat shell, NO sidebar, NO composer, NO command palette. D-203-10 standalone window surface.

**OpenUiAppView.tsx** (client body):
- `extractSlugFromPathname(pathname)` — pure function that handles all 3 prefixes the request may have travelled under (`/apps/x`, `/liv-ai-app/apps/x`, `/plugins/openclawos/apps/x`). Strips trailing slash, `.html`, query, hash. Returns null on the `__placeholder__` sentinel or any missing slug.
- `<OpenUiAppView />` mounts the slug-resolution effect first (runs once on hydration), then the fetch effect (runs whenever the resolved slug changes; AbortController cancels in-flight on unmount).
- Renders one of 4 states: `loading` → `not-found` → `error` → `ready`. The `ready` branch mounts `<Renderer library={openuiLibrary} response={app.content} onError={...} onStateUpdate={...} />` from `@openuidev/react-lang` — same Renderer AppDetail uses, so the 14-component whitelist + T-203-03 mitigations apply identically at render time.
- `<header>` displays `app.name`; `<main>` is full-viewport (`min-h-screen`) so the iframe content fills the window body.
- NO toolProvider — defence-in-depth (T-203-07): a malicious or buggy app cannot escalate to tool execution via the standalone surface.

**plugin/src/index.ts** (single 9-line block):
```ts
// 4) Phase 203-11 — /apps/<unknown-slug> falls back to the prebuilt
//    OpenUI-app page placeholder so the client component can extract
//    the live slug from window.location.pathname. Without this,
//    fallback (5) would deliver ChatApp's index.html which doesn't
//    know how to render an OpenUI app.
if (safeRel.startsWith("/apps/") && safeRel !== "/apps/__placeholder__.html") {
  if (await tryServe(res, path.join(STATIC_ROOT, "apps", "__placeholder__.html"))) {
    return true;
  }
}
```
Added BEFORE the generic SPA index.html fallback (line 248-pre-edit). More-specific match wins; existing routing semantics for non-`/apps/` URLs unchanged.

**OpenUiAppView.test.ts** — 10 vitest cases for `extractSlugFromPathname` (direct, Caddy-rewritten, gateway-rewritten, trailing slash, .html suffix, sentinel, missing, query/hash, hyphens/underscores). Typecheck clean; runner blocked per the same Plan 203-02 vitest gap.

### Task 3 — Build PASS

- `npx tsc --noEmit` → 0 errors (claw-client) AND 0 errors (claw-plugin).
- `npx next build` → 5/5 static pages generated. Route manifest:
  ```
  ┌ ○ /
  ├ ○ /_not-found
  ├ ● /apps/[slug]
  │ └ /apps/__placeholder__
  └ ○ /setup
  ```
- `out/apps/__placeholder__.html` written (10.5 KB) — contains "Loading app" and OpenUiAppView bundle reference.
- `npx esbuild` on the claw-plugin → 190.6 KB in 33 ms (was 175.7 KB pre-203-06; this plan adds the 9-line fallback block).
- `npx eslint` on all new files → 0 warnings.

The plan's `ƒ /apps/[slug]` verify expectation (Dynamic-server) does NOT match the `output:'export'` route type — `●` (SSG) is the correct manifest annotation for a static export. Verify intent (the route is present in the manifest) PASS.

### Task 4 — Smoke (structural)

- Full local smoke (live curl against a booted gateway) deferred to Plan 203-12 Mini PC deploy + UAT walk — booting livinityd + Postgres + openclaw gateway + plugin process simultaneously on Windows is non-trivial and competes with 203-12 territory.
- Structural smoke PASS: the prebuilt `__placeholder__.html` contains:
  - "Loading app" text (initial state of OpenUiAppView before hydration completes).
  - OpenUiAppView bundle reference (the JS chunk the static HTML pulls in to hydrate the client view).
  - "openclawos" and "apps" path references (the fetch helper's URL construction).
- Live curl smoke is part of Plan 203-12's deploy walk + Plan 203-13's UAT step 6 (operator clicks dock icon → window opens → OpenUI app renders live).

### Task 5 — Commits

- `790f4eba feat(203-11): fetchOpenUiApp client helper for openclawos.apps.get` — sacred SHA hook PASS.
- `f807eae3 feat(203-11): /apps/[slug] standalone OpenUI app renderer` — sacred SHA hook PASS.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-11-D-01 | Client-side fetch (not server component) | claw-client uses output:'export' — cookies() and async server components are unavailable; same-origin cookie auto-flow preserves T-203-06 |
| 203-11-D-02 | generateStaticParams returns __placeholder__ sentinel | output:'export' requires known build-time params; truly-dynamic slugs are filled in by the plugin's static-file handler fallback |
| 203-11-D-03 | Server-shell-with-client-body split | Canonical Next.js pattern to combine generateStaticParams (server concern) with 'use client' body |
| 203-11-D-04 | Reuse Renderer + openuiLibrary | Same renderer AppDetail uses; T-203-03 mitigations layered: server validator (write time) + renderer onError (render time) |
| 203-11-D-05 | Plugin static-file fallback in this plan, not 203-12 | Without /apps/<unknown> → __placeholder__.html, SPA fallback would deliver wrong page; ordering matters so more-specific fires first |
| 203-11-D-06 | NO toolProvider in OpenUiAppView | T-203-07 defence-in-depth — standalone surface cannot escalate to tool execution; tool-aware apps open from chat sessions via AppDetail |
| 203-11-D-07 | Task 4 local smoke deferred to 203-12 | Full local boot needs livinityd+PG+gateway+plugin on Windows; competes with deploy territory. Structural smoke covers route-existence + bundle hydration path |

## Threat Flags

None — Plan 203-11 wires a UI surface around existing security boundaries:
- **T-203-03** (OpenUI markup XSS in desktop window): unchanged — server-side validator gate at `openclawos.apps.create` still rejects bad content BEFORE persistence; the renderer's own AST walker + prop validation catch issues at render time via `onError` callback.
- **T-203-06** (iframe-in-iframe trust chain): preserved — fetch uses `credentials:'include'` over same-origin (the iframe is mounted under the parent vhost via the Caddy split); LIVINITY_SESSION cookie auto-flows; no cross-origin handshake needed.
- **T-203-07** (OpenUI app calls db_query via gateway): explicitly mitigated by omitting toolProvider in OpenUiAppView — standalone surface cannot reach the gateway's tool dispatcher at all; only the chat-session AppDetail path can invoke tools, where session scoping + ApprovalManager HITL apply.

INV-203-01 PASS 2/2 (`[sacred-sha] PASS: 20 files verified` on both commits).
INV-203-09 PASS — Phase 202 `agents.*` / `agents.tasks.*` / `mcp.config.*` tRPC namespaces UNCHANGED (this plan only adds a UI consumer of `openclawos.apps.get`; no contract changes anywhere).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Plan path drift] App Router path**
- **Found during:** Pre-task discovery (objective re-read).
- **Issue:** Plan frontmatter paths read `livos/packages/liv-claw-os/app/apps/[slug]/page.tsx`. Actual App Router lives at `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/page.tsx` (claw-client + claw-plugin sub-workspace shape locked by Plan 203-02). Prompt's success criteria confirmed the actual path.
- **Fix:** Used the actual path per success criteria.
- **Commits:** `790f4eba`, `f807eae3`.

**2. [Rule 3 — Plan path drift] Package name**
- **Found during:** Pre-task discovery.
- **Issue:** Plan task 3 verify reads `pnpm --filter @livos/liv-claw-os build`. Actual package name is `@openuidev/claw-client` (preserved upstream identifier per Plan 203-02).
- **Fix:** Used `cd packages/claw-client && npx next build` directly.

**3. [Rule 3 — Output mode mismatch] Server-side fetch impossible under output:'export'**
- **Found during:** Task 1 (translating plan's example into actual code).
- **Issue:** Plan task 1+2 specified server-side fetch with `cookies()` from `next/headers`. The claw-client `next.config.ts` has `output:'export'` — there is NO Next.js server runtime; `cookies()` cannot run; async server components on dynamic routes refuse to build.
- **Fix:** Adapted to client-side fetch — `fetchOpenUiApp(slug)` runs in the browser, reaches livinityd via same-origin `credentials:'include'`. T-203-06 cookie auto-flow preserved identically because the iframe is mounted under the parent vhost.
- **Commit:** `790f4eba`.

**4. [Rule 3 — Output mode mismatch] Verify expects `ƒ /apps/[slug]` (Dynamic)**
- **Found during:** Task 3 (running plan verify).
- **Issue:** Plan task 3 verify searches for `ƒ /apps/[slug]`. With output:'export', dynamic routes cannot be tagged Dynamic-server (`ƒ`) — they become SSG (`●`) with prebuilt static HTML.
- **Fix:** Verify intent (the route is present in the manifest) PASS via `● /apps/[slug]` prerendered to `/apps/__placeholder__`. The literal `ƒ` check is an artefact of the export strategy, not a real defect.

**5. [Rule 2 — Missing critical functionality] Plugin /apps/<unknown> fallback**
- **Found during:** Task 2 (designing the static-export strategy).
- **Issue:** With `generateStaticParams` returning only `__placeholder__`, the static export emits ONLY `out/apps/__placeholder__.html`. Visiting `/apps/foo` would 404 from the plugin's tryServe at line 247 (3) and fall through to the SPA index.html fallback at line 248 (4) — which delivers ChatApp's root HTML, completely the wrong surface for a dock-window iframe.
- **Fix:** Added a 9-line `/apps/<unknown> → __placeholder__.html` fallback in claw-plugin/src/index.ts BEFORE the generic SPA fallback. More-specific match wins; existing routing semantics for non-`/apps/` URLs unchanged.
- **Commit:** `f807eae3`.

**6. [Rule 2 — Defence-in-depth] NO toolProvider in OpenUiAppView**
- **Found during:** Task 2 (deciding what to copy from AppDetail).
- **Issue:** AppDetail wires `exec/read/db_query/db_execute` to the gateway via `record.sessionKey` scoping. Copying this into the standalone view would let a buggy or malicious OpenUI app reach tool execution via the dock-window iframe without any chat-session attribution, bypassing the T-203-07 boundary.
- **Fix:** Standalone view intentionally omits toolProvider. Apps that need live tool calls open from inside a chat session via AppDetail where session scoping + ApprovalManager HITL apply.

**7. [Rule 3 — Task 4 local smoke deferred]**
- **Found during:** Task 4 execution.
- **Issue:** Full local smoke requires livinityd + Postgres + openclaw gateway + plugin process simultaneously running on Windows — non-trivial setup that competes with Plan 203-12 territory (Mini PC deploy walk).
- **Fix:** Structural smoke PASS instead — verified the prebuilt `__placeholder__.html` contains 'Loading app' (initial state) + OpenUiAppView bundle reference (proves hydration fires) + openclawos/apps fetch URL fragments (proves fetch wiring). Live curl smoke is part of Plan 203-12's deploy + UAT walk (step 6).

## Auth gates encountered

None — no live Mini PC interaction this plan; all builds/typechecks/lints local.

## Known Stubs

- **`generateStaticParams` returns one `__placeholder__` slug** — not a behavioural stub; mandated workaround for output:'export' + truly-dynamic slugs. Both the build manifest entry AND the runtime route work as documented in the file header.
- **`renderErrors` first message only** — surfaces only the first render error in a banner. AppDetail does the same; the full debug surface (AppDebugPanel) is intentionally chat-session-only because the standalone view does not own a `sessionKey` to attribute tool-invocation logs to. Future plan can add a minimal collapsed error list if operators want richer in-iframe error introspection.

## Deferred Issues

- **Live E2E smoke** deferred to Plan 203-12 Mini PC deploy + 203-13 UAT step 6 (operator clicks dock icon → window opens → OpenUI app renders live). Structural smoke covered everything verifiable without a booted gateway.
- **claw-client vitest run blocked** by the pre-existing Plan 203-02 vitest 4.x install gap — same SCOPE BOUNDARY as Plan 203-04. Tests typecheck clean and will auto-run once 203-02 deviation is unblocked.

## Self-Check

Files verified:
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.ts`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/lib/fetch-openui-app.test.ts`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/page.tsx`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/layout.tsx`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/OpenUiAppView.tsx`
- FOUND: `livos/packages/liv-claw-os/packages/claw-client/src/app/apps/[slug]/OpenUiAppView.test.ts`
- FOUND: `livos/packages/liv-ai-app/public/icons/liv-ai-placeholder.svg` (shipped by Plan 203-10; success criterion already satisfied)

Commits verified:
- FOUND: `790f4eba feat(203-11): fetchOpenUiApp client helper for openclawos.apps.get`
- FOUND: `f807eae3 feat(203-11): /apps/[slug] standalone OpenUI app renderer`

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`:
- `[sacred-sha] PASS: 20 files verified` on both commits.

Build:
- `npx tsc --noEmit` (claw-client): PASS (0 errors)
- `npx tsc --noEmit` (claw-plugin): PASS (0 errors)
- `npx next build` (claw-client): PASS — `● /apps/[slug]` in route manifest; `out/apps/__placeholder__.html` written (10.5 KB)
- `npx esbuild` (claw-plugin): PASS (190.6 KB in 33 ms)
- `npx eslint` on new files: PASS (0 warnings)

Invariants:
- INV-203-01 (sacred SHA) PASS 2/2.
- INV-203-09 (Phase 202 tRPC namespaces) PASS — no contract changes anywhere.

## Self-Check: PASSED

## Next steps

**Plan 203-12 (Mini PC deploy via update.sh)** is unblocked. It will:
1. Run `bash /opt/livos/update.sh` on the Mini PC, which rsyncs the rebuilt claw-client static export bundle (now containing `/apps/__placeholder__.html`) and the rebundled claw-plugin (now containing the `/apps/<unknown>` fallback).
2. The existing `caddy reload` step picks up the Plan 203-10 Caddy rewrite (`* /plugins/openclawos{path}` inside the `/liv-ai-app/openclawos` handle_path block).
3. The existing `systemctl restart livos` step picks up no livinityd changes (this plan did not touch livinityd) — `openclawos.apps.get` already shipped in Plan 203-04.
4. Smoke: after restart, `curl -sf https://bruce.livinity.io/liv-ai-app/apps/<seeded-slug>` should return the prebuilt placeholder HTML, which the browser then hydrates to fetch the live slug from `openclawos.apps.get`.

**Plan 203-13 (VERIFICATION.md operator UAT walk)** can now PASS step 6 end-to-end: operator creates an OpenUI app via the chat → dock icon appears (Plan 203-10) → click → window opens with the iframe → iframe loads the OpenUI app (Plan 203-11). Step 7 (second app + simultaneous windows) also PASS-able once 203-12 has deployed.
