---
phase: 169
plan: 169-03
subsystem: ui/features/vault-graph
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/ui/src/features/vault-graph/VaultGraph.tsx
    - livos/packages/ui/src/features/vault-graph/VaultGraph.test.tsx
    - livos/packages/ui/src/features/vault-graph/GraphNodeDetail.tsx
    - livos/packages/ui/src/features/vault-graph/GraphNodeDetail.test.tsx
    - livos/packages/ui/src/features/vault-graph/index.ts
  modified:
    - livos/packages/ui/package.json (added react-force-graph-2d ^1.29.1)
    - livos/pnpm-lock.yaml (transitive deps for react-force-graph-2d)
acceptance:
  vitest: "14/14 vault-graph UI tests pass (6 GraphNodeDetail + 8 VaultGraph)"
  tsc: "0 new errors in features/vault-graph/* (UI tsc baseline unchanged)"
  grep-invariants:
    - "react-force-graph-2d in livos/packages/ui/package.json: exactly 1 line added"
    - "NODE_COLORS table covers 7 type keys (memory, session, inbox, agent, skill, command, root) in VaultGraph.tsx"
    - "dangerouslySetInnerHTML occurrences in features/vault-graph/: 0 (T-169-03-02)"
    - "encodeURIComponent on node.id in GraphNodeDetail.tsx: 1 (T-169-03-01)"
    - "credentials: 'include' in vault-graph fetch calls: 2 (one per fetch — graph + file)"
sacred-guards-verified:
  - "Sacred SHA f3538e1d preserved"
  - "D-09 luse-system-prompt.ts NOT touched"
  - "Phase 161-167 server files NOT touched"
  - "Phase 166 cc-pty/* NOT touched"
  - "Phase 167 features/cc-terminal/* NOT touched (separate sibling feature)"
  - "D-NEW-DEPS-v35 EXCEPTION: react-force-graph-2d is the ONLY new top-level dep added — verified by git diff package.json line count = 1"
---

# Phase 169 Plan 169-03: VaultGraph React Component Summary

Built the `VaultGraph` React feature under `livos/packages/ui/src/features/vault-graph/` with a force-directed graph (`react-force-graph-2d`), a node-click side drawer (`GraphNodeDetail`), manual refresh, and a truncated-banner. Installed the single authorized D-NEW-DEPS-v35 dependency.

## Summary

- **`VaultGraph.tsx` (NEW)** — `useQuery(['vault-graph'])` against `/api/vault/graph` (169-02). NODE_COLORS table covers all 7 vault types (memory/cyan, session/purple, inbox/green, agent/amber, skill/blue, command/pink, root/gray). Truncated banner + Refresh button. `onNodeClick` opens `GraphNodeDetail` drawer.

- **`GraphNodeDetail.tsx` (NEW)** — Right-anchored 400px overlay. Fetches `/api/vault/file?path=encodeURIComponent(id)` on mount. Renders content as plain text inside a `<pre>` block — no markdown parser, no `dangerouslySetInnerHTML` (T-169-03-02 mitigation). Loading / error / OK tri-state.

- **`index.ts` (NEW)** — barrel re-exporting `VaultGraph` + `GraphNodeDetail`.

- **`VaultGraph.test.tsx` (NEW)** — 8 vitest assertions. Mocks `react-force-graph-2d` (captures `graphData` + `onNodeClick` for assertion) + `./GraphNodeDetail` (testid-only stub). Wraps the component in a fresh `QueryClient` per test. Covers loading/error states, truncated banner show/hide, refresh refetch, node click → drawer open, close → drawer unmount, color mapping.

- **`GraphNodeDetail.test.tsx` (NEW)** — 6 vitest assertions. Mocks `globalThis.fetch`. Covers heading render, fetch URL + credentials, loading/success/error states, Close button.

- **`livos/packages/ui/package.json` (MODIFIED)** — added `"react-force-graph-2d": "^1.29.1"` — exactly one line added (verified by `git diff --numstat` and `git diff | grep '^+\s+"' | wc -l = 1`).

- **`livos/pnpm-lock.yaml` (MODIFIED)** — pnpm-managed; new transitive entries for `react-force-graph-2d` and its dependencies (accessor-fn, bezier-js, d3-* hoists, etc.). No other top-level package.json deps added.

## Acceptance Evidence

