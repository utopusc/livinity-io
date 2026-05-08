# Phase 100: Multi-Stream + Stream-Window Redesign — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 6 (2 backend, 4 frontend)
**Analogs found:** 6 / 6 (5 strong; 1 partial — bottom action-bar has no exact analog)

---

## File Classification

| File (new / modified) | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------|------|-----------|----------------|---------------|
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` | service (subprocess orchestrator) | event-driven (spawn → discover → store) | self (existing file at lines 220-238 — argv-only tweak `--new-window URL` → `--app=URL`); cross-ref `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts:62-87` for the canonical sudo-prefix env style | exact (in-place edit) |
| `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` | test | request-response | self (existing tests; `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts:285-311` for argv-content assertion idiom) | exact |
| `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` | component (composition root) | request-response | self (heavy rewire); `livos/packages/ui/src/routes/docker/resources/container-detail-sheet.tsx:962-968` for the right-side Sheet drawer pattern | partial (sui generis composition) |
| `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` | component | presentational | self (deprecate / delete per E1) | exact |
| `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx` | component | presentational | self + `livos/packages/ui/src/routes/docker/sidebar.tsx:118-152` for the icon-only button + tooltip pattern | role-match (collapse pills → icons) |
| `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` | test (source-text invariants) | request-response | self — extend with new invariants for the bottom-bar / drawer wiring | exact |

**Note on the bottom action-bar (V33-MULTI-03):** there is **no existing horizontal icon-button row** in `livos/packages/ui` (the docker sidebar at `routes/docker/sidebar.tsx` is vertical; `mobile-nav-bar.tsx` is title-bar shape). The closest stylistic analogs are the per-button styles inside `webapp-toolbar.tsx:33-35` (`buttonBase` Tailwind class) and `container-detail-sheet.tsx:984` (icon button with hover + min size). New code must compose these — see "Shared Patterns → Bottom Action Bar (NEW)" below.

---

## Pattern Assignments

### `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (service, event-driven)

**Analog:** self — minimum-surface-area edit. The argv tweak is a 1-line change inside an already-locked spawn block.

**Current spawn argv (lines 220-238) — what is there now:**
```typescript
const chromeUser = process.env.LIVOS_CHROME_USER ?? 'bruce'
const chromeProfile =
    process.env.LIVOS_CHROME_PROFILE ?? '/home/bruce/.config/livos-chrome'
const chromeArgs = [
    '-n', // non-interactive (fail fast if password would be prompted)
    '-u',
    chromeUser,
    `DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
    `XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,
    this.chromeBinary,
    `--user-data-dir=${chromeProfile}`,
    '--new-window',
    opts.url,
]
const chromeProc = this.spawnFactory('sudo', chromeArgs, {
    detached: true,
    stdio: 'ignore',
    env: {...process.env, ...WEBAPPS_X11_ENV},
})
```

**Target shape (per CONTEXT G-100-B locked default B1 — `--app=URL`):**
Replace the two-element `'--new-window', opts.url` with the single element `` `--app=${opts.url}` ``. All other argv, env, detached/stdio options stay identical.

```typescript
//  this.chromeBinary,
//  `--user-data-dir=${chromeProfile}`,
//  `--app=${opts.url}`,   // ← P100-02: was `'--new-window', opts.url` (G-100-B B1)
```

**Why this matters per CONTEXT:** `--app=URL` (Chrome site-specific-browser mode) defeats the IPC-merge that makes a 2nd `--new-window` invocation reuse the existing top-level window. It also produces a chromeless window (no URL bar at the X11 layer) — bonus alignment with V33-MULTI-02.

**Cross-reference for sudo+env style (DO NOT change — already correct here):** `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts:62-87` uses the same `'sudo', ['-n', '-u', 'bruce', 'DISPLAY=...', 'XAUTHORITY=...', /usr/bin/x11vnc, ...]` pattern. Both files are the only two `sudo -n -u bruce ...` call sites in `livos/packages/livinityd/`.

