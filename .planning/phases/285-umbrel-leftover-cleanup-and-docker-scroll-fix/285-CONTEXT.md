# Phase 285 — CONTEXT (investigation findings + locked operator decisions, pre-plan)

> Written 2026-06-18 from two read-only investigation workflows (5 agents + a docker-scroll agent),
> all file:line spot-verified against `master`. Feed this to the researcher/planner so it BUILDS ON this.
> The operator wants ALL remaining Umbrel-heritage cruft GONE ("Umbrel ile ilgili bir şey görmek
> istemiyorum, kendi ikonlarımız var zaten"). **Verify each file:line before editing — they were accurate
> on 2026-06-18 but line numbers drift.**

## Recent context (so the planner doesn't re-derive)
- Phase 276 just shipped (master) + released v44.40, then a regression hotfix **v44.41** (`4356b30a`):
  v44.40 left `legacy-compat/docker-compose.yml` networks-only, but **`docker compose up` does NOT create a
  top-level network with zero services** → `livinity_main_network` wasn't created → all apps failed.
  Fix = `appEnvironment('up')` now runs idempotent `docker network create --subnet 10.21.0.0/16
  livinity_main_network` before the compose up. Box is on v44.41 and HEALTHY (operator confirmed).
- **LESSON (apply to this phase):** never assume "removing X is harmless" — verify the live consumers first
  (the Phase-276 trap). Each item below lists its load-bearing "MUST NOT BREAK".

## Phase boundary — 6 work items (all operator-approved)

### Item 1 — Files app `/files/Home` redirect → **DECISION: Option A** (remove URL redirect, KEEP a windowed Files)
Operator: clicking "Files" must NOT change the browser URL to `https://{user}.livinity.io/files/Home` and must
not show the full-page Umbrel layout; Files should open as a LivOS **window** instead (no URL change). The
Files UI is umbrelOS's file-manager shipped verbatim. Pure client-side React (no livinityd route / no Caddy).
**Two surfaces share the layout** — a full-page route (the URL change) AND a windowed surface (dock already
uses this). Option A = remove the full-page route mount + repoint every launch entry to the window manager;
KEEP `FilesWindowContent` (the windowed Files) as-is.
- `livos/packages/ui/src/providers/apps.tsx:46-52` — Files registration `LIVINITY_files`, `systemAppTo:'/files/Home'` (the redirect target).
- `livos/packages/ui/src/features/files/routes.tsx:21-24` — the index redirect `<Navigate to="/files/Home" replace/>` (block 14-53).
- `livos/packages/ui/src/router.tsx:147` — where the full-page `/files` route is MOUNTED (spread `filesRoutes` in SheetLayout) = the actual browser-URL change. **Comment 148-167 documents Settings was ALREADY removed from this SheetLayout per a prior operator request ("livos un yonlendirme yapmasini istemiyorum") — mirror that pattern.** ⚠️ Line 167 explicitly PRESERVED `/files` "OwnCloud daily driver depends on URL deep-linking" — see MUST-NOT-BREAK.
- `livos/packages/ui/src/features/files/index.tsx:30-121` — `FilesLayout` (full-page 3-col layout the operator does NOT want).
- `livos/packages/ui/src/features/files/components/sidebar/index.tsx:26-125` — the Umbrel sidebar (Home/Recents/Apps/Favorites/Shares/External/Storage/Trash). Shared by BOTH surfaces.
- `livos/packages/ui/src/modules/window/app-contents/files-content.tsx:42-181` — `FilesWindowContent` (the WINDOWED surface; KEEP). Registered `window-content.tsx:217-218` case `LIVINITY_files`.
- Launch entries to repoint from `navigate('/files/Home')` → `windowManager.openWindow('LIVINITY_files', …)`:
  `apple-spotlight.tsx:278-292` (LIVE palette — Files + a Recents entry), `mobile-tab-bar.tsx:7` (mobile bottom tab), `cmdk.tsx:161-163` (dead/Docker-only palette — update for consistency).
  `dock.tsx:261-284` ALREADY opens a window (uses `onOpenWindow`) — unaffected by the redirect removal.
- `system-windowed-routes.ts:6` — `WINDOWED_SYSTEM_ROUTES.LIVINITY_files = '/files/Home'` (handed to FilesWindowContent; keep, change in lock-step if path changes).
- **MUST NOT BREAK (load-bearing /files/Home deep-links — Option A must re-point these at windowed Files, not 404):**
  - OwnCloud daily-driver URL deep-linking (router.tsx:167 note) — confirm whether still needed; if yes the windowed Files must accept the same deep path.
  - Backups: `backups/setup-wizard.tsx:588`, `backups-mobile-drawer.tsx:87` deep-link `/files/Home` with dialog + rewind query params.
  - `desktop-folder.tsx:96-99` opens folders as Files windows at `/files/Home/NAME`; launchpad folder/Downloads shortcuts.
  - `dock.tsx:264` open-dot keys on `pathname.startsWith('/files')`.
  - `dock.test.tsx` asserts `/files` behavior — update tests in lock-step.
- **Risk: HIGH coupling.** Must handle the full-page route AND every launch entry AND the deep-links together, or the old layout reappears from a missed path. (OPEN-Q for planner: is OwnCloud deep-linking still in use? If not, simpler.)

### Item 2 — Umbrel dock/system icons → **DECISION: REMOVE all Umbrel icons, use LivOS icons**
Operator: "Kaldır, kendi ikonlarımız var zaten, Umbrel ile ilgili bir şey görmek istemiyorum." The original
umbrelOS app-tile PNGs live in `livos/packages/ui/public/figma-exports/`. A partial migration already shipped
(`9e113633` added LivOS-authored `dock-files-new.svg`, `dock-settings-new.svg`; `dock-server.svg`,
`dock-terminal.svg`, `dock-ai-chat.svg` also exist). **Live Umbrel PNGs still referenced (repoint each):**
- `modules/mobile/mobile-tab-bar.tsx:7` — Files tab → still `dock-files.png` → repoint to existing `dock-files-new.svg` (desktop already uses it). ONE LINE, no new art, safe.
- `mobile-tab-bar.tsx:8` + `:11` — mobile Settings + Server tabs → `dock-settings.png` → use existing `dock-settings-new.svg` / `dock-server.svg`.
- `providers/apps.tsx:99` (Devices `LIVINITY_my-devices`) + `:107` (Schedules) → `dock-settings.png` → `dock-settings-new.svg`.
- `providers/apps.tsx:42` (Home) → `dock-home.png`; `:63` (Live Usage) → `dock-live-usage.png`; `:72` (App Store) → `dock-app-store.png`.
- ⚠️ **ICON GAP (planner must resolve):** there is **NO existing LivOS SVG** for Home / Live Usage / App Store
  (only Files/Settings/Server/Terminal/AI have LivOS SVGs). Inventory of LivOS-authored SVGs in figma-exports:
  `dock-files-new.svg, dock-settings-new.svg, dock-server.svg, dock-terminal.svg, dock-ai-chat.svg, liv-ai.svg,
  livinity-app.svg, system-docker.svg, system-generic-device.svg, system-pi.svg, app-icon-placeholder.svg,
  system-widget-{cpu,memory,storage,temperature}.svg`. Options for Home/Live-Usage/App-Store: (a) author 3
  simple LivOS-consistent SVG tiles matching the `dock-files-new.svg` style (operator explicitly asked to
  remove Umbrel + said no mockup ceremony → this is now operator-directed, overriding the older
  [[feedback-adaptive-icon-tiles-rejected]] "no unsolicited redesign" note — but still show the operator the
  result), or (b) reuse a fitting existing LivOS asset. Planner: pick (a) minimal tiles unless operator says
  otherwise; DO NOT ship Umbrel art.
- **Orphan Umbrel PNGs (ZERO importers, confirmed via grep) — delete:** `dock-chrome.png, dock-preview.png,
  dock-widgets.png, app-facebook.png, app-gmail.png, app-whatsapp.png, app-youtube.png`. (Also likely-dead but
  verify: `dock-remote-desktop.png`, the `migrate-*`/`system-livinity-home.png` are LivOS — keep.)
- **MUST NOT BREAK:** keep public path strings stable OR update ALL consumers in lock-step — `providers/apps.tsx`,
  `modules/mobile/mobile-tab-bar.tsx`, AND the hard-coded icon-path string assertions in
  `modules/desktop/dock.test.tsx` (~lines 58-69 and ~218). Cache-bust new/changed icons with a `?v=` suffix
  (codebase already does this for `dock-ai-chat.svg`). KEEP generic file-type thumbnails
  (`features/files/.../file-items-thumbnails/*.svg`) — unbranded, not Umbrel.

### Item 3 — "Back That Mac Up" / Time Machine notice (operator sees it "in Ctrl+K") → **DECISION: REMOVE** (operator does NOT run the legacy app → safe)
⚠️ **It is NOT a command-palette item.** It's a livinityd notification (ID `migrated-back-that-mac-up`)
rendered as a global `<AlertDialog>` overlay mounted at the router root, which paints over the whole desktop
INCLUDING an open Ctrl+K spotlight (operator conflated the overlay with the palette). `apple-spotlight.tsx`
contains NO Time Machine content.
- ORIGIN/trigger: `livos/packages/livinityd/source/modules/startup-migrations/index.ts:117-137`
  (`migrateBackThatMacUpPort()`) — on boot, IF the legacy `back-that-mac-up` app is installed and its compose
  port isn't already `1445:445`, rewrites the Samba port and calls `notifications.add('migrated-back-that-mac-up')`
  (line 136). Invoked from `start()` at `:179-184`.
- UI string: `livos/packages/ui/src/routes/notifications.tsx:154-160` (`getMigratedBackThatMacUpContent()`),
  dispatched `:215-217`, rendered as `<AlertDialog>` `:223-245`. Mounted at `router.tsx:80` (`<Notifications/>`).
- **Removal (do BOTH):** (A) delete the `migrateBackThatMacUpPort()` call from `start()` (and the method); (B)
  delete `getMigratedBackThatMacUpContent()` + its dispatch branch. Update the test that asserts it:
  `startup-migrations.integration.test.ts:86-87`. Already-affected boxes keep the persisted ID until the
  operator clicks OK once (or a one-time `notifications.clear('migrated-back-that-mac-up')`).
- **MUST NOT BREAK:** do NOT remove `<Notifications/>` or the notifications tRPC routes — shared by the live
  `backups-failing[:repoId]` notices (`backups.ts:152/527`) and `livos-updated`. Keep `getBackupFailingContent`,
  the backups query, and the `livos-updated` auto-clear (notifications.tsx:191-198). Do NOT touch the legitimate
  Time Machine i18n strings (`locales/en.json:537-542`) + `macos-instructions.tsx` — they power the real Files
  Shared-Folder share dialog and must stay.
- **Note (Phase-276 trap, resolved):** the `445→1445` remap protects against a Samba collision IF the legacy
  app is installed — operator confirmed they do NOT run it, so removal is safe.

### Item 4 — Umbrel references in install scripts → **DECISION: remove** (all comment-only, harmless)
After Phase 276, every surviving "Umbrel" token in the install scripts is a COMMENT documenting the removal —
NO live `getumbrel/*` pulls, no `umbrel-apps` clone, no umbrel icon URLs. Comment-only hits:
`livos/install.sh:408-411`, `livos/install.sh:1757-1758`, `scripts/install/deploy-livinityd.sh:771-775`,
`scripts/install/__tests__/test-deploy-livinityd.sh:943-947` and `:985-986`. Deleting them changes no behavior
(operator may alternatively keep them for traceability — operator chose remove).
- **Separate near-dead remnant (judgment call):** `livos/install.sh` `setup_docker_prerequisites()` (~413-429,
  called ~1818) still `mkdir`s `data/tor/data` ("mounted by tor_proxy") + `data/app-data` ("mounted by auth")
  and chowns `1000:1000` — orphaned (those services are gone) but harmless (creates 2 empty dirs). It is a LIVE
  code path (not a comment), so treat removal as a deliberate, separate change; confirm nothing downstream
  expects those dirs before removing.

### Item 5 — Docker containers section won't scroll → **DECISION: fix** (CSS, low risk)
- `livos/packages/ui/src/routes/docker/resources/container-section.tsx:401` — the desktop table-container div
  has `overflow-hidden` but NO `flex-1`/`min-h-0`/`overflow-y-auto` → classic flexbox scroll-clipping (a flex
  child won't shrink below content height without `min-h-0`). Parent at `docker-app.tsx:51` is already
  `min-h-0 flex-1 overflow-auto`; wrapper at `container-section.tsx:234` is `flex h-full flex-col overflow-y-auto`.
- **Fix:** add `flex flex-col min-h-0` (or `overflow-y-auto flex-1`) to the table container at line 401.
  ⚠️ The planner/executor MUST re-read the actual hierarchy (container-section.tsx + docker-app.tsx) and verify
  the fix scrolls without breaking width/mobile (mobile path at ~line 318 uses `space-y-2`, scrolls at parent).
  CSS-only, no logic. (Diagnosed by a dedicated agent; HIGH confidence but verify live in the UI build.)

## Constraints / sequencing
- Box deploy is release-based (tag → `update.sh`); livinityd runs via **tsx** (no build); the box UI is **vite-built** (a dangling import FAILS `pnpm --filter ui build` — that build is the key gate for UI deletions).
- **Verification per item:** `cd livos && pnpm --filter ui build` (exit 0, catches dangling imports/route errors) + `pnpm --filter livinityd exec tsc --noEmit` (livinityd has a ~305-error pre-existing baseline — require ZERO NEW errors in touched files; capture baseline first). The livinityd integration suite needs Linux D-Bus — a `livos-itest` WSL distro exists (node22/pnpm/docker/dbus + a `/opt/livos` deploy) for Linux test runs; Windows can't run it.
- Suggested order (safe-first): (1) Item 5 scroll fix; (2) Item 2 mobile Files icon repoint + orphan-PNG delete; (3) Item 4 comment cleanup; (4) Item 3 Time Machine notice removal (+ test update); (5) Item 2 the Home/Live-Usage/App-Store icon gap (new tiles — show operator); (6) Item 1 Files redirect (HIGH coupling — do last, re-point all deep-links in lock-step). Use small atomic commits; UI-build + tsc gate each.

## Operator decisions LOCKED (do not re-litigate)
- Files = **Option A** (remove URL redirect, keep windowed Files).
- Icons = **remove all Umbrel, use LivOS** (repoint existing; for Home/Live-Usage/App-Store author minimal LivOS tiles — no Umbrel, show operator the result).
- Time Machine notice = **remove** (legacy app not used → safe).
- Install Umbrel comments = **remove**.
- Docker scroll = **fix**.

## Open questions for the planner / operator
1. Files Item 1: is OwnCloud URL deep-linking still actually used (router.tsx:167)? If not, simpler; if yes, windowed Files must accept the deep path so backups/OwnCloud/folder deep-links don't 404.
2. Icon gap: author 3 new LivOS tiles for Home/Live Usage/App Store (recommended, minimal, show operator) — confirm acceptable since the older note rejected unsolicited icon redesigns (this is now operator-directed Umbrel removal).
3. Item 4: also remove the orphaned `setup_docker_prerequisites()` dir-creation, or leave it (harmless)?
