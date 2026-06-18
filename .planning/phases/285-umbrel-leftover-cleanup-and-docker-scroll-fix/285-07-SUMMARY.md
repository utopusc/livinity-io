---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 07
subsystem: ui-files-backups
status: complete
tags: [ui, files, backups, windowed-files, strategy-b, dialog-trigger, item-1b]
requires: []
provides:
  - "Windowed Files auto-opens the rewind/format-drive dialog from an initialRoute launch suffix (no browser-URL dependency)"
  - "The 3 backups deep-links open Files as a LivOS window instead of navigating the full-page /files route"
affects:
  - livos/packages/ui/src/features/files/components/dialogs/format-drive-dialog/index.tsx
  - livos/packages/ui/src/modules/window/app-contents/files-content.tsx
  - livos/packages/ui/src/features/backups/components/setup-wizard.tsx
  - livos/packages/ui/src/features/backups/components/restore-wizard.tsx
  - livos/packages/ui/src/routes/settings/mobile/backups-mobile-drawer.tsx
tech-stack:
  added: []
  patterns: ["mount-only one-shot launch-suffix parser", "allow-list-validated dialog name", "prop-driven dialog open without browser-URL write", "windowManager.openWindow('LIVINITY_files', …)"]
key-files:
  created: []
  modified:
    - livos/packages/ui/src/features/files/components/dialogs/format-drive-dialog/index.tsx
    - livos/packages/ui/src/modules/window/app-contents/files-content.tsx
    - livos/packages/ui/src/features/backups/components/setup-wizard.tsx
    - livos/packages/ui/src/features/backups/components/restore-wizard.tsx
    - livos/packages/ui/src/routes/settings/mobile/backups-mobile-drawer.tsx
decisions:
  - "Strategy B (LOCKED): the windowed Files surface uses an in-memory WindowRouterProvider invisible to useSearchParams, so the existing ?dialog=/?rewind= auto-open mechanisms never fire. Parse the suffix off initialRoute ONCE on mount and trigger the dialog programmatically instead."
  - "InitialDialogTrigger is rendered INSIDE RewindOverlayProvider so useRewindOverlay() resolves; rewind via setRepoOpen(true), format via setForcedFormatDeviceId."
  - "FormatDriveDialog got additive forcedDeviceId + onForcedClose props (default-empty signature = {} so existing zero-arg callers are unaffected). open = dialogProps.open || Boolean(forcedDeviceId); deviceId = forcedDeviceId ?? urlParams.get('deviceId'); self-gates `if (!drive) return null`."
  - "restore-wizard.tsx Trans-slot <Link> replaced with <a role='button' className='underline cursor-pointer' onClick> (an <a>, NOT a <button>, NO href) to preserve the inline-anchor slot."
  - "Full-page /files route NOT removed here — that is Plan 06 (later wave). Repointing to openWindow is safe while the route still exists."
  - "Operator approved the human-verify checkpoint after an orchestrator spot-read confirmed the wiring + security invariants (no browser-URL write, allow-list, opaque deviceId)."
metrics:
  duration: ~9m
  completed: 2026-06-18
  tasks-completed: 4
  tasks-total: 4
---

# Phase 285 Plan 07: Backups deep-links → windowed Files + programmatic dialog trigger (Item 1b, Strategy B) — Summary

Implemented the LOCKED Strategy B for the 3 backups deep-links so the windowed Files surface auto-opens the rewind / format-drive dialog without depending on the browser URL, then repointed the 3 deep-links from the (Plan-06-doomed) full-page `/files` route to `windowManager.openWindow('LIVINITY_files', …)`. This closes the one genuinely-coupled risk RESEARCH flagged: the in-memory `WindowRouterProvider` is invisible to `useSearchParams`, so a naive repoint would open the window but the dialog would never fire.

## What Changed

**Task 1 — `format-drive-dialog/index.tsx`** (`f4e48823`): additive `forcedDeviceId?: string | null` + `onForcedClose?: () => void` props (default-empty `= {}`). `open = dialogProps.open || Boolean(forcedDeviceId)`; `deviceId = forcedDeviceId ?? urlParams.get('deviceId')`; self-gates `if (!drive || drive.isFormatting) return null`. Legacy browser-URL path untouched.

