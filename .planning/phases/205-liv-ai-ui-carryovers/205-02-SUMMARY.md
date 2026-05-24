---
phase: 205-liv-ai-ui-carryovers
plan: 02
subsystem: liv-claw-os/claw-client
tags: [claw-client, ui, settings-dialog, tab-strip, entry-point, gear-icon-swap, wave-1]
requirements_addressed: [R1]
dependency_graph:
  requires:
    - 205-01 (Wave 0 spike LOCKED auth path + envelope shape)
    - claw-client/src/components/ui/SegmentedTabs.tsx (pre-existing)
    - claw-client/src/components/layout/sidebar/IconButton.tsx (pre-existing)
    - claw-client/src/lib/gateway/types.ts (ConnectionState enum, pre-existing)
  provides:
    - claw-client/src/components/settings/ConnectionTab.tsx (extracted body)
    - claw-client/src/components/settings/McpServersTab.tsx (shell — Wave 2 fills)
    - claw-client/src/components/settings/GatewayTab.tsx (shell — Wave 3 fills)
    - claw-client/src/lib/livinityd-client.ts (callQuery + callMutation helpers — Wave 2 + 3 consume)
  affects:
    - claw-client/src/components/settings/SettingsDialog.tsx (body wrapped in SegmentedTabs strip; public prop signature unchanged)
    - claw-client/src/components/layout/AppSidebar.tsx (footer bottom-tile content swapped to gear icon + "Settings" label per D-205-01)
tech-stack:
  added: []
  patterns:
    - "SegmentedTabs<V extends string>(value, onChange, options, ariaLabel) — used for 3-tab strip"
    - "Bare non-batch tRPC v11 envelope {json: input} for mutations (NOT {0:{json:...}}?batch=1)"
    - "GET /trpc/<path>?input=<encoded {json: input}> for queries"
    - "X-Api-Key bootstrap via same-origin /openclawos/runtime-config (one-time fetch + module-scope cache)"
    - "Defensive cookie fallback via credentials: 'include'"
key-files:
  created:
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/ConnectionTab.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/McpServersTab.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/lib/livinityd-client.ts
  modified:
    - livos/packages/liv-claw-os/packages/claw-client/src/components/settings/SettingsDialog.tsx
    - livos/packages/liv-claw-os/packages/claw-client/src/components/layout/AppSidebar.tsx
decisions:
  - "Extract verbatim (no behavior changes) into ConnectionTab.tsx — preserves the snapshot + has-left-snapshot race resolver exactly as the production code shipped it."
  - "SettingsDialog public prop signature unchanged so ChatApp + tests keep working without callsite edits."
  - "AppSidebar bottom-tile content fully replaced — connection-status pill OUT, gear-icon + 'Settings' label IN — but lookup tables (STATUS_LABEL/STATUS_ICON/DOT_CLASS) kept defined for a future Connection-tab body consumer."
  - "X-Api-Key bootstrap de-duplicated via a shared `bootstrapPromise` so concurrent first-callers share a single fetch."
  - "Mutation envelope = bare `{json: input}` (not batch); response unwrap tolerates both `{result:{data:<raw>}}` and `{result:{data:{json:<raw>}}}` defensively."
metrics:
  completed: 2026-05-24
  duration: ~25 minutes
  tasks: 1
  files_changed: 6
  insertions: 654
  deletions: 324
---

# Phase 205 Plan 02: SegmentedTabs Settings Shell + Gear-Icon Entry Summary

Wrapped the existing SettingsDialog body in a 3-tab SegmentedTabs strip (Connection → MCP Servers → Gateway) and swapped AppSidebar's footer connection-status pill for a gear-icon + "Settings" label per D-205-01 — additive shell only, no behavioral regressions to the Connection form, public prop signatures preserved.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 1 | Extract SettingsDialog body into ConnectionTab + scaffold McpServersTab + GatewayTab + livinityd-client + gear-icon swap | `4049110c` |

## File Map — JSX Migration

**ConnectionTab.tsx (NEW, 326 lines)** received the verbatim extraction of the pre-Phase-205 SettingsDialog body:

