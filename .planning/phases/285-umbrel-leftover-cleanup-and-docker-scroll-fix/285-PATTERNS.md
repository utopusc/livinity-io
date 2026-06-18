# Phase 285: Umbrel-Leftover UI Cleanup + Docker Scroll Fix — Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 11 (3 NEW SVG assets, 1 new feature in an existing file, 7 modified/repointed)
**Analogs found:** 11 / 11 (all in-codebase; this is a cleanup phase so analogs are exact)

> This is a DELETION + REPOINT phase plus one small feature and 3 new SVG tiles. RESEARCH.md already has the
> exhaustive file:line break-list — this PATTERNS.md only maps the NEW / NON-TRIVIAL files to their closest
> existing analog with copy-paste-grade excerpts. Decisions are LOCKED (CONTEXT §"RESOLVED during planning").
> Re-verify line numbers before editing (they drift).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `public/figma-exports/dock-home.svg` (NEW) | asset (SVG tile) | static | `public/figma-exports/dock-files-new.svg` | exact (same design system) |
| `public/figma-exports/dock-live-usage.svg` (NEW) | asset (SVG tile) | static | `dock-files-new.svg` + `dock-server.svg` | exact |
| `public/figma-exports/dock-app-store.svg` (NEW) | asset (SVG tile) | static | `dock-files-new.svg` | exact |
| `modules/window/app-contents/files-content.tsx` | component (window content) | event-driven (mount-time dialog trigger) | in-file `RewindOverlay` `?rewind=open` effect (`rewind/index.tsx:72-79`) + `useDialogOpenProps` (`utils/dialog.ts:43-63`) | role-match (new feature, no exact precedent) |
| `components/apple-spotlight.tsx` | component (command palette) | request-response (launch) | `desktop-folder.tsx:87-101` (windowManager openWindow) | exact |
| `components/cmdk.tsx` | component (command palette) | request-response (launch) | `desktop-folder.tsx:95-100` | exact |
| `providers/apps.tsx` (icon strings) | config (registry) | static | self — existing `?v=` repoint at `apps.tsx:143` | exact |
| `modules/mobile/mobile-tab-bar.tsx` (icon strings) | config (tab registry) | static | `apps.tsx` SVG entries (`:49`, `:82`) | exact |
| `modules/desktop/dock.test.tsx` (mock strings) | test | n/a | self — existing `?v=238_7` mirror at `dock.test.tsx:69` | exact |
| `routes/docker/resources/container-section.tsx:401` (CSS) | component (CSS only) | n/a | `docker-app.tsx:51` flex-scroll | exact |
| Removals (Items 3 & 4) | mixed (deletions) | n/a | none needed | n/a |

---

## Pattern Assignments

### 1. THREE NEW SVG TILES — `dock-home.svg`, `dock-live-usage.svg`, `dock-app-store.svg` (asset, static)

**Analog:** `livos/packages/ui/public/figma-exports/dock-files-new.svg` (gradient + glyph) and
`dock-server.svg` (gradient + simple geometric shapes — easier glyph reference).

**EXACT skeleton to copy** (`dock-files-new.svg`, full file — 11 lines):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="26" fill="url(#bg)"/>
  <path d="M34 44c0-3.3 2.7-6 6-6h14l8 8h18c3.3 0 6 2.7 6 6v28c0 3.3-2.7 6-6 6H40c-3.3 0-6-2.7-6-6V44z" fill="white" fill-opacity="0.95"/>
  <path d="M34 52h52v28c0 3.3-2.7 6-6 6H40c-3.3 0-6-2.7-6-6V52z" fill="white" fill-opacity="0.85"/>