**xdotool subprocess pattern (preserved unchanged):** lines 363-366 — `windowkill`, `unref()` style. If 100-01 root-causes H2 (matcher problem rather than spawn problem), tightening goes into `window-discovery.ts:152-193` (the `findNewWindowMatching` poll loop), where the existing 60%-elapsed fallback to "any new window with chrome/firefox in title" is the gate — replace title-substring fallback with `_NET_WM_PID` + creation-timestamp filter via `xprop -id <wid> _NET_WM_PID` (no existing analog for `_NET_WM_PID`; introduce as a new `execFileAsync('xprop', ['-id', String(wid), '_NET_WM_PID'])` call mirroring `getWindowGeometry` lines 217-244).

**Discovery helper style to mirror (lines 217-244 of `window-discovery.ts`):**
```typescript
export async function getWindowGeometry(wid: number): Promise<Geometry | null> {
    if (!Number.isInteger(wid) || wid <= 0) return null
    let stdout: string
    try {
        const result = await execFileAsync(
            'xdotool',
            ['getwindowgeometry', '--shell', String(wid)],
            {timeout: DEFAULT_TIMEOUT_MS},
        )
        stdout = result.stdout
    } catch {
        return null
    }
    // ... parse KEY=VALUE lines into typed object
    return {x: ..., y: ..., w: ..., h: ...}
}
```

**Error class style (lines 64-69 of `window-manager.ts`) — reuse if any new error is needed:**
```typescript
export class WindowNotFoundError extends Error {
    code = 'WINDOW_NOT_FOUND'
    constructor(public url: string) {
        super(`no new window matching ${url} appeared within timeout`)
    }
}
```

---

### `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` (test, request-response)

**Analog:** self + `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts:285-311` (argv content-assertion idiom).

**Existing test 1 (lines 123-133) — happy-path shape to preserve:**
```typescript
it('Test 1: spawn happy path returns {webappId,windowId,streamId,wsUrl} with mode:"vnc-window" (Phase 99-04 swap)', async () => {
    const {mgr, streamManager, started} = makeManager()
    const r = await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://github.com'})
    expect(r.windowId).toBe(0x200)
    expect(r.streamId).toMatch(/^stream-/)
    expect(r.wsUrl).toMatch(/^\/ws\/stream\//)
    expect(streamManager.startStream).toHaveBeenCalledOnce()
    expect(started[0].mode).toBe('vnc-window')
    expect(started[0].target).toEqual({wid: 0x200})
    mgr._clearForTests()
})
```

**Argv assertion idiom from `stream-manager.test.ts:295-302` — copy this into a new test:**
```typescript
expect(spawn).toHaveBeenCalledTimes(1)
const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
expect(cmd).toBe('sudo')
expect(args).toContain('-id')
expect(args).toContain('0xabcdef')
// ... (one toContain per argv element you care about)
```

**Apply to Phase 100:** add a Test 11 along these lines:
```typescript
it('Test 11: spawn argv uses --app=<url> (G-100-B B1) — no --new-window flag', async () => {
    const {mgr, spawn} = makeManager()
    await mgr.spawn({userId: 'u1', webappId: 'app1', url: 'https://duckduckgo.com'})
    const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('sudo')
    expect(args).toContain('--app=https://duckduckgo.com')
    expect(args).not.toContain('--new-window')
    expect(args).toContain('--user-data-dir=/home/bruce/.config/livos-chrome')
    mgr._clearForTests()
})
```

**FakeChild + makeManager helpers (lines 31-113) — reuse as-is.** No new fakes needed; the argv change is purely in the assertion list.

---

### `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (component, composition root)

