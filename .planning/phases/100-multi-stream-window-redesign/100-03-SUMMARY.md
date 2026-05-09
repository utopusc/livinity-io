---
phase: 100-multi-stream-window-redesign
plan: 03
status: complete
date: 2026-05-08
requirements_addressed:
  - V33-MULTI-02
key_files:
  modified:
    - livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx
    - livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx
  deleted:
    - livos/packages/ui/src/modules/window/webapp-toolbar.tsx
  created:
    - .planning/phases/100-multi-stream-window-redesign/100-03-SUMMARY.md
sacred_sha:
  pre:  f3538e1d811992b782a9bb057d1b7f0a0189f95f
  post: f3538e1d811992b782a9bb057d1b7f0a0189f95f
pre_100_03_sha: 688887fd66dec645f3eb314d40eb7555181ee671  # The commit immediately BEFORE 100-03's first source-deleting commit (HEAD of 100-02). 100-04 reads this to lift the WebAppAgentPanel body via `git show 688887fd66dec645f3eb314d40eb7555181ee671:livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — 5 occurrences of the literal `WebAppAgentPanel` confirmed at this SHA.
---

# Phase 100-03 SUMMARY

**Date:** 2026-05-08
**Goal:** V33-MULTI-02 — drop URL bar + inline agent panel; full-bleed stream.

## Diff

| File | Change |
|---|---|
| `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` | **DELETED** (125 lines gone — `git rm`). |
| `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` | 776 → 524 lines (−252 net). Toolbar render call dropped, ResizablePanelGroup wrapper dropped, persistence helpers dropped, toolbar handlers dropped, WebAppAgentPanel inner component dropped, root wrapper switched to `relative flex h-full w-full flex-col`, stream wrapper gains `pb-9` (Plan A locked). |
| `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` | 106 → 99 lines. 7 invariants removed (toolbar import + ResizablePanelGroup + persistence-key + 70/30 + [20,90] + copyUrl + fullscreen + composerDisabled). 4 invariants added (drops WebAppToolbar, drops ResizablePanelGroup, uses flex-col root, reserves pb-9). |

### Imports removed from webapp-stream-window.tsx
- `WebAppToolbar` from `../webapp-toolbar` (file deleted)
- `WebAppModeSelector` (kept as `type WebAppMode` only)
- `WebAppSkillsSidebar` from `../webapp-skills-sidebar`
- `ResizableHandle, ResizablePanel, ResizablePanelGroup` from `@/shadcn-components/ui/resizable`
- `ChatMessageItem` from `@/routes/ai-chat/chat-messages`
- `ChatInput, type FileAttachment` from `@/routes/ai-chat/chat-input`

### Constants / helpers / state removed
- `SPLIT_KEY_PREFIX`, `DEFAULT_TOP_PCT`, `DEFAULT_BOTTOM_PCT`, `MIN_PCT`, `MAX_PCT`
- `PersistedLayout` interface, `readPersistedLayout`, `writePersistedLayout`
- `initialLayout` (useMemo), `onLayoutChange` (useCallback)
- `sendChord`, `onBack`, `onForward`, `onRefresh`, `onCopyUrl`, `onFullscreen`
- `composerValue` / `setComposerValue`, `composerDisabled`, `onSend`, `onStop`
- `mode` / `setMode`, `handleModeChange`, `armPrivacyWarningOnce`
- `agent` (`useWebAppAgent` call removed)
- `sidebarCollapsed` / `setSidebarCollapsed`, `showSkillsSidebar`
- `WebAppAgentPanel` inner component (~80 lines) + its props interface

### Preserved byte-for-byte
- Spawn lifecycle (lines 132-198 of pre-100-03): `spawnedForRef`, `closeMutationRef`, retry / idempotency from 95-07.B / 99-04 / 95-08 hotfixes.
- Teach recorder wiring + privacy ack (`useTeachRecorder`, `TEACH_PRIVACY_ACK_KEY`, `TEACH_PRIVACY_TEXT`).
- Skill dialog wiring (`pendingSave`, `onSavePending`, `onCancelPending`, `skillCreateMutation`, `skillDiscardMutation`, `skillsListUtils`).
- Selected-skill scrubber (`selectedSkillId`, `<SkillReplayScrubber>` overlay).
- All overlays (`SpawnErrorBanner`, `VncOverlay`, `TeachRecordingOverlay`, `TeachAutoStopBanner`, `SaveSkillDialog`).
- noVNC keysym constants (`KEY_ALT_LEFT`, `KEY_ARROW_LEFT`, `KEY_ARROW_RIGHT`, `KEY_F5`) — kept for 100-04 to lift back/forward/refresh chord into drawer.

