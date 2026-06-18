# Phase 285 — Research (file:line re-verification + open-question resolution)

**Researched:** 2026-06-18
**Domain:** Internal codebase cleanup (LivOS UI `livos/packages/ui` + livinityd `livos/packages/livinityd` + install scripts). NOT a web-research phase.
**Confidence:** HIGH (every claim below is grep/read-verified against current `master`; tsc baseline run live)

> This RESEARCH builds on `285-CONTEXT.md`. It does NOT re-derive the boundary — it (a) re-verifies every file:line (line numbers drifted), (b) gives DEFINITIVE answers to the 3 open questions, (c) surfaces consumers CONTEXT.md missed, and (d) gives the planner an atomic-commit + lock-step-test breakdown. Operator decisions in CONTEXT are LOCKED — not re-litigated.

---

<user_constraints>
## User Constraints (from 285-CONTEXT.md)

### Locked Decisions (do NOT re-litigate)
- **Files (Item 1) = Option A** — remove the full-page `/files` URL redirect/route; KEEP windowed Files (`FilesWindowContent`). Clicking Files must NOT change the browser URL; it opens as a LivOS window.
- **Icons (Item 2) = remove ALL Umbrel art, use LivOS** — repoint existing PNGs to existing LivOS SVGs; for Home / Live Usage / App Store author minimal LivOS tiles (no Umbrel art; show operator the result).
- **Time Machine notice (Item 3) = remove** — legacy `back-that-mac-up` app not used by operator → safe.
- **Install Umbrel comments (Item 4) = remove** (comment-only, harmless).
- **Docker scroll (Item 5) = fix** (CSS-only).

### Claude's Discretion
- Icon-tile authoring approach for the 3 missing tiles (recommended: option (a) minimal LivOS-consistent SVGs matching `dock-files-new.svg` style — see Item 2 asset analysis).
- Whether to simplify the now-dead `pathname.startsWith('/files')` branch in `dock.tsx:265` after the route removal (harmless either way).
- Whether to remove the orphaned `setup_docker_prerequisites()` dir-creation (Open Q3 — research says SAFE; operator pre-approved "remove").

### Deferred Ideas (OUT OF SCOPE)
- CF-SaaS custom-hostnames rework (separate future phase).
- Touching the LIVE `umbrel-app.yml` / `${UMBREL_ROOT}` third-party-app compatibility code paths (see Item 4 — these are functional, NOT cruft, MUST NOT be removed).
</user_constraints>

<phase_requirements>
## Phase Requirements (6 work items from CONTEXT.md)

| ID | Description | Research Support |
|----|-------------|------------------|
| Item 1 | Remove full-page `/files` route; repoint launch entries + deep-links to windowed Files | §Item 1 — break list narrowed to 5 real consumers; backups deep-link URL-param caveat documented |
| Item 2 | Repoint live Umbrel PNGs to LivOS SVGs; author 3 new tiles; delete orphan PNGs | §Item 2 — full repoint map, asset analysis, orphan delete list (0-importer verified) |
| Item 3 | Remove "Back That Mac Up"/Time Machine notice (backend + UI + test) | §Item 3 — exact removal points; MUST-NOT-BREAK confirmed separate |
| Item 4 | Remove Umbrel comments in install scripts; (judgment) orphaned dir-creation | §Item 4 + Open Q3 — comment ranges confirmed; dir-removal SAFE |
| Item 5 | Fix Docker containers scroll (flexbox) | §Item 5 — flex chain confirmed; precise class change |
| Verify | Build/tsc gates + baselines | §Verification — ui build gate; tsc baseline = exactly 305 |
</phase_requirements>

---

## Summary

All 6 items are real and well-scoped. Line numbers drifted from CONTEXT but every cited construct still exists. The riskiest item is **Item 1 (Files redirect)** — but research dramatically NARROWS the blast radius CONTEXT feared: most "launch entries" CONTEXT listed already open Files as a window (or via mobile state) and do NOT break under Option A. The only consumers that genuinely break are the two command palettes and three backups deep-links.

**The one non-obvious trap in Item 1:** the three backups deep-links (`?dialog=files-format-drive`, `?rewind=open`) work by putting query params in the **browser URL**, which the format-drive / rewind dialogs read via react-router `useSearchParams`. The windowed Files surface uses an in-memory `WindowRouterProvider` that does **not** propagate to the browser URL or `useSearchParams`, so naively repointing those deep-links to `openWindow('LIVINITY_files', '/files/Home?rewind=open')` will open the window but the dialog will NOT auto-open. The planner must handle this (see Item 1 recommendations).

**Open questions — definitive answers:**
1. **OwnCloud `/files/Home` deep-linking is NOT a wired consumer.** The only "OwnCloud" reference in the entire codebase is the *developer comment* at `router.tsx:167` and a STYLE-GUIDE memory note. There is zero OwnCloud integration code that navigates to `/files`. The `/files` route can be removed cleanly (no OwnCloud 404 risk). The windowed Files DOES accept the same deep path (`FilesWindowContent` strips `/files` and decodes the rest).
2. **No existing LivOS SVG for Home / Live Usage / App Store** — confirmed. Author 3 new 120×120 gradient tiles matching `dock-files-new.svg` (structure documented).
3. **`setup_docker_prerequisites()` orphaned dirs are SAFE to remove** — `data/tor/data` + `data/app-data` (under `data/`) have zero downstream consumers; the only references are the `mkdir` lines themselves. (Distinct from the LIVE top-level `$LIVOS_DIR/app-data` per-app dir, which stays.)

**Primary recommendation:** Execute in the CONTEXT-suggested safe-first order, with Item 1 split into two commits (palette repoint = simple; backups deep-links = needs the URL-param decision). tsc baseline is exactly **305** errors; `startup-migrations/index.ts` (the only livinityd file touched) has **0** baseline errors so the gate is clean (≤305 total, 0 new in touched file).

---

## Item 1 — Files `/files/Home` redirect → Option A

### File:line re-verification