**Analog:** self (heavy rewire, ~776 lines). Sub-patterns drawn from:
- `livos/packages/ui/src/routes/docker/resources/container-detail-sheet.tsx:962-968` — right-side `<Sheet>` drawer
- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx:33-35` — icon-button Tailwind class
- `livos/packages/ui/src/routes/docker/sidebar.tsx:124-150` — icon button + Tooltip wrapper pattern

**Imports pattern to preserve (current lines 28-58):**
```typescript
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'
import {AlertTriangle, RefreshCw, Square} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {useTeachRecorder, type ActionLog} from '@/hooks/use-teach-recorder'
```

**Imports to ADD for Phase 100 (drawer + new icons):**
```typescript
import {MessageCircle, GraduationCap, Eye, Bot} from 'lucide-react'
import {Sheet, SheetContent} from '@/shadcn-components/ui/sheet'
```

**Imports to REMOVE (per CONTEXT G-100-E E1 — drop entire toolbar; mode selector becomes inline icon row):**
```typescript
// import {WebAppToolbar} from '../webapp-toolbar'              ← DROP
// import {WebAppModeSelector, type WebAppMode} from '../webapp-mode-selector'  ← keep `WebAppMode` type only
```

**Spawn lifecycle pattern (lines 132-198) — preserve byte-for-byte.** The spawn idempotency, retry, fire-once `spawnedForRef`, fire-and-forget `closeMutationRef` cleanup is hard-won (2026-05-08 hotfix v2). Don't touch.

**Mode state (line 205):**
```typescript
const [mode, setMode] = useState<WebAppMode>('chat')
```

**ADD for Phase 100 — drawer-open state coupled to mode (G-100-D D2):**
```typescript
// G-100-D D2: each mode button toggles its own drawer. Second click of the same
// button closes. Switching to a different button swaps drawer content.
const [openDrawer, setOpenDrawer] = useState<WebAppMode | null>(null)

const toggleDrawer = useCallback((next: WebAppMode) => {
    setOpenDrawer((current) => (current === next ? null : next))
    setMode(next) // existing handleModeChange wiring (lines 251-275) still runs
}, [])
```

**Drawer pattern to mirror (`container-detail-sheet.tsx:962-968`):**
```typescript
<Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
        side='right'
        className='!w-full !max-w-full sm:!w-[600px] sm:!max-w-[600px] overflow-hidden'
        closeButton={false}
    >
        <div className='relative z-10 flex h-full flex-col'>
            {/* Header */}
            {/* Body */}
        </div>
    </SheetContent>
</Sheet>
```

**Apply to Phase 100 — 35% width, controlled open:**
```typescript
<Sheet
    open={openDrawer !== null}
    onOpenChange={(o) => { if (!o) setOpenDrawer(null) }}
>
    <SheetContent
        side='right'
        className='!w-[35%] !max-w-none overflow-hidden'
        closeButton={false}
    >
        <div className='relative z-10 flex h-full flex-col'>
            {openDrawer === 'chat' ? <WebAppChatDrawer ... /> : null}
            {openDrawer === 'teach' ? <WebAppTeachDrawer ... /> : null}
            {openDrawer === 'watch' ? <WebAppWatchDrawer ... /> : null}
            {openDrawer === 'auto' ? <WebAppAutoDrawer ... /> : null}
        </div>
    </SheetContent>
