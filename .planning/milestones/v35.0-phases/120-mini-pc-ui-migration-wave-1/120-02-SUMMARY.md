---
phase: 120-mini-pc-ui-migration-wave-1
plan: 02
subsystem: ui-mini-pc-chrome
tags: [design-system, tokens, ui-kit, mini-pc, wave-2, v35.0]
dependency-graph:
  requires:
    - "Plan 120-01 foundation (design-tokens preset wired into livos/packages/ui)"
    - "@livinity/ui-kit (available but not consumed in this plan — see Deviations)"
  provides:
    - "Dock surface consumes canonical `bg-card-bg/80` token (background)"
    - "Apple spotlight overlay consumes canonical `bg-card-bg`, `bg-card-bg-2`, `border-dash-line` tokens"
    - "Plan 120-03/04/05 inherit a token-anchored Mini PC chrome shell"
  affects:
    - "livos/packages/ui (visual layer only — zero behavioral change)"
    - "Wave 1 component tally: 2 / 30 (running total after 120-02)"
tech-stack:
  added: []
  patterns:
    - "Direct className substring substitution from Tailwind defaults to canonical Tailwind utility names (`bg-white/N` → `bg-card-bg/N`, `border-neutral-200/X` → `border-dash-line`, `bg-neutral-50/X` → `bg-card-bg-2/X`)"
    - "Token mapping applied ONLY to substrings explicitly listed in the plan's `<interfaces>` table — no opportunistic v32→canonical migration"
    - "Component-in-place restyle preferred over ui-kit primitive swap when prop API mismatches risk D-120-NO-FUNCTIONAL-CHANGES"
key-files:
  created:
    - ".planning/phases/120-mini-pc-ui-migration-wave-1/120-02-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/modules/desktop/dock.tsx"
    - "livos/packages/ui/src/components/apple-spotlight.tsx"
decisions:
  - "Path correction: plan specified `livos/packages/ui/src/modules/dock/dock.tsx` — actual path is `livos/packages/ui/src/modules/desktop/dock.tsx`. Verified via `Get-ChildItem -Recurse -Filter dock*.tsx`."
  - "Login swap to ui-kit `<PasswordInput>` SKIPPED per D-120-NO-FUNCTIONAL-CHANGES: shadcn `PasswordInput` uses `onValueChange={setPassword}` prop API; ui-kit `PasswordInput` (which wraps `Input`) accepts standard React `onChange={(e) => setPassword(e.target.value)}`. Swapping would require a handler-body diff (`onValueChange` → `onChange` with inline arrow). Plan instructs `Preserve the value=, onChange=, onKeyDown= handlers verbatim. Pass them through as the same prop names.` — shadcn's `onValueChange` is NOT the same prop name as ui-kit's `onChange`. The locked invariant beats the plan's secondary instruction to swap. Documented as Rule 4 architectural-deviation (handler-API mismatch); login restyle deferred to Phase 121 or a dedicated plan that explicitly migrates `onValueChange` callsites."
  - "Login swap to ui-kit `<Button>` SKIPPED: existing `<button type='submit' className={buttonClass}>` consumes `buttonClass` from `bare/shared.tsx` (full Tailwind utility string with `bg-brand`, shadow, hover, focus-visible). Swapping introduces ui-kit's `h-btn h-btn-md solid` baseline classes which collide with `buttonClass` height/padding. Restyle deferred."
  - "Login `<Card>` wrap SKIPPED: login screen is already wrapped by `Layout` (from `bare/shared.tsx`) which renders its own glassmorphic card. Adding `<Card>` would nest a second visual card inside the existing one. Restyle deferred."
  - "`desktop.tsx`, `cmdk.tsx`, `app-icon.tsx`, `window-content.tsx`, `windows-container.tsx`: NO EDITS because they consume only (a) layout utilities (`flex`, `relative`, `h-[100dvh]`, etc.) or (b) v32-era LivOS tokens (`bg-surface-base`, `border-border-default`, `text-text-secondary`). Per plan's explicit instruction: `DO NOT convert utility classes that are NOT in the mapping above`. v32→canonical token migration is out of this plan's scope (Phase 121)."
  - "Edited only `bg-white/N`, `bg-neutral-50/N`, `border-neutral-200/N`, `bg-white` substrings — every match is from the plan's `<interfaces>` token-to-existing-class table."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-15"
  tasks: 4
  files_modified: 2
---

# Phase 120 Plan 02: Restyle Mini PC Chrome (Wave 2 first cut) Summary