</svg>
```

**Design-system rules (held by BOTH analogs):**
- `viewBox="0 0 120 120"`, `fill="none"` on the root `<svg>`.
- ONE `<linearGradient id="bg">` with `x1=0 y1=0 x2=120 y2=120 gradientUnits="userSpaceOnUse"` (diagonal), exactly 2 `<stop>`s (`0%` and `100%`).
- Tile: `<rect width="120" height="120" rx="26" fill="url(#bg)"/>`.
- Glyph: centered in the ~30–90 coordinate band, white fills with `fill-opacity` layering (`0.95` foreground, `0.85` shadow). `dock-server.svg` shows the alternative: plain geometric `<rect rx=4>` / `<circle>` shapes in solid accent colors (`#4b5563`, `#22c55e`, `#6b7280`) — simpler than a single path glyph. The planner may mix either approach.
- Keep file size ~0.5–1.5 KB (no editor metadata, no `width`/`height` attrs, lowercase hex).

**LOCKED palettes + glyph (CONTEXT §RESOLVED Open-Q2):**
| File | `stop 0%` | `stop 100%` | Glyph |
|------|-----------|-------------|-------|
| `dock-home.svg` | `#3b82f6` | `#2563eb` (blue) | house |
| `dock-live-usage.svg` | `#22c55e` | `#16a34a` (green) | gauge / activity line |
| `dock-app-store.svg` | `#6366f1` | `#4f46e5` (indigo/purple) | shopping bag or grid |

**Gate:** `pnpm --filter ui build` (build copies `public/` → `dist/`; a malformed SVG still ships, so SHOW operator the rendered tile during execute per CONTEXT). No tsc/test gate for the asset files themselves.

---

### 2. NEW FEATURE — mount-time dialog trigger in `FilesWindowContent` (component, event-driven)

**File:** `modules/window/app-contents/files-content.tsx` (current full file is 181 lines; KEEP all of it).

**Why new:** the windowed Files mounts under `WindowRouterProvider` (pure in-memory `useState`, no browser URL) so the existing `?dialog=`/`?rewind=` auto-open mechanisms (which read `useSearchParams` / `window.location.search`) never fire inside a window. Strategy B (LOCKED) = parse the suffix off `initialRoute` once on mount and trigger the dialog programmatically. There is no exact precedent — compose from the two existing trigger mechanisms below.

**Where the route/suffix arrives** (`files-content.tsx:42-48`, KEEP — this is the prop you read the suffix from):
```ts
export default function FilesWindowContent({initialRoute}: FilesWindowContentProps) {
	const raw = initialRoute.startsWith('/files')
		? initialRoute.replace('/files', '') || HOME_PATH
		: initialRoute || HOME_PATH
	const filesPath = decodeURIComponent(raw)
	// initialRoute may carry a "?rewind=open" or "?dialog=files-format-drive&deviceId=sdc" suffix.
	// Parse it HERE (e.g. const [path, query] = initialRoute.split('?')) before stripping for filesPath.
```

**Analog A — REWIND open** (`features/files/components/rewind/index.tsx:62-79` — how the full-page surface opens it today):
```ts
export function RewindOverlay() {
	const {overlayOpen, setOverlayOpen, repoOpen, setRepoOpen} = useRewindOverlay()
	const [searchParams, setSearchParams] = useSearchParams()
	useEffect(() => {
		if (searchParams.get('rewind') === 'open') {
			setRepoOpen(true)                         // <-- the programmatic trigger to replicate
			searchParams.delete('rewind')
			setSearchParams(searchParams, {replace: true})
		}
	}, [searchParams, setSearchParams, setRepoOpen])
```
`setRepoOpen` comes from `useRewindOverlay()` (`rewind/overlay-context.tsx:7,18-22`). NOTE: `RewindOverlay` is already
rendered INSIDE `FilesWindowContent` (`files-content.tsx:159`) wrapped by `RewindOverlayProvider` (`:110`). So the
window can open Rewind by calling `setRepoOpen(true)` from a component that lives under that provider, OR by passing
an `openRewind` signal down. Simplest: add a small child inside `RewindOverlayProvider` that reads the parsed suffix
and calls `setRepoOpen(true)` on mount (mirrors the effect above but keyed off `initialRoute`, not `useSearchParams`).