</Sheet>
```

**Existing AgentPanel body to relocate into `<WebAppChatDrawer>`:** lines 555-635 (the `WebAppAgentPanel` inner component with `ChatMessageItem` + `ChatInput`). Lift the body, keep the same prop wiring.

**Existing `WebAppSkillsSidebar` + `SkillReplayScrubber` to relocate into `<WebAppTeachDrawer>`:** existing imports lines 40-41. The sidebar (lines 478-485) and scrubber (lines 446-451) move from siblings of the stream pane into children of the Teach drawer body.

**Stream pane (lines 422-452) — preserve as-is, drop the wrapping `ResizablePanelGroup`.** With no inline agent panel below, the bottom 30% is gone; the stream area becomes `flex-1` of a single column. Keep the overlays (`SpawnErrorBanner`, `VncOverlay`, `TeachRecordingOverlay`, `TeachAutoStopBanner`) — they are absolutely positioned and don't depend on the resizable layout.

**ResizablePanelGroup IMPORT to drop:** lines 54-58 — the entire `import {ResizableHandle, ResizablePanel, ResizablePanelGroup}` block goes away. The companion `SPLIT_KEY_PREFIX`, `DEFAULT_TOP_PCT`, `DEFAULT_BOTTOM_PCT`, `MIN_PCT`, `MAX_PCT`, `readPersistedLayout`, `writePersistedLayout`, `initialLayout`, `onLayoutChange` (lines 67-119, 366-376) all become dead code — remove. Update the unit-test invariants in `webapp-stream-window.unit.test.tsx:42-56` accordingly (drop the ResizablePanelGroup + persistence assertions).

---

### `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` (component, presentational)

**Analog:** self — **deprecate / delete entirely** per CONTEXT G-100-E E1.

The whole file (125 lines) goes away. The two callbacks it dispatches (`onCopyUrl`, `onFullscreen`) move to the right-click menu on the WebApp desktop icon (per CONTEXT line 107). The back/forward/refresh chord wiring (currently parent-side at lines 329-350 of `webapp-stream-window.tsx`) ALSO becomes dead code unless reused inside a future drawer.

**If retained as a hidden command surface (NOT recommended per E1):** keep the `buttonBase` Tailwind class as the source of truth for icon-button hover styling — it is the only existing 32-36px icon-button utility class in this package and the new bottom action-bar can copy it verbatim:
```typescript
const buttonBase =
    'flex h-8 w-8 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
```

---

### `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx` (component, presentational)

**Analog:** self + `livos/packages/ui/src/routes/docker/sidebar.tsx:118-152` (icon-only button + Radix Tooltip pattern).

**Decision per CONTEXT G-100-C C1 + V33-MULTI-03:** collapse the pill segmented control into an icon-only horizontal row, OR delete this file entirely and inline the row inside `webapp-stream-window.tsx`. Existing pill-with-emoji approach (lines 38-43) becomes:

**Existing MODE_ORDER (lines 38-43):**
```typescript
const MODE_ORDER: ReadonlyArray<ModeDef> = [
    {id: 'watch', label: 'Watch', emoji: '⏺', hint: 'Watch only — recording arrives in P96'},
    {id: 'teach', label: 'Teach', emoji: '🎙', hint: 'Teach mode arrives in P96'},
    {id: 'auto', label: 'Auto', emoji: '🤖', hint: 'Auto mode arrives in P97'},
    {id: 'chat', label: 'Chat', emoji: '💬', hint: 'Chat with the agent about this WebApp'},
]
```

**Proposed P100 shape — Lucide icons replace emoji:**
```typescript
import {MessageCircle, GraduationCap, Eye, Bot} from 'lucide-react'

