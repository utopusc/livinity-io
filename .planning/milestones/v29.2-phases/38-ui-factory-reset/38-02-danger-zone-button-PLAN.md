---
phase: 38-ui-factory-reset
plan: 02
type: execute
wave: 2
depends_on: ['38-01']
files_modified:
  - livos/packages/ui/src/routes/settings/advanced.tsx
  - livos/packages/ui/src/routes/settings/_components/danger-zone.tsx
  - livos/packages/ui/src/routes/settings/_components/danger-zone.unit.test.tsx
  - livos/packages/ui/public/locales/en.json
autonomous: true
requirements:
  - FR-UI-01
  - FR-UI-07
must_haves:
  truths:
    - 'Settings > Advanced has a new "Danger Zone" section positioned below all existing rows (Terminal / Beta / External DNS / Tor)'
    - 'Danger Zone section renders a destructive (red) Factory Reset button with a shield/warning icon left of the label, ONLY when the current user is admin'
    - 'When current user is non-admin, an explanatory note replaces the button (D-UI-03 verbatim text), no faded button visible'
    - 'When current user query is loading, the section renders neutrally (no admin button, no note flash)'
    - 'Clicking the button navigates to the existing /factory-reset route (router.tsx already registers it)'
    - 'The legacy /factory-reset row that lived inline with the safe Advanced rows is REMOVED — the new Danger Zone is the only entry point'
  artifacts:
    - path: livos/packages/ui/src/routes/settings/_components/danger-zone.tsx
      provides: 'DangerZone React component (admin-only Factory Reset button + non-admin explanatory note)'
      exports: ['DangerZone']
    - path: livos/packages/ui/src/routes/settings/advanced.tsx
      provides: 'Advanced settings dialog/drawer with Danger Zone section appended after existing rows; legacy inline factory-reset row removed'
    - path: livos/packages/ui/src/routes/settings/_components/danger-zone.unit.test.tsx
      provides: 'Smoke tests + extracted-pure-logic tests for the admin-gating decision (visibility helper)'
  key_links:
    - from: livos/packages/ui/src/routes/settings/_components/danger-zone.tsx
      to: livos/packages/ui/src/hooks/use-current-user.ts
      via: 'useCurrentUser().isAdmin'
      pattern: 'useCurrentUser\\('
    - from: livos/packages/ui/src/routes/settings/_components/danger-zone.tsx
      to: '/factory-reset route (router.tsx)'
      via: 'react-router IconButtonLink to "/factory-reset"'
      pattern: 'to=.*factory-reset'
    - from: livos/packages/ui/src/routes/settings/advanced.tsx
      to: 'DangerZone'
      via: 'imports from `./_components/danger-zone`'
      pattern: 'import.*DangerZone'
---

<objective>
Add the Settings > Advanced > Danger Zone entry point. Admin users see a red
destructive Factory Reset button with shield/warning icon; non-admin users see
the D-UI-03 explanatory note. The legacy inline `factory-reset` row (which sat
mixed with safe options like Terminal/Beta) is removed — the consent surface
must be visually segregated from harmless settings.

Purpose: FR-UI-01 (entry point) + part of FR-UI-07 (admin-only gating).
Pre-flight checks (update-in-progress + network) live in Plan 03's modal.

Output: A new `DangerZone` component in `_components/`, used inside the
existing Advanced dialog/drawer. Tests confirm the admin-gating logic via a
pure helper extracted to a top-level export.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/38-ui-factory-reset/38-CONTEXT.md
@.planning/phases/38-ui-factory-reset/38-01-foundation-and-unbreak-SUMMARY.md
@livos/packages/ui/src/routes/settings/advanced.tsx
@livos/packages/ui/src/hooks/use-current-user.ts
@livos/packages/ui/src/components/ui/icon-button-link.tsx
@livos/packages/ui/src/shadcn-components/ui/alert.tsx
@livos/packages/ui/src/components/ui/icon.tsx

<interfaces>
From `livos/packages/ui/src/hooks/use-current-user.ts`:
```typescript
export function useCurrentUser(): {
  user: User | undefined
  isLoading: boolean
  isAdmin: boolean    // <-- gate on this
  // ...
}
```

