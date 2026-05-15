---
phase: 121-mini-pc-long-tail-and-audit
plan: 03
subsystem: mini-pc-ui
wave: 2
status: code-complete-pending-operator-uat
date: 2026-05-14
tags: [v35, design-system, mini-pc, tokens, window-chrome, webapp-launcher, restyle, long-tail, wave-2]
requires:
  - "120-01 (Tailwind preset + design-tokens deps + index.css wired)"
  - "120-02 (chrome dock + apple-spotlight, audited NOOPs in window-content + windows-container deferred to 121-03)"
  - "121-01 (features/{backups,local-setup,factory-reset} migrated -- precedent for honest tally + scope-deferral)"
provides:
  - "modules/window window chrome (window.tsx + window-chrome.tsx) on canonical card-bg + dash-line tokens"
  - "modules/window window-content.tsx + windows-container.tsx audited canonical NOOP (zero literals on entry; already on v32 semantic where painted)"
  - "modules/window WebApp Launcher overlay (floating-action-bar + floating-skills-button + skills-sidebar + skill-replay-scrubber + teach-popover + 4 app-contents/webapp-*.tsx) on canonical tokens"
  - "modules/window/app-contents per-app dialogs audited (12 of 18 already canonical NOOP; 2 deliberately dark surfaces deferred to v36 dark-token; 4 app-store-routes scope-deferred to 121-04)"
affects:
  - "Visual layer only -- D-121-NO-FUNCTIONAL-CHANGES enforced via strict handler-anchored behavioral-guard regex"
  - "Window chrome (drag/resize/snap/focus/zindex) -- D-121-MINI-PC-OPERATOR-PRIORITY extra-strong guard, byte-identical handler bodies verified"
tech-stack:
  added: []
  patterns:
    - "Tailwind class swap via Edit tool (mechanical token-map)"
    - "Strict handler-anchored regex (foo= and foo() anchors) -- avoids false-match on Tailwind utility class substrings like 'backdrop-blur', 'focus:'"
    - "Test invariant preservation -- T-09-09-01 (webapp-stream-window.unit.test.tsx:356-365) locks bg-red-500 / isRecording branch verbatim on Teach icon; kept literal"
key-files:
  created:
    - ".planning/phases/121-mini-pc-long-tail-and-audit/121-03-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/modules/window/window.tsx (bg-white/95 -> bg-card-bg/95; border-neutral-200/50 -> border-dash-line, windowClass tw template)"
    - "livos/packages/ui/src/modules/window/window-chrome.tsx (2x bg-white/90 -> bg-card-bg/90 on close button + title pill; 2x border-neutral-200/60 -> border-dash-line)"
    - "livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx (5 hunks: idle action-button bg/border/text; chat-input bar bg+border; send-disabled bg+text; close-button hover; ChatResponseBar rounded-2xl+bg+border; Stop-stream bg-red-500; chat-response close hover)"
    - "livos/packages/ui/src/modules/window/webapp-floating-skills-button.tsx (2 hunks: skills button bg/border/text; delete hover bg-red-500/10+text-red-500)"
    - "livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx (3 hunks: error text-red-400; trash hover bg-red-500/10+text-red-400; AlertDialog destructive Delete button bg-red-500/hover-red-600)"
    - "livos/packages/ui/src/modules/window/skill-replay-scrubber.tsx (1 hunk: error text-red-400 -> text-accent-red; bg-black/85 backdrop kept for skill replay overlay dark theme)"
    - "livos/packages/ui/src/modules/window/teach-popover.tsx (2 hunks: input focus:border-blue-500 -> focus:border-accent-blue; Save button bg-blue-500/hover-blue-600 -> bg-accent-blue/hover-accent-blue/90)"
    - "livos/packages/ui/src/modules/window/app-contents/webapp-chat-bottom-bar.tsx (1 hunk: backdrop bar bg-white/95 -> bg-card-bg/95)"
    - "livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx (5 hunks: AlertTriangle text-amber-400; VncOverlay error text-red-400; TeachAutoStopBanner bg-amber-500/90 with intentional text-black for banner contrast; SaveSkillDialog inline error text-red-400; SaveSkillDialog Save button bg-blue-500/hover-blue-600 -> accent-blue family)"
    - "livos/packages/ui/src/modules/window/app-contents/webapp-teach-drawer.tsx (1 hunk: Record button bg-blue-500/hover-blue-600 -> bg-accent-blue/hover-accent-blue/90)"
    - "livos/packages/ui/src/modules/window/app-contents/webapp-skills-popover.tsx (2 hunks: trigger button bg-white/90 + hover:bg-white -> bg-card-bg/90 + hover:bg-card-bg; delete hover bg-red-500/10+text-red-500 -> accent-red family)"