**Task 2 — `files-content.tsx`** (`c40fec6d`): splits the launch suffix off `initialRoute` on the first `?` BEFORE deriving `filesPath` (so the in-memory router never sees `?…`). Allow-list `ALLOWED_DIALOGS = ['files-format-drive']`; `wantRewind` only on exact `rewind === 'open'`; `deviceId` opaque. New `InitialDialogTrigger` child (rendered under `RewindOverlayProvider`) fires a mount-only effect → `setRepoOpen(true)` for rewind else `onFormat(formatDeviceId)`. `FilesWindowRouter` holds `forcedFormatDeviceId` state and passes `forcedDeviceId` + `onForcedClose` to `<FormatDriveDialog/>`.

**Task 3 — the 3 backups deep-links** (`c47b8f39`):
- `setup-wizard.tsx:588` → `openFilesWindow('/files/Home?dialog=files-format-drive&deviceId=${disk.id}')` (helper wraps `windowManager.openWindow`, navigate fallback).
- `backups-mobile-drawer.tsx:87` → `openFilesWindow('/files/Home?rewind=open')` (keeps `preventScrollReset` on fallback).
- `restore-wizard.tsx:764` → the `<Trans>`-slot `<Link to='/files?rewind=open'>` replaced with `<a role='button' className='underline cursor-pointer' onClick={openRewind} key='rewind'/>` (preserves the single inline-anchor slot; translated text unchanged).

## Verification Gates — ALL PASS

```
pnpm --filter ui build  -> exit 0 after every task (4 runs; final "built in 30.37s")
ALLOWED_DIALOGS = ['files-format-drive']                       -> present (allow-list)
no browser-URL write in new/changed code
  grep "setSearchParams|window.history|location.search =|window.location.href ="  -> 0
  (the one window.history.replaceState in setup-wizard:456 is PRE-EXISTING, not in this diff)
no eval / no suffix-driven dynamic import / no dangerouslySetInnerHTML            -> confirmed
restore-wizard: <a> (1), role='button' (1), stray <Link> -> 0
```

**Orchestrator spot-read (operator-approved checkpoint):** Confirmed `InitialDialogTrigger` is rendered INSIDE `RewindOverlayProvider` (files-content.tsx:164-169) so `useRewindOverlay()` resolves; `setForcedFormatDeviceId` flows to `<FormatDriveDialog forcedDeviceId=… onForcedClose=…/>` (lines 234-237); and `format-drive-dialog` opens on `forcedDeviceId`, resolves the drive via `disks.find`, and self-gates `if (!drive) return null` (an invalid opaque deviceId renders nothing). Both halves wire together correctly.

## Threat Model (T-285-08 / T-285-09)

The only new code-execution surface is the `initialRoute` suffix parse. Mitigated: dialog name validated against a fixed allow-list; `deviceId` is an opaque string consumed only by `FormatDriveDialog` (which self-gates on a real drive); no eval, no dynamic import from the suffix, no DOM injection, no browser-URL write. `initialRoute` is internally constructed (not attacker-supplied free text). Residual risk: negligible.

## Deviations from Plan

None. Strategy B implemented exactly as locked.

## Known Stubs

None.

## How To Verify Live (post-deploy / localhost:3000)

1. Backups setup → external storage → click a disk that requires format → a Files WINDOW opens AND the Format Drive dialog auto-appears; browser URL does NOT change to /files.
2. Restore flow warning step → click the underlined "rewind" link → Files window opens + Rewind overlay auto-opens; URL unchanged.
3. Mobile backups drawer → rewind item → Files window opens + Rewind auto-opens; URL unchanged.

## Commits

- `f4e48823` — feat(285-07): add prop-driven open path to FormatDriveDialog (forcedDeviceId)
- `c40fec6d` — feat(285-07): parse initialRoute launch suffix in FilesWindowContent (Strategy B)
- `c47b8f39` — feat(285-07): repoint 3 backups deep-links to openWindow

## Self-Check: PASSED

- All 5 files modified on disk: FOUND
- Commits f4e48823 / c40fec6d / c47b8f39: FOUND
- `pnpm --filter ui build` exit 0: PASS
- InitialDialogTrigger scoped under RewindOverlayProvider + format/rewind wiring: VERIFIED (orchestrator spot-read)
- No browser-URL write / allow-list present: PASS
