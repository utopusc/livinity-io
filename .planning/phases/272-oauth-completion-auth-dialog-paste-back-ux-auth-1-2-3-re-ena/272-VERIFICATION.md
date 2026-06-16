---
phase: 272-oauth-completion
verified: 2026-06-15T00:00:00Z
status: human_needed
score: 5/5 code must-haves verified
overrides_applied: 0
human_verification:
  - test: "Build gate — `pnpm --filter @livos/config build && pnpm --filter ui build` succeeds (repo-wide tsc is broken at baseline, so the deploy build is the real type gate)."
    expected: "UI bundle builds cleanly; no NEW type errors from the two modified files."
    why_human: "Full monorepo build is heavy and environment-bound; the verifier checks per-file API correctness statically but does not run the production build."
  - test: "Deploy to Mini PC (release → update.sh → clear the PWA service-worker cache / hard-refresh) then click an agent's 'Auth' in the Liv AI Local Agents panel."
    expected: "The CliAuthDialog opens (NOT the LivOS Terminal), because cli-auth now routes to openCliAuthDialog."
    why_human: "Live UI behavior on the deployed box; PWA SW caching means a deploy can serve a stale bundle — must be visually confirmed."
  - test: "AUTH-1 live — start a bare `claude` paste-back login from the dialog."
    expected: "The 'Paste the code from your browser' input is visible IMMEDIATELY (no infinite 'Waiting…' spinner), even before/without a parsed sign-in URL. If a URL is parsed, the 'Open link ↗' block appears above the field."
    why_human: "Depends on the live login child's stdout (whether a short code is parsed); only observable against the real CLI on the box."
  - test: "AUTH-2/AUTH-3 live — paste a one-time code and press Enter; also try the 'Use an API key instead' button."
    expected: "Enter submits the code (field is visible, not masked); 'Use an API key instead' is a clear full-width button that switches to the API-key flow; pasting an API key + Enter saves it. The pasted code is cleared after submit."
    why_human: "Real auth round-trip + keystroke behavior against the live login process; cannot be exercised statically."
  - test: "Routing regression — confirm cli-install still opens the Terminal install and the in-dialog 'Advanced: run in Terminal instead' fallback still works."
    expected: "Install runs in a fresh Terminal tab; the Advanced affordance opens the Terminal for auth. (If operator prefers Terminal-default for auth, the one-line cli-auth branch in use-cli-auth-bridge.ts is the revert point.)"
    why_human: "Live window-manager + Terminal PTY behavior on the deployed box."
---

# Phase 272: cli-auth-dialog paste-back UX (AUTH-1/2/3) Verification Report

**Phase Goal (operator-scoped to Part 1):** Fully fix the three cli-auth-dialog paste-back UX bugs — AUTH-1 (paste field always visible, no infinite spinner), AUTH-2 (API-key fallback is a first-class button), AUTH-3 (code field visible + Enter-to-submit) — and re-promote the fixed dialog as the default cli-auth path. Apple (Part 2) + Microsoft (Part 3) DEFERRED per operator (separate platform/web track) — their absence is NOT a gap.

**Verified:** 2026-06-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | AUTH-1: paste-back branch renders the code field unconditionally; no spinner-only dead path | ✓ VERIFIED | cli-auth-dialog.tsx — `<Input>` (L724) sits in the `space-y-2` div (L720) that is a SIBLING of, not inside, the `deviceCode ? (...) : (...)` ternary (L693-716). The else-branch is a hint `<p>` (L711-715), not a `<Spinner/>`. No `<Spinner/>` anywhere in the paste-back branch (L683-762). |
| 2 | AUTH-2: API-key fallback is a `<Button>`, not a `text-caption` link | ✓ VERIFIED | L745-760 — `<Button variant='default' className='w-full'>Use an API key instead</Button>`, gated on `method?.apiKeyEnv` (L745), with the exact onClick (reset `pasteStarted.current=false`, clear `pasteError`/`pasteCode`, `setPhase({kind:'auth-apikey'})`). No `text-caption` link in this branch. |
| 3 | AUTH-3: paste field is `<Input>` (not PasswordInput), autoFocus, Enter-to-submit; code cleared on submit; API-key Enter-to-submit present | ✓ VERIFIED | Paste field = `<Input>` (L724) with `autoFocus` (L730) + `onKeyDown` Enter → `void handleSubmitPasteCode()` + preventDefault (L731-736). `handleSubmitPasteCode` (L462-480) still `setPasteCode('')` on success (L472) AND catch (L477) — E-9 intact. API-key Enter via wrapper-div `onKeyDown` (L768-774 apikey, L821-827 browser). `grep PasswordInput` shows it only at the import (L55), api-key field (L786), browser fallback (L833) — NOT in the paste-back branch. |
| 4 | Routing: cli-auth opens the dialog; cli-install/cli-uninstall unchanged; RCE guard intact | ✓ VERIFIED | use-cli-auth-bridge.ts — `cli-auth` → `openCliAuthDialog({cli, mode:'auth'})` (L188-189); `cli-install` → `runCliInTerminalFallback(...,'cli-install',...)` (L186-187); `cli-uninstall` → `openCliAuthDialog` confirm (L190-194). NAME-only RCE guard `/^[a-z0-9-]+$/` + `INSTALLABLE_CLIS.has(cli)` at L180, unchanged. |
| 5 | `pnpm --filter ui` typecheck introduces ZERO new errors vs baseline | ? UNCERTAIN (human) | All props used by `<Input>` (onValueChange/variant/sizeVariant/autoFocus/onKeyDown/placeholder) and `<AnimatedInputError>` are valid per input.tsx (`InputProps extends React.InputHTMLAttributes & VariantProps & {onValueChange}`; AnimatedInputError exported L115). Static API check passes; the actual build gate is operator-run (repo tsc broken at baseline). |

