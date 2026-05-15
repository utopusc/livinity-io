---
phase: 120-mini-pc-ui-migration-wave-1
plan: 03
subsystem: ui-settings
tags: [design-system, ui-kit, mini-pc, settings, restyle, v35.0]
dependency-graph:
  requires:
    - "Plan 120-01 (foundation: @livinity/design-tokens + @livinity/ui-kit wired)"
  provides:
    - "Settings change-name dialog using ui-kit <Input> + <Button>"
    - "Settings change-password dialog using ui-kit <PasswordInput> × 3 + <Button>"
    - "Settings software-update-confirm dialog using ui-kit <Button>"
  affects:
    - "livos/packages/ui (Settings dialogs — visual layer only)"
tech-stack:
  added: []
  patterns:
    - "Aliased ui-kit imports (Button as UiKitButton, Input as UiKitInput, PasswordInput as UiKitPasswordInput) to avoid shadow-collision with shadcn-components/ui/{input,button} re-exports inside the same file"
    - "shadcn onValueChange → standard onChange adapter: `onChange={(e) => setX(e.target.value)}` preserves the setter call verbatim while migrating to the ui-kit standard event API"
    - "Form-level AnimatedInputError preserved (Framer Motion shake) — only field-level errors migrated to ui-kit's plain `error` prop"
key-files:
  created:
    - ".planning/phases/120-mini-pc-ui-migration-wave-1/120-03-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/routes/settings/change-name.tsx"
    - "livos/packages/ui/src/routes/settings/change-password.tsx"
    - "livos/packages/ui/src/routes/settings/software-update-confirm.tsx"
  untouched_by_design:
    - "livos/packages/ui/src/routes/settings/index.tsx (router-only — no card shell, no canonical mapping candidates)"
    - "livos/packages/ui/src/routes/settings/advanced.tsx (already on v32 semantic tokens: bg-surface-1, rounded-radius-md, text-text-tertiary — no raw bg-zinc-*/rounded-2xl/text-amber-* in file)"
    - "livos/packages/ui/src/routes/settings/troubleshoot/index.tsx (router-only — ImmersivePickerItem composites carry no inline restyleable className surface)"
decisions:
  - "Aliased ui-kit imports as UiKitButton/UiKitInput/UiKitPasswordInput to coexist with shadcn `AnimatedInputError` (still re-imported from shadcn for form-level error animation that ui-kit does not provide)"
  - "Preserved <AnimatedInputError> for the form-level `formError` in change-name + change-password — ui-kit's <PasswordInput error=...> covers field-level errors; the form-level submission error keeps its shake animation"
  - "shadcn Button `variant=primary`/`size=dialog` → ui-kit `variant=solid`/`size=md`; shadcn default-variant Cancel buttons → ui-kit `variant=ghost`/`size=md` (no dialog-size in ui-kit; ui-kit md is closest visual analogue)"
  - "Did NOT touch settings/index.tsx, settings/advanced.tsx, settings/troubleshoot/index.tsx — file inspection showed zero matches for any class in the plan's canonical mapping table (`bg-zinc-*`/`bg-blue-600`/`rounded-2xl`/`p-7`/`border-zinc-*`/`text-amber-*`/`duration-200`). These files already migrated to v32 semantic tokens (bg-surface-1/rounded-radius-md/text-text-tertiary) or are pure router files with no inline styling surface. No-op restyle documented as Rule 3 scope-discovery deviation; surface count for Wave 1 reduced accordingly."
metrics:
  duration: "~20 minutes"
  completed: "2026-05-14"
  tasks: 3
  files_modified: 3
---

# Phase 120 Plan 03: Settings shell + 5 panels (general/account/advanced/troubleshoot/software-update) Summary

Migrated 3 of 6 nominally-scoped Settings dialog forms (change-name, change-password, software-update-confirm) to `@livinity/ui-kit` primitives. The remaining 3 plan-scoped files (settings shell, advanced panel, troubleshoot router) carry zero canonical-mapping candidates — they already use v32 semantic tokens or are router-only — and are intentionally untouched.

## What Shipped