const MODE_ORDER = [
    {id: 'chat',  label: 'Chat',  Icon: MessageCircle, hint: 'Chat with the agent about this WebApp'},
    {id: 'teach', label: 'Teach', Icon: GraduationCap, hint: 'Record a skill'},
    {id: 'watch', label: 'Watch', Icon: Eye,           hint: 'Watch only'},
    {id: 'auto',  label: 'Auto',  Icon: Bot,           hint: 'Run agent in auto mode'},
] as const
```

**Tooltip + button pattern from `docker/sidebar.tsx:124-150`:**
```typescript
<TooltipProvider delayDuration={300}>
    {visibleSectionIds.map((id) => {
        const meta = SECTION_META[id]
        const Icon = meta.icon
        const active = section === id
        const button = (
            <button
                type='button'
                onClick={() => setSection(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                    'flex w-full items-center gap-3 px-3 text-sm transition-colors',
                    density === 'compact' ? 'py-1' : 'py-2',
                    active
                        ? 'bg-blue-500/10 text-blue-700'
                        : 'text-zinc-700 hover:bg-zinc-200/60',
                    collapsed && 'justify-center px-0',
                )}
            >
                <Icon size={18} className='shrink-0' />
                {!collapsed && <span className='truncate'>{meta.label}</span>}
            </button>
        )
        if (!collapsed) return <div key={id}>{button}</div>
        return (
            <Tooltip key={id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side='right'>{meta.label}</TooltipContent>
            </Tooltip>
        )
    })}
</TooltipProvider>
```

**Existing `WEBAPP_MODE_CHANGE_EVENT` CustomEvent dispatch (lines 45-66) — preserve.** Future P96/P97 phases listen on this event without prop-drilling.

**Existing keyboard navigation (`handleKeyDown` lines 68-88) — preserve.** Arrow-Left/Right cycles through MODE_ORDER; the `data-mode` attribute on each button is already used for focus restoration.

---

### `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx` (test, source-text invariants)

**Analog:** self — extend with new invariants. The existing convention (lines 1-16):
```typescript
// @vitest-environment jsdom
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS — same precedent
// as 95-04 / 95-06 / 67-04). This file ships source-text invariants that
// lock the contract with the spawn/close mutations, the VNC + agent hooks,
// the resizable layout, and the persistence key shape (D-95-04).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'app-contents/webapp-stream-window.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')
```

**Invariants TO ADD for Phase 100:**
```typescript
it('drops WebAppToolbar import (V33-MULTI-02 / G-100-E E1)', () => {
    expect(SRC).not.toMatch(/from\s+['"]\.\.\/webapp-toolbar['"]/)
    expect(SRC).not.toMatch(/<WebAppToolbar\b/)
})

it('drops ResizablePanelGroup vertical split (no inline agent panel below stream)', () => {
    expect(SRC).not.toMatch(/ResizablePanelGroup/)
})

it('imports the Sheet drawer from shadcn (G-100-D D2)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/shadcn-components\/ui\/sheet['"]/)
})

it('renders a 4-button bottom action row with Lucide icons (V33-MULTI-03)', () => {
    expect(SRC).toMatch(/MessageCircle/)
    expect(SRC).toMatch(/GraduationCap/)
    expect(SRC).toMatch(/Eye/)
    expect(SRC).toMatch(/Bot/)
})

it('toggleDrawer second-click closes its own drawer (G-100-D D2)', () => {
    // Source-text shape: setOpenDrawer((current) => current === next ? null : next)
    expect(SRC).toMatch(/openDrawer/)
    expect(SRC).toMatch(/setOpenDrawer/)
})
```

**Invariants TO REMOVE (lines 42-56 of the test file):**
- The `ResizablePanelGroup` assertion (line 43-44)
- The persistence key shape assertion (line 47-48)
- The 70/30 + [20,90] guard assertions (lines 51-55)
- The toolbar import assertion (lines 36-39)

---

## Shared Patterns

### Bottom Action Bar (NEW — no existing analog)

**Source:** compose from `webapp-toolbar.tsx:33-35` (`buttonBase` class) + `docker/sidebar.tsx:118-152` (Tooltip+button) + `window-chrome.tsx:11-39` (the existing top drag-strip + close-X is the visual pattern to mirror, but it lives FLOATING above the window — the new bottom bar is INSIDE the window per CONTEXT G-100-C C1).

**Apply to:** `webapp-stream-window.tsx` only.

**Reference style — the existing top-bar visual to mirror (`window-chrome.tsx:11-38`):**
```tsx
export function WindowChrome({title, icon, onClose}: WindowChromeProps) {
    return (
        <div className='relative flex items-center'>
            {/* Close button - positioned to the left, with magnetic attraction */}
            <div className='absolute right-full mr-3'>
                <Magnetic intensity={0.3} range={60}
                    springOptions={{stiffness: 200, damping: 12, mass: 0.15}}>
                    <button
                        type='button'
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                        className='group flex items-center justify-center w-9 h-9 rounded-full
                                   bg-white/90 backdrop-blur-xl border border-neutral-200/60
                                   shadow-[0_2px_8px_rgba(0,0,0,0.08)]
                                   hover:bg-destructive hover:border-destructive/80
                                   transition-all duration-200'
                        aria-label='Close window'
                    >
                        <TbX className='h-4 w-4 text-neutral-400 group-hover:text-white
                                        transition-colors' strokeWidth={2.5} />
                    </button>
                </Magnetic>
            </div>
            {/* ... title pill ... */}
        </div>
    )
}
```

**Key visual conventions to copy verbatim:**
- `bg-white/90 backdrop-blur-xl border border-neutral-200/60`
- `shadow-[0_2px_8px_rgba(0,0,0,0.08)]`
- `rounded-full` (or `rounded-radius-sm` per the toolbar's existing `buttonBase` if a flat row reads better)
- `transition-all duration-200`

**Suggested P100 bottom bar (NEW — no existing exact analog; this is the proposed shape):**
```tsx
{/* Floating bottom action row — mirrors the top drag-strip pattern from
    window-chrome.tsx but anchored to the bottom-INSIDE-the-window edge per
    G-100-C C1. */}
<div className='absolute inset-x-0 bottom-0 z-20 flex h-9 items-center
                justify-center gap-1 border-t border-border-default
                bg-white/90 backdrop-blur-xl px-2'>
    {(['chat','teach','watch','auto'] as const).map((m) => {
        const Icon = MODE_ICONS[m]
        const active = openDrawer === m
        return (
            <Tooltip key={m}>
                <TooltipTrigger asChild>
                    <button
                        type='button'
                        onClick={() => toggleDrawer(m)}
                        aria-pressed={active}
                        aria-label={MODE_LABELS[m]}
                        className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-radius-sm',
                            'transition-colors',
                            active
                                ? 'bg-surface-2 text-text-primary'
                                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                        )}
                    >
                        <Icon size={16} />
                    </button>
                </TooltipTrigger>
                <TooltipContent side='top'>{MODE_LABELS[m]}</TooltipContent>
            </Tooltip>
        )
    })}