**Analog B — FORMAT-DRIVE open** (`features/files/components/dialogs/format-drive-dialog/index.tsx:61-83` + `utils/dialog.ts:43-63`):
```ts
// format-drive-dialog reads its open state from the URL ?dialog= key:
const dialogProps = useDialogOpenProps('files-format-drive')   // -> useQueryParams() -> useSearchParams (browser URL)
// ...and the deviceId straight from window.location.search:
const urlParams = new URLSearchParams(window.location.search)
const deviceId = urlParams.get('deviceId')
const drive = disks?.find((d) => d.id === deviceId)
if (!drive || drive.isFormatting) return null                  // <-- self-gates on a real device
```
`useDialogOpenProps` (`utils/dialog.ts:43-49`) keys `open` off `params.get('dialog') === 'files-format-drive'` —
again a BROWSER-URL read, invisible to the window. `FormatDriveDialog` is also already rendered inside the window
(`files-content.tsx:175`). To trigger it programmatically the planner needs to bridge the `dialog`/`deviceId` values
parsed from `initialRoute` into whatever local open-state the windowed instance reads (the dialog currently has NO
prop-driven open path — it ONLY reads the URL). Two contained options: (a) extend the parse to push the
`?dialog=files-format-drive&deviceId=…` onto the window router / a small context the dialog also reads, or
(b) the simplest contained path: since format-drive deep-link is ONLY `restore-wizard`/`setup-wizard` driven and the
dialog reads `window.location.search` for `deviceId`, the parsed suffix must reach `useDialogOpenProps`-equivalent
state. **Planner: rewind (`setRepoOpen`) is the clean one; format-drive needs the bridge — keep the change inside
`files-content.tsx` + the dialog, do not re-introduce a browser-URL write.**

**Pattern to follow for the parse-once effect** (compose, not copy): a `useEffect(..., [])` (mount-only) that
splits `initialRoute` on `?`, runs `new URLSearchParams(query)`, and dispatches `setRepoOpen(true)` for
`rewind=open` or the format-drive open for `dialog=files-format-drive`. Place it under `RewindOverlayProvider`
(`files-content.tsx:110`) so `useRewindOverlay()` resolves.

**Gate:** `pnpm --filter ui build` (exit 0) + `pnpm --filter ui test` (jsdom). No livinityd tsc.

---

### 3. PALETTE REPOINT to windowManager — `apple-spotlight.tsx` (+ `cmdk.tsx`) (component, request-response)

**Analog (canonical openWindow call):** `modules/desktop/desktop-folder.tsx:87-101`:
```ts
import {useWindowManagerOptional} from '@/providers/window-manager'
import {systemAppsKeyed} from '@/providers/apps'
// ...
const windowManager = useWindowManagerOptional()
// ...
const handleOpen = () => {
	const route = `/files/Home/${encodeURIComponent(name)}`
	const filesIcon = systemAppsKeyed['LIVINITY_files']?.icon || ''
	if (windowManager) {
		windowManager.openWindow('LIVINITY_files', route, name, filesIcon)
	}
}
```
**Signature:** `openWindow(appId, route, name, icon)` — `appId='LIVINITY_files'`, `route` is a `/files/...` path
(deep paths fine — `FilesWindowContent:45-48` strips `/files`), `name` is the window title, `icon` from
`systemAppsKeyed['LIVINITY_files'].icon`.