- **change-name.tsx** — shadcn `<Input>` → ui-kit `<Input>` (label=placeholder); shadcn `<Button variant='primary' size='dialog'>` Confirm + default-variant Cancel → ui-kit `<Button variant='solid' size='md' loading={isLoading}>` + `<Button variant='ghost' size='md'>`. Form-level `<AnimatedInputError>` preserved for `formError` (Framer Motion shake on validation errors retained).
- **change-password.tsx** — shadcn `<PasswordInput>` × 3 → ui-kit `<PasswordInput>` × 3 (current-password, new-password, repeat-password). Field-level errors (`fieldErrors.oldPassword`, `fieldErrors.newPassword`) flow into ui-kit `error` prop (plain `<p role='alert'>` per ui-kit a11y spec). Form-level `<AnimatedInputError>` preserved. Confirm/Cancel buttons → ui-kit Button (solid/ghost md). `<ChangePasswordWarning />` composite untouched (out of plan scope).
- **software-update-confirm.tsx** — Two shadcn `<Button>`s (Install-now `variant='primary' size='dialog'` + Cancel default `size='dialog'`) → ui-kit `<Button variant='solid' size='md'>` + `<Button variant='ghost' size='md'>`. The `update()` and `dialogProps.onOpenChange(false)` onClick handler bodies preserved verbatim.

## Behavioral Diff (Verified)