</div>
```

The wrapping container outside the bar must be `relative` (or `flex flex-col` with the bar as a non-absolute sibling at the bottom) so `absolute inset-x-0 bottom-0` reaches the right edge. Existing `webapp-stream-window.tsx:404-405` already wraps everything in `<div className='flex h-full w-full flex-row bg-surface-base'>` — change to `<div className='relative flex h-full w-full flex-col bg-surface-base'>` so the bar can anchor to the bottom of the window content.

---

### Slide-In Drawer (Sheet — RIGHT side)

**Source:** `livos/packages/ui/src/routes/docker/resources/container-detail-sheet.tsx:962-968`
**Apply to:** `webapp-stream-window.tsx` (4 mode drawers, controlled by `openDrawer` state)

**Concrete shape:**
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
        side='right'
        className='!w-full !max-w-full sm:!w-[600px] sm:!max-w-[600px] overflow-hidden'
        closeButton={false}
    >
        <div className='relative z-10 flex h-full flex-col'>
            {/* Header */}
            <div className='flex shrink-0 items-center justify-between
                            border-b border-border-default p-4'>
                {/* ... title + action buttons ... */}
            </div>
            {/* Body */}
        </div>
    </SheetContent>
</Sheet>
```

**Width override per CONTEXT G-100-D D2 (~35% window width):** swap `sm:!w-[600px]` for `sm:!w-[35%]` or use a CSS variable. Note that the Sheet is portaled to `document.body` (see `sheet.tsx:60-95`), so "35% of the window" really means "35% of the viewport" — for the Phase 100 window-content use case this is approximately equivalent and the existing pattern doesn't constrain to a parent ref.

**Sheet primitive surface (`sheet.tsx:36-51`) — pre-existing `side='right'` variant:**
```typescript
right:
    'inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right
     data-[state=open]:slide-in-from-right sm:max-w-sm rounded-l-24',
```