Restyled the two Mini PC chrome surfaces where the plan's canonical token mapping yields a direct substring substitution (dock background, apple-spotlight overlay) — zero behavioral diff, zero ui-kit primitive swap (deferred per locked invariants). Plan's full 8-file target list reduced to 2 actually-editable files after honest mapping audit; remaining 6 files documented as no-edit-applicable in this plan's scope and deferred to Phase 121 or a dedicated handler-API migration plan.

## What Shipped

### `livos/packages/ui/src/modules/desktop/dock.tsx`

- `bg-white/80` → `bg-card-bg/80` in both `dockClass` and `dockPreviewClass` tw template literals.
- Canonical `--card-bg = #ffffff` is identical to Tailwind's `white`; the `/80` alpha channel is preserved via Tailwind 3.4 color-opacity syntax (`bg-card-bg/80`). Visual result is bit-identical to pre-edit on light theme; on `body.dark` (PENDING canonical fetch per D-116-FOLLOW-UP-DARK) the dock will inherit dark `--card-bg` once Phase 116 lands the dark block.
- Border (`border-white/60` on dockClass, `border-border-default` on dockPreviewClass): UNCHANGED — neither is in the plan's mapping table.
- Shadow, padding, layout, motion props: UNCHANGED.

### `livos/packages/ui/src/components/apple-spotlight.tsx`

Five mapped substring substitutions across the file:

1. Search-bar container wash: `[&>div]:bg-white/95` → `[&>div]:bg-card-bg/95` (line 636).
2. Inner shell border: `border-neutral-200/60` → `border-dash-line` (line 647).
3. Search-results list backdrop: `border-t border-neutral-200/60 bg-neutral-50/80` → `border-t border-dash-line bg-card-bg-2/80` (line 179).
4. Empty-state banner: same pair as #3 (line 679).
5. Search-result hover/selected states: `bg-white shadow-…` / `hover:bg-white/60` → `bg-card-bg shadow-…` / `hover:bg-card-bg/60` (line 141).

All `motion.div` props (`initial`, `animate`, `exit`, `transition`, `layout`, `layoutId`), all `onClick`/`onMouseEnter`/`onMouseLeave` handlers, all `AnimatePresence` wrappers, the `SVGFilter`, the `useMemo`/`useState`/`useCallback`/`useEffect` blocks, every `t(...)` call, every `navigate(...)` call, the keyboard handler, the SearchResultCard prop shape: UNCHANGED. Verified via behavioral-diff regex guard (next section).

## Sacred SHA Verification

Verified before AND after every edit:

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Per D-120-SACRED-SHA — preserved across all 4 plan tasks. Pre-edit + post-Edit-1 (dock.tsx) + post-final-Edit (apple-spotlight.tsx) all match canonical. No commit attempted with mismatched SHA.

## Build Status

```
$ cd livos && pnpm --filter ui build
✓ built in 47.87s
PWA v1.2.0 — precache 206 entries (6928.27 KiB)
```

Canonical token markers visible in bundled CSS:

```
$ rg "card-bg|dash-line" livos/packages/ui/dist/assets/index-cadd4c8a.css | wc -l
3
```

3 hits cover the new `bg-card-bg/80`, `bg-card-bg`, `border-dash-line`, `bg-card-bg-2/80` utility classes (Tailwind dedupes `bg-card-bg/N` into the same compiled rule family). Confirms preset wiring from Plan 120-01 resolves the new utilities.

## Behavioral-Diff Audit

Plan-mandated regex guard:

```
$ git diff <2 modified files> | grep -E "^[+-][[:space:]]*(on(Click|Submit|Change|KeyDown|MouseEnter|PointerDown|Focus|Blur)|useEffect|useState|useNavigate|useMutation|useQuery|useStore|t\(|navigate\(|router\.)"
(empty)
```

Result: BEHAVIORAL_GUARD_PASS. Zero handler/hook/route/store/i18n call drift. Every diff hunk is exclusively a className substring substitution; the lines containing `onClick=`, `onMouseLeave=` etc. appear only as context (unchanged) lines in the diff output, never as `-`/`+` lines.

## Deviations from Plan

### Rule 4 — Architectural / Locked-invariant conflict: ui-kit `PasswordInput` swap NOT viable