| Source range (pre-205 SettingsDialog.tsx) | Destination (ConnectionTab.tsx) | Notes |
|---|---|---|
| Lines 20-90 (`STATUS_BANNER` lookup table) | Lines 30-100 | Verbatim copy. |
| Lines 92-203 (state setup + handleSubmit + race resolver) | Lines 102-203 | Verbatim — snapshot + has-left-snapshot latch preserved. |
| Lines 229-243 (status banner block — tile + label + description) | Lines 217-231 | Moved outside `<dialog>`; wraps with `<div className="flex flex-col">`. |
| Lines 245-330 (intro paragraph + URL form + Token form + error + pending + buttons) | Lines 233-318 | Verbatim, including code-fenced inline help text. |
| Lines 208-228 (dialog open/close `useEffect` + close button) | **STAYS in SettingsDialog** | Dialog chrome belongs to the shell, not the tab body. |

**SettingsDialog.tsx (MOD, 99 lines, was 335)** keeps the dialog chrome and orchestrates the tabs:

- Imports `SegmentedTabs`, `ConnectionTab`, `McpServersTab`, `GatewayTab`.
- New `SettingsTab` type (`'connection' | 'mcp' | 'gateway'`) + `activeTab` `useState` (default `'connection'`).
- New `useEffect` that resets `activeTab='connection'` whenever the dialog opens (first-visit predictability).
- Dialog title changed from "Gateway Settings" → "Settings" (broader scope now that tabs cover MCP + Gateway too).
- Body wraps `<SegmentedTabs>` strip + conditional render of `<ConnectionTab>` / `<McpServersTab>` / `<GatewayTab>` based on `activeTab`.

**McpServersTab.tsx (NEW, 21 lines)** — placeholder shell with title "MCP Servers" + Wave 2 explainer.

**GatewayTab.tsx (NEW, 22 lines)** — placeholder shell with title "Gateway" + Wave 3 explainer.

**livinityd-client.ts (NEW, 187 lines)** — shared tRPC HTTP client:

- `getApiKey()` — one-time bootstrap from `GET /openclawos/runtime-config` (same-origin); caches `livApiKey` in module-scope `cachedApiKey`; de-dups concurrent first callers via `bootstrapPromise`.
- `callQuery<I, O>(path, input?)` — `GET /trpc/<path>` with optional `?input=<encoded {json: input}>`. Attaches `X-Api-Key` + `credentials: 'include'` for LIVINITY_SESSION cookie.
- `callMutation<I, O>(path, input)` — `POST /trpc/<path>` with body `{json: input}` (bare non-batch envelope per AUTH PATH lock).
- `unwrap()` helper tolerates both v11 strip-wrapper response shapes (`{result:{data:<raw>}}`) and v10 wrapped shapes (`{result:{data:{json:<raw>}}}`).
- Error path extracts `error.json?.message ?? error.data?.message ?? error.message` from the tRPC envelope and rethrows; HTTP non-2xx also attempts JSON parse before fallback.

**AppSidebar.tsx (MOD)** — D-205-01 gear-icon swap:

- Added `Settings as SettingsIcon` to existing `lucide-react` import group.
- Replaced lines 753-803 footer block content:
  - Collapsed branch (`nc=true`): `IconButton icon={SettingsIcon}` with title "Open settings" (was `IconButton icon={StatusIcon}` with dynamic title).
  - Expanded branch (`nc=false`): inner button now renders `<SettingsIcon size={14} />` + literal `<span>Settings</span>` (was dot + `STATUS_LABEL[connectionState]` + trailing pulsing `<StatusIcon>`).
  - Theme-toggle `IconButton` (Sun/Moon) preserved verbatim.
  - `onClick={onSettingsClick}` wiring preserved on both branches — R1 acceptance ("bottom-tile click opens SettingsDialog") not regressed.
- `STATUS_LABEL` / `STATUS_ICON` / `DOT_CLASS` lookup tables (lines 51-81) kept in the file per plan locked decision — future Connection-tab body may consume them.

## Wave 2 + Wave 3 Unblocked

Both downstream plans now have non-overlapping `files_modified` and can begin in parallel:

