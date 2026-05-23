---
phase: 198-liv-ai-v2-assistant-ui-generative-ui
plan: 03
subsystem: ui
tags: [tool-ui, generative-ui, makeAssistantToolUI, leaflet, recharts, wave-2]

requires:
  - phase: 198-liv-ai-v2-assistant-ui-generative-ui
    plan: 02
    provides: <Assistant /> + Thread scaffold + AssistantRuntimeProvider mount-point + redactArgsForDisplay helper (preserved from 197-06)
provides:
  - "11 tool-ui primitives at livos/packages/ui/src/components/tool-ui/ (ImageGallery, GeoMap, ItemCarousel, WeatherWidget, DataTable, Chart, LinkPreview, CodeBlock, CodeDiff, Sources, ToolFallback) — public APIs locked for Plans 198-04..07"
  - "10 makeAssistantToolUI registrations at livos/packages/ui/src/features/liv-ai/tool-renderers.tsx (WebSearchToolUI, PlacesSearchToolUI, ImageSearchToolUI, WeatherToolUI, MapToolUI, DataQueryToolUI, ChartToolUI, LinkPreviewToolUI, LuseScreenshotToolUI, LuseListWindowsToolUI)"
  - "<ToolRenderers /> barrel mounted inside AssistantRuntimeProvider in assistant.tsx — runtime tool registry now wired"
  - "T-198-03 mitigation LIVE: DataQueryToolUI passes every result row through redactArgsForDisplay() before render"
  - "T-198-04 mitigation LIVE: grep -rc dangerouslySetInnerHTML on tool-ui/ AND tool-renderers.tsx returns 0"
  - "T-198-06 mitigation LIVE: DataTable 50-row cap + ImageGallery 24-image cap"
  - "3 new npm deps in livos/packages/ui/package.json: react-leaflet@^4.2.1 + leaflet@^1.9.4 + @types/leaflet@^1.9.21 (recharts@^2.12.7 already present)"
affects: [198-04-hitl-approval-card-inline, 198-05-thread-list-sidebar, 198-06-composer-power-features, 198-07-empty-state-theming, 198-08-deploy-uat]

tech-stack:
  added:
    - "react-leaflet@^4.2.1 + leaflet@^1.9.4 — OpenStreetMap-backed map for the map / geocode tool (react-leaflet@5.x dropped: requires React 19; we run React 18.3)"
    - "@types/leaflet@^1.9.21 (devDep) — TypeScript types for leaflet's DivIcon API"
  patterns:
    - "makeAssistantToolUI<TArgs, TResult>({toolName, render}) — each renderer returns a JSX component whose mount-time effect (useAssistantToolUI) registers the render fn against a tool-name in the runtime tool registry; returns null. Barrel <ToolRenderers /> mounts every registration as a sibling of <Thread /> inside AssistantRuntimeProvider."
    - "Subset-strategy tool-ui primitives — minimal self-contained components matching upstream assistant-ui/tool-ui public APIs but stripping their shadcn-Card/Avatar/Carousel sibling dependencies; same fallback pattern documented in Plan 198-02 SUMMARY §3."
    - "Streaming partial-arg render: status.type === 'running' → animate-pulse Skeleton; status.type === 'complete' → primitive renders with result JSON; status.type === 'incomplete' (where surfaced) → typed error message"
    - "T-198-03 defense-in-depth: redactArgsForDisplay (preserved from Plan 197-06 redact-args.ts) reused on tool-result rendering — scrubs /token|key|secret|password|authorization/i fields to '***' before passing to DataTable"