From `livos/packages/ui/src/components/ui/icon-button-link.tsx`:
```typescript
// Used elsewhere in advanced.tsx: <IconButtonLink to=... variant='destructive'>
// Confirmed pattern: `variant='destructive'` exists.
```

From `livos/packages/ui/public/locales/en.json` (existing keys to reuse):
```json
"factory-reset": "Factory Reset",
"factory-reset-description": "Erase all your data and apps, restoring LivOS to default settings"
```

The `<Alert>` component lives at `livos/packages/ui/src/shadcn-components/ui/alert.tsx` (verify via Read for exact API; if Alert is too heavy, use a plain styled `<p>` per D-UI-03).

The icon library is `react-icons` (`react-icons/tb` and `react-icons/pi` are used in advanced.tsx). For the shield-warning icon, use `TbShieldExclamation` or `TbAlertTriangle` from `react-icons/tb` (advanced.tsx already imports from `react-icons/pi`; mirror that style — explicit `import` from a sub-package).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DangerZone component + extracted admin-gating helper + unit test</name>
  <files>
    livos/packages/ui/src/routes/settings/_components/danger-zone.tsx,
    livos/packages/ui/src/routes/settings/_components/danger-zone.unit.test.tsx,
    livos/packages/ui/public/locales/en.json
  </files>
  <read_first>
    1. .planning/phases/38-ui-factory-reset/38-CONTEXT.md (D-UI-01, D-UI-02, D-UI-03 — section structure, button visual, non-admin fallback text)
    2. livos/packages/ui/src/hooks/use-current-user.ts (FULL — confirm `isLoading` + `isAdmin` shape)
    3. livos/packages/ui/src/routes/settings/advanced.tsx (FULL — match `cardClass` styling pattern + i18n usage)
    4. livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx + past-deploys-table.unit.test.tsx (test pattern: smoke + deferred RTL block)
    5. livos/packages/ui/src/shadcn-components/ui/alert.tsx (verify Alert API; if heavyweight, use a plain styled div)
    6. livos/packages/ui/public/locales/en.json (find the `factory-reset` and `factory-reset-description` keys; insert NEW keys alphabetically nearby)
  </read_first>
  <action>
**Step 1 — Add i18n keys** to `livos/packages/ui/public/locales/en.json`:
Insert these keys ALPHABETICALLY near the existing `factory-reset.*` block (lines ~329-347). New keys:
```json
"danger-zone": "Danger Zone",
"danger-zone.description": "Irreversible destructive operations. Read carefully before proceeding.",
"factory-reset.button": "Factory Reset",
"factory-reset.non-admin-note": "Factory reset is restricted to admin users. Contact your LivOS administrator if you need to perform a factory reset."
```
DO NOT touch other locale files (de/es/fr/etc) — i18n fall-through to `en.json` is the project default for new keys until translators run.