- **205-03 (Wave 2 — MCP Servers tab):** writes `McpServersTab.tsx` (replaces placeholder body), `livinityd/source/modules/openclawos/mcp-bridge.ts` (Redis subscribe loop), `livinityd/source/modules/openclawos/openclawos-router.ts` or new file (`/openclawos/runtime-config` endpoint if not yet wired), and `livinityd/source/modules/common.ts` (`httpOnlyPaths` registration). Imports `callQuery`/`callMutation` from `lib/livinityd-client.ts`.
- **205-04 (Wave 3 — Gateway tab):** writes `GatewayTab.tsx` (replaces placeholder body), `livinityd/source/modules/openclawos/openclawos-gateway-router.ts` (paired devices / origins / auth mode CRUD), `livinityd/source/modules/openclawos/device-auto-approver.ts` (revoked.json deny-list 4-line patch), `livinityd/source/modules/openclawos/openclaw-config-store.ts` (new file or extension for atomic tmp+rename `openclaw.json` mutations), and `livinityd/source/modules/common.ts` (httpOnlyPaths registration). Also consumes `lib/livinityd-client.ts`.

No further refactor of `SettingsDialog.tsx` is needed by either plan — they each replace the body of their respective placeholder tab file.

## Deviations from Plan

None — plan executed exactly as written, including:

- Plan's locked AUTH PATH envelope template (`{json: input}` mutation body, `?input=<encoded {json: input}>` query) carried verbatim into `livinityd-client.ts`.
- All 5 file paths from plan frontmatter `files_modified` matched.
- AppSidebar.tsx gear-icon swap surgical patch matched plan steps 1-5 exactly.

## Auth Gates

None encountered. No Mini PC SSH was attempted (this wave is frontend-only — Wave 0 spike already collected all server-side findings under LOCKED contracts).

## Known Stubs

- `McpServersTab.tsx` — placeholder shell labelled `"Wave 2 — Phase 205-03."` Resolved by 205-03.
- `GatewayTab.tsx` — placeholder shell labelled `"Wave 3 — Phase 205-04."` Resolved by 205-04.

Both stubs are intentional and documented in the plan; they do not block the R1 acceptance criterion ("clicking the bottom sidebar element opens SettingsDialog" — that path works after this wave; the dialog renders 3 tabs in the locked order).

## Verification

| Check | Result |
|---|---|
| `pnpm tsc --noEmit` (claw-client workspace) | PASS (clean, no output) |
| `pnpm --filter @openuidev/claw-client build` | PASS (`✓ Compiled successfully in 5.3s` + 5 static routes prerendered) |
| `grep "import { SegmentedTabs }" SettingsDialog.tsx` | PASS |
| `grep "MCP Servers" SettingsDialog.tsx` | PASS |
| `grep "export function ConnectionTab" ConnectionTab.tsx` | PASS |
| `grep "export function McpServersTab" McpServersTab.tsx` | PASS |
| `grep "export function GatewayTab" GatewayTab.tsx` | PASS |
| `grep "export async function callMutation" livinityd-client.ts` | PASS |
| `grep "export async function callQuery" livinityd-client.ts` | PASS |
| `grep "Settings as SettingsIcon" AppSidebar.tsx` | PASS |
| `grep "onClick={onSettingsClick}" AppSidebar.tsx` | PASS (2 hits — both branches preserved) |
| Footer block (lines 753-805) does NOT render `{STATUS_LABEL[connectionState]}` / `<StatusIcon` / `{DOT_CLASS[...]}` | PASS |
| `process.env.LIV_API_KEY` not present in `livinityd-client.ts` (browser env restriction) | PASS |
| Pre-commit hook output | `[sacred-sha] PASS: 20 files verified` |

## Self-Check: PASSED

- File `ConnectionTab.tsx` exists at `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/ConnectionTab.tsx` — FOUND
- File `McpServersTab.tsx` exists at same dir — FOUND
- File `GatewayTab.tsx` exists at same dir — FOUND
- File `livinityd-client.ts` exists at `livos/packages/liv-claw-os/packages/claw-client/src/lib/livinityd-client.ts` — FOUND
- File `SettingsDialog.tsx` modified (335 → 99 lines net of extraction) — FOUND
- File `AppSidebar.tsx` modified (gear-icon swap) — FOUND
- Commit `4049110c` exists in `git log` — FOUND
- Commit pre-commit hook output recorded `[sacred-sha] PASS: 20 files verified` — VERIFIED inline above