decisions:
  - "Class-only token migration -- ZERO event-handler / hook / ref / state / motion-config / drag-config bytes changed across all 11 modified files. Strict handler-anchored regex (foo= / foo() anchors) PASS on both task diffs. The plan's looser regex matched on Tailwind utility class substrings like 'backdrop-blur' (substring 'blur') and 'focus:' (substring 'focus') -- documented + verified false-positive; tightened regex confirms true behavioral parity."
  - "T-09-09-01 test invariant preserved -- webapp-stream-window.unit.test.tsx:356-365 locks `bg-red-500` literal tied to `isRecording` branch on Teach icon button. webapp-floating-action-bar.tsx:292 keeps `bg-red-500/90 border-red-500/80` AND :314 keeps `bg-red-600 text-white ... ring-white` (recording-state click-count badge tied to the same test) verbatim. Migration to bg-accent-red would have broken the regex assertion `expect(barSrc).toMatch(/isRecording\\s*&&\\s*[\"'`][^\"'`]*bg-red-500/)`. Deviation documented; migrate via test update in v36."
  - "chrome-content + terminal-content NOT migrated -- both files use `bg-neutral-900` + `bg-neutral-800` + `text-neutral-{200,400,500,600,700}` palette across the entire surface as INTENTIONAL DARK theme (Chrome iframe loading state surface + Terminal app emulator UI). Migrating to canonical `card-bg` light-default would break the dark-theme aesthetic that's core to both apps' visual identity. Carry-over to v36 dark-token expansion (paired `bg-card-bg-dark` / `text-on-dark-*` tokens needed; not in v35 scope per Phase 121 CONTEXT acceptance criteria 5)."
  - "app-store-routes/* (4 files: app-page-window, discover-window, marketplace-app-window, shared-components) NOT migrated -- these are deep app-store sub-route surfaces (shared-components.tsx alone is 400+ lines with 4 card variants + gradient orb color tables). Scope-aligned to Plan 121-04 (routes/* batch) per CONTEXT routing decision; D-121-OPERATOR-CHECKPOINTS in 121-04 owns operator UAT between sub-batches. 121-03 mandate scope ends at the modules/window namespace's per-app inner-dialog WRAPPERS, not their nested route trees. Documented carry-over."
  - "ui-kit primitive swap = 0 introduced (matches 121-01 precedent) -- D-121-NO-FUNCTIONAL-CHANGES forbids prop API drift. Migration targets used Magnetic + framer-motion.div wrapped buttons (asChild semantics), shadcn AlertDialog + AlertDialogAction (variant='destructive'), shadcn Popover, shadcn DialogContent + DialogFooter -- all with handler signatures that would change shape if wrapped in ui-kit Button/Modal. Plan 121-05 (shadcn audit) owns swap analysis with prop adapter shims."
  - "window-content.tsx + windows-container.tsx audited canonical NOOP -- zero non-canonical literals on entry. Phase 120-02 explicitly carry-forwarded these to 121-03; on inspection they paint zero color/radius classes (windows-container is pure orchestration; window-content uses `text-text-secondary` v32 semantic for the fallback paragraph). Audit-only NOOP documented."
metrics:
  duration: "~50 min"
  completed: "2026-05-14"
  commits: 2
  files_migrated: 11
  files_audited_canonical: 13
  files_scope_deferred: 4
  files_dark_carry_over: 2
  literal_swaps: 31
---

# Phase 121 Plan 03: modules/window long-tail (chrome + WebApp Launcher + app-contents) — Summary