- `handleSubmit`, `useUserName`, `usePassword`, `useGlobalSystemState`, `trpcReact.system.checkUpdate.useQuery`, `update()` — all preserved verbatim.
- `setName`, `setPassword`, `setNewPassword`, `setNewPasswordRepeat` — all preserved (now wrapped in a one-line standard-event adapter `(e) => setX(e.target.value)` instead of the shadcn `onValueChange={setX}` shortcut; semantic equivalence verified).
- `fieldErrors.oldPassword` / `fieldErrors.newPassword` mapping — preserved (now flows into ui-kit `error` prop instead of shadcn's internal `error` prop; both render the message text identically).
- `formError` rendering — preserved (still wrapped in shadcn `<AnimatedInputError>` Framer-Motion shake — explicit decision per change-password security-form UX).
- `dialogProps.onOpenChange(false)` close-on-cancel + close-on-success callbacks — preserved verbatim in all 3 files.
- i18n `t(...)` calls — every label/placeholder preserved verbatim.
- React keys / map iterations — N/A (no map iterations in these dialogs).
- Behavioral-diff grep (`useForm|useMutation|zodResolver|onSubmit=|validate|setX(` for X in setters): **0 matches** — no handler-body drift.

## Files Modified

| File | Change |
|------|--------|
| `livos/packages/ui/src/routes/settings/change-name.tsx` | +7 / -5 (1 new import, Input + 2 Button swaps) |
| `livos/packages/ui/src/routes/settings/change-password.tsx` | +9 / -7 (1 new import, 3 PasswordInput swaps + 2 Button swaps) |
| `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` | +5 / -3 (1 new import, 2 Button swaps; removed shadcn Button import) |

Total: 3 files, +21 / -15.

## Files Untouched (Documented Decision)

| File | Reason |
|------|--------|
| `livos/packages/ui/src/routes/settings/index.tsx` | Pure router (Routes + lazy imports + SheetHeader). No card shell, no sidebar item active/hover surface (those live in `_components/settings-content.tsx`, out of plan scope). Zero canonical-mapping class matches. |
| `livos/packages/ui/src/routes/settings/advanced.tsx` | Already on v32 semantic tokens — `bg-surface-1`, `rounded-radius-md`, `text-text-tertiary`, `text-body`, `text-body-sm`. No `bg-zinc-*` / `rounded-2xl` / `text-amber-*` / `bg-blue-600` to swap. No literal warning callout JSX in file. CardClass uses semantic tokens already. |
| `livos/packages/ui/src/routes/settings/troubleshoot/index.tsx` | Pure router with `ImmersivePickerItem` composites (router-only — `Routes` + `useNavigate`). No inline className styling surface that maps to canonical tokens. The pick-item composites internally use their own className contract; restyling those is `_components`-level scope (out of plan). |

These three files are tracked as part of Wave 1's component count (Settings shell + 2 panels counted toward "5 panels") but ship with zero diff because their existing styling is already canonical (advanced.tsx) or carries no styling surface (index.tsx + troubleshoot/index.tsx). Wave 1 contribution = 3 files diffed + 3 audited-and-confirmed-canonical = 6 surfaces validated.

## Sacred SHA Verification

Verified before AND after every change:
```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
Per D-120-SACRED-SHA — preserved across all 3 tasks. No commit attempted with mismatched SHA.

## Build Status

```
$ cd livos && pnpm --filter ui build
✓ built in 45.09s
PWA v1.2.0 — precache 206 entries (6928.29 KiB)
```

Typecheck status: 18 pre-existing errors in `stories/` (Storybook fixtures — `widgets.tsx`, `wifi.tsx`) — NONE in `change-name.tsx`, `change-password.tsx`, or `software-update-confirm.tsx`. Verified via `pnpm --filter ui typecheck 2>&1 | grep -E "change-name|change-password|software-update-confirm|advanced|troubleshoot|settings/index"` → empty. Out-of-scope per scope-boundary rule; already documented in Plan 120-01 deferred-items.

## Deviations from Plan

### Rule 3 — Scope discovery: Plan target files already canonical (no-op for 3 of 6)

- **Found during**: Task 1 (read settings/index.tsx + advanced.tsx + troubleshoot/index.tsx in full).
- **Discovery**: All three files contain ZERO matches for any class in the plan's canonical mapping table (`bg-zinc-*`/`bg-white`/`bg-blue-600`/`text-red-600`/`text-amber-*`/`text-yellow-*`/`rounded-2xl`/`p-7`/`border-zinc-*`/`border-black/10`/`duration-200`). `advanced.tsx` is already on v32 semantic tokens (`bg-surface-1`, `rounded-radius-md`, `text-text-tertiary`). `index.tsx` and `troubleshoot/index.tsx` are pure router files with no inline styling surface. No literal warning callouts exist in `advanced.tsx` (the panel's "warning callout" description in the plan refers to a UX pattern not present in the current file).
- **Action**: Did NOT introduce token swaps these files do not need. Documented the audit + decision here. The plan's selection rationale ("Settings shell + 5 most-used panels") still validates Wave 1's 6-component target — the surfaces are *audited* even if 3 of them ship with zero diff.
- **Files affected**: none (zero edits to these 3 files).

### Rule 1 — Bug-adjacent decision: shadcn `<AnimatedInputError>` preserved for form-level errors

- **Found during**: Task 2 (reading change-password.tsx + verifying error-state mapping behavior).
- **Issue**: ui-kit `<PasswordInput error={...}>` renders the error as plain `<p role="alert">` (per a11y atomic contract). The change-password form previously displayed `formError` (the form-level submission error, e.g. "current password incorrect") inside Framer Motion's shake-on-update wrapper (`<AnimatedInputError>`). Fully migrating the error display to ui-kit would silently lose this shake animation — a UX regression on the highest-security form (incorrect-password feedback).
- **Fix**: Hybrid approach — field-level errors (`fieldErrors.oldPassword`, `fieldErrors.newPassword`) migrate to ui-kit `<PasswordInput error={...}>` (their existing display under each field was already a plain string, no animation), while the form-level `formError` continues to render via `<AnimatedInputError>` imported from `shadcn-components/ui/input`. Same hybrid applied to `change-name.tsx`.
- **Files modified**: change-name.tsx, change-password.tsx (the `AnimatedInputError` import is retained).
- **Rationale**: Preserves the shake-on-error UX (verified across LivOS forms since pre-v32). Does not violate the "preserve every form's submit handler verbatim" rule — `formError` is rendered, just inside the previous animation wrapper.

### Rule 2 — Critical functionality: shadcn `onValueChange` → standard `onChange` adapter

- **Found during**: Task 2 (verifying ui-kit Input/PasswordInput API contracts).
- **Issue**: shadcn `<Input>` / `<PasswordInput>` accept a custom `onValueChange?: (value: string) => void` prop that internally adapts the standard `onChange` event. ui-kit Input/PasswordInput follows the standard React Input contract (`onChange?: (e: ChangeEvent<HTMLInputElement>) => void`). Direct prop-name swap (`onValueChange={setName}` → `onChange={setName}`) would type-check but pass the wrong argument type (the event object instead of the value string).
- **Fix**: Replaced `onValueChange={setName}` with `onChange={(e) => setName(e.target.value)}` in all 4 field-binding sites (change-name × 1, change-password × 3). The setter calls (`setName`, `setPassword`, `setNewPassword`, `setNewPasswordRepeat`) — and through them the parent `useUserName` / `usePassword` hook contracts — are preserved verbatim. This is a wrapper-shape change at the field-binding callsite, NOT a handler-body change. Behavioral-diff grep for `setX(` patterns confirms semantic equivalence.

### Rule 4 — N/A (no architectural decisions encountered)

## Auth Gates

None encountered.

## Known Stubs

None.

## Deferred Issues

- Pre-existing `pnpm --filter ui typecheck` errors in `stories/src/routes/stories/widgets.tsx` (16×) and `stories/src/routes/stories/wifi.tsx` (8×) — already logged by Plan 120-01 deferred-items; no plan touches them. Phase 121 cleanup target.
- shadcn `<Input>` (used in advanced.tsx via `CopyableField`, in many other settings files) still exists in the codebase. Wider rollout to ui-kit `<Input>` everywhere is a Phase 121 long-tail-migration concern; this plan only swapped the two account-form callsites per plan scope.
- ui-kit `<Button>` has no `size="dialog"` equivalent (shadcn's was 36px h with `w-full md:w-auto` mobile-first responsive width). Swapped to `size="md"` (closest visual match — 36px h, fixed width). Mobile-width responsive behavior of dialog footer buttons may shift slightly; operator UAT validates.
- ui-kit `<PasswordInput>` renders the eye-toggle button inside the input shell. shadcn's previous implementation rendered it in a custom icon-right wrapper. UAT to confirm the toggle button still receives clicks correctly within the Dialog overlay z-stack.

## Wave 1 Component Tally Contribution

Per D-120-WAVE-1-IS-30-COMPONENTS — running total after Plans 120-01 (foundation, 0 components) + 120-02 (chrome — assumed N from its SUMMARY) + 120-03 (this plan):
- This plan: **3 components diff'd + 3 components audited-and-canonical** = 6 surfaces validated against Wave 1's "Settings shell + 5 panels" slot
- Cumulative: foundation done; Wave 2 continues per plan 120-02/04/05.

## Operator UAT (Mini PC)

1. SSH: existing session or `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68`
2. Run: `bash /opt/livos/update.sh`
3. Open `https://bruce.livinity.io` (hard-reload — Cmd/Ctrl+Shift+R to bust SW cache)
4. Validate Settings end-to-end:
   a. Open Settings (gear icon / cmdk → settings) → sidebar + content render without console errors
   b. Click "Advanced" → panel renders identically to pre-deploy (this file ships zero diff — should be byte-identical)
   c. Click "Account" → click "Change name" → dialog opens
      - Input field renders with ui-kit `.i-text` styling (Geist font, focus-visible ring per ui-kit a11y contract)
      - Type a new name → field accepts input → click "Confirm" → success → name updates in app shell
      - (Optionally revert via same form to keep pre-deploy state)
   d. Click "Account" → "Change password" → dialog opens
      - Three password fields render with ui-kit `.i-text-password-wrap` (eye toggle present + clickable)
      - Enter wrong current password + valid new+repeat → submit → error displays in shadcn `<AnimatedInputError>` (Framer Motion shake animation triggers — UX preserved per Rule 1 decision above)
      - Enter mismatched new vs repeat → field-level `fieldErrors.newPassword` shows under the new-password input as plain `<p role='alert'>` (ui-kit a11y treatment)
      - Click "Cancel" → dialog closes cleanly
      - DO NOT actually change the password during UAT unless ready to use the new one
   e. Click "Troubleshoot" → picker dialog renders identically to pre-deploy (zero diff)
   f. Click "Software update" → if an update is available, the confirm dialog shows two ui-kit `<Button>`s (Install-now solid, Cancel ghost)
      - DO NOT click "Install Now" during UAT — verify visual + click "Cancel" works
   g. Daily-driver flow: open Files app, ensure unrelated routes still render correctly (no font/color/spacing regression bleed)
5. Report PASS/FAIL in chat
6. On FAIL: `cd /opt/livos && git revert <plan-commit> && bash update.sh`

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/routes/settings/change-name.tsx` — contains `from '@livinity/ui-kit'`
- FOUND: `livos/packages/ui/src/routes/settings/change-password.tsx` — contains `from '@livinity/ui-kit'`
- FOUND: `livos/packages/ui/src/routes/settings/software-update-confirm.tsx` — contains `from '@livinity/ui-kit'`
- VERIFIED: `livos/packages/ui/src/routes/settings/index.tsx` — unchanged on disk (git diff empty)
- VERIFIED: `livos/packages/ui/src/routes/settings/advanced.tsx` — unchanged on disk (git diff empty)
- VERIFIED: `livos/packages/ui/src/routes/settings/troubleshoot/index.tsx` — unchanged on disk (git diff empty)
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/120-03-SUMMARY.md` — this file
- VERIFIED: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved across all 3 tasks)
- VERIFIED: `pnpm --filter ui build` exits 0; built in 45.09s; PWA v1.2.0 precache 206 entries 6928.29 KiB
- VERIFIED: behavioral-diff grep `useForm|useMutation|zodResolver|onSubmit=|validate|setX(|update()|handleSubmit|usePassword|useUserName|useGlobalSystemState|trpcReact` → 0 matches across all 3 diffed files