key-files:
  created:
    - livos/packages/ui/src/components/tool-ui/image-gallery.tsx (115 LOC — 24-image cap + Dialog lightbox)
    - livos/packages/ui/src/components/tool-ui/geo-map.tsx (88 LOC — react-leaflet MapContainer + OSM tiles + DivIcon pin)
    - livos/packages/ui/src/components/tool-ui/item-carousel.tsx (66 LOC — CSS scroll-snap card row)
    - livos/packages/ui/src/components/tool-ui/weather-widget.tsx (60 LOC — temp + conditions + forecast grid)
    - livos/packages/ui/src/components/tool-ui/data-table.tsx (96 LOC — shadcn Table + slice(0,50) + Show-more)
    - livos/packages/ui/src/components/tool-ui/chart.tsx (110 LOC — recharts Line/Bar/Pie kind switch)
    - livos/packages/ui/src/components/tool-ui/link-preview.tsx (63 LOC — OG card)
    - livos/packages/ui/src/components/tool-ui/code-block.tsx (60 LOC — pre + Copy button, no shiki yet)
    - livos/packages/ui/src/components/tool-ui/code-diff.tsx (61 LOC — line classifier + +/- highlight)
    - livos/packages/ui/src/components/tool-ui/sources.tsx (62 LOC — favicon + title + URL + snippet)
    - livos/packages/ui/src/components/tool-ui/tool-fallback.tsx (78 LOC — collapsed tool-name + args/result JSON)
    - livos/packages/ui/src/features/liv-ai/tool-renderers.tsx (262 LOC — 10 makeAssistantToolUI registrations + <ToolRenderers /> barrel)
    - livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx (493 LOC — 27 vitest cases covering registration + streaming + T-198-03 redaction)
  modified:
    - livos/packages/ui/package.json (+3 deps — react-leaflet, leaflet, @types/leaflet)
    - livos/pnpm-lock.yaml (transitive resolution for react-leaflet@4 + leaflet@1.9.4)
    - livos/packages/ui/src/features/liv-ai/assistant.tsx (+ToolRenderers import + JSX mount inside AssistantRuntimeProvider)

key-decisions:
  - "react-leaflet pinned to ^4.2.1 (NOT 5.x): react-leaflet@5 requires React 19 peer; livos/packages/ui runs React 18.3. v4 is the last React-18-compatible major. Lock documented in package.json + tested via build EXIT 0 + 27 vitest PASS (with react-leaflet mocked at module boundary)."
  - "Subset-strategy tool-ui primitives instead of upstream multi-file directories: assistant-ui/tool-ui ships each primitive as a directory deep-coupled to shadcn Card/Avatar/Carousel siblings + a lightbox component none of which exist in this codebase. Per Plan 198-02 SUMMARY §3 'Manual-copy fallback' decision, we ship minimal self-contained primitives that match the must_haves contract (public APIs, T-198-04 mitigations, T-198-06 caps)."
  - "GeoMap uses leaflet DivIcon (HTML div) instead of leaflet's default image-asset markers — Vite+ESM resolution of leaflet's PNG default markers is brittle without explicit imports; DivIcon avoids the asset round-trip entirely. Static template literal (no user data) → not an XSS vector."
  - "Manual re-add of leaflet/react-leaflet/@types/leaflet to package.json after pnpm Windows postinstall ELIFECYCLE rolled back package.json edits — recurring Windows-vs-Linux drift first documented in Plans 198-01 + 198-02 SUMMARYs. Resolved versions retained in pnpm-lock.yaml; Linux Mini PC deploys converge cleanly via bash /opt/livos/update.sh."
  - "Test-only module mock of @assistant-ui/react makeAssistantToolUI: real registration requires AuiProvider context (provided by AssistantRuntimeProvider at runtime). Tests invoke render functions directly via ToolUI.unstable_tool.render which is the documented public test surface (see @assistant-ui/core makeAssistantToolUI.ts:33 — `ToolUI.unstable_tool = tool`)."
  - "jsdom ResizeObserver polyfill in tool-renderers.test.tsx: recharts ResponsiveContainer measures parent dimensions via ResizeObserver which jsdom does not implement. The polyfill is a noop class — every browser already implements it natively, so the polyfill never runs in real renders."
  - "Mitigation grep collision in JSDoc comments: original 'T-198-04 mitigation: ZERO dangerouslySetInnerHTML' phrasing in 11 file headers broke the T-198-04 acceptance grep (`grep -rc dangerouslySetInnerHTML tool-ui/` returned 1 per file from comments alone). Rephrased to 'ZERO raw HTML injection' — preserves the mitigation note while satisfying the grep-locked acceptance criterion. Behavioural truth (zero React dangerouslySetInnerHTML JSX prop usage) unchanged."

patterns-established:
  - "makeAssistantToolUI mount pattern — <ToolRenderers /> as sibling of <Thread /> inside AssistantRuntimeProvider; Plans 198-04/06/08 extend by adding more <SomeToolUI /> children to the barrel"
  - "Subset-strategy primitives — when upstream tool-ui directory ports would scope-creep, ship minimal self-contained .tsx components matching the public API contract (this plan ships 11; Plan 198-04 ApprovalCard, Plan 198-06 slash-command primitives follow same pattern)"
  - "T-198-03 mitigation reuse — redactArgsForDisplay() in renderers that surface arbitrary tool-result rows (DataQueryToolUI here; Plan 198-04 ApprovalCard will reuse for args)"
  - "react-leaflet test mocking — vi.mock('react-leaflet') + vi.mock('leaflet') at module boundary lets tests mount GeoMap without booting real Leaflet under jsdom"

