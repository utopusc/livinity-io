---
phase: 272-oauth-completion
plan: 01
subsystem: ui
tags: [liv-ai, cli-auth-dialog, auth, paste-back, react, trpc]

requires:
  - phase: 267-269
    provides: CliAuthDialog (paste-back/apikey/device branches), use-cli-auth-bridge routing, cliInstaller.sendAuthInput/setApiKey
provides:
  - cli-auth-dialog paste-back UX fixes (AUTH-1 always-visible paste field, AUTH-2 first-class API-key button, AUTH-3 visible field + Enter-submit)
  - cli-auth re-routed to the fixed dialog (Terminal kept as in-dialog Advanced fallback)
affects: [liv-ai-agents-panel, cli-auth]

tech-stack:
  added: []
  patterns:
    - "Paste-back: never gate the user's input field on a server-side parse that may never fire"

key-files:
  created: []
  modified:
    - livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx
    - livos/packages/ui/src/hooks/use-cli-auth-bridge.ts

key-decisions:
  - "Scope reduced to Part 1 (AUTH-1/2/3) per operator; Apple (Part 2) + Microsoft/Azure (Part 3) deferred to the separate livinity.io platform track"
  - "Re-promoted the fixed dialog as the default cli-auth path (reverses v44.22 Terminal-default) — one-line revert if operator prefers Terminal; flagged for UAT"
  - "Un-masked only the one-time paste-back code field; API keys stay masked (long-lived secrets)"

patterns-established:
  - "Pattern: Enter-to-submit on auth fields via onKeyDown (Input native; PasswordInput wrapped in an onKeyDown div since it doesn't forward onKeyDown)"

requirements-completed: []

duration: ~20min
completed: 2026-06-15
---

# Phase 272 Plan 01: cli-auth-dialog paste-back UX (AUTH-1/2/3) Summary

**Fixed the three cli-auth-dialog paste-back bugs (infinite spinner, buried API-key escape, masked/no-Enter code field) and re-promoted the now-reliable dialog as the default cli-auth path.**

## Performance
- **Duration:** ~20 min
- **Completed:** 2026-06-15
- **Tasks:** 3 (A: AUTH-1+3, B: AUTH-2, C: routing)
- **Files modified:** 2

## Accomplishments
- **AUTH-1** — the `auth-paste-back` branch now always renders the code-paste field; the "Open this link" block is the only part gated on a parsed `deviceCode`. Bare `claude` login (which prints no short uppercase code) no longer hangs on "Waiting for the sign-in link…" — the user can paste immediately. The empty-deviceCode state is now a helpful hint, not a dead spinner.
- **AUTH-2** — "Use an API key instead" is a first-class full-width `<Button>` (was a `text-caption` gray link), shown when the CLI has an `apiKeyEnv`.
- **AUTH-3** — the paste-back code field is a visible `<Input>` (was masked `<PasswordInput>`) with `autoFocus` + Enter-to-submit; the API-key fields also submit on Enter (via an `onKeyDown` wrapper div since `PasswordInput` doesn't forward `onKeyDown`). The pasted code is still cleared on submit and never logged/persisted (E-9 contract unchanged).
- **Routing** — `use-cli-auth-bridge.ts` `cli-auth` now opens the fixed dialog (`openCliAuthDialog`) instead of the Terminal; `cli-install` (Terminal) and `cli-uninstall` (dialog confirm) unchanged; NAME-only RCE boundary preserved.

## Task Commits
1. **Tasks A+B: dialog AUTH-1/2/3** — `610ddd2b` (feat)
2. **Task C: re-promote dialog for cli-auth** — `1a26de2e` (feat)

## Files Created/Modified
- `cli-auth-dialog.tsx` — paste-back branch rewrite (always-visible Input + Enter), API-key first-class button, Enter-to-submit on API-key fields
- `use-cli-auth-bridge.ts` — `cli-auth` → `openCliAuthDialog`; header + inline comments updated

## Decisions Made
See key-decisions. Notably: scope cut to AUTH-1/2/3 (Apple/Microsoft deferred per operator); dialog re-promoted as default cli-auth path (easily reverted).

## Deviations from Plan
None — plan executed as written. Kept edits to the 2 planned files (Enter-on-API-key via wrapper div rather than modifying the shared `input.tsx`).

## Issues Encountered
- Repo-wide `tsc` is broken at baseline (pre-existing). Edits use only existing `Input`/`AnimatedInputError` APIs (verified against `input.tsx`); the real gate is the deploy build.

## User Setup Required
**Deploy + live UAT is operator-gated (Mini PC).** After release → `update.sh` → SW-cache-clear: click an agent's "Auth" → confirm the dialog (not the Terminal) opens, the paste field is visible immediately, "Use an API key instead" is a clear button, and pasting a code + Enter submits. Confirm bare `claude` no longer hangs. The in-dialog "Advanced: run in Terminal instead" still works. If you prefer Terminal-default for auth, revert the one-line `cli-auth` branch in `use-cli-auth-bridge.ts`.

## Next Phase Readiness
- Code-complete and committed; ready for deploy + operator UAT.
- Apple/Microsoft OAuth remain deferred ([[project_oauth_signin]] has the full nOAuth-safe design for when picked up).

---
*Phase: 272-oauth-completion (scoped to AUTH-1/2/3)*
*Completed: 2026-06-15*