Migrated 11 .tsx files across two sub-areas (window chrome 2 + WebApp Launcher 9) of modules/window from raw Tailwind color/radius literals (white, neutral, red, amber, blue, rounded-2xl) to canonical design-tokens (bg-card-bg, bg-card-bg-2, border-dash-line, text-text-{primary,secondary,tertiary}, bg-accent-{red,amber,blue}, rounded-dash). 13 files audited canonical NOOP (pre-existing v32 semantic or zero literals). 2 files deliberately deferred to v36 dark-token expansion (chrome-content + terminal-content -- intentional dark surfaces). 4 files scope-deferred to Plan 121-04 routes/* batch (app-store-routes/*). 2 atomic commits shipped; sacred SHA preserved 2/2; build PASS 2/2; behavioral-guard regex PASS 2/2.

## Plans shipped

| Sub-batch | Commit | Status | Files | Build | Sacred SHA | Behavioral-guard |
|---|---|---|---|---|---|---|
| Window chrome (window + window-chrome; window-content + windows-container audited NOOP) | `d2afdedc` | PASS | 2 | PASS | preserved | PASS |
| WebApp Launcher + skill-replay + teach-popover + app-contents/webapp-* | `542d9582` | PASS | 9 | PASS | preserved | PASS |

## Per-sub-area migration matrix

### Window chrome (2 files modified, 2 audited canonical NOOP)

| File | Migrations |
|---|---|
| `window.tsx` | windowClass tw template: `bg-white/95` -> `bg-card-bg/95`; `border-neutral-200/50` -> `border-dash-line` |
| `window-chrome.tsx` | Close button: `bg-white/90` -> `bg-card-bg/90`, `border-neutral-200/60` -> `border-dash-line` (kept `hover:bg-destructive` v32 semantic). Title pill: same 2 swaps |
| `window-content.tsx` | AUDITED-CANONICAL-NOOP -- file paints `text-text-secondary` v32 semantic for fallback paragraph; zero non-canonical literals |
| `windows-container.tsx` | AUDITED-CANONICAL-NOOP -- pure orchestration component, zero color/radius classes |

**Window-chrome event handlers verified byte-identical:** `handleDragStart` (onMouseDown title-bar), `handleResizeStart` (8x onMouseDown on resize handles N/S/E/W/NE/NW/SE/SW), `handleMouseMove` (global doc listener during drag), `handleResizeMove` (global doc listener during resize), `handleMouseUp` + `handleResizeUp` (drag/resize commit-and-clamp), `handleFocus` (onPointerDown z-index lift), `handleClose` (close button). useState (isDragging, dragOffset, isResizing, resizeDirection), useRef (dragStartPos, initialPosition, resizeStartPos, resizeStartSize, resizeStartPosition), useEffect (global mouse listener installation + cleanup with cursorMap). framer-motion `motion.div` morph animation (initial / animate / exit / transition + originRect spring config) untouched.

### WebApp Launcher + skill-replay + teach-popover (8 files modified, 1 audited canonical NOOP)

| File | Migrations |
|---|---|
| `webapp-floating-action-bar.tsx` | (5 hunks) IconBar idle button bg+border+text (line 296); chat-input pill bg+border (456); send-button disabled state bg+text (493); chat-input close button text+hover (502); ChatResponseBar shell rounded-2xl+bg+border (618); Stop-streaming bg-red-500 (649); chat-response close button text+hover (667). T-09-09-01 invariants on line 292 (`bg-red-500/90 border-red-500/80 text-white hover:bg-red-500` isRecording branch) + line 314 (`bg-red-600 text-white ring-white` recording click-count badge) PRESERVED VERBATIM |
| `webapp-floating-skills-button.tsx` | (2 hunks) outer button bg+border+text (94); trash hover bg-red-500/10+text-red-500 (136) -> accent-red family |
| `webapp-skills-sidebar.tsx` | (3 hunks) error text-red-400 (116); list-row delete hover bg-red-500/10+text-red-400 (146); AlertDialogAction destructive button bg-red-500+hover-red-600 (182) -> accent-red family |
| `skill-replay-scrubber.tsx` | (1 hunk) error text-red-400 (189) -> text-accent-red. bg-black/85 backdrop + border-white/10 top-bar + text-white/{70,80} kept (intentional full-bleed dark overlay during replay; not a "light/dark/iridescent" surface) |
| `teach-popover.tsx` | (2 hunks) input focus:border-blue-500 (103) -> focus:border-accent-blue; Save button bg-blue-500+hover-blue-600 (124) -> accent-blue family |
| `webapp-chat-bottom-bar.tsx` (app-contents/) | (1 hunk) backdrop bottom-bar bg-white/95 (94) -> bg-card-bg/95 |
| `webapp-stream-window.tsx` (app-contents/) | (5 hunks) SpawnErrorBanner AlertTriangle text-amber-400 (784); VncOverlay error variant text-red-400 (801); TeachAutoStopBanner bg-amber-500/90 (826) -> bg-accent-amber/90 [kept text-black + bg-black/{20,30} inner button contrast intentional banner aesthetic]; SaveSkillDialog inline error text-red-400 (895); SaveSkillDialog Save bg-blue-500+hover-blue-600 (914) -> accent-blue family |
| `webapp-teach-drawer.tsx` (app-contents/) | (1 hunk) Record button bg-blue-500+hover-blue-600 (69) -> bg-accent-blue/hover-accent-blue/90 |
| `webapp-skills-popover.tsx` (app-contents/) | (2 hunks) trigger bg-white/90 + hover:bg-white (55-57); delete hover bg-red-500/10+text-red-500 (96) -> accent-red family |
| `webapp-mode-selector.tsx` | AUDITED-CANONICAL-NOOP (zero literals) |
| `webapp-chat-drawer.tsx` (app-contents/) | AUDITED-CANONICAL-NOOP (zero literals) |
| `webapp-teach-popup-host.tsx` (app-contents/) | AUDITED-CANONICAL-NOOP (zero literals) |

**Phase 99/110 VNC-stream handlers verified byte-identical:** `useWebAppVnc` hook calls, `useWebAppAgent` hook calls, `webapp.window.spawn.useMutation`, `webapp.window.close.useMutation`, `webapp.list.useQuery`, `closeMutationRef.current.mutate`, `KEY_*` constants, `SpawnErrorBanner` props, `TeachAutoStopBanner` recording auto-stop callback, `SaveSkillDialog` SKILL_NAME_RE validation -- all untouched. Phase 100-09-09 isRecording branch lock + click-count badge lock verbatim.

### app-contents per-app dialogs (13 audited canonical NOOP, 2 dark carry-over, 4 scope-deferred)

| File | Status |
|---|---|
| `ai-chat-content.tsx` | AUDITED-CANONICAL-NOOP -- Plan 120-04 already migrated to canonical |
| `app-store-content.tsx` | AUDITED-CANONICAL-NOOP -- Plan 120-05 already migrated; only `text-white/60` on `NoApiKeyMessage` (intentional hero overlay text on dark backdrop) |
| `docker-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `files-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `my-devices-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `remote-desktop-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `schedules-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `server-control-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `settings-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `subagents-content.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `app-store-routes/category-page-window.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `app-store-routes/app-store-layout-window.tsx` | AUDITED-CANONICAL-NOOP -- zero non-canonical literals |
| `chrome-content.tsx` | DARK-CARRY-OVER (v36 dark-token) -- bg-neutral-900 + text-red-400 + text-neutral-400 + border-blue-500 painted across loading state surface; intentional dark theme |
| `terminal-content.tsx` | DARK-CARRY-OVER (v36 dark-token) -- bg-neutral-{700,800,900} + text-neutral-{100,200,400,500,600} painted across terminal surface; intentional terminal-emulator dark aesthetic |
| `app-store-routes/app-page-window.tsx` | SCOPE-DEFERRED-121-04 -- text-neutral-{500,900} + rounded-2xl + ring-neutral-200/60 + rounded-3xl across app detail page; aligned to routes/* batch |
| `app-store-routes/discover-window.tsx` | SCOPE-DEFERRED-121-04 -- text-neutral-{500,600,900} + 12+ gradient orb literals (bg-blue-200/40, bg-amber-200/40, etc. data-table-driven) + rounded-2xl x4 + border-neutral-200/80 x2 |
| `app-store-routes/marketplace-app-window.tsx` | SCOPE-DEFERRED-121-04 -- bg-black/10 overlay |
| `app-store-routes/shared-components.tsx` | SCOPE-DEFERRED-121-04 -- 400+ line file with 4 card variants, 15+ rounded-xl/2xl/3xl, 10+ text/border-neutral; aligned to routes/* batch scope per CONTEXT |

## ui-kit import counts

Plan acceptance criteria asked for ui-kit imports >= 10 across modules/window. **Honest count: 0 introduced this plan**, deferred to Plan 121-05 (shadcn audit) for these reasons:

1. **window.tsx** wraps in framer-motion `motion.div` with `initial / animate / exit / transition` props + `originRect` morph config; not swappable to ui-kit Card without losing the morph animation primitive.
2. **window-chrome.tsx** wraps the close button in `<Magnetic intensity={0.3} range={60} springOptions={...}>`; ui-kit Button doesn't expose the Magnetic + asChild forwarding semantics.
3. **webapp-floating-action-bar.tsx** uses native `<button>` inside `<Magnetic>` + `<Tooltip>`; the IconBar dispatches to `webappWindowManager` via `handleIconClick` (10+ branch logic on `id` discriminator). Wrapping in ui-kit Button would change the onClick signature.
4. **webapp-skills-sidebar.tsx** uses shadcn `<AlertDialog>` + `<AlertDialogAction>` with `variant='destructive'` semantic prop; ui-kit Modal has different prop API. shadcn ChevronRight inside text-only collapse button.
5. **teach-popover.tsx** uses Radix `Popover.Root + Popover.Trigger + Popover.Portal + Popover.Content`; not 1:1 swappable to ui-kit Modal.
6. **webapp-stream-window.tsx** uses shadcn `<Dialog>` + `<DialogContent>` + `<DialogFooter>` for SaveSkillDialog; native `<button>`s inside dialog wired to `onSave` / `onCancel` callbacks.
7. **app-contents/webapp-skills-popover.tsx** uses shadcn `<Popover>` + `<PopoverTrigger>` + `<PopoverContent>`; not 1:1 swappable.

Decision: **honest tally** -- ship token migration with ui-kit-import-count = 0, log carry-over to 121-05 for shadcn-audit pass. Matches Phase 120-02 + 121-01 precedent.

## Sacred SHA verification (D-121-SACRED-SHA + D-V35-SACRED-SHA)

| Checkpoint | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` |
|---|---|
| Pre-plan | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-chrome commit (`d2afdedc`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-webapp commit (`542d9582`) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| **Result** | **PRESERVED 2/2 commits** |

## Behavioral-guard verification (D-121-NO-FUNCTIONAL-CHANGES)

Two regex passes per commit:

**Loose regex (plan-as-written):**
```
git diff --unified=0 -- <files> | grep -E "^[-+].*(onMouseDown|onMouseMove|onMouseUp|onPointerDown|...|focus|blur|drag|resize|...).*"
```

This regex matches on Tailwind utility class substrings (`backdrop-blur` contains `blur`, `focus:` contains `focus`, `transition-all` does NOT contain `transition`). Documented as false-positive on the chrome diff.

**Strict regex (handler-anchored):**
```
git diff --unified=0 -- <files> | grep -E "^[-+].*(onMouseDown=|onMouseMove=|onMouseUp=|onPointerDown=|onFocus=|onBlur=|onClick=|onChange=|useMutation\(|useQuery\(|useEffect\(|useState\(|useRef\(|useMemo\(|useCallback\(|trpc\.|fetch\(|streamManager|webappWindowManager|skillReplay|isRecording|isStreaming|position\.x|position\.y|\.transform\b|\bzIndex:).*"
```

| Commit | Strict-regex output |
|---|---|
| `d2afdedc` (chrome) | (no match) -> **BEHAVIORAL-GUARD-STRICT: PASS** |
| `542d9582` (webapp) | (no match) -> **BEHAVIORAL-GUARD-STRICT: PASS** |

All event handler bodies + hook calls + drag/resize/snap state-machine + framer-motion morph configs + tRPC mutation/query calls byte-identical pre/post-migration across all 11 modified files.

## Final non-canonical literal count (modules/window/)

```
$ grep -rcE "bg-(zinc|red|amber|green|blue)-(50|100|200|400|500|600|700|800|900)\b" livos/packages/ui/src/modules/window/ | grep -v ":0$"
livos/packages/ui/src/modules/window/app-contents/app-store-routes/discover-window.tsx:6     [scope-deferred to 121-04]
livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx:5                        [T-09-09-01 test-locked: bg-red-500/90 + bg-red-500/80 + bg-red-500 + bg-red-600 ring -- isRecording branch + click-count badge]
livos/packages/ui/src/modules/window/webapp-stream-window.unit.test.tsx:4                    [test file, untouched]
```

(chrome-content + terminal-content + app-page-window + marketplace-app-window + shared-components dark/scope-deferred items show under broader regex; the 5/4/6 counts above are only the strict `bg-{color}-{50-900}` palette literals.)

## Out-of-scope verification

`git diff 7b16fafe..HEAD -- livos/packages/livinityd/ liv/ scripts/ .github/` = **empty** (only Plan 121-01 and 121-03 commits + parallel 121-02 wave 2 commits in master between pre-plan checkpoint and now). No backend / liv core / deploy-script touches.

## Build verification

```
cd livos && pnpm --filter ui build
```
Exit 0 after both commits. Build artifacts: dist/sw.js, dist/workbox-2b3e6643.js, 206 PWA precache entries. Only warning: chunk size >500 kB (pre-existing, unchanged by this plan).

## Operator UAT

### A. Window chrome (extra-detailed -- D-121-MINI-PC-OPERATOR-PRIORITY)

```
1. SSH to Mini PC: /c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
2. Run: bash /opt/livos/update.sh
3. Browse: https://bruce.livinity.io (hard-reload)
4. Window chrome behavioral parity:
   a. Open any app from dock (Settings, Files, etc.)
   b. DRAG the window title pill: position updates smoothly, no jank; release commits new position
   c. RESIZE from each corner (NW, NE, SW, SE): all 4 corner handles work, 8 directions of size delta
   d. RESIZE from each edge (N, S, E, W): all 4 edge handles work, axis-locked resize
   e. MINIMIZE (if dock has minimize affordance): window disappears, dock badge persists
   f. CLOSE: click the X-shaped close button (left of title pill); window removed, no orphan DOM
   g. FOCUS: click on inactive window; z-index lifts to top, title pill remains styled with bg-card-bg
   h. Edge proximity: drag towards left/right/top screen edge -- visual feedback (if implemented)
5. Window chrome visual parity:
   a. Title pill renders bg-card-bg/90 (slightly off-white on light theme; near-black on dark theme)
   b. Border on title pill renders border-dash-line (subtle hairline)
   c. Close button hover stays red (kept hover:bg-destructive v32 semantic intact)
   d. Window frame renders bg-card-bg/95 backdrop-blur on all surfaces
   e. Theme toggle (light/dark/iridescent) cycles all chrome surfaces correctly
```

### B. WebApp Launcher (Phase 99/110 carry-over)

```
1. Right-click desktop -> "Open as Chrome window" or pick a WebApp
2. Stream window renders with x11vnc backend (Phase 99 VNC swap)
3. Floating action bar at bottom:
   - All 5 icon buttons (Chat, Teach, Auto, Watch placeholder, Skills) render bg-card-bg/90 in idle
   - Hover any -> bg-primary (kept), text turns white
   - Click TEACH while not recording -> button enters isRecording branch -> turns RED (bg-red-500/90 locked by T-09-09-01)
   - Numeric click-count badge appears top-right of Teach button as user clicks in VNC pane (bg-red-600 ring-white)
   - Click TEACH again -> stops recording, save dialog opens
4. Click CHAT icon -> action bar morphs into chat input bar (bg-card-bg/95 + border-dash-line)
   - Type a message, press Enter; assistant streams back into ChatResponseBar (rounded-dash + bg-card-bg/95)
   - Click Stop (red bg-accent-red) -> agent interrupts; New (Plus) appears
5. Click SKILLS button (top-right of window, outside the frame):
   - bg-card-bg/90 + border-dash-line; hover -> bg-primary
   - Popover lists saved skills
   - Click Play -> SkillReplayScrubber overlay appears (bg-black/85 backdrop intentional dark)
   - Click Delete -> bg-accent-red/10 hover, AlertDialog with bg-accent-red Delete button
6. Teach popover: hover an unlabelled action in TeachPopupHost -> input renders with focus:border-accent-blue, Save with bg-accent-blue
```

### C. Per-app content windows (audited canonical)

```
Open each app, verify inner content renders WITHOUT visual regression vs Phase 120 baseline:
- AI Chat -> already on Phase 120-04 canonical tokens
- App Store (main) -> already on Phase 120-05 canonical tokens
- App Store sub-routes (discover, app detail, marketplace) -> SCOPE-DEFERRED 121-04; expect Phase-120-pre-canonical look until 121-04 ships
- Settings -> v32 semantic tokens (no change)
- Files / Docker / Server Control / Schedules / Subagents / My Devices / Remote Desktop -> v32 semantic tokens (no change)
- Chrome -> dark surface (bg-neutral-900) intentionally retained; v36 dark-token carry-over
- Terminal -> dark surface (bg-neutral-{700,800,900}) intentionally retained; v36 dark-token carry-over
```

### D. Theme toggle smoke

```
1. Open Settings -> Apparence (or wherever the theme toggle lives)
2. Cycle: light -> dark -> iridescent
3. Confirm:
   - Window chrome bg-card-bg cycles correctly (white -> dark -> shimmer)
   - WebApp Launcher floating bar bg-card-bg cycles correctly
   - Skill replay overlay stays dark (intentional)
   - Chrome / Terminal apps stay dark (intentional carry-over)
```

**Report PASS/FAIL in chat. If window drag/resize feels different in any way, REVERT `d2afdedc` and report.**

**Rollback (per-commit, D-121-INCREMENTAL-DEPLOY):**
```
git revert 542d9582              # rollback WebApp Launcher token migration only
git revert d2afdedc              # rollback window chrome token migration only
bash /opt/livos/update.sh        # redeploy
```
Each commit is independently revertable; reverting one does not affect the other.

## Deviations from plan

### [Rule 3 - blocking path mismatch] Plan path globs include 4 webapp-* files under app-contents/ that Task 2 ships

**Found during:** Task 2 file enumeration
**Issue:** Plan lists `webapp-chat-bottom-bar.tsx`, `webapp-chat-drawer.tsx`, `webapp-stream-window.tsx`, `webapp-teach-drawer.tsx`, `webapp-teach-popup-host.tsx` under `modules/window/` root in Task 2, but on disk they live under `modules/window/app-contents/`. Task 3 lists `app-contents/*` glob.
**Fix:** Took on-disk reality -- migrated webapp-* in their actual `app-contents/` location during the Task 2 commit (`542d9582`); Task 3 then audits the remaining app-contents/ files (the 13 non-webapp inner-app surfaces). Honest reorganization documented in matrices above.

### [Rule 4 - test invariant guard] T-09-09-01 locks bg-red-500 literal on Teach icon recording branch

**Found during:** Task 2 -- webapp-stream-window.unit.test.tsx grep
**Issue:** Plan instructs `bg-red-500` -> `bg-accent-red` migration. But test invariant `expect(barSrc).toMatch(/isRecording\\s*&&\\s*['"`][^'"`]*bg-red-500/)` (line 365) locks the literal `bg-red-500` to the isRecording-conditional branch on the Teach icon button.
**Fix:** Kept `webapp-floating-action-bar.tsx:292` (`bg-red-500/90 border-red-500/80 text-white hover:bg-red-500`) AND `:314` (`bg-red-600 text-white ... ring-white` click-count badge) verbatim. Migration would have broken regex source-text invariant assertion. Documented; migrate via paired token + test update in v36.

### [Rule 4 - dark surface scope] chrome-content + terminal-content are intentional dark surfaces

**Found during:** Task 3 audit
**Issue:** Both files paint `bg-neutral-900` + `text-neutral-{200,400,500,600,700}` across the entire content surface as deliberate dark-theme aesthetic (Chrome iframe loading state + Terminal app emulator). Migrating to `bg-card-bg` light-default would break the dark theme that's core to these apps' visual identity.
**Fix:** AUDITED-DARK-CARRY-OVER (v36 dark-token expansion). v35 canonical tokens are light-defaults; v36 needs paired `bg-card-bg-dark` / `text-on-dark-*` tokens for "always dark" surfaces. Not in v35 acceptance criteria.

### [Rule 1 - scope correction] app-store-routes/* aligned to 121-04 routes batch

**Found during:** Task 3 audit
**Issue:** 4 files (`app-page-window`, `discover-window`, `marketplace-app-window`, `shared-components`) under `app-contents/app-store-routes/` are deep app-store sub-route surfaces -- `shared-components.tsx` alone has 400+ lines, 4 card variants, 12 gradient orb literals (data-table-driven `bg-blue-200/40` / `bg-amber-200/40` etc.), 15+ rounded-xl/2xl/3xl, 10+ text-neutral / border-neutral classes. Migrating these in 121-03 risks visual regression breadth far exceeding Task 3 scope.
**Fix:** Honest scope correction -- aligned to Plan 121-04 (`routes/*` sub-batched per D-121-OPERATOR-CHECKPOINTS) per CONTEXT routing decision. Documented carry-over.

### [Carry-over to 121-05] ui-kit primitive swap deferred

See "ui-kit import counts" section above. 0 ui-kit imports introduced this plan; 121-05's shadcn-audit pass owns the swap analysis (each shadcn primitive / Magnetic / framer-motion wrapper / Radix Popover evaluated for ui-kit equivalent + prop adapter shim cost-benefit).

### [Plan regex false-positive documented] backdrop-blur Tailwind class matches blur substring

**Found during:** Task 1 behavioral-guard
**Issue:** Plan's regex includes `|blur|` and `|focus|` as bare-word substrings. Tailwind class `backdrop-blur-xl` contains substring `blur`; `focus:` arbitrary-property variant contains substring `focus`. These false-match on class literal changes.
**Fix:** Verified via tightened handler-anchored regex (foo= / foo() anchors). True behavioral diff = zero. Documented both regex results in evidence section above.

## Carry-overs

- **Plan 121-04** (Wave 3, routes/* batch): owns `app-contents/app-store-routes/*.tsx` (4 files) migration with operator UAT checkpoints between sub-batches per D-121-OPERATOR-CHECKPOINTS
- **Plan 121-05** (Wave 3, generic + shadcn audit): owns ui-kit primitive swap analysis for the 11 modified files this plan (shadcn AlertDialog / Popover / Dialog / Tooltip + Magnetic + framer-motion `motion.div` -> ui-kit equivalents with prop adapter shims), plus T-09-09-01 token migration paired with test update (`bg-red-500` -> `bg-accent-red` + test source-text invariant update)
- **v36 dark-token expansion** (post-v35): owns `chrome-content.tsx` + `terminal-content.tsx` migration to paired `bg-card-bg-dark` / `text-on-dark-*` canonical tokens for intentional dark surfaces
- **Plan 121-06** (Wave 4, cross-surface audit): will include window chrome + WebApp Launcher in Playwright snapshot baseline; will diff against pre-Phase 121 baseline for visual regression CI

## Self-Check: PASSED

- [x] `livos/packages/ui/src/modules/window/window.tsx` FOUND (1 hunk migrated, windowClass tw template)
- [x] `livos/packages/ui/src/modules/window/window-chrome.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` FOUND (7 hunks)
- [x] `livos/packages/ui/src/modules/window/webapp-floating-skills-button.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx` FOUND (3 hunks)
- [x] `livos/packages/ui/src/modules/window/skill-replay-scrubber.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/modules/window/teach-popover.tsx` FOUND (2 hunks)
- [x] `livos/packages/ui/src/modules/window/app-contents/webapp-chat-bottom-bar.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` FOUND (5 hunks)
- [x] `livos/packages/ui/src/modules/window/app-contents/webapp-teach-drawer.tsx` FOUND (1 hunk)
- [x] `livos/packages/ui/src/modules/window/app-contents/webapp-skills-popover.tsx` FOUND (2 hunks)
- [x] Commit `d2afdedc` FOUND in `git log` (chrome)
- [x] Commit `542d9582` FOUND in `git log` (webapp)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED 2/2
- [x] `pnpm --filter ui build` exits 0 (both commits)
- [x] Behavioral-guard regex (handler-anchored strict) PASS 2/2
- [x] T-09-09-01 invariant preserved (bg-red-500 on Teach icon isRecording branch + bg-red-600 click-count badge ring-white)
- [x] Phase 99/110 VNC stream handlers + agent socket wiring untouched
- [x] Window chrome event handlers (drag/resize/snap/focus/zIndex) byte-identical

Plan 121-03 closed pending Mini PC operator UAT.