| CONTEXT.md citation | Status | Actual current location |
|---------------------|--------|--------------------------|
| `providers/apps.tsx:46-52` (Files reg) | MOVED | `apps.tsx:46-52` — `LIVINITY_files` block; `systemAppTo:'/files/Home'` at **:51** (CONFIRMED) |
| `features/files/routes.tsx:21-24` (index redirect) | CONFIRMED (form differs) | `routes.tsx:21-24` — `<Navigate to={\`${BASE_ROUTE_PATH}${HOME_PATH}\`} replace />` (constants-derived, not literal `/files/Home`). Export block = lines 14-53 |
| `router.tsx:147` (route mount) | CONFIRMED | `router.tsx:147` — `...filesRoutes` spread inside `SheetLayout` |
| `router.tsx:148-167` (Settings-removed precedent comment) | CONFIRMED | `router.tsx:148-168`; OwnCloud note at **:167** |
| `features/files/index.tsx:30-121` (FilesLayout) | NOT RE-READ (full-page layout; deleting the route makes it unreachable — see note) | exists |
| `features/files/components/sidebar/index.tsx:26-125` | CONFIRMED exists (shared by both surfaces — KEEP) | exists |
| `app-contents/files-content.tsx:42-181` (FilesWindowContent, KEEP) | CONFIRMED | `files-content.tsx:42` export; deep-path strip at **:45-48** |
| `window-content.tsx:217-218` (case LIVINITY_files) | CONFIRMED | `window-content.tsx:217-218` |
| `system-windowed-routes.ts:6` (LIVINITY_files = '/files/Home') | CONFIRMED | `system-windowed-routes.ts:6` |
| `apple-spotlight.tsx:278-292` | **MOVED (wrong dir)** | file is at `components/apple-spotlight.tsx` (NOT `modules/desktop/`). Files action at **:280-285**, Recents **:288-291**, Apps **:294-297**, Trash **:300-303** |
| `mobile-tab-bar.tsx:7` | CONFIRMED | `modules/mobile/mobile-tab-bar.tsx:7` |
| `cmdk.tsx:161-163` | CONFIRMED (file at `components/cmdk.tsx`) | Files navigate at **:163**; Recents :173, Apps :183, Trash :193 |
| `dock.tsx:261-284` (already windowed) | CONFIRMED | `dock.tsx:261-284`; open-dot `pathname.startsWith('/files')` at **:265** |
| `setup-wizard.tsx:588` deep-link | CONFIRMED | `features/backups/components/setup-wizard.tsx:588` |
| `backups-mobile-drawer.tsx:87` deep-link | CONFIRMED | `routes/settings/mobile/backups-mobile-drawer.tsx:87` |
| `desktop-folder.tsx:96-99` | CONFIRMED | `modules/desktop/desktop-folder.tsx:96-100` (`handleOpen`) |

### OPEN QUESTION 1 — DEFINITIVE ANSWER

**Is OwnCloud `/files/Home` deep-linking still in use? → NO. It is not a wired consumer; it is a stale developer comment.**

Evidence (grep `[Oo]wn[Cc]loud` across all of `livos/`):
- `livos/packages/ui/src/router.tsx:167` — `// /files PRESERVED — OwnCloud daily driver depends on URL deep-linking.` (a comment)
- `livos/packages/design-tokens/STYLE-GUIDE.md:145` — a memory-note reference to `feedback_minipc_is_owncloud_primary` (docs, not code)

There is **zero** OwnCloud integration code, no component, no link, no navigate target that depends on the browser being at `/files/Home`. **The full-page `/files` route can be removed cleanly with no OwnCloud 404 risk.** [VERIFIED: codebase grep]

**Does the windowed Files accept the same deep path?** YES. `FilesWindowContent` (`files-content.tsx:45-48`) does:
```ts
const raw = initialRoute.startsWith('/files')
  ? initialRoute.replace('/files', '') || HOME_PATH
  : initialRoute || HOME_PATH
const filesPath = decodeURIComponent(raw)
```
So `openWindow('LIVINITY_files', '/files/Home/SomeFolder', …)` opens the window at `/Home/SomeFolder`. Deep paths work. [VERIFIED: read]

### The COMPLETE break list (Option A) — NARROWER than CONTEXT feared

CONTEXT listed many "launch entries". Research shows **most already open Files as a window or via mobile state and do NOT break.** The actual breaks are only the browser-`navigate()`/`<Link>` consumers:

**SAFE — already windowed / state-driven (NO change needed for correctness):**
- `dock.tsx:262-281` — system pin uses `onOpenWindow` (`WINDOWED_SYSTEM_ROUTES`). [VERIFIED]
- `launchpad-grid.tsx:166-172` `openFilesAt()` + callers :276/:282/:288/:306 — all call `windowManager.openWindow('LIVINITY_files', …)`; `navigate()` only as a null-windowManager fallback. [VERIFIED]
- `desktop-folder.tsx:96-100` — `windowManager.openWindow('LIVINITY_files', …)`. [VERIFIED]
- `mobile-tab-bar.tsx:7` and `desktop-content.tsx:320` — pass `route` to `openApp()` (mobile-app-context, in-memory state) → `MobileAppRenderer` renders `<WindowAppContent appId initialRoute>` (`mobile-app-renderer.tsx:33`), the SAME windowed switch. They do NOT navigate the browser URL. **They do NOT break.** [VERIFIED]

**BREAK — browser `navigate()` / `<Link>` to the full-page route (MUST repoint):**
1. `components/apple-spotlight.tsx` (LIVE Search palette per MEMORY.md):
   - **:284** Files → `navigate(lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo)`
   - **:291** Recents → `navigate(\`/files${FILES_RECENTS_PATH}\`)`
   - **:297** Apps → `navigate(\`/files${FILES_APPS_PATH}\`)`
   - **:303** Trash → `navigate(\`/files${FILES_TRASH_PATH}\`)`
   - ⚠️ apple-spotlight does NOT currently import any window-manager hook (grep: zero `windowManager`/`openWindow`). Repointing requires adding `useWindowManagerOptional()`.