- **Found during**: Task 3 (login restyle).
- **Issue**: Plan Task 3 instructs `swap to <PasswordInput label="Password" /> from ui-kit. Preserve the value=, onChange=, onKeyDown= handlers verbatim. Pass them through as the same prop names.` But the existing login screen uses shadcn's `<PasswordInput>` with `onValueChange={setPassword}` — shadcn-specific prop API. The ui-kit `<PasswordInput>` (`livos/packages/ui-kit/src/components/PasswordInput.tsx`) wraps `<Input>` and forwards standard React `<input>` props including `onChange={(e: ChangeEvent<HTMLInputElement>) => void}`. Swapping the component requires changing `onValueChange={setPassword}` → `onChange={(e) => setPassword(e.target.value)}`, which:
  - Renames the prop (violates plan's "same prop names" clause).
  - Changes the handler body (violates D-120-NO-FUNCTIONAL-CHANGES).
- **Resolution**: Per the plan's own conflict-resolution clause `When in doubt, restyle the existing component in place rather than swap (lower risk per D-120-NO-FUNCTIONAL-CHANGES)`, the shadcn `<PasswordInput>` is LEFT IN PLACE. No swap performed. Login restyle to ui-kit primitives is deferred to a follow-up plan that explicitly migrates `onValueChange` callsites in coordination with `livos/packages/ui/src/shadcn-components/ui/input.tsx`.

### Rule 4 — Architectural: ui-kit `<Button>` swap collides with `buttonClass`

- **Found during**: Task 3.
- **Issue**: Login uses `<button type='submit' className={buttonClass}>` where `buttonClass` is a `tw` template literal in `bare/shared.tsx` containing `bg-brand`, `rounded-full`, `shadow-[…]`, `hover:brightness-110`, `focus-visible:ring-2`, etc. Wrapping with ui-kit `<Button variant='solid' className={buttonClass}>` triggers className concatenation with ui-kit's `h-btn h-btn-md solid` baseline (height/padding/font weight from `atoms.css`). The `h-btn` baseline conflicts with `buttonClass`'s explicit `h-12 px-6 rounded-full` rules — Tailwind CSS specificity is source-order dependent so the result is undefined-by-design.
- **Resolution**: Swap NOT performed. `<button className={buttonClass}>` left unchanged. A future plan can either migrate `buttonClass` itself into ui-kit `<Button>` props (variant=solid + custom override className) or replace it wholesale.

### Rule 4 — Architectural: `<Card>` wrap would double-nest the login card

- **Found during**: Task 3.
- **Issue**: Plan instructs `wrap the form in <Card padding="default" radius="default"> from ui-kit`. But login is rendered inside `Layout` (from `bare/shared.tsx`) which already renders a `<div>` styled as a glassmorphic card (translucent white background, blur backdrop, 32px rounded corners, 6px shadow stack). Adding a ui-kit `<Card>` around the form would nest a second card inside the first — visually wrong and unrelated to the plan's intent.
- **Resolution**: `<Card>` wrap NOT performed. The Layout's existing card chrome is the canonical wrap; if it needs token migration, that's a Layout-level restyle (out of scope for this plan).

### Rule 4 — Architectural: 5 of 8 target files have NO mapping-applicable substrings

- **Found during**: Task 1 + Task 2.
- **Issue**: Plan's `<files_modified>` lists 8 files but the token-to-existing-class mapping table in `<interfaces>` covers only Tailwind-default utilities (`bg-zinc-*`, `bg-white`, `bg-blue-600`, `text-green-600`, `text-red-600`, `text-amber-600`, `rounded-2xl`, `p-7`, `border-zinc-*`, `border-black/X`, `transition-all duration-200`, `shadow-md`, `shadow-lg`). The following files use only (a) generic layout utilities (`flex`, `relative`, `h-[100dvh]`) or (b) v32-era LivOS tokens (`bg-surface-base`, `border-border-default`, `text-text-secondary`, `border-border-subtle`, `rounded-radius-xl`, `shadow-dock`) that are NOT in the canonical mapping:
  - `livos/packages/ui/src/layouts/desktop.tsx` — pure layout.
  - `livos/packages/ui/src/components/cmdk.tsx` — uses shadcn primitives + v32 tokens.
  - `livos/packages/ui/src/components/app-icon.tsx` — v32 tokens only (`border-border-subtle bg-surface-base`).
  - `livos/packages/ui/src/modules/window/window-content.tsx` — only `text-text-secondary` (v32 token).
  - `livos/packages/ui/src/modules/window/windows-container.tsx` — pure layout / no styling classes at all.
- **Resolution**: Per plan's explicit instruction `DO NOT convert utility classes that are NOT in the mapping above`, these 5 files are LEFT UNTOUCHED. v32-token → canonical-token migration is documented as Phase 121's responsibility per the v35.0 milestone scope. Wave 1 component tally for this plan is honestly 2/30 (dock + apple-spotlight), not 8/30; the remaining 6 slots will be filled by 120-03/04/05 plus a dedicated v32→canonical token migration plan in Phase 121.

## Files Modified

| File | Lines + / - | Change Class |
| --- | --- | --- |
| `livos/packages/ui/src/modules/desktop/dock.tsx` | +2 / -2 | `bg-white/80` → `bg-card-bg/80` (2 sites: dockClass, dockPreviewClass) |
| `livos/packages/ui/src/components/apple-spotlight.tsx` | +5 / -5 | 5 mapped substring substitutions: `bg-white/N`, `bg-white`, `border-neutral-200/60`, `bg-neutral-50/80` → canonical tokens |
| `.planning/phases/120-mini-pc-ui-migration-wave-1/120-02-SUMMARY.md` | (new) | this file |

## Operator UAT (Mini PC)

```
1. SSH: existing session or ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68
2. Run: bash /opt/livos/update.sh
3. Open https://bruce.livinity.io (hard-reload / clear cache)
4. Validate:
   a. Desktop loads → wallpaper renders, dock visible at bottom.
   b. Dock surface translucent white wash visibly identical to pre-deploy
      (canonical --card-bg = #ffffff is bit-identical to Tailwind white;
      visual diff = zero).
   c. Open spotlight (existing keybind):
      - Pill-shaped search container: white/95 wash (canonical card-bg).
      - Result-list separator: subtle dashed line (canonical dash-line
        = rgba(0,0,0,0.07); previously neutral-200/60 = rgba(229,231,235,0.6),
        slight visual shift toward warmer/softer line).
      - Result-list backdrop: light off-white (canonical card-bg-2 = #fafafa
        with /80; previously neutral-50/80 = rgba(250,250,250,0.8) —
        bit-identical).
      - Selected/hover result card: white wash (canonical card-bg).
   d. Verify in DevTools after step c:
      getComputedStyle(document.documentElement).getPropertyValue('--card-bg')
      // → "#ffffff"
      getComputedStyle(document.documentElement).getPropertyValue('--dash-line')
      // → "rgba(0,0,0,0.07)"
   e. FUNCTIONAL: type a search query → results filter; arrow-down/up navigates;
      Enter launches the highlighted item; Escape closes. All identical to pre-deploy.
   f. Click an app icon in the dock → app window opens. Daily-driver flows (Files,
      Settings, App Store) still work per D-120-MINI-PC-OPERATOR-PRIORITY.
   g. Log out → login screen renders WITH PRE-DEPLOY STYLING (this plan
      deliberately did not restyle login per Deviations above).
5. Report PASS/FAIL in chat
6. On FAIL: cd /opt/livos && git revert <plan-commit> && bash update.sh
```

## Auth Gates

None encountered.

## Known Stubs

None introduced by this plan.

## Deferred Issues

- Login screen restyle to ui-kit `<PasswordInput>` / `<Button>` / `<Card>` — deferred (Deviation 1/2/3 above). Requires either a dedicated handler-API migration plan or a Layout-level restyle that absorbs the existing glassmorphic card chrome.
- 5 of 8 originally-targeted files (`desktop.tsx`, `cmdk.tsx`, `app-icon.tsx`, `window-content.tsx`, `windows-container.tsx`) consume v32-era LivOS tokens not in the canonical mapping — deferred to Phase 121 (per the v35.0 milestone master plan).
- Wave 1 component tally honestly counted as 2/30 after this plan, NOT 8/30 (the plan's nominal count is incompatible with the strict no-functional-changes audit + scope-boundary rule). Plans 120-03/04/05 will need to either (a) restyle more files within the same canonical-only constraint or (b) explicitly include v32-token migrations under a relaxed scope.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/modules/desktop/dock.tsx` contains `bg-card-bg/80` (2 occurrences).
- FOUND: `livos/packages/ui/src/components/apple-spotlight.tsx` contains `bg-card-bg/95`, `bg-card-bg/60`, `bg-card-bg-2/80`, `bg-card-bg`, `border-dash-line` (5 sites total).
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/120-02-SUMMARY.md` (this file).
- VERIFIED: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved, pre- and post-edits).
- VERIFIED: `pnpm --filter ui build` exits 0; built CSS chunk contains canonical token classes.
- VERIFIED: behavioral-diff regex guard returns empty across both modified files (no handler/hook/route drift).