The `w-3/4` default (75%) is overridden to 35% via the `className` prop pass-through (the example uses `!w-[600px]` to override). Animation `slide-in-from-right` is built in.

**Backdrop / overlay note:** `sheet.tsx:67-68` shows `<SheetOverlay />` is commented out by convention and a `backdrop` prop slot is passed through. WebApp drawers should pass `backdrop={null}` so the stream behind stays visible while the drawer is open (per UX intent of "click button → see drawer alongside the stream"). If the stream needs an overlay scrim, render a custom translucent div as the `backdrop` prop value.

---

### Lucide Icon Imports (already established convention)

**Source:** `livos/packages/ui/src/modules/window/webapp-toolbar.tsx:12`, `webapp-stream-window.tsx:30`, `webapp-skills-sidebar.tsx:24`, `mobile-nav-bar.tsx:1`
**Apply to:** all new icon usage in Phase 100

```typescript
import {MessageCircle, GraduationCap, Eye, Bot} from 'lucide-react'
// existing already-imported set in webapp-stream-window.tsx:
import {AlertTriangle, RefreshCw, Square} from 'lucide-react'
```

**Convention:** the project uses BOTH `lucide-react` (window subsystem, mobile nav, AI chat) AND `@tabler/icons-react` (docker subsystem). For Phase 100 stay with `lucide-react` because every existing file in `livos/packages/ui/src/modules/window/` uses it. Suggested icons per V33-MULTI-03:
| Mode  | Icon              |
|-------|-------------------|
| Chat  | `MessageCircle`   |
| Teach | `GraduationCap`   |
| Watch | `Eye`             |
| Auto  | `Bot`             |

All 4 are confirmed exports of `lucide-react@latest` (no new dep — `lucide-react` is already in `package.json` per the existing imports above).

---

### Sudo + X11-Env Subprocess Spawn Pattern

**Source:** `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts:62-87` (canonical D-99-01)
**Apply to:** `window-manager.ts:223-238` (in-place argv tweak; pattern is preserved, only the Chrome flag changes)

```typescript
const args = [
    '-n', '-u', 'bruce',
    `DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
    `XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,
    /* binary path */, /* binary-specific args */
]
const proc = factory('sudo', args, {
    /* stdio + env overlay */
    env: {...process.env, ...WEBAPPS_X11_ENV},
})
```

**Key constraint (preserved):** `WEBAPPS_X11_ENV` is the single source of truth (`window-discovery.ts:49-56`). All sudo prefixes pass `DISPLAY=` and `XAUTHORITY=` as command-line env (env_keep-independent) AND merge into `spawn` options' `env` (so child processes that re-exec inherit it). Both window-manager.ts AND vnc-bridge.ts already do this correctly.

---

### Sacred SHA Gate (NO EXISTING HOOK)

**Source:** none — there is no `.husky/`, no pre-commit hook, no scripts/sacred check anywhere in the repo. The constraint exists only in CONTEXT.md / memory.

**Apply to:** every plan in Phase 100. Each PLAN.md should include a manual gate at the top of its action checklist:

```bash
# Pre-commit gate (required by D-100-SACRED):
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# MUST output: f3538e1d811992b782a9bb057d1b7f0a0189f95f
# If different: abort, restore the file, do NOT commit.
```

**Recommended:** plan 100-01 (or a new 100-00 setup task) introduces a real `.husky/pre-commit` hook to automate this. Existing `package.json` scripts can be inspected by the planner to wire it. There is precedent for the SHA appearing in `vnc-bridge.ts:18` (file-level docstring callout) — the hook would replace prose with enforcement.

---

### Test Convention — Source-Text Invariants (NO React Testing Library)

**Source:** `livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx:1-16`
**Apply to:** any new UI test in Phase 100