**Score:** 5/5 code must-haves verified (truth 5 statically sound; build gate routed to human).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx` | Paste-back AUTH-1/2/3 rewrite | ✓ VERIFIED | Always-visible `<Input>` paste field, first-class API-key `<Button>`, Enter-to-submit on paste + both API-key fields. Substantive (1056 lines); wired into desktop shell. |
| `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` | cli-auth → openCliAuthDialog | ✓ VERIFIED | One-line routing flip + updated header/inline comments; RCE boundary preserved; cli-install/cli-uninstall unchanged. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| use-cli-auth-bridge.ts | cli-auth-dialog.tsx | `openCliAuthDialog` import + call | ✓ WIRED | Imported L33, called L189/L194; dispatches `CLI_AUTH_DIALOG_EVENT`. |
| cli-auth-dialog.tsx (`CliAuthDialog`) | desktop shell | mounted + bridge invoked | ✓ WIRED | desktop-content.tsx imports `CliAuthDialog` (L5) mounted at L416; `useCliAuthBridge()` invoked L255. Full open path intact. |
| `<Input>` paste field | `handleSubmitPasteCode` | onKeyDown Enter + footer Submit button | ✓ WIRED | L731-736 (Enter) and L967-971 (Submit code button) both call it; handler clears state + posts via `sendAuthInputM`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| cli-auth-dialog.tsx | 725 | `placeholder='Code'` | ℹ️ Info | Legitimate HTML input placeholder on the paste field — NOT a stub/placeholder anti-pattern. No action. |

No TODO/FIXME/HACK, no spinner-only dead path, no empty handlers, no hardcoded-empty render data introduced.

### Notable Implementation Note (not a gap)

The plan task 272-01-A text suggested `error={pasteError}` on the paste `<Input>`, but `Input` (unlike `PasswordInput`) has no `error` prop. The executor correctly adapted to `variant={pasteError ? 'destructive' : undefined}` (L728) plus a sibling `<AnimatedInputError>{pasteError}</AnimatedInputError>` (L738) — same intent (error styling + animated message), correct API usage. This is the right call, not a deviation that affects goal achievement.

### Deferred Items (operator-scoped OUT, not gaps)

| Item | Reason |
| ---- | ------ |
| Part 2 — Apple Sign-In re-enable (platform/web) | Operator-deferred to the separate livinity.io platform OAuth track. Out of scope for this LivOS-desktop polish phase. |
| Part 3 — Microsoft/Azure OAuth (nOAuth-safe) | Same — deferred platform track. |

### Human Verification Required

See frontmatter `human_verification`. Summary:
1. **Build gate** — `pnpm --filter @livos/config build && pnpm --filter ui build` succeeds.
2. **Deploy + dialog-opens UAT** — after release/update.sh + SW-cache clear, agent "Auth" opens the dialog (not the Terminal).
3. **AUTH-1 live** — bare `claude` no longer hangs on an infinite "Waiting…" spinner; paste field visible immediately.
4. **AUTH-2/3 live** — visible code field + Enter submits; "Use an API key instead" is an obvious button; code cleared after submit.
5. **Routing regression** — cli-install still Terminal; in-dialog "Advanced: run in Terminal" still works (one-line revert available if operator prefers Terminal-default).

### Gaps Summary

No code gaps. All 5 must-haves are met in the actual code (verified against the files, not the SUMMARY): AUTH-1 (unconditional paste field, no spinner-only path), AUTH-2 (first-class `<Button>`), AUTH-3 (visible `<Input>` + Enter + clear-on-submit + API-key Enter parity), routing flip with RCE boundary preserved. The only remaining work is the operator-gated build + deploy + live auth UAT, per the plan's explicit `autonomous: true` (code) / operator-gated (deploy) contract — hence `human_needed`, not `gaps_found`.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