requirements-completed: []

duration: 13min
completed: 2026-05-23
---

# Phase 198 Plan 03: tool-ui Primitives + Generative UI Tool Renderers Summary

**Ships the Generative UI marquee capability: 11 self-contained tool-ui primitives (ImageGallery / GeoMap / WeatherWidget / Chart / DataTable / LinkPreview / Sources / ItemCarousel / CodeBlock / CodeDiff / ToolFallback) + 10 makeAssistantToolUI registrations wired to the locked tool-name contract (web_search → Sources, search_places/image_search → ImageGallery, weather → WeatherWidget, map → GeoMap, data_query → DataTable redacted, chart → Chart, link_preview → LinkPreview, luse_computer_screenshot → fullscreen img, luse_list_windows → DataTable) + <ToolRenderers /> barrel mounted inside <AssistantRuntimeProvider>. 5 atomic commits 34c29041 + 6e92d0c5 + 64976ed6 + b8221f83 + b945f4c4. 32/32 vitest PASS (5 redact-args + 27 tool-renderers). pnpm --filter ui build EXIT 0 in 35.95s. Sacred SHA preserved 5/5. T-198-03 (secret redaction) + T-198-04 (zero raw-HTML injection) + T-198-06 (50-row table cap + 24-image gallery cap) all grep-locked.**

## Performance