```typescript
// @vitest-environment jsdom

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

const COMPONENT_PATH = resolve(__dirname, 'app-contents/webapp-stream-window.tsx')
const SRC = readFileSync(COMPONENT_PATH, 'utf8')

describe('Component — source-text invariants', () => {
    it('imports X from Y', () => {
        expect(SRC).toMatch(/from\s+['"]some\/module['"]/)
    })
})
```

**Convention rationale (from line 6):** `@testing-library/react` is NOT installed (D-NO-NEW-DEPS). All UI tests in this package are regex-against-source. New Phase 100 tests must follow this convention — do not propose adding RTL.

---

### Test Convention — Argv Content Assertion

**Source:** `livos/packages/livinityd/source/modules/streaming/stream-manager.test.ts:286-311`
**Apply to:** the new `window-manager.test.ts` Test 11 (`--app=URL` argv assertion)

```typescript
const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
expect(cmd).toBe('sudo')
expect(args).toContain('--app=https://duckduckgo.com')
expect(args).not.toContain('--new-window')
```

`toContain` (not `toEqual` against the full array) keeps the test resilient to argv reordering / additions; the existing window-manager.test.ts tests already assert on output shape via `started[0].mode` rather than full argv, so this is the first place argv-ordering would be tested.

---

## No Analog Found

| File / pattern | Role | Reason |
|----------------|------|--------|
| Bottom action-bar (4-icon row anchored INSIDE-window-bottom) | UI primitive | `livos/packages/ui` has no existing horizontal icon-button row of this shape. Closest is `docker/sidebar.tsx` (vertical) and `window-chrome.tsx` (top, floating outside window border). New code must compose `webapp-toolbar.tsx`'s `buttonBase` class + `docker/sidebar.tsx`'s Tooltip-wrap pattern from scratch. |
| Sacred SHA pre-commit gate | tooling | No `.husky/`, no `scripts/sacred*`, no existing hook. Currently enforced by prose in CLAUDE.md and CONTEXT.md only. Planner should introduce a real hook in 100-00 or as a sub-task in 100-01. |
| Chrome `--app=URL` spawn | backend convention | This flag is not used anywhere in the repo today. Only `--new-window` (window-manager.ts:231) exists. The 100-02 plan introduces this as a new convention; argv style mirrors vnc-bridge.ts:62-87. |
| `xprop _NET_WM_PID` matcher (if H2 hypothesis lands) | discovery primitive | window-discovery.ts only uses `wmctrl -lG`, `xdotool getwindowname/getwindowgeometry/windowactivate/windowkill`, and `xdpyinfo`. No `xprop` invocation exists. Introduce as new `execFileAsync('xprop', ['-id', String(wid), '_NET_WM_PID'])` mirroring `getWindowGeometry` parse style (lines 217-244). |

---

## Metadata

**Analog search scope:**
- `livos/packages/ui/src/modules/window/**` (full)
- `livos/packages/ui/src/shadcn-components/ui/{sheet,popover,drawer}.tsx`
- `livos/packages/ui/src/routes/docker/**` (sidebar + container-detail-sheet)
- `livos/packages/ui/src/modules/mobile/mobile-nav-bar.tsx`
- `livos/packages/livinityd/source/modules/webapps/**` (full)
- `livos/packages/livinityd/source/modules/streaming/{vnc-bridge.ts,stream-manager.test.ts}` (read-only reference)

**Files scanned:** ~25 read in full or in targeted ranges; ~50 grep'd for patterns

**Pattern extraction date:** 2026-05-08

**Sacred SHA constraint:** `liv/packages/core/src/sdk-agent-runner.ts` was NOT scanned, NOT read, NOT analyzed. All pattern sources are confined to `livos/` per D-100-SACRED.

**Phase boundary check:** all extracted patterns are minimum-surface-area: backend is 1-line argv tweak + 1 new test case; frontend is composition rewire (no new deps, no new shadcn primitives, no architectural changes to the window-manager Zustand store, no tRPC contract changes). PATTERNS.md preserves this boundary — none of the cited analogs require structural lifts.
