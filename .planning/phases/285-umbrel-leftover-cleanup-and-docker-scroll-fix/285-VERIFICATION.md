---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
status: passed
verdict: PHASE GOAL ACHIEVED
score: 5/5 must-haves verified
verified: 2026-06-18
method: goal-backward (independent gsd-verifier + orchestrator phase-wide gates)
---

# Phase 285 — Verification (goal-backward)

**Verdict: PHASE GOAL ACHIEVED.** All 5 work items delivered (Items 2 and 4 partial BY OPERATOR DESIGN — both narrowings were the correct call). MUST-NOT-BREAK consumers preserved (Phase-276 trap avoided).

## Phase-wide gates (orchestrator, 2026-06-18)
- `pnpm --filter ui build` → exit 0
- livinityd `tsc --noEmit` → 305 errors (exactly the pre-existing baseline — ZERO new errors)
- `dock.test.tsx` → 9/9 pass

## Per-item verdicts

### Item 1 — Files redirect → Option A: **PASS**
- `features/files/routes.tsx` + `features/files/index.tsx` (FilesLayout) DELETED.
- `router.tsx` — zero `filesRoutes` import/spread (removal comment ~line 146).
- `components/apple-spotlight.tsx` + `components/cmdk.tsx` — 4× `openWindow('LIVINITY_files', …)` each (Files/Recents/Apps/Trash) with `navigate` fallback; apple-spotlight added `useWindowManagerOptional()`.
- 3 backups deep-links (`setup-wizard.tsx`, `restore-wizard.tsx`, `backups-mobile-drawer.tsx`) repointed to `openWindow`/`openFilesWindow`.
- KEPT: `FilesWindowContent` intact incl. Strategy B (`ALLOWED_DIALOGS`, `InitialDialogTrigger`, `forcedFormatDeviceId`); `apps.tsx:51 systemAppTo:'/files/Home'`; `system-windowed-routes.ts LIVINITY_files`; shared `features/files/components/sidebar/`.

### Item 2 — Umbrel icons → LivOS: **PASS (partial by operator design)**
- Devices/Schedules/mobile Files/Settings/Server repointed to PRE-EXISTING LivOS SVGs with `?v=285`.
- 8 always-orphan Umbrel PNGs gone (0 source imports); `dock-settings.png` + `dock-files.png` deleted.
- **Item 2b (3 new tiles) CANCELLED — operator rejected the redesign; original `dock-home/live-usage/app-store.png` KEPT (commit `80e1b818`).** `dock.test.tsx` mock consistent (Devices→new SVG; Live-Usage/App-Store→original PNG). No dangling import.

### Item 3 — Time Machine notice: **PASS**
- 0 refs to `migrateBackThatMacUpPort` / `migrated-back-that-mac-up` / `getMigratedBackThatMacUpContent` in livinityd or UI.
- MUST-NOT-BREAK intact: generic notification render loop; `getBackupFailingContent` + `backups-failing` dispatch (11× in notifications.tsx); `livos-updated`; sibling migrations; real Time Machine i18n in `en.json`.

### Item 4 — install comments + orphan dirs: **PASS (partial by design)**
- 0 `umbrel` comment tokens in the 3 install scripts.
- **`setup_docker_prerequisites()` correctly KEPT** (install.sh:408) — research Open-Q3 was INVERTED; `/opt/livos/data/app-data` is the LIVE per-app data root (`app.ts:74`, `apps.ts:273`). Removing it would have been a Phase-276-class regression; the executor's drift-defense gate caught it (operator chose Option B).
- LIVE Umbrel-compat code (`apps/app.ts` umbrel-app.yml, `apps/apps.ts` UMBREL_ROOT) untouched.

### Item 5 — Docker scroll: **PASS**
- `container-section.tsx:401` → `overflow-x-hidden overflow-y-auto` (the `overflow-hidden` clip gone).

## Human-verify (live runtime confirmation, post-deploy)
- Docker containers list scrolls (operator approved the diff at checkpoint).
- The 3 backups deep-links open windowed Files AND auto-open their dialog (operator approved after orchestrator spot-read).
- Files opens as a window with no `/files` URL change.

## PHASE GOAL ACHIEVED