2. `components/cmdk.tsx` (dead/Docker-only palette per MEMORY.md — update for consistency):
   - **:163** Files, **:173** Recents, **:183** Apps, **:193** Trash — all `navigate(...)`.
3. Backups deep-links (URL-param-driven — see caveat below):
   - `setup-wizard.tsx:588` → `navigate('/files/Home?dialog=files-format-drive&deviceId=...')`
   - `backups-mobile-drawer.tsx:87` → `navigate('/files/Home?rewind=open', {preventScrollReset:true})`
   - `restore-wizard.tsx:764` → `<Link to='/files?rewind=open'>` **(NEW — CONTEXT.md missed this one)**

### ⚠️ CRITICAL CAVEAT — backups deep-links rely on the browser URL (`useSearchParams`)

The format-drive and rewind dialogs auto-open by reading query params from the **browser URL**:
- `format-drive-dialog/index.tsx:62` `useDialogOpenProps('files-format-drive')` → `utils/dialog.ts:44` `useQueryParams()` → react-router `useSearchParams` (browser URL). `deviceId` read at `index.tsx:82` via `urlParams.get('deviceId')`.
- `features/files/components/rewind/index.tsx:67-79` — `useSearchParams()` checks `rewind === 'open'`.

The windowed Files surface mounts under `WindowRouterProvider` (`providers/window-router.tsx`), which is **pure in-memory `useState` history — it does NOT touch the browser URL and is invisible to `useSearchParams`.** [VERIFIED: read window-router.tsx — no URL writes]

**Consequence:** `openWindow('LIVINITY_files', '/files/Home?rewind=open')` would store the query string inside the window route but the rewind/format dialog would NOT see it → dialog would NOT auto-open. The dialog COMPONENTS do render inside the windowed surface (`files-content.tsx:159` `<RewindOverlay/>`, `:175` `<FormatDriveDialog/>`) — they just aren't triggered.

**Planner options for the 3 backups deep-links (pick one):**
- **(A) Keep them as full-page `navigate()` for now** and only repoint the palettes. The full-page route still exists for these specific deep entries → BUT this contradicts "remove the route". Not recommended.
- **(B) (recommended) Open the window, then trigger the dialog programmatically** — give `FilesWindowContent` an optional initial-dialog signal (e.g. parse a `?dialog=`/`?rewind=` suffix off `initialRoute` once on mount and call `setRepoOpen(true)` / open format dialog). Small, contained change to `files-content.tsx`. Lets the route be fully removed.
- **(C) Re-point to the windowed Files without the dialog auto-open** (operator manually clicks Rewind/Format inside the window). Simplest; minor UX regression on those 3 deep-entry points. Acceptable only if operator confirms.

This is the single genuinely-coupled decision in the phase. Surface it to the operator in discuss/plan.

### Notes
- `dock.tsx:265` `pathname.startsWith('/files')` open-dot branch becomes dead after route removal (a windowed Files never sets `pathname` to `/files`), BUT the open-dot still works via `windowAppIds.has(pin.id)` at `dock.tsx:271`. Harmless; optionally simplify. [VERIFIED]
- `apps.tsx:51` `systemAppTo:'/files/Home'` and `system-windowed-routes.ts:6` should STAY — they feed the windowed `initialRoute`. Do not delete; only the full-page route mount (`router.tsx:147`) + the `filesRoutes` route tree + the `FilesLayout`/`Files` full-page wrapper become removable.
- `dock.test.tsx` asserts `systemAppTo: '/files/Home'` (line 58) and the default-pins set (line 267) — see Planner guidance for lock-step.

---

## Item 2 — Umbrel dock/system icons → remove all, use LivOS

### figma-exports inventory (verified `ls`)

**LivOS-authored SVGs present:** `dock-files-new.svg`, `dock-settings-new.svg`, `dock-server.svg`, `dock-terminal.svg`, `dock-ai-chat.svg`, `liv-ai.svg`, `livinity-app.svg`, `system-docker.svg`, `system-generic-device.svg`, `system-pi.svg`, `app-icon-placeholder.svg`, `system-widget-{cpu,memory,storage,temperature}.svg`, `livinity-home-certifications.svg`. (Matches CONTEXT.) [VERIFIED: ls]

### OPEN QUESTION 2 — DEFINITIVE ANSWER

**There is NO existing LivOS SVG for Home / Live Usage / App Store.** Confirmed against the full inventory — none of the LivOS SVGs map to those three. → Must author 3 new tiles. [VERIFIED]

### Live Umbrel PNG repoint map (grep-verified, exact current lines)

| PNG | apps.tsx | dock.test.tsx (mock) | mobile-tab-bar.tsx | Repoint target |
|-----|----------|----------------------|--------------------|----------------|
| `dock-home.png` | **:42** (Home) | — (NOT in test mock) | — | **NEW tile** |
| `dock-live-usage.png` | **:63** | **:60** | — | **NEW tile** |
| `dock-app-store.png` | **:72** | **:61** | — | **NEW tile** |
| `dock-settings.png` | **:99** (Devices), **:107** (Schedules) | **:63** (Devices) | **:8** (Settings), **:11** (Server) | existing `dock-settings-new.svg` / `dock-server.svg` |
| `dock-files.png` | — | — | **:7** | existing `dock-files-new.svg` (desktop already uses it) |

Notes:
- `apps.tsx:99` (Devices) + `:107` (Schedules) currently both reuse `dock-settings.png`; repoint to `dock-settings-new.svg`.
- `mobile-tab-bar.tsx:11` (Server) reuses `dock-settings.png`; repoint to `dock-server.svg` for consistency with desktop Server/Docker.
- **`dock.test.tsx` mock has NO `LIVINITY_home` entry** → changing `apps.tsx:42` (Home icon) needs NO test update. But `live-usage` (:60), `app-store` (:61), `my-devices` (:63) mock strings MUST update in lock-step with apps.tsx. [VERIFIED]
- Icons are read from `systemAppsKeyed` in `cmdk.tsx` (:140, :147) and `desktop-content.tsx:320-321` — these read the registry dynamically (no hard-coded strings), so they auto-pick-up the new icons (no edit needed there). [VERIFIED]