**Current state to replace — `apple-spotlight.tsx`** (imports at `:1-17`; it does NOT yet import any window-manager hook):
```ts
// :5  import {useNavigate} from 'react-router-dom'           // navigate stays for non-Files items (Home/Settings)
// :15 import {systemAppsKeyed} from '@/providers/apps'        // already imported — reuse for icon
// MUST ADD: import {useWindowManagerOptional} from '@/providers/window-manager'
// then inside the component: const windowManager = useWindowManagerOptional()
```
The four Files actions to repoint (`:282-303`):
```ts
// :282-285 Files:  action: () => { const lastFilesPath = sessionStorage.getItem('lastFilesPath')
//                                   navigate(lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo) }
// :291 Recents:    action: () => navigate(`/files${FILES_RECENTS_PATH}`)
// :297 Apps:       action: () => navigate(`/files${FILES_APPS_PATH}`)
// :303 Trash:      action: () => navigate(`/files${FILES_TRASH_PATH}`)
```
Repoint each `navigate(X)` → `windowManager?.openWindow('LIVINITY_files', X, 'Files', systemAppsKeyed['LIVINITY_files'].icon)`.
Leave Home (`:276`) and Settings (`:309`) as `navigate(...)` (not Files; out of scope). NOTE `lastFilesPath` is a
`/files/...`-form string already — passes straight through.