**Step 2 — Create `livos/packages/ui/src/routes/settings/_components/danger-zone.tsx`**:
```typescript
// Phase 38 Plan 02 — Settings > Advanced > Danger Zone section.
// FR-UI-01 (entry point) + part of FR-UI-07 (admin-only gating).
// Pre-flight blocking checks (update-in-progress + network reachability) live
// in Plan 03's confirmation modal — at this layer the button is always
// "available" for admins; the modal performs gating before the destructive
// mutation fires.

import {TbShieldExclamation} from 'react-icons/tb'

import {IconButtonLink} from '@/components/ui/icon-button-link'
import {useCurrentUser} from '@/hooks/use-current-user'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

// Pure helper extracted for unit-testability. Given a current-user query
// shape, decide what to render (button | non-admin note | nothing-while-loading).
export type DangerZoneVisibility = 'admin-button' | 'non-admin-note' | 'loading'

export function decideDangerZoneVisibility(state: {isLoading: boolean; isAdmin: boolean}): DangerZoneVisibility {
  if (state.isLoading) return 'loading'
  return state.isAdmin ? 'admin-button' : 'non-admin-note'
}

export function DangerZone() {
  const {isLoading, isAdmin} = useCurrentUser()
  const visibility = decideDangerZoneVisibility({isLoading, isAdmin})

  return (
    <section
      data-testid='settings-danger-zone'
      className={cn(dangerSectionClass)}
      aria-labelledby='danger-zone-heading'
    >
      <header className='flex items-center gap-2'>
        <TbShieldExclamation className='h-5 w-5 text-destructive2' aria-hidden='true' />
        <h3 id='danger-zone-heading' className='text-body font-medium leading-tight text-destructive2'>
          {t('danger-zone')}
        </h3>
      </header>
      <p className='text-body-sm leading-tight text-text-tertiary'>{t('danger-zone.description')}</p>

      {visibility === 'admin-button' && (
        <div className='flex items-center justify-between gap-2 rounded-radius-md bg-surface-1 p-4'>
          <div className='flex-1 space-y-1'>
            <h4 className='text-body font-medium leading-tight'>{t('factory-reset')}</h4>
            <p className='text-body-sm leading-tight text-text-tertiary'>{t('factory-reset-description')}</p>
          </div>
          <IconButtonLink
            to='/factory-reset'
            variant='destructive'
            icon={TbShieldExclamation}
            data-testid='factory-reset-button'
          >
            {t('factory-reset.button')}
          </IconButtonLink>
        </div>
      )}

      {visibility === 'non-admin-note' && (
        <p
          data-testid='factory-reset-non-admin-note'
          className='rounded-radius-md bg-surface-1 p-4 text-body-sm leading-tight text-text-tertiary'
        >
          {t('factory-reset.non-admin-note')}
        </p>
      )}

      {visibility === 'loading' && <div data-testid='factory-reset-loading' className='h-12' />}
    </section>
  )
}

// D-UI-01: red border + muted background + warning header. tw helper used
// elsewhere in advanced.tsx for cardClass — mirror the convention.
const dangerSectionClass = tw`flex flex-col gap-2 rounded-radius-md border border-destructive2/40 bg-destructive2/5 p-4 mt-6`
```

**IMPORTANT — verify `IconButtonLink` accepts an `icon` prop**: read
`livos/packages/ui/src/components/ui/icon-button-link.tsx` first. If the
component does NOT accept an `icon` prop, render the icon as a child:
```jsx
<IconButtonLink to='/factory-reset' variant='destructive'>
  <TbShieldExclamation className='mr-1.5 h-4 w-4' />
  {t('factory-reset.button')}
</IconButtonLink>
```
Pick whichever pattern matches existing usage in the codebase.