### Orphan-PNG delete list — ALL confirmed ZERO importers (grep across `ui/src`)

| PNG | Importers | Verdict |
|-----|-----------|---------|
| `dock-chrome.png` | 0 | DELETE |
| `dock-preview.png` | 0 | DELETE |
| `dock-widgets.png` | 0 | DELETE |
| `app-facebook.png` | 0 | DELETE |
| `app-gmail.png` | 0 | DELETE |
| `app-whatsapp.png` | 0 | DELETE |
| `app-youtube.png` | 0 | DELETE |
| `dock-remote-desktop.png` | 0 | **DELETE** (CONTEXT flagged "verify" → confirmed orphan, 1.34 MB) |
| `dock-home.png` | 1 (apps.tsx:42) → 0 after repoint | DELETE after Item 2 repoint |
| `dock-live-usage.png` | 2 → 0 after repoint | DELETE after repoint |
| `dock-app-store.png` | 2 → 0 after repoint | DELETE after repoint |
| `dock-settings.png` | 5 → 0 after repoint | DELETE after repoint |
| `dock-files.png` | 1 (mobile-tab-bar:7) → 0 after repoint | DELETE after repoint |

**KEEP (LivOS PNGs, have live importers):** `migrate-livinity-home-livinity-home.png` (migrate-image.tsx:5), `migrate-raspberrypi-livinity-home.png` (migrate-image.tsx:4), `system-livinity-home.png` (constants/index.ts:14), `livinity-home-device-info-grain.png`, `livinity-ios.png`, `docker-app-icon.png`. Also KEEP generic file-type thumbnails `features/files/.../file-items-thumbnails/*.svg` (unbranded). [VERIFIED]

### New-tile asset analysis — mimic `dock-files-new.svg`

`dock-files-new.svg` (609 bytes) structure to replicate for the 3 new tiles:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#f59e0b"/>     <!-- amber for Files -->
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="26" fill="url(#bg)"/>   <!-- the tile -->
  <path d="…" fill="white" fill-opacity="0.95"/>            <!-- centered glyph -->
  <path d="…" fill="white" fill-opacity="0.85"/>