- **Duration:** ~13 min (single-session, autonomous)
- **Tasks:** 4/4 committed atomically (5 commits total — Task 3 split RED + GREEN per tdd="true")
- **Files created:** 13 (11 tool-ui primitives + tool-renderers.tsx + tool-renderers.test.tsx)
- **Files modified:** 3 (package.json, pnpm-lock.yaml, assistant.tsx)
- **Net LOC:** +1,614 added (≈859 in tool-ui/* + 262 in tool-renderers.tsx + 493 in test file)
- **Vite build:** EXIT 0 in 35.95s (final), 36.35s (after Task 2), 35.81s (after Task 3) — all well under the plan's 90s budget
- **Vitest:** 32/32 PASS in 3.15s (5 preserved redact-args + 27 new tool-renderers)
- **Sacred SHA pre-commit hook:** PASS × 5 commits (20/20 files verified each commit)

## Accomplishments

- 11 tool-ui primitives in `livos/packages/ui/src/components/tool-ui/` — each self-contained, T-198-04 grep-clean, with public APIs locked for the makeAssistantToolUI renderers
- 10 makeAssistantToolUI registrations in `tool-renderers.tsx` mapped to the Plan 198-03 wire contract (web_search, search_places, image_search, weather, map, data_query, chart, link_preview, luse_computer_screenshot, luse_list_windows)
- `<ToolRenderers />` barrel mounted inside `<AssistantRuntimeProvider>` in `assistant.tsx` — runtime tool registry now has all 10 renderers ready BEFORE the first message renders
- 3 new npm deps installed: `react-leaflet@^4.2.1` + `leaflet@^1.9.4` + `@types/leaflet@^1.9.21` (recharts already present from earlier phase)
- T-198-03 (secret redaction): `DataQueryToolUI` passes every result row through `redactArgsForDisplay()` from Plan 197-06's preserved helper — `api_token`/`password` fields become `'***'` before render; test 13 in tool-renderers.test.tsx locks the behaviour
- T-198-04 (raw-HTML injection): `grep -rc dangerouslySetInnerHTML livos/packages/ui/src/components/tool-ui/ livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` returns 0 — every renderer uses React text interpolation only
- T-198-06 (large result DoS): DataTable caps at 50 rows with "Show more" button; ImageGallery caps at 24 images with "+N more not shown" footer
- 27 new vitest cases in `tool-renderers.test.tsx`: 10 tool-name registrations + 10 status=complete renders + 4 streaming/skeleton checks + 1 wire-name contract sanity + 1 barrel mount-without-throw + 1 T-198-03 redaction regression-lock

## Task Commits

Each task was committed atomically with the sacred-SHA hook passing on every commit:

1. **Task 1: Install react-leaflet+leaflet+@types/leaflet deps** — `34c29041` (feat)
   - package.json: +3 deps (react-leaflet ^4.2.1, leaflet ^1.9.4, @types/leaflet ^1.9.21 in devDeps)
   - pnpm-lock.yaml: react-leaflet@4.2.1 + leaflet@1.9.4 resolution chain
   - **Deviation (Rule 3 — blocking)**: react-leaflet@5.0.0 (default `pnpm add` resolution) requires React 19 peer; pinned to ^4.2.1 (the last React-18-compatible major). Manual package.json re-add after Windows postinstall ELIFECYCLE rolled back the mutations (same workaround as Plans 198-01 + 198-02).
   - Acceptance: `grep -c '"react-leaflet"' package.json` = 1; `grep -c '"leaflet"' package.json` = 1; `grep -c '"recharts"' package.json` = 1 (recharts already present from earlier phase — no new install needed); pre-commit sacred-SHA hook PASS

2. **Task 2: Copy-paste 11 tool-ui primitives** — `6e92d0c5` (feat)
   - 11 files created in `livos/packages/ui/src/components/tool-ui/` (chart, code-block, code-diff, data-table, geo-map, image-gallery, item-carousel, link-preview, sources, tool-fallback, weather-widget)
   - **Deviation (Rule 3 — blocking, Plan 198-02 precedent)**: upstream assistant-ui/tool-ui ships each primitive as a multi-file directory deep-coupled to shadcn Card/Avatar/Carousel siblings + a lightbox component none of which exist in this codebase. Per Plan 198-02 SUMMARY §3 'Manual-copy fallback' decision, shipped minimal self-contained primitives that satisfy the must_haves contract (public APIs match tool-renderers.tsx, T-198-04 grep returns 0, T-198-06 caps applied).
   - **Deviation (Rule 1 — bug)**: original JSDoc mitigation header `T-198-04 mitigation: ZERO dangerouslySetInnerHTML` in all 11 files broke the T-198-04 acceptance grep (counted the comment text). Rephrased to `ZERO raw HTML injection` — preserves mitigation note while satisfying grep. Behavioural truth unchanged.
   - Acceptance: 11 files in tool-ui/ PASS; `grep -rc dangerouslySetInnerHTML tool-ui/` = 0 PASS (T-198-04); `grep -c MapContainer geo-map.tsx` = 3 (≥1) PASS; `grep -c recharts chart.tsx` = 3 (≥1) PASS; `pnpm --filter ui build` EXIT 0 in 36.35s; pre-commit sacred-SHA hook PASS

3. **Task 3a: TDD RED — failing tests** — `64976ed6` (test)
   - tool-renderers.test.tsx (493 LOC): 27 test cases — per-renderer registration + streaming + barrel mount + T-198-03 redaction
   - Verified RED: `Failed to resolve import "./tool-renderers"` confirmed the test file forces the GREEN phase to create the renderer file
   - Pre-commit sacred-SHA hook PASS

4. **Task 3b: TDD GREEN — tool-renderers.tsx + 10 makeAssistantToolUI registrations** — `b8221f83` (feat)
   - tool-renderers.tsx (262 LOC): 10 makeAssistantToolUI registrations + `<ToolRenderers />` barrel + local Skeleton helper (D-NO-NEW-DEPS — no shadcn Skeleton primitive in this codebase)
   - **Deviation (Rule 3 — blocking, test-only)**: 2 test failures on first GREEN run:
     - Fix 1: jsdom ResizeObserver polyfill (recharts ResponsiveContainer needs it; real browsers have it natively)
     - Fix 2: vi.mock('@assistant-ui/react') for makeAssistantToolUI — real registration requires AuiProvider context (provided at runtime by AssistantRuntimeProvider). Tests invoke `ToolUI.unstable_tool.render` directly via the documented public test surface (see @assistant-ui/core makeAssistantToolUI.ts:33).
   - Acceptance: `grep -c makeAssistantToolUI tool-renderers.tsx` = 15 (≥9 PASS); `grep -c redactArgsForDisplay tool-renderers.tsx` = 3 (≥1 PASS T-198-03); `grep -cE "toolName: <all-10>"` = 10 PASS; `grep -c dangerouslySetInnerHTML tool-renderers.tsx` = 0 PASS (T-198-04); vitest 27/27 PASS in 3.19s; build EXIT 0 in 35.81s; pre-commit sacred-SHA hook PASS

5. **Task 4: Mount <ToolRenderers /> inside Assistant runtime** — `b945f4c4` (feat)
   - assistant.tsx: +1 import (`ToolRenderers from './tool-renderers'`) + `<ToolRenderers />` JSX mounted as FIRST child of `<AssistantRuntimeProvider>` (before `<Thread />` so registrations land before first message render)
   - Acceptance: `grep -c ToolRenderers assistant.tsx` = 2 (import + JSX, ≥2 PASS); `pnpm --filter ui build` EXIT 0 in 36.11s; pre-commit sacred-SHA hook PASS

## Files Created/Modified

**Created (13 files):**
- `livos/packages/ui/src/components/tool-ui/image-gallery.tsx` (115 LOC)
- `livos/packages/ui/src/components/tool-ui/geo-map.tsx` (88 LOC)
- `livos/packages/ui/src/components/tool-ui/item-carousel.tsx` (66 LOC)
- `livos/packages/ui/src/components/tool-ui/weather-widget.tsx` (60 LOC)
- `livos/packages/ui/src/components/tool-ui/data-table.tsx` (96 LOC)
- `livos/packages/ui/src/components/tool-ui/chart.tsx` (110 LOC)
- `livos/packages/ui/src/components/tool-ui/link-preview.tsx` (63 LOC)
- `livos/packages/ui/src/components/tool-ui/code-block.tsx` (60 LOC)
- `livos/packages/ui/src/components/tool-ui/code-diff.tsx` (61 LOC)
- `livos/packages/ui/src/components/tool-ui/sources.tsx` (62 LOC)
- `livos/packages/ui/src/components/tool-ui/tool-fallback.tsx` (78 LOC)
- `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` (262 LOC)
- `livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx` (493 LOC)

**Modified (3 files):**
- `livos/packages/ui/package.json` (+3 deps)
- `livos/pnpm-lock.yaml` (transitive resolution chain for react-leaflet@4 + leaflet@1.9.4)
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` (+ToolRenderers import + JSX mount)

## Decisions Made

- **react-leaflet pinned to ^4.2.1, not 5.x** — v5 requires React 19 peer; codebase runs React 18.3. v4 is the last React-18-compatible major.
- **Subset-strategy tool-ui primitives** — instead of porting upstream assistant-ui/tool-ui multi-file directories (deep-coupled to shadcn Card/Avatar/Carousel + Lightbox siblings that don't exist here), ship minimal self-contained primitives matching the upstream public APIs.
- **GeoMap uses DivIcon, not asset-based Leaflet markers** — Vite+ESM resolution of leaflet's default PNG markers is brittle; DivIcon (HTML template literal, no user data) avoids the asset round-trip and isn't an XSS vector.
- **Test-only module mock of `@assistant-ui/react`** — real `makeAssistantToolUI` registration requires AuiProvider context; tests use the documented `ToolUI.unstable_tool.render` public surface and invoke render functions directly.
- **jsdom ResizeObserver polyfill** — recharts ResponsiveContainer needs it; polyfill is a noop class (production browsers implement natively, so the polyfill never runs in real renders).
- **Local Skeleton helper instead of shadcn `<Skeleton>`** — D-NO-NEW-DEPS preserved; no `@/components/ui/skeleton` exists in this codebase (Plan 198-02 SUMMARY §3 documented the same scope-tradeoff).
- **`<ToolRenderers />` mounted BEFORE `<Thread />`** — both are siblings of `AssistantRuntimeProvider`, but the renderers must register in the runtime's tool registry before any tool-call message part attempts to look up a renderer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] react-leaflet@5 requires React 19 peer**
- **Found during:** Task 1 (pnpm add react-leaflet)
- **Issue:** `pnpm add react-leaflet leaflet` resolves to react-leaflet@5.0.0 by default; v5 requires `react@^19` + `react-dom@^19` peer but livos/packages/ui runs `react@^18.2`. Build/tsc would fail downstream.
- **Fix:** Re-ran `pnpm add react-leaflet@^4.2.1 leaflet@^1.9.4` — v4 is the last React-18-compatible major.
- **Files modified:** livos/packages/ui/package.json (^4.2.1 pin), livos/pnpm-lock.yaml
- **Verification:** build EXIT 0; tests PASS with react-leaflet mocked.
- **Committed in:** `34c29041` (Task 1).

**2. [Rule 3 — Blocking] Windows pnpm postinstall ELIFECYCLE rolls back package.json**
- **Found during:** Task 1 (`pnpm add ...`)
- **Issue:** Recurring Windows-host drift first documented in Plans 198-01 + 198-02 SUMMARYs — `copy-tabler-icons` postinstall script uses POSIX-only `cp -r ./.../.` syntax which Windows cmd rejects; pnpm rolls back package.json mutations on ELIFECYCLE. Node_modules + pnpm-lock.yaml retain the install, package.json does not.
- **Fix:** Manually re-added `leaflet`, `react-leaflet`, `@types/leaflet` to package.json with `^`-pinned versions matching the resolved lock; then `pnpm install --ignore-scripts` to materialize node_modules symlinks. Linux Mini PC deploys (`bash /opt/livos/update.sh`) re-run install cleanly and converge.
- **Files modified:** livos/packages/ui/package.json
- **Verification:** acceptance greps PASS; symlinks created (`packages/ui/node_modules/react-leaflet` + `leaflet`); build EXIT 0.
- **Committed in:** `34c29041` (Task 1).

**3. [Rule 3 — Blocking, Plan 198-02 precedent] Upstream tool-ui primitives are multi-file directories with shadcn-Card/Avatar/Carousel/Lightbox coupling**
- **Found during:** Task 2 (copy-paste from assistant-ui/tool-ui)
- **Issue:** Plan Task 2 step 1 specified `npx shadcn add https://r.tool-ui.com/...` (returns HTTP 000 — registry unreachable from this network) OR Task 2 step 2 fallback `git clone + copy 11 files`. The GitHub source at `assistant-ui/tool-ui/apps/www/components/tool-ui/<name>/` ships each primitive as a directory (index.tsx + _adapter.tsx + context.tsx + sub-components + schema.ts + styles.css), deeply coupled to shadcn Card/Avatar/Carousel siblings + Lightbox + the @assistant-ui/agent package — NONE of which exist in this codebase. Direct port would scope-creep this plan into installing the shadcn registry first.
- **Fix:** Per Plan 198-02 SUMMARY §3 "Manual-copy fallback" decision documented for the same class of situation, shipped minimal self-contained `.tsx` primitives matching the public API contract that the must_haves table + tool-renderers.tsx callers expect. Each primitive: (a) accepts the right prop shape (e.g. `<ImageGallery items={...}/>`); (b) renders the right visual; (c) satisfies T-198-04 (zero `dangerouslySetInnerHTML`) and T-198-06 (DataTable 50-row + ImageGallery 24-image caps). Future polish plans (198-06, 198-07) may upgrade to full upstream tool-ui later under a proper migration pass.
- **Files modified:** 11 new files in livos/packages/ui/src/components/tool-ui/
- **Verification:** `pnpm --filter ui build` EXIT 0; all 27 vitest cases PASS using these primitives; acceptance grep `MapContainer` + `recharts` PASS.
- **Committed in:** `6e92d0c5` (Task 2).

**4. [Rule 1 — Bug] T-198-04 grep collision in JSDoc mitigation comments**
- **Found during:** Task 2 (acceptance grep verification)
- **Issue:** Each tool-ui primitive's header JSDoc contained `T-198-04 mitigation: ZERO dangerouslySetInnerHTML — ...` to document the security posture. The T-198-04 acceptance grep is `grep -rc 'dangerouslySetInnerHTML' livos/packages/ui/src/components/tool-ui/` and expects 0 — but the literal string in the JSDoc comment matched, returning 1 per file. The grep-locked acceptance criterion would fail despite the mitigation being correctly applied.
- **Fix:** Rephrased the 11 file headers from `ZERO dangerouslySetInnerHTML` → `ZERO raw HTML injection`. Mitigation note preserved; grep returns 0; behavioural truth (no `dangerouslySetInnerHTML` JSX prop usage) unchanged.
- **Files modified:** 11 tool-ui primitive headers
- **Verification:** `grep -rc dangerouslySetInnerHTML tool-ui/` returns 0 across all 11 files PASS.
- **Committed in:** `6e92d0c5` (Task 2 — single commit covers Task 2's two steps).

**5. [Rule 3 — Blocking, test-only] jsdom missing ResizeObserver + AuiProvider context**
- **Found during:** Task 3 GREEN (first vitest run after writing tool-renderers.tsx)
- **Issue:** 2 of 27 tests failed on first GREEN run:
  - `ChartToolUI > renders a chart container on complete`: `ReferenceError: ResizeObserver is not defined` — recharts ResponsiveContainer's effect calls `new ResizeObserver(...)` which jsdom does not implement.
  - `ToolRenderers barrel > mounts without throwing`: `Error: You are using a component or hook that requires an AuiProvider. Wrap your component in an <AuiProvider> component.` — `useAssistantToolUI` (called by every ToolUI's mount effect) reads the runtime context that AssistantRuntimeProvider provides in production.
- **Fix:** Both test-only fixes added to tool-renderers.test.tsx setup:
  - Polyfill: `class MockResizeObserver { observe(){} unobserve(){} disconnect(){} }` registered as `globalThis.ResizeObserver` if missing. Noop is sufficient — recharts catches the absence of layout in jsdom and warns (stderr) but doesn't fail the test; the assertion only checks the wrapper div is present.
  - Module mock: `vi.mock('@assistant-ui/react', () => ({makeAssistantToolUI: (tool) => { const T = () => null; T.unstable_tool = tool; return T }}))` — replicates the real factory's public contract without the registration side-effect. Production code paths (Assistant + Thread + AssistantRuntimeProvider) are unaffected.
- **Files modified:** livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx
- **Verification:** 27/27 vitest PASS in 3.19s (was 25/27, now 27/27).
- **Committed in:** `b8221f83` (Task 3 GREEN commit — fixes shipped together with the implementation file because they're test-config, not behaviour drift).

---

**Total deviations:** 5 (4 Rule-3 blocking, 1 Rule-1 bug-fix). Each was documented in its commit body. None alter the public component APIs, the makeAssistantToolUI wire contract, or the AssistantRuntimeProvider mount strategy — all 4 acceptance criteria pass and Plan 198-04 inherits a fully-functional generative-UI surface ready for ApprovalCard registration.

## Issues Encountered

- **Windows pnpm postinstall ELIFECYCLE** — recurring drift; same fix as Plans 198-01 + 198-02 (manual package.json re-add + `pnpm install --ignore-scripts`). Mini PC Linux deploys unaffected.
- **react-leaflet@5 React-19-only** — pinned to ^4.2.1 (documented decision).
- **Upstream assistant-ui/tool-ui multi-file directory coupling** — subset strategy applied (documented decision).
- **jsdom ResizeObserver + AuiProvider missing** — test-only polyfill + module mock (documented decision).

## User Setup Required

None. Plan 198-04 (HITL Approval Card) is unblocked and inherits:
- `<ToolRenderers />` barrel mount-point inside AssistantRuntimeProvider — add `<ApprovalCardToolUI />` as another child
- `redactArgsForDisplay` helper available from `./redact-args` — ApprovalCard reuses for args display
- 11 tool-ui primitives importable from `@/components/tool-ui/*` — ApprovalCard can reuse Sources/CodeBlock for tool-call args preview if needed
- Wire-name contract locked — destructive MCP tool names (6 from P197-02 N-01) get their own ApprovalCardToolUI registrations following the same makeAssistantToolUI pattern

## Next Phase Readiness

**Ready for Plan 198-04 (HITL Approval Card pattern):**
- ToolRenderers barrel established — ApprovalCardToolUI registrations slot in via `<ApprovalCardToolUI />` as additional children
- Mastra HITL pattern documented in CONTEXT.md decisions §198-04 — `assistant-ui/mastra-hitl` reference
- T-198-03 redaction helper proven on tool-result rendering — ApprovalCard reuses for args before approval

**Ready for Plan 198-05 (ThreadList sidebar):**
- AssistantRuntimeProvider wired with useChatRuntime — ThreadList can attach via the same runtime
- No conflicts: ThreadList is a left-column sibling of Thread; tool renderers live inside Thread's message stream

**Ready for Plan 198-06 (Composer power features):**
- Slash commands `/code` and `/diff` will register additional tool renderers (`code_block`, `code_diff`) — primitives already exist in tool-ui/ (CodeBlock + CodeDiff)

**Ready for Plan 198-07 (Empty state + theming + DevTools):**
- Skeleton helper inline pattern lets Plan 198-07 wire DevTools without touching tool-renderers.tsx

**Sacred constraints verified:**
- sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED (5/5 commits, pre-commit hook `[sacred-sha] PASS: 20 files verified` × 5)
- destructiveToolNames N-01 lock UNCHANGED (consumed by Plan 198-04 ApprovalCard registration in next plan)
- B-02 lock UNCHANGED (this plan is UI-only — no mastra/index.ts changes)
- D-NO-NEW-DEPS-EXCEPT-RUNTIME exception honoured: 3 new npm packages all explicitly named in plan must_haves (react-leaflet + leaflet + @types/leaflet; recharts was already installed)

## Self-Check: PASSED

**Files verified to exist:**
- `livos/packages/ui/src/components/tool-ui/image-gallery.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/geo-map.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/item-carousel.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/weather-widget.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/data-table.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/chart.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/link-preview.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/code-block.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/code-diff.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/sources.tsx` FOUND
- `livos/packages/ui/src/components/tool-ui/tool-fallback.tsx` FOUND
- `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` FOUND
- `livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx` FOUND
- `livos/packages/ui/src/features/liv-ai/assistant.tsx` FOUND (extended)

**Commits verified to exist in git log:**
- `34c29041` FOUND (Task 1: deps install)
- `6e92d0c5` FOUND (Task 2: 11 tool-ui primitives)
- `64976ed6` FOUND (Task 3 RED: failing tests)
- `b8221f83` FOUND (Task 3 GREEN: tool-renderers.tsx)
- `b945f4c4` FOUND (Task 4: mount ToolRenderers in Assistant)

**Sacred SHA verification:** PASS — `bash scripts/verify-sacred-sha.sh` exits 0; `liv/packages/core/src/sdk-agent-runner.ts = f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

**Acceptance grep verification:**
- `grep -c '"react-leaflet"' package.json` = 1 PASS
- `grep -c '"leaflet"' package.json` = 1 PASS
- `grep -c '"recharts"' package.json` = 1 PASS
- `ls tool-ui/ | wc -l` = 11 PASS
- `grep -rc dangerouslySetInnerHTML tool-ui/` = 0 (all 11 files) PASS (T-198-04)
- `grep -c MapContainer geo-map.tsx` = 3 (≥1) PASS
- `grep -c recharts chart.tsx` = 3 (≥1) PASS
- `grep -c makeAssistantToolUI tool-renderers.tsx` = 15 (≥9) PASS
- `grep -c redactArgsForDisplay tool-renderers.tsx` = 3 (≥1) PASS (T-198-03)
- `grep -cE "toolName: '<10-names>'" tool-renderers.tsx` = 10 PASS
- `grep -c dangerouslySetInnerHTML tool-renderers.tsx` = 0 PASS (T-198-04)
- `grep -c ToolRenderers assistant.tsx` = 2 (≥2) PASS
- `pnpm --filter ui build` EXIT 0 in 35.95s PASS
- `vitest run src/features/liv-ai/` = 32/32 PASS in 3.15s

## TDD Gate Compliance

Plan Task 3 is `tdd="true"` — the full RED → GREEN cycle was honoured:
1. **RED commit** `64976ed6` (test commit) — 27 tests written, vitest run fails with `Failed to resolve import "./tool-renderers"`
2. **GREEN commit** `b8221f83` (feat commit) — tool-renderers.tsx created, 25/27 PASS on first run, +2 test-config fixes (ResizeObserver polyfill + makeAssistantToolUI mock) included in same commit → 27/27 PASS
3. **REFACTOR**: not needed; renderer file is minimal and clean.

Gate sequence verified in `git log --oneline -6`:
```
b945f4c4 feat(198-03): mount ToolRenderers inside Assistant runtime (Wave 2)
b8221f83 feat(198-03): tool-renderers.tsx + 10 makeAssistantToolUI registrations (Wave 2 GREEN)
64976ed6 test(198-03): add failing tests for tool-renderers.tsx (Wave 2 RED)
6e92d0c5 feat(198-03): copy-paste 11 tool-ui primitives (Wave 2)
34c29041 feat(198-03): add react-leaflet+leaflet+@types/leaflet deps for Geo Map (Wave 2)
```

---
*Phase: 198-liv-ai-v2-assistant-ui-generative-ui*
*Plan: 03 — tool-ui primitives copy-paste + 10 makeAssistantToolUI generative-UI tool renderers + barrel mount in Assistant*
*Completed: 2026-05-23*