**Step 3 — Create unit test `livos/packages/ui/src/routes/settings/_components/danger-zone.unit.test.tsx`**:
RTL is NOT installed. Use the smoke + pure-helper pattern (mirror
`past-deploys-table.unit.test.tsx`).
```typescript
// @vitest-environment jsdom
//
// Phase 38 Plan 02 — DangerZone component RED tests.
//
// `@testing-library/react` is NOT installed in this UI package. Per the
// established Phase 33 pattern (past-deploys-table.unit.test.tsx), we ship:
//   1. A smoke test that imports the module + asserts exports
//   2. Pure-helper tests for `decideDangerZoneVisibility` (the admin-gating
//      decision lives in a pure function — fully unit-testable)
//   3. Deferred RTL test plan as comments
//
// Deferred RTL tests (uncomment + run when @testing-library/react lands):
//
//   DZ1: when isAdmin=true, query.getByTestId('factory-reset-button') exists
//        and has a destructive-variant class on its root.
//   DZ2: when isAdmin=true, the button's <a> href ends with '/factory-reset'.
//   DZ3: when isAdmin=false + isLoading=false, query.getByTestId(
//        'factory-reset-non-admin-note') exists, query.queryByTestId(
//        'factory-reset-button') is null.
//   DZ4: when isLoading=true, neither testid exists; the loading testid does.
//   DZ5: heading text is exactly 'Danger Zone' (D-UI-01 verbatim).
//   DZ6: shield-warning icon rendered (assert <svg> with TbShieldExclamation
//        class signature inside the heading).

import {describe, expect, it} from 'vitest'

describe('DangerZone smoke (FR-UI-01)', () => {
  it('module exports DangerZone and decideDangerZoneVisibility', async () => {
    const mod = await import('./danger-zone')
    expect(typeof mod.DangerZone).toBe('function')
    expect(typeof mod.decideDangerZoneVisibility).toBe('function')
  })
})

describe('decideDangerZoneVisibility (admin-gate decision)', () => {
  it('isLoading=true -> "loading" regardless of isAdmin', async () => {
    const {decideDangerZoneVisibility} = await import('./danger-zone')
    expect(decideDangerZoneVisibility({isLoading: true, isAdmin: true})).toBe('loading')
    expect(decideDangerZoneVisibility({isLoading: true, isAdmin: false})).toBe('loading')
  })
  it('isLoading=false + isAdmin=true -> "admin-button"', async () => {
    const {decideDangerZoneVisibility} = await import('./danger-zone')
    expect(decideDangerZoneVisibility({isLoading: false, isAdmin: true})).toBe('admin-button')
  })
  it('isLoading=false + isAdmin=false -> "non-admin-note"', async () => {
    const {decideDangerZoneVisibility} = await import('./danger-zone')
    expect(decideDangerZoneVisibility({isLoading: false, isAdmin: false})).toBe('non-admin-note')
  })
  it('the three states are exhaustive (covers all combinations)', async () => {
    const {decideDangerZoneVisibility} = await import('./danger-zone')
    const got = new Set([
      decideDangerZoneVisibility({isLoading: false, isAdmin: false}),
      decideDangerZoneVisibility({isLoading: false, isAdmin: true}),
      decideDangerZoneVisibility({isLoading: true, isAdmin: false}),
    ])
    expect(got).toEqual(new Set(['non-admin-note', 'admin-button', 'loading']))
  })
})
```
  </action>
  <acceptance_criteria>
    - `livos/packages/ui/src/routes/settings/_components/danger-zone.tsx` exists and exports `DangerZone` (React function component) and `decideDangerZoneVisibility` (pure helper)
    - The component uses `useCurrentUser()` from `@/hooks/use-current-user`
    - Admin path renders `<IconButtonLink to='/factory-reset' variant='destructive'>` (or equivalent destructive-variant button) with a shield/warning icon
    - Non-admin path renders a `<p>` (no faded button) with `data-testid='factory-reset-non-admin-note'`
    - Loading path renders a neutral placeholder
    - `livos/packages/ui/public/locales/en.json` contains 4 NEW keys: `danger-zone`, `danger-zone.description`, `factory-reset.button`, `factory-reset.non-admin-note`
    - Unit test file exists with ≥4 pure-helper tests + 1 smoke test
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/settings/_components/danger-zone.unit.test.tsx` — all tests pass
    - Run `grep -n "Server4\|Server5" livos/packages/ui/src/routes/settings/_components/danger-zone.tsx` — returns nothing
    - Run `grep -n "Server4\|Server5" livos/packages/ui/public/locales/en.json` — same as before this plan (no NEW Server4/5 mentions introduced)
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec vitest run src/routes/settings/_components/danger-zone.unit.test.tsx --reporter=verbose</automated>
  </verify>
  <done>DangerZone component + helper + tests + i18n keys committed; vitest passes.</done>
</task>

<task type="auto">
  <name>Task 2: Wire DangerZone into Advanced settings dialog/drawer; remove legacy inline factory-reset row</name>
  <files>
    livos/packages/ui/src/routes/settings/advanced.tsx
  </files>
  <read_first>
    1. livos/packages/ui/src/routes/settings/advanced.tsx (CURRENT — full file; identify the legacy `<label className={cardClass}>` row containing `t('factory-reset')` + `to='/factory-reset'` IconButtonLink — remove it from BOTH the mobile (Drawer) branch (line ~120-125) and the desktop (Dialog) branch (line ~170-175))
    2. The newly-created `./_components/danger-zone.tsx` for the import
  </read_first>
  <action>
**Step 1 — Add the import:**
```typescript
import {DangerZone} from '@/routes/settings/_components/danger-zone'
```
near the other `_components/shared` import.

**Step 2 — Remove the legacy inline rows:**

In the **mobile (Drawer) branch** (around lines 120-125 in current file), delete:
```jsx
<label className={cardClass}>
  <CardText title={t('factory-reset')} description={t('factory-reset-description')} />
  <IconButtonLink className='pointer-events-auto self-center' to={'/factory-reset'} variant='destructive'>
    {t('reset')}
  </IconButtonLink>