</svg>
```
Design system (also confirmed in `dock-server.svg`):
- **viewBox** `0 0 120 120`; **tile** `<rect width=120 height=120 rx=26 fill=url(#bg)>`
- **bg** = 2-stop diagonal `linearGradient` (`x1=0 y1=0 x2=120 y2=120`)
- **glyph** centered, drawn within ~30–90 coordinate band, white or accent fills with `fill-opacity` layering
- Per-app gradient palette suggestion (planner's discretion): Home (e.g. blue `#3b82f6`→`#2563eb` with a house glyph), Live Usage (e.g. green `#22c55e`→`#16a34a` with a gauge/activity glyph), App Store (e.g. indigo/purple `#6366f1`→`#4f46e5` with a bag/grid glyph). Keep file sizes small (~0.5–1.5 KB) like the existing SVGs.

**Cache-bust:** the codebase appends `?v=` to changed icons (`apps.tsx:143` `dock-ai-chat.svg?v=chat_2026_06_02`). Add a `?v=285` suffix to the 5 repointed/new icon strings so cached browsers refetch. NOTE: if you cache-bust, the `?v=…` suffix becomes part of the literal string the `dock.test.tsx` mock must match (it already mirrors `?v=238_7` for liv-assistant at :69/:218). [VERIFIED]

---

## Item 3 — "Back That Mac Up" / Time Machine notice → remove

### File:line re-verification

| CONTEXT.md citation | Status | Actual current location |
|---------------------|--------|--------------------------|
| `startup-migrations/index.ts:117-137` (`migrateBackThatMacUpPort()`) | CONFIRMED | method = **lines 117-137**; `notifications.add('migrated-back-that-mac-up')` at **:136** |
| `startup-migrations/index.ts:179-184` (call site in `start()`) | CONFIRMED | try/catch block calling `migrateBackThatMacUpPort()` = **lines 179-184** |
| `notifications.tsx:154-160` (`getMigratedBackThatMacUpContent()`) | CONFIRMED | **lines 154-160** |
| `notifications.tsx:215-217` (dispatch branch) | CONFIRMED | `if (notification === 'migrated-back-that-mac-up') return getMigratedBackThatMacUpContent()` = **lines 215-217** |
| `notifications.tsx:223-245` (AlertDialog render) | CONFIRMED (but see note) | the GENERIC render loop for ALL notifications = **lines 223-245**. **Do NOT delete** — it renders every notification. Item 3 removes only the function (154-160) + dispatch branch (215-217). |
| `startup-migrations.integration.test.ts:86-87` | CONFIRMED + **WIDER** | the notification assertion is at **:86-87**, but the WHOLE test block `'Back That Mac Up app port is migrated from 445 to 1445'` spans **lines 43-88**. Since the method under test is being deleted, **delete the entire test (43-88)**, not just :86-87. **(NEW — CONTEXT under-scoped this.)** |

### MUST-NOT-BREAK — confirmed SEPARATE and untouched

- `<Notifications/>` component + the generic render loop (`notifications.tsx:223-245`) — shared by all notices. KEEP. [VERIFIED]
- `getBackupFailingContent` (`notifications.tsx:101-149`) + backups query (`:183-185`) + dispatch branch (`:203-212`) — KEEP. [VERIFIED]
- `livos-updated` auto-clear (`notifications.tsx:191-198`) — KEEP. [VERIFIED]
- `livos-updated` notification add in startup-migrations (`index.ts:200`) and `migrateDownloadsDirectory()` (`:139-150`) — SEPARATE migrations in the same `start()`; KEEP. The `start()` body keeps its other try/catch blocks (activateImportedDataDirectory :159-163, migrateLegacyData :166-170, migrateLegacyLinuxData :173-177, migrateDownloadsDirectory :187-191, version write :193-201). Only the back-that-mac-up block (:179-184) is removed. [VERIFIED]
- **The legitimate Time Machine i18n strings** `files-share.instructions.macos.time-machine.*` at `public/locales/en.json:537-542` — power the real Files Shared-Folder share dialog. KEEP (CONFIRMED at :537-542). `macos-instructions.tsx` references these keys (no string literals — grep for "Time Machine" returns 0 there) and is untouched. [VERIFIED]

### Notes
- `getMigratedBackThatMacUpContent()` description is a hard-coded English string in `notifications.tsx:158` (NOT an i18n key) — so deleting the function removes all of its copy; no en.json edit needed for Item 3. [VERIFIED]
- Already-affected boxes keep the persisted `migrated-back-that-mac-up` notification ID until OK is clicked once. After removal, an unknown ID falls through to `getDefaultNotificationContent` (`notifications.tsx:165-170`) → shows the raw ID string. To avoid that on already-affected boxes, a one-time `notifications.clear('migrated-back-that-mac-up')` is an option (CONTEXT noted). Operator confirmed not running the legacy app, so impact is near-zero.

---

## Item 4 — Umbrel references in install scripts → remove (comment-only)

### File:line re-verification (grep `-i umbrel`)

| CONTEXT.md citation | Status | Actual |
|---------------------|--------|--------|
| `install.sh:408-411` | CONFIRMED | comment block **408-411** (the removed docker-image pull/retag helper note) |
| `install.sh:1757-1758` | CONFIRMED | comment **1757-1758** |
| `deploy-livinityd.sh:771-775` | CONFIRMED | section divider :771 + Umbrel comment **772-775** |
| `test-deploy-livinityd.sh:943-947` | CONFIRMED | comment **943-947** |
| `test-deploy-livinityd.sh:985-986` | CONFIRMED | comment **985-986** |

All five are pure comments documenting the Phase 276 removal. Deleting them changes no behavior. [VERIFIED]

### ⚠️ LIVE Umbrel-compat code paths — MUST NOT TOUCH (NOT in scope)

A repo-wide `umbrel` grep surfaced FUNCTIONAL third-party-app compatibility code that is NOT cruft:
- `apps/app.ts:29,34` — `umbrel-app.yml` manifest fallback (Umbrel app-store manifest compatibility). KEEP.
- `apps/apps.ts:1944` — `${UMBREL_ROOT}` env-var replacement in third-party app compose files. KEEP.
- `apps/install-for-user-injection.test.ts:10,65` — tests the `${UMBREL_ROOT}` injection. KEEP.
- `legacy-compat/app-script.ts:27` — comment about the deleted auth-server (documents prior removal; harmless either way; leave to avoid churn).
- `components/cmdk.tsx:263` — comment "Umbrel-era leftovers" (in the dead palette; harmless).
- `routes/notifications.tsx:187` — comment "WhatsNewModal removed (Umbrel-leftover content)" (documents prior removal). KEEP.

These are deliberately OUT of Item 4 scope. [VERIFIED]

### OPEN QUESTION 3 — DEFINITIVE ANSWER

**Does anything downstream expect `data/tor/data` or `data/app-data` (under `data/`)? → NO. Safe to remove `setup_docker_prerequisites()` dir-creation.**

`setup_docker_prerequisites()` verified at `install.sh:413-429`; call site at `install.sh:1818`; flow-comment reference at `install.sh:1754`.

Evidence (grep `data/tor`, `tor/data`, `data/app-data` across all of `livos/`):
- The ONLY references to `data/tor/data` and `$data_dir/app-data` are the `mkdir`/`chown`/`ok` lines INSIDE `setup_docker_prerequisites()` (install.sh:419, 422, 425, 426, 428). Nothing else reads/mounts them. [VERIFIED]
- The legacy-compat tor/auth services that mounted these (`tor_proxy` → `/data`, `auth` → `/app-data`) were deleted in Phase 276. Grep `tor_proxy` / `/app-data` across all compose `*.yml` → **0 hits**. [VERIFIED]

**CRITICAL distinction — two different "app-data" paths (do not conflate):**
- ❌ orphaned: `$LIVOS_DIR/data/app-data` and `$LIVOS_DIR/data/tor` (under `data/`, created by `setup_docker_prerequisites`) — SAFE to remove.
- ✅ LIVE: `$LIVOS_DIR/app-data/<appId>` (TOP-LEVEL per-app data dir) — preserved across updates at `install.sh:1110, 1126-1127`, chowned by the app-script at `install.sh:1887`, and the target of all `${APP_DATA_DIR}/data:...` volume mounts in `builtin-apps.ts`. **MUST STAY.**

Removing `setup_docker_prerequisites()` (definition + call site at :1818 + the flow-comment line at :1754) only deletes the two orphaned empty dirs' creation. Operator pre-approved "remove". Recommend: remove. [VERIFIED]

---

## Item 5 — Docker containers section won't scroll → fix (CSS)

### File:line re-verification

| CONTEXT.md citation | Status | Actual |
|---------------------|--------|--------|
| `container-section.tsx:401` (table-container, `overflow-hidden`, no flex-1/min-h-0) | CONFIRMED | **:401** `<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>` |
| `container-section.tsx:234` (wrapper) | CONFIRMED | **:234** `<div className='flex h-full flex-col overflow-y-auto p-4 sm:p-6'>` |
| `container-section.tsx:~318` (mobile path `space-y-2`) | CONFIRMED | **:318** `<div className='space-y-2'>` (mobile card stack — scrolls at parent) |
| `docker-app.tsx:51` (parent) | CONFIRMED (file at `routes/docker/docker-app.tsx`) | **:51** `<div className='min-h-0 flex-1 overflow-auto'>` |

### Flexbox diagnosis — confirmed

The chain (outer → inner):
1. `docker-app.tsx:46` `<main className='flex min-w-0 flex-1 flex-col overflow-hidden'>` → `:51` `<div className='min-h-0 flex-1 overflow-auto'>` (mounts `<SectionView/>`)
2. `container-section.tsx:234` wrapper `flex h-full flex-col overflow-y-auto` — flex column; children = search row (:236, `mb-4`) + the conditional content (:291-398)
3. `container-section.tsx:401` table-container `rounded-xl border … overflow-hidden` — a direct flex child of the wrapper, holding `<Table>`.

**Root cause:** the table-container at :401 has `overflow-hidden` and no `flex-shrink-0` / `min-h-0` / `overflow-y-auto`. As a flex item in the `flex-col` wrapper, it is sized to the available flex space, and `overflow-hidden` HARD-CLIPS rows that exceed that height. Because the inner content is clipped (not overflowing), the wrapper's `overflow-y-auto` never detects overflow → rows below the fold are unreachable. This is the classic flexbox "min-height: auto + overflow-hidden clips instead of scrolls" trap. [VERIFIED: read full chain]

### Recommended fix (planner specifies precise class)

Two viable approaches at `container-section.tsx:401`:
- **(A) Simplest — remove `overflow-hidden`** so the table grows to natural height and the wrapper's existing `overflow-y-auto` scrolls it. (The `rounded-xl border` corner-clipping that `overflow-hidden` provided is cosmetic; verify rounded corners still look OK, or keep `overflow-hidden` only on the horizontal axis.)
- **(B) CONTEXT-suggested — add `flex flex-col min-h-0`** (or make it `overflow-y-auto flex-1 min-h-0`) so the container itself becomes the scroll region.

Recommend approach (A) (or a hybrid: `overflow-x-hidden overflow-y-auto`) — least likely to disturb table width. **MUST verify live in the UI build** (mobile path at :318 already scrolls at the parent; verify the fix doesn't regress width or mobile). CSS-only, no logic change. [VERIFIED diagnosis; HIGH confidence; verify visually]

---

## Verification Strategy

### Gate commands (verified available)

- **UI build gate (catches dangling imports / removed-route errors):** `cd livos && pnpm --filter ui build` — pnpm 10.25.0 present; `build:ui` script confirmed. This is the KEY gate for Items 1, 2, 5 (all UI). A deleted PNG with a remaining importer, or a removed route/component still imported, FAILS this build. [VERIFIED]
- **livinityd tsc gate:** `cd livos && pnpm --filter livinityd typecheck` (= `tsc --noEmit`). For Item 3 backend.
- **Vitest (lock-step tests):** `pnpm --filter ui test` (jsdom — runs on Windows) for `dock.test.tsx`. `startup-migrations.integration.test.ts` needs Linux D-Bus (the `livos-itest` WSL distro) — Windows CANNOT run it; the planner must either run it in WSL or rely on tsc + careful review for the test-deletion.

### Baselines (captured live, 2026-06-18)

- **livinityd `tsc --noEmit` = exactly 305 errors** (pre-existing). [VERIFIED — ran live, error count = 305]
- **`startup-migrations/index.ts` has ZERO baseline tsc errors** → Item 3's only livinityd file is clean; the rule "0 new errors in touched files" starts from 0. [VERIFIED]
- `notifications/routes.ts` has 2 baseline errors but Item 3 does NOT touch it (UI `notifications.tsx` is build-gated, not tsc-gated; livinityd side touches only `startup-migrations/index.ts`).
- **Gate rule for the planner:** after each commit, `tsc --noEmit` count must stay ≤ 305 AND `startup-migrations/index.ts` must remain at 0 errors. `pnpm --filter ui build` must exit 0.

### Which gate applies to which item

| Item | UI build gate | livinityd tsc gate | Vitest |
|------|---------------|--------------------|--------|
| 1 Files redirect | ✅ (required) | — | `dock.test.tsx` (icon-path + default-pins) |
| 2 Icons | ✅ (required — dangling PNG/SVG imports) | — | `dock.test.tsx` (icon-path strings :60/:61/:63) |
| 3 Time Machine | ✅ (UI `notifications.tsx`) | ✅ (`startup-migrations/index.ts`) | `startup-migrations.integration.test.ts` (delete block 43-88) — WSL only |
| 4 Install comments | — (shell, no build) | — | `test-deploy-livinityd.sh` (shell test; comment delete only — no assertion changes) |
| 5 Docker scroll | ✅ (required + visual) | — | — |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Opening Files as a window | A new window-open helper | `windowManager.openWindow('LIVINITY_files', route, name, icon)` (existing) + `WINDOWED_SYSTEM_ROUTES.LIVINITY_files` | Already the canonical path used by dock/launchpad/desktop-folder; deep-path strip handled by `FilesWindowContent` |
| New dock tiles | Raster PNGs or a new icon system | 120×120 SVG matching `dock-files-new.svg`/`dock-server.svg` | The LivOS tile design system already exists; consistency + tiny file size |
| Scroll fix | JS scroll handlers / measuring heights | Tailwind flex classes (`overflow-y-auto` / `min-h-0`) | It is a pure CSS flexbox-clipping issue |

---

## Runtime State Inventory

This phase is partly a rename/cleanup. The runtime-state question matters mainly for Item 3.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | livinityd notifications store may hold a persisted `migrated-back-that-mac-up` ID on already-affected boxes (operator says legacy app not used → unlikely present) | Optional one-time `notifications.clear('migrated-back-that-mac-up')`; otherwise it falls through to default render until OK clicked |
| Live service config | None — Items are UI/comment/CSS; no external service config embeds these strings | None |
| OS-registered state | None — verified: no systemd/Task-Scheduler reference to `/files`, dock icons, or back-that-mac-up | None |
| Secrets/env vars | None | None |
| Build artifacts | `livos/packages/ui/dist/` is a build output (contains stale `figma-exports` copies + en.json); regenerated by `pnpm --filter ui build`. Box gets a fresh build via release tag. | None (auto-regenerated; do not hand-edit dist) |

**Browser cache:** changed/new dock icons need a `?v=285` cache-bust suffix (existing codebase convention) so operator browsers refetch — otherwise cached old PNGs (or empty tiles for new SVGs) persist.

---

## Common Pitfalls

### Pitfall 1: Removing the generic notification render loop with the back-that-mac-up content
**What goes wrong:** Deleting `notifications.tsx:223-245` (thinking it's the back-that-mac-up dialog) kills ALL notifications (backups-failing, livos-updated).
**How to avoid:** Remove ONLY `getMigratedBackThatMacUpContent()` (154-160) + its dispatch branch (215-217). The render loop is generic.

### Pitfall 2: Deleting only the test assertion, not the whole test
**What goes wrong:** Removing `migrateBackThatMacUpPort()` but leaving `startup-migrations.integration.test.ts` lines 43-85 → the test still calls a deleted method / asserts a no-longer-created notification → red.
**How to avoid:** Delete the entire test block `'Back That Mac Up app port is migrated from 445 to 1445'` (lines 43-88).

### Pitfall 3: Windowed Files doesn't auto-open the rewind/format dialog
**What goes wrong:** Repointing backups deep-links to `openWindow('LIVINITY_files', '…?rewind=open')` opens the window but the dialog never appears (URL param invisible to the in-memory window router).
**How to avoid:** Use Item 1 option (B) — parse the dialog/rewind suffix in `FilesWindowContent` and trigger programmatically — or get operator sign-off on option (C).

### Pitfall 4: Forgetting the dock.test.tsx icon-string lock-step
**What goes wrong:** Changing `apps.tsx` icon strings (live-usage/app-store/my-devices) without updating the hard-coded mock at `dock.test.tsx:60/61/63` → the test's mock drifts from production (the test won't necessarily fail on icon strings since it asserts behavior, but the mock comment says "Mock mirrors production exactly" — keep it true).
**How to avoid:** Update the mock strings + any `?v=285` suffix in lock-step. Note Home (apps.tsx:42) is NOT in the mock → no edit there.

### Pitfall 5: Deleting the wrong "app-data"
**What goes wrong:** Removing `setup_docker_prerequisites()` is fine, but if a refactor also touches `$LIVOS_DIR/app-data` (top-level), per-app data breaks.
**How to avoid:** Only the `data/`-prefixed orphans go; top-level `app-data` stays (see Open Q3).

---

## Runtime / Architecture facts the planner needs

- **apple-spotlight = the LIVE Search palette** (MEMORY.md + `router.tsx:62-65` `SpotlightConnected`). **cmdk.tsx = dead/Docker-only.** Prioritize apple-spotlight repoint; cmdk for consistency.
- **Mobile Files is ALREADY windowed** — `MobileAppRenderer` (`mobile-app-renderer.tsx:33`) renders `<WindowAppContent appId initialRoute>`. mobile-tab-bar + desktop-content mobile grid use `openApp()` (in-memory state), not browser nav → unaffected by Option A.
- **`WindowRouterProvider` is in-memory only** (`providers/window-router.tsx`) — no browser-URL/`useSearchParams` coupling. This is why backups deep-links need special handling.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none — all claims verified by grep/read/live-run) | — | — |

**This table is empty: every factual claim in this research was verified against current `master` via grep/read or a live tsc run.** The only genuinely open DECISION (not a fact) is which of the 3 backups-deep-link strategies (Item 1 A/B/C) the operator prefers — surface in discuss/plan.

---

## Open Questions (for operator confirmation)

1. **Backups deep-link dialog auto-open (Item 1):** Choose strategy (A) keep full-page for those 3 (contradicts route removal), (B) programmatically trigger the dialog in `FilesWindowContent` after open (recommended — fully removes the route, small code), or (C) re-point to windowed Files without dialog auto-open (operator clicks Rewind/Format manually — minor UX regression). **Recommendation: (B).**
2. **New tile palette/glyphs (Item 2):** Confirm the 3 new tiles' colors/glyphs (Home / Live Usage / App Store) — operator asked to "show the result". Suggested palettes in Item 2.
3. **`dock.tsx:265` dead branch:** Simplify `pathname.startsWith('/files')` after route removal, or leave it (harmless)? Discretion.

---

## Planner Guidance

### Recommended task breakdown order (safe-first; small atomic commits; gate each)

1. **Item 5 — Docker scroll fix** (1 commit). Single-line class change at `container-section.tsx:401`. Gate: `pnpm --filter ui build` + visual scroll check. Lowest risk; ships value immediately.
2. **Item 2a — Repoint existing-SVG icons + delete zero-importer orphans** (1 commit). Edit `apps.tsx` (:99, :107 → settings-new; :49/files already SVG), `mobile-tab-bar.tsx` (:7 → files-new, :8 → settings-new, :11 → server), update `dock.test.tsx:63` (my-devices). Delete the 8 always-orphan PNGs (`dock-chrome/preview/widgets`, `app-facebook/gmail/whatsapp/youtube`, `dock-remote-desktop`). Gate: `pnpm --filter ui build` + `pnpm --filter ui test` (dock.test).
3. **Item 4 — install-script comment cleanup + orphaned dir removal** (1 commit, OR split: comments vs `setup_docker_prerequisites`). Delete the 5 comment blocks; remove `setup_docker_prerequisites()` (def :413-429 + call :1818 + flow-comment line :1754). Shell-only — no build gate; review carefully. (Per Open Q3, dir removal is safe + operator-approved.)
4. **Item 3 — Time Machine notice removal** (1 commit). Backend: delete `migrateBackThatMacUpPort()` (`startup-migrations/index.ts:117-137`) + its call block (:179-184). Delete test block (`startup-migrations.integration.test.ts:43-88`). UI: delete `getMigratedBackThatMacUpContent()` (`notifications.tsx:154-160`) + dispatch branch (:215-217). Gate: `pnpm --filter ui build` + `tsc --noEmit` (≤305, startup-migrations=0). Run the integration test in WSL `livos-itest` if possible, else rely on tsc + review.
5. **Item 2b — Author 3 new LivOS tiles (Home / Live Usage / App Store)** (1 commit, SHOW OPERATOR). Create `dock-home.svg`, `dock-live-usage.svg`, `dock-app-store.svg` (120×120, mimic `dock-files-new.svg`). Repoint `apps.tsx:42/63/72` + `dock.test.tsx:60/61` (live-usage, app-store) with `?v=285`. Delete the now-orphan `dock-home/live-usage/app-store.png` + `dock-settings.png` + `dock-files.png` (verify 0 importers after step 2 + this step). Gate: build + test.
6. **Item 1 — Files redirect removal (HIGH coupling — LAST)** (split into 2 commits):
   - **1a (palettes):** Repoint `apple-spotlight.tsx:284/291/297/303` and `cmdk.tsx:163/173/183/193` to `windowManager.openWindow('LIVINITY_files', …)` (add `useWindowManagerOptional()` to apple-spotlight). Remove the full-page route (`router.tsx:147` `...filesRoutes`) + the `filesRoutes` tree (`features/files/routes.tsx`) + the full-page `FilesLayout`/`Files` wrapper (`features/files/index.tsx`). KEEP `apps.tsx:51` systemAppTo, `system-windowed-routes.ts:6`, `FilesWindowContent`, the shared sidebar. Update `dock.test.tsx` default-pins (:267) if Files behavior changes. Optionally simplify `dock.tsx:265`.
   - **1b (backups deep-links):** Per operator's chosen strategy (recommend B), make `FilesWindowContent` honor an initial `?dialog=`/`?rewind=` suffix, then repoint `setup-wizard.tsx:588`, `backups-mobile-drawer.tsx:87`, `restore-wizard.tsx:764` to `openWindow('LIVINITY_files', …)`.
   - Gate each: `pnpm --filter ui build` (CRITICAL — catches the dangling FilesLayout import) + `pnpm --filter ui test`.

### Atomic vs separate
- **Atomic (single commit):** Item 5; Item 2a; Item 4 (or 2 commits); Item 3; Item 2b.
- **Must be lock-step within one commit:** icon-string change in `apps.tsx` + matching `dock.test.tsx` mock string + the orphaned-PNG delete (do NOT delete a PNG in a separate commit before its importer is repointed — that breaks `git bisect`/build at the intermediate commit).
- **Split Item 1** into 1a (palettes + route removal) and 1b (backups deep-links) — different risk profiles; 1b depends on the operator's dialog-strategy decision.

### Test assertions that MUST be updated in lock-step
- **`dock.test.tsx`:** mock icon strings at **:60** (live-usage), **:61** (app-store), **:63** (my-devices) — update with new icon paths (+`?v=285` if added). `:58` (files) already `dock-files-new.svg`. Home is NOT in the mock. Default-pins assertion at **:267** (`['launchpad','files','settings','app-store','server-control','liv-assistant']`) — re-check after Item 1 if Files launch semantics change (likely unaffected — it asserts presence of the data-test seam, not the route).
- **`startup-migrations.integration.test.ts`:** delete the entire `'Back That Mac Up app port is migrated…'` test block **lines 43-88** (not just the :86-87 assertion).
- **`scripts/install/__tests__/test-deploy-livinityd.sh`:** the Umbrel hits at :943-947 and :985-986 are COMMENTS (TESTS 39/40/41 already deleted in Phase 276) — removing the comments changes no assertion. No test-logic update needed for Item 4.

---

## Sources

### Primary (HIGH confidence — all this session, against current `master`)
- Read: `apps.tsx`, `router.tsx`, `routes.tsx`, `files-content.tsx`, `window-router.tsx`, `system-windowed-routes.ts`, `dock.tsx`, `dock.test.tsx`, `mobile-tab-bar.tsx`, `mobile-app-context.tsx`, `mobile-app-renderer.tsx`, `apple-spotlight.tsx`, `cmdk.tsx`, `desktop-folder.tsx`, `desktop-content.tsx`, `launchpad-grid.tsx`, `setup-wizard.tsx`, `restore-wizard.tsx`, `backups-mobile-drawer.tsx`, `format-drive-dialog/index.tsx`, `utils/dialog.ts`, `rewind/index.tsx` (grep), `notifications.tsx`, `startup-migrations/index.ts`, `startup-migrations.integration.test.ts`, `en.json` (grep), `container-section.tsx`, `docker-app.tsx`, `dock-files-new.svg`, `dock-server.svg`, `install.sh`, `deploy-livinityd.sh`, `test-deploy-livinityd.sh`.
- Grep (verified counts): orphan-PNG importers (all 0), live Umbrel PNG importers, `[Oo]wn[Cc]loud` (only comment), `data/tor`/`app-data` consumers, repo-wide `umbrel`.
- Live run: `tsc --noEmit` in livinityd → **305 errors baseline** (and 0 in startup-migrations/index.ts).
- `ls livos/packages/ui/public/figma-exports/` — full asset inventory.

## Metadata

**Confidence breakdown:**
- File:line re-verification: HIGH — every citation read/grepped on current master.
- Open Q1 (OwnCloud): HIGH — exhaustive grep, only a comment exists.
- Open Q2 (icon gap): HIGH — full inventory confirms no Home/LiveUsage/AppStore SVG.
- Open Q3 (orphaned dirs): HIGH — only the mkdir lines reference them; no compose/mount consumer.
- Item 1 break-list narrowing: HIGH — traced mobile path (openApp → WindowAppContent) and windowManager fallbacks.
- Item 1 backups-deep-link caveat: HIGH — confirmed `useSearchParams` dependency vs in-memory WindowRouterProvider.
- Item 5 diagnosis: HIGH on cause; visual verification still recommended post-build.
- tsc baseline: HIGH (live run).

**Research date:** 2026-06-18
**Valid until:** ~2026-07-18 (internal codebase; line numbers drift with any commit to these files — re-verify before editing, as CONTEXT advised).