### Layout (V33-MULTI-02 + Plan A locked)
- Root wrapper: `<div className='flex h-full w-full flex-row bg-surface-base'>` → `<div className='relative flex h-full w-full flex-col bg-surface-base'>` (relative for 100-04 absolute-anchor; flex-col for column orientation).
- Stream wrapper: `<div className='relative flex-1 min-h-0 overflow-hidden bg-black pb-9'>` (the `pb-9` reserves 36px so 100-04's `absolute inset-x-0 bottom-0 z-20 h-9` overlay action-bar never occludes stream pixels).

## Test results

- `npx vitest run webapp-stream-window.unit`: **13 / 13 PASS**.
  - 4 new RED invariants from prior commit are now GREEN: `drops WebAppToolbar import`, `drops ResizablePanelGroup vertical split`, `uses flex-col root container`, `reserves bottom space via pb-9`.
  - All preserved invariants still PASS: spawn/close mutations, webapp.list, useWebAppVnc/useWebAppAgent hooks, default mode 'chat', back/forward/refresh keysyms, SERVICE_UNAVAILABLE banner, close-mutate on unmount, smoke import.
- `npx vitest run src/modules/window`: 1 file passed / 13 tests passed (window module isolated).
- `npx vitest run` (full ui suite): 50 files passed / 439 tests passed; 10 files failed / 21 tests failed — **ALL pre-existing failures unrelated to 100-03** (Playwright `tests/example.spec.ts`, `docker/sidebar.unit.test.ts`, `docker/store.unit.test.ts`, `docker/use-tag-filter`, `docker/use-recent-searches`, `use-liv-tool-panel-shortcut`, `use-liv-agent-stream`, `sidebar-density.unit.test.ts` — all localStorage / hook / playwright tests in code 100-03 did not touch). Confirmed pre-existing per execute-plan SCOPE BOUNDARY rule.
- `npx tsc --noEmit`: clean for `livos/packages/ui` files; pre-existing livinityd `ctx.livinityd | undefined` errors in `routes.ts` are unrelated to this plan (not modified).
- `npx vite build`: PASS (built in 41.25s; 210 PWA precache entries; bundle size warnings are pre-existing chunk-size advisory, not errors).

## Acceptance grep checks

| Check | Expected | Actual |
|-------|----------|--------|
| `test ! -f livos/.../webapp-toolbar.tsx` | exit 0 | **PASS** ✓ (deleted) |
| `grep -c "WebAppToolbar" .../webapp-stream-window.tsx` | 0 | **0** ✓ |
| `grep -cE "ResizablePanelGroup\|ResizablePanel\b\|ResizableHandle" .../webapp-stream-window.tsx` | 0 | **0** ✓ |
| `grep -cE "SPLIT_KEY_PREFIX\|DEFAULT_TOP_PCT\|readPersistedLayout\|writePersistedLayout" .../webapp-stream-window.tsx` | 0 | **0** ✓ |
| `grep -c "WebAppAgentPanel" .../webapp-stream-window.tsx` | 0 | **0** ✓ |
| `grep -c "flex h-full w-full flex-col" .../webapp-stream-window.tsx` | ≥1 | **3** ✓ (root + 2 in subcomponents) |
| `grep -c "pb-9" .../webapp-stream-window.tsx` | ≥1 | **3** ✓ (in code + 2 in comments) |
| `grep -cE "relative flex-1 min-h-0 overflow-hidden" .../webapp-stream-window.tsx` (Plan A) | ≥1 | **1** ✓ |
| `grep -rEn "from ['\"]\.\./webapp-toolbar['\"]" livos/packages/ui/src/` | 0 | **0** ✓ (no surviving importers) |

## Sacred SHA gate

- Pre commits:  `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Post commits: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- `.husky/pre-commit` hook auto-fired on each commit. No `--no-verify` used.
  - Task 1 RED commit `ff99ebfd` — gate PASS.
  - Task 2 GREEN commit `6702780c` — gate PASS.
  - Task 3 SUMMARY commit (this file) — gate fires on commit.

## Commits

- `ff99ebfd` test(100-03): RED - flip stream-window invariants for full-bleed layout
- `6702780c` feat(100-03): drop URL bar + ResizablePanelGroup; stream is full-bleed (V33-MULTI-02)
- `<this-commit>` docs(100-03): SUMMARY — full-bleed shipped, stream is now flex-1 of single column (+ ROADMAP flip)

## Notes for 100-04

- **Layout contract:** root wrapper is `relative flex h-full w-full flex-col bg-surface-base`; stream wrapper is `relative flex-1 min-h-0 overflow-hidden bg-black pb-9`. 100-04 adds the bottom action-bar as `absolute inset-x-0 bottom-0 z-20 h-9` overlay (Plan A locked). The `pb-9` reservation is unit-test-guarded — do NOT remove.
- **WebAppAgentPanel lift source:** `pre_100_03_sha = 688887fd66dec645f3eb314d40eb7555181ee671`. To recover the deleted body for `<WebAppChatDrawer>`:
  ```bash
  git show 688887fd66dec645f3eb314d40eb7555181ee671:livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx
  ```
  The relevant block is the inline `WebAppAgentPanel` function (lines ~555-635 of that revision) plus its props interface, plus the supporting state declarations (`composerValue`, `setComposerValue`, `composerDisabled`, `onSend`, `onStop`, `agent`, `mode`, `setMode`, `handleModeChange`, `armPrivacyWarningOnce`). 100-04 will reconstitute these inside the new drawer host.
- **WebAppSkillsSidebar lift source:** same `pre_100_03_sha`. Sidebar render site (`<WebAppSkillsSidebar webappId={...} onSelectSkill={...} collapsed={...} onToggleCollapsed={...} />`) and its `sidebarCollapsed` / `setSidebarCollapsed` / `selectedSkillId` / `setSelectedSkillId` state are at lines ~478-485 + ~209-210 of that revision. The skills sidebar component file itself (`livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx`) was NOT touched — still on disk and importable.
- **Mode selector lift source:** `WebAppModeSelector` import block + render site at the same `pre_100_03_sha`. The component file (`webapp-mode-selector.tsx`) is also still on disk; D-locked option (a) per CONTEXT G-100-C C1 is to keep it as a constants module — 100-04 may delete the file or repurpose it. Type import `type {WebAppMode}` is preserved in the current file to ease the lift.
- **Keysym constants:** `KEY_ALT_LEFT` (`0xffe9`), `KEY_ARROW_LEFT` (`0xff51`), `KEY_ARROW_RIGHT` (`0xff53`), `KEY_F5` (`0xffc2`) are kept in webapp-stream-window.tsx for 100-04 to lift back/forward/refresh chord wiring into a drawer. They're unused at HEAD but documented as "preserved for 100-04 lift" via the inline comment.
- **Spawn lifecycle:** byte-identical to pre-100-03 — 100-04 must NOT touch lines 75-152 of the post-100-03 file (the `webappListQuery` + spawn mutation block + `spawnedForRef` + `closeMutationRef` + `triggerSpawn` + the two `useEffect` blocks for spawn/cleanup).
- **Multi-stream input-routing bug (out of scope per orchestrator):** 100-04 also does not address the "input clicks always route to last-opened wid" gap reported in 100-02 SUMMARY. That is queued for Plan 100-06.

## key-files.created

- `.planning/phases/100-multi-stream-window-redesign/100-03-SUMMARY.md` (this file)

## key-files.modified

- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (slim down — 776 → 524 lines)
- `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` (invariant flip — 7 removed, 4 added)

## key-files.deleted

- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` (URL bar + back/forward/refresh chord — 125 lines)

## Self-Check: PASSED

- `pre_100_03_sha = 688887fd66dec645f3eb314d40eb7555181ee671` — verified non-empty + contains `WebAppAgentPanel` (5 occurrences) at that SHA. ✓
- All 9 acceptance grep checks pass. ✓
- 13/13 webapp-stream-window.unit tests pass. ✓
- Wider window module suite clean. ✓
- Pre-existing failures in 10 unrelated test files are scope-isolated (docker store, sidebar density, playwright) and documented above. ✓
- `npx tsc --noEmit` clean for ui-package files (livinityd pre-existing errors not introduced by this plan). ✓
- `npx vite build` PASS. ✓
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-identical at HEAD across all 100-03 commits (verified pre AND post each commit; husky `.husky/pre-commit` hook from 100-01 enforced). ✓
- No `--no-verify` used. ✓