</label>
```

In the **desktop (Dialog) branch** (around lines 170-175), delete the equivalent `<label>...factory-reset...</label>` block.

**Step 3 — Append `<DangerZone />` AFTER the existing rows in BOTH branches**, OUTSIDE the inner `<div className='flex flex-col gap-y-3'>` block (so it gets visual segregation per D-UI-01 — the inner div holds the safe rows; DangerZone sits below, separated by margin from `dangerSectionClass`).

Mobile:
```jsx
<DrawerScroller>
  <div className='flex flex-col gap-y-3'>
    {/* ... existing rows: terminal, beta-program, external-dns, remoteTorAccessSettingRow ... */}
    {/* (legacy factory-reset row REMOVED) */}
  </div>
  <DangerZone />
</DrawerScroller>
```

Desktop:
```jsx
<DialogScrollableContent>
  <div className='space-y-6 px-5 py-6'>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
    </DialogHeader>
    <div className='flex flex-col gap-y-3'>
      {/* ... existing rows ... */}
      {/* (legacy factory-reset row REMOVED) */}
    </div>
    <DangerZone />
  </div>
</DialogScrollableContent>
```

**Step 4 — Confirm no other consumers reference `t('factory-reset-description')` from advanced.tsx in a way that breaks** (the key is reused inside DangerZone so the i18n entry stays live).

  </action>
  <acceptance_criteria>
    - `livos/packages/ui/src/routes/settings/advanced.tsx` imports `DangerZone` from `@/routes/settings/_components/danger-zone`
    - The mobile (Drawer) branch and desktop (Dialog) branch BOTH render `<DangerZone />` once, outside the inner `flex flex-col gap-y-3` block
    - The legacy inline `<label>...factory-reset...</label>` rows are REMOVED from BOTH branches (the `t('factory-reset')` text now appears only via `<DangerZone />`)
    - `grep -c "to={'/factory-reset'}" livos/packages/ui/src/routes/settings/advanced.tsx` returns 0 (the legacy rows are gone)
    - `grep -c "DangerZone" livos/packages/ui/src/routes/settings/advanced.tsx` returns ≥2 (one import, one or two render sites)
    - Run `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — no new type errors
    - Run `cd livos && pnpm --filter ui exec vitest run src/routes/settings/_components/danger-zone.unit.test.tsx` — still passes (regression)
  </acceptance_criteria>
  <verify>
    <automated>cd livos && pnpm --filter ui exec tsc --noEmit -p . 2>&1 | grep -E "advanced\.tsx|danger-zone" | tee /tmp/tsc-task2.log; test ! -s /tmp/tsc-task2.log</automated>
  </verify>
  <done>Advanced dialog/drawer renders DangerZone in both branches; legacy inline factory-reset row removed; typecheck clean.</done>
</task>

</tasks>

<verification>
1. `cd livos && pnpm --filter ui exec vitest run src/routes/settings/_components/danger-zone.unit.test.tsx --reporter=verbose` — all tests pass
2. `cd livos && pnpm --filter ui exec tsc --noEmit -p .` — no new errors
3. `grep -n "to=.*factory-reset" livos/packages/ui/src/routes/settings/advanced.tsx` — returns nothing (legacy row gone)
4. `grep -n "DangerZone" livos/packages/ui/src/routes/settings/advanced.tsx` — returns ≥2 lines (import + render)
5. `grep -rn "Server4\|Server5" livos/packages/ui/src/routes/settings/_components/danger-zone.tsx` — returns nothing
6. Running the existing `cd livos && pnpm --filter ui exec vitest run` doesn't regress past-deploys-table or onerror-audit tests
</verification>

<success_criteria>
- DangerZone component renders admin button OR non-admin note OR loading placeholder per `useCurrentUser`
- Admin button is destructive-variant, has a shield/warning icon, and links to `/factory-reset`
- Legacy inline factory-reset row is removed from both mobile and desktop Advanced screens
- 4 new i18n keys added to `en.json`; no Server4/5 references introduced
- Pure helper `decideDangerZoneVisibility` has ≥4 unit-test assertions
</success_criteria>

<output>
After completion, create `.planning/phases/38-ui-factory-reset/38-02-danger-zone-button-SUMMARY.md` listing:
- Files changed
- The new i18n keys
- Test count
- Pre-condition for Plan 03: clicking the button now navigates to `/factory-reset`, where Plan 03's new modal will render
</output>