**`cmdk.tsx`** (dead/Docker-only palette — repoint for consistency). Same `navigate(...)` pattern at `:163` (Files,
uses `lastFilesPath || systemAppsKeyed['LIVINITY_files'].systemAppTo`), `:173` (Recents), `:183` (Apps), `:193`
(Trash). Check whether `cmdk.tsx` already imports a window-manager hook; if not, add `useWindowManagerOptional()`
the same way. (Confirm `cmdk` is mounted under the WindowManagerProvider; if it can render outside it, the
`?.` optional call + leaving the `navigate` fallback is the safe pattern — mirror `desktop-folder`'s `if (windowManager)` guard.)

**Gate:** `pnpm --filter ui build` (CRITICAL — also catches the removed full-page route's dangling `FilesLayout` import) + `pnpm --filter ui test`.

---

### 4. ICON REPOINTS — `apps.tsx`, `mobile-tab-bar.tsx` + `dock.test.tsx` mock (config / test, static)

**Repoint pattern (self-analog, with `?v=` cache-bust) — `apps.tsx:143`:**
```ts
icon: '/figma-exports/dock-ai-chat.svg?v=chat_2026_06_02',
```
Mirror this exactly: change the icon string to the LivOS SVG and append `?v=285`.

**`apps.tsx` edits** (block read `:38-147`):
- `:42` Home → `'/figma-exports/dock-home.svg?v=285'` (NEW tile)
- `:63` Live Usage → `'/figma-exports/dock-live-usage.svg?v=285'` (NEW tile)
- `:72` App Store → `'/figma-exports/dock-app-store.svg?v=285'` (NEW tile)
- `:99` Devices (`LIVINITY_my-devices`) → `'/figma-exports/dock-settings-new.svg?v=285'` (existing SVG)
- `:107` Schedules → `'/figma-exports/dock-settings-new.svg?v=285'` (existing SVG)

**`mobile-tab-bar.tsx` edits** (`TABS` array `:5-12`; the `appIcon` field):
- `:7` Files `appIcon` `'/figma-exports/dock-files.png'` → `'/figma-exports/dock-files-new.svg'` (existing)
- `:8` Settings `appIcon` `'/figma-exports/dock-settings.png'` → `'/figma-exports/dock-settings-new.svg'` (existing)
- `:11` Server `appIcon` `'/figma-exports/dock-settings.png'` → `'/figma-exports/dock-server.svg'` (existing)

**`dock.test.tsx` mock lock-step** (self-analog `:69` already mirrors `?v=238_7`). The mock string MUST match the
new `apps.tsx` literal CHARACTER-FOR-CHARACTER (incl. `?v=285`):
- `:60` Live Usage icon → `'/figma-exports/dock-live-usage.svg?v=285'`
- `:61` App Store icon → `'/figma-exports/dock-app-store.svg?v=285'`
- `:63` Devices (`LIVINITY_my-devices`) icon → `'/figma-exports/dock-settings-new.svg?v=285'`
- Home (`apps.tsx:42`) is NOT present in this mock (`:57-70`) → NO test edit for Home.

**Orphan PNG deletes (0 importers, RESEARCH-verified):** `dock-chrome.png`, `dock-preview.png`, `dock-widgets.png`,
`app-facebook.png`, `app-gmail.png`, `app-whatsapp.png`, `app-youtube.png`, `dock-remote-desktop.png`. AFTER the
repoints above land: `dock-home.png`, `dock-live-usage.png`, `dock-app-store.png`, `dock-settings.png`,
`dock-files.png`. **Lock-step rule:** never delete a PNG in a commit before its importer is repointed (breaks the
intermediate `ui build`).

**Gate:** `pnpm --filter ui build` (dangling PNG/SVG imports fail it) + `pnpm --filter ui test` (`dock.test.tsx`).

---

### 5. DOCKER SCROLL FIX — `container-section.tsx:401` (component, CSS only)

**Analog (house flex-scroll):** `routes/docker/docker-app.tsx:51`:
```tsx
<div className='min-h-0 flex-1 overflow-auto'>   {/* <-- the working scroll container that mounts SectionView */}
	<SectionView section={section} />
</div>
```

**Broken line — `container-section.tsx:401`** (desktop table container, direct flex child of the `:234` wrapper
`flex h-full flex-col overflow-y-auto`):
```tsx
<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
	<Table> … </Table>
</div>
```
`overflow-hidden` + no `min-h-0` → hard-clips rows so the wrapper's `overflow-y-auto` never sees overflow.

**Fix (RESEARCH-preferred):** drop `overflow-hidden` (or use `overflow-x-hidden overflow-y-auto`) so the table grows
to natural height and the wrapper at `:234` scrolls it — least likely to disturb table width. Alternatively add
`flex flex-col min-h-0` to make the container itself the scroll region (matches `docker-app.tsx:51`). CSS-only, no
logic. Mobile path (`:318` `space-y-2`) scrolls at the parent — unaffected.

**Gate:** `pnpm --filter ui build` + MUST visually verify scroll in the built UI (mobile + desktop).

---

## Shared Patterns

### Icon cache-bust (`?v=`)
**Source:** `apps.tsx:143` (`dock-ai-chat.svg?v=chat_2026_06_02`); mock mirror `dock.test.tsx:69` (`?v=238_7`).
**Apply to:** every repointed/new icon string in Item 2 + Item 5(2b). Use `?v=285`. The suffix becomes part of the
literal string the `dock.test.tsx` mock must match exactly.

### openWindow for Files
**Source:** `desktop-folder.tsx:87-101` — `useWindowManagerOptional()` + `windowManager.openWindow('LIVINITY_files', route, name, icon)`, icon from `systemAppsKeyed['LIVINITY_files'].icon`.
**Apply to:** apple-spotlight + cmdk palette repoints (Item 1a) and the backups deep-link repoints (Item 1b).
**KEEP:** `apps.tsx:51` `systemAppTo:'/files/Home'` and `system-windowed-routes.ts:6` (`LIVINITY_files='/files/Home'`) feed the windowed `initialRoute` — do NOT delete; only the full-page route mount/tree/wrapper is removable.

### SVG tile design system
**Source:** `dock-files-new.svg` + `dock-server.svg`.
**Apply to:** the 3 new tiles (Item 2b). `viewBox 0 0 120 120` / `rect rx=26` / 2-stop diagonal `linearGradient id="bg"` / centered white glyph.

### Programmatic dialog open (windowed Files)
**Source:** rewind `setRepoOpen(true)` from `useRewindOverlay()` (`rewind/index.tsx:73`, `overlay-context.tsx:7`); format-drive `useDialogOpenProps('files-format-drive')` + `window.location.search` `deviceId` (`format-drive-dialog/index.tsx:62,81-82`).
**Apply to:** the new `files-content.tsx` mount-time trigger (Item 1b). Bridge the parsed `initialRoute` suffix to these existing local triggers; do NOT write to the browser URL (the window router is in-memory).

---

## No Analog Found

None. Every file maps to an in-codebase analog (this is a cleanup phase). The closest thing to "no analog" is the
`files-content.tsx` mount-time dialog trigger (Item 1b) — there is no exact precedent for triggering these dialogs
WITHOUT the browser URL, but the two trigger mechanisms (`setRepoOpen` and `useDialogOpenProps`) already exist and
are composed above.

---

## Removals (Items 3 & 4) — construct boundaries (no analog needed)

**Item 3 — Time Machine notice:**
- `livos/packages/livinityd/source/modules/startup-migrations/index.ts` — delete the `migrateBackThatMacUpPort()` METHOD (lines `117-137`) AND its call block in `start()` (lines `179-184`). KEEP all other `start()` try/catch blocks (activateImportedDataDirectory, migrateLegacyData, migrateLegacyLinuxData, migrateDownloadsDirectory, version write, the `livos-updated` add at `:200`).
- `livos/packages/ui/src/routes/notifications.tsx` — delete ONLY `getMigratedBackThatMacUpContent()` (lines `154-160`) + its dispatch branch (lines `215-217`). DO NOT delete the generic AlertDialog render loop (`223-245`) — it renders all notifications. KEEP `getBackupFailingContent`, the backups query, `livos-updated` auto-clear.
- `livos/packages/livinityd/source/modules/startup-migrations/startup-migrations.integration.test.ts` — delete the ENTIRE test block `'Back That Mac Up app port is migrated from 445 to 1445'` (lines `43-88`), not just the `:86-87` assertion.

**Item 4 — install-script Umbrel comments (all comment-only):**
- `livos/install.sh:408-411` (comment block)
- `livos/install.sh:1757-1758` (comment)
- `scripts/install/deploy-livinityd.sh:771-775` (divider + comment)
- `scripts/install/__tests__/test-deploy-livinityd.sh:943-947` and `:985-986` (comments; no assertion change)

**Item 4 — orphaned dir-creation (LIVE code, separate change, operator pre-approved):**
- `livos/install.sh` — remove `setup_docker_prerequisites()` definition (`~413-429`), its call site (`~1818`), and the flow-comment line (`~1754`). It only `mkdir`s `data/tor/data` + `data/app-data` (under `data/`) — zero downstream consumers. ⚠️ Do NOT touch the LIVE top-level `$LIVOS_DIR/app-data/<appId>` path (`install.sh:1110, 1126-1127, 1887` + builtin-apps volume mounts) — that STAYS.

**Discretion (LEAVE per CONTEXT):** `dock.tsx:265` `pathname.startsWith('/files')` dead branch — leave it (harmless; open-dot still works via `windowAppIds.has` at `:271`). Minimize churn.

**Gates:** Item 3 = `pnpm --filter ui build` + livinityd `tsc --noEmit` (stay ≤305; `startup-migrations/index.ts` stays at 0) + `startup-migrations.integration.test.ts` (WSL `livos-itest` only). Item 4 = shell, no build gate; careful review.

---

## Metadata

**Analog search scope:** `livos/packages/ui/{public/figma-exports,src}`, `livos/packages/livinityd/source/modules/startup-migrations`, `livos/install.sh`, `scripts/install/`.
**Files read for excerpts:** `dock-files-new.svg`, `dock-server.svg`, `files-content.tsx`, `rewind/index.tsx`, `rewind/overlay-context.tsx`, `format-drive-dialog/index.tsx`, `utils/dialog.ts`, `desktop-folder.tsx`, `apple-spotlight.tsx`, `apps.tsx`, `mobile-tab-bar.tsx`, `dock.test.tsx`, `cmdk.tsx`, `container-section.tsx`, `docker-app.tsx`.
**Pattern extraction date:** 2026-06-18