- **vitest**: `npx vitest run src/features/vault-graph/` → **14/14 passed** (6 GraphNodeDetail + 8 VaultGraph), 2.16 s total.
- **tsc**: 0 new errors in `features/vault-graph/*` (UI baseline unchanged).
- **Dep audit**: `git diff -- livos/packages/ui/package.json | grep -E '^\+\s+"' | wc -l` = **1** — only `react-force-graph-2d` added at top level. Lockfile expansion is transitive.
- **Grep invariants**:
  - `NODE_COLORS` keys: memory + session + inbox + agent + skill + command + root (7/7 present in `VaultGraph.tsx`).
  - `dangerouslySetInnerHTML` in `features/vault-graph/`: 0 matches (T-169-03-02 honored).
  - `encodeURIComponent(node.id)` in `GraphNodeDetail.tsx`: 1 match.
  - `credentials: 'include'` in vault-graph fetches: 2 matches (one in VaultGraph.tsx, one in GraphNodeDetail.tsx).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] pnpm add fails on Windows because of `copy-tabler-icons` postinstall**

- **Found during:** Task 1 (initial install)
- **Issue:** `pnpm --filter ui add react-force-graph-2d` resolved & installed correctly but failed at `postinstall` (`mkdir -p public/generated-tabler-icons && cp -r ...`) on Windows because `mkdir -p` is a Unix-ism. Exit code 1; `package.json` was NOT updated by pnpm even though `pnpm-lock.yaml` was already mutated with the new dep node. End result: lockfile said the dep was installed; package.json did not declare it; future `pnpm install` would have removed the lockfile entry.
- **Fix:** Manually added `"react-force-graph-2d": "^1.29.1"` to `livos/packages/ui/package.json` and re-ran `pnpm install --ignore-scripts` from the workspace root. Lockfile + package.json now agree. The deferred `copy-tabler-icons` postinstall is unrelated to Phase 169 (a Phase 167-era Windows-incompatibility that should be addressed in a follow-up).
- **Files modified:** None beyond what the plan already specified (`package.json` + `pnpm-lock.yaml`). The Windows-only postinstall failure does NOT affect the production Mini PC deploy where `mkdir -p` works natively.

**2. [Rule 1 - Test framework] No `@testing-library/react` — adopted Phase 167 createRoot + act() pattern**

- **Found during:** Task 2 + Task 3 (test scaffolds)
- **Issue:** Plan 169-03 Task 2 + 3 referenced `@testing-library/react` ("already a UI dep"). It is NOT installed (verified by grep + package.json). Adding RTL would violate D-NEW-DEPS-v35.
- **Fix:** Mirrored the Phase 167 `CcTerminal.test.tsx` pattern: `createRoot(container)` + `act(() => root.render(...))` + `vi.fn()`-mocked `globalThis.fetch`. Same testing power as RTL for these tests; zero new deps.
- **Files modified:** `VaultGraph.test.tsx` + `GraphNodeDetail.test.tsx` use the createRoot pattern verbatim (mirrors `CcTerminal.test.tsx`).

**3. [Rule 1 - Bug] React Query v5 microtask settling required setTimeout(0) in flushPromises**

- **Found during:** VaultGraph test first run (6/8 tests failing — query stuck in loading)
- **Issue:** Initial `flushPromises()` helper used `Promise.resolve()` ticks only. React Query v5's `executeFetch → setState` chain spans more than just microtasks; on Windows runtimes the rendered output stayed at "Loading vault graph..." even after 3 ticks.
- **Fix:** Replaced flushPromises with a mixed `setTimeout(0)` + `Promise.resolve()` chain (5 ticks total). All 8 VaultGraph tests then pass cleanly.
- **Files modified:** `VaultGraph.test.tsx` (helper function only).

## Notes

- **Plan 169-03 fallback path NOT exercised:** Plan said "if @tanstack/react-query missing, fall back to plain `fetch + useEffect`". `@tanstack/react-query@5.74.4` IS installed (verified at `package.json:62`); the canonical `useQuery` implementation is used.
- **14 vitest assertions** = plan target (≥14: 6 detail + 8 graph).
- D-NEW-DEPS-v35 EXCEPTION honored: only `react-force-graph-2d` added at the top level. d3-force, d3-zoom, etc. all arrived transitively.

## Self-Check: PASSED

- `VaultGraph.tsx` exports `VaultGraph`, uses `react-force-graph-2d` + `@tanstack/react-query`.
- `GraphNodeDetail.tsx` exports `GraphNodeDetail`, uses `encodeURIComponent` + `credentials: 'include'`.
- `index.ts` barrel re-exports both.
- Test files exist, 14/14 pass.
- `package.json` shows exactly 1 added line.
- No `dangerouslySetInnerHTML` anywhere in vault-graph/.
- Sacred SHA `f3538e1d` still in HEAD ancestry (will be verified by pre-commit hook).
