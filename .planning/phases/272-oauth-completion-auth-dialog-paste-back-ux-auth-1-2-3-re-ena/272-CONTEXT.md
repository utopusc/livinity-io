# Phase 272: OAuth completion — cli-auth-dialog paste-back UX (AUTH-1/2/3) - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — scope confirmed with operator

<domain>
## Phase Boundary

**Scope CONFIRMED by operator (2026-06-15 discuss):** Phase 272 implements **only Part 1** — fully fix the three `cli-auth-dialog.tsx` paste-back UX bugs (AUTH-1/2/3). **Apple Sign-In (Part 2) and Microsoft/Azure OAuth (Part 3) are DEFERRED** — operator: "gerek yok … apple ve microsoft auth livinity.io için geçerli" = those platform/web (livinity.io) OAuth providers are a separate track, not needed in this LivOS-desktop polish phase.

The three bugs (from the cli-auth "auth is incredibly hard" workflow; defined in [[project_liv_assistant_desktop_user_path]]), all in `livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx`:

- **AUTH-1 — infinite spinner.** The paste-back branch only renders its code-paste field when `deviceCode` (from `getDeviceCode`/`parseDeviceCode`) is truthy, which requires the server to parse BOTH a URL and a short uppercase code from the login's stdout. Bare `claude` login emits a URL + "Paste code here if prompted" but **no short code** → `getDeviceCode` never resolves → the dialog hangs on "Waiting for the sign-in link…" and the paste field never appears.
- **AUTH-2 — buried API-key escape.** The "Use an API key instead" fallback is a tiny gray text link (`text-caption text-text-tertiary`) below the spinner — easy to miss when the device flow stalls.
- **AUTH-3 — masked code field, no Enter-to-submit.** The paste-back code uses `<PasswordInput>` (masked) and only submits via the footer "Submit code" button (no Enter key).

OUT OF SCOPE: platform/web OAuth (Apple/Microsoft/Google/GitHub at livinity.io); the SD-1 "merge detectCli into /api/agents overlay" robustness idea; AionUi vendored bundle; anything in Phase 273.
</domain>

<decisions>
## Implementation Decisions

### AUTH-1 — surface the paste field immediately (LOCKED)
- In the `auth-paste-back` branch, ALWAYS render the code-paste input (do NOT gate it on `deviceCode`). The "Open this link" block stays conditional on `deviceCode` (show it if/when the server parses a URL), but the user can paste a code at any time — that is the whole point of paste-back.
- Replace the standalone "Waiting for the sign-in link…" spinner-only state with: a short hint ("If a sign-in link appears below, open it; then paste the code your browser shows.") + the always-present paste field. If `deviceCode` arrives, the link block appears above it.

### AUTH-2 — promote the API-key fallback to first-class (LOCKED)
- Render "Use an API key instead" as a real secondary `<Button>` (not a gray caption link) in the paste-back branch, shown whenever `method?.apiKeyEnv` exists. Same handler (reset `pasteStarted`, clear state, switch to `auth-apikey`).

### AUTH-3 — visible code field + Enter-to-submit (LOCKED)
- Paste-back code field: switch from masked `<PasswordInput>` to a **visible** text input (the value is a short one-time device/login code; visibility removes friction — operator-requested). Keep the never-log / clear-on-submit handling unchanged (`handleSubmitPasteCode` already clears the value immediately; it is never echoed back or persisted).
- Add **Enter-to-submit**: pressing Enter in the paste-back code field calls `handleSubmitPasteCode`. Apply the same Enter-to-submit to the API-key field (`handleSubmitApiKey`) for consistency (low-risk UX parity).

### Routing — re-promote the fixed dialog for auth (LOCKED, flagged for operator UAT)
- The v44.22 pivot routed `cli-auth` to the Terminal because the dialog's paste flow was unreliable — i.e. AUTH-1. Fixing AUTH-1 removes that reason, so re-wire `use-cli-auth-bridge.ts` `cli-auth` to open the fixed dialog (`openCliAuthDialog({cli, mode:'auth'})`) again, KEEPING the prominent in-dialog "Advanced: run in Terminal instead" affordance (one click away). `cli-install` and `cli-uninstall` routing unchanged.
- **OPERATOR-VISIBLE CHANGE:** this reverses the v44.22 "auth-in-Terminal" default (operator-confirmed working). It is a one-line flip to revert if the operator prefers Terminal-default at UAT. Surfaced in SUMMARY + HUMAN-UAT.

### Claude's Discretion
- Exact copy/microcopy for the new hint + button labels; spacing.
- Whether the API-key field Enter-to-submit is wired via a shared `onKeyDown` helper or per-field.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cli-auth-dialog.tsx` `CliAuthDialogBody` — the whole flow (loading/install/auth-*/ready). The `auth-paste-back` branch (≈ lines 682-745) is the edit site for AUTH-1/2/3.
- `handleSubmitPasteCode` (clears code on submit; never logs) and `handleSubmitApiKey` already exist — only the trigger surface (Enter) + field visibility change.
- `runCliInTerminalFallback` / `openCliAuthDialog` already exported — the routing re-wire is in `use-cli-auth-bridge.ts` `handleMessage`.
- `<PasswordInput>` vs a visible `<Input>` from `@/shadcn-components/ui/input`.

### Established Patterns
- Phase-state machine (`Phase` union) drives the dialog; `pasteStarted` ref fires the long-running `authM` mutation once on entering `auth-paste-back`.
- Pasted code = bearer-like secret: cleared from React state immediately on submit, never echoed/stored (E-9). Keep this contract when un-masking (visibility ≠ persistence).
- D-239-07 RCE boundary (NAME-only) lives in `use-cli-auth-bridge.ts`; re-wiring `cli-auth` to the dialog keeps it (the dialog also takes only a NAME).

### Integration Points
- `use-cli-auth-bridge.ts` `useCliAuthBridge()` `handleMessage` — change the `cli-auth` branch from `runCliInTerminalFallback(...,'cli-auth',...)` to `openCliAuthDialog({cli, mode:'auth'})`.
- The dialog self-mounts in the desktop shell via `CLI_AUTH_DIALOG_EVENT` (already wired).

</code_context>

<specifics>
## Specific Ideas
- Keep the "Open link ↗" explicit-click (no auto-navigate) 267-02 phishing mitigation when `deviceCode` is present.
- The paste field should `autoFocus` so the operator can paste + Enter immediately.
</specifics>

<deferred>
## Deferred Ideas
- Part 2 (Apple Sign-In re-enable) + Part 3 (Microsoft/Azure OAuth w/ nOAuth mitigation) on platform/web — separate livinity.io platform track, per operator ([[project_oauth_signin]] has the full design incl. the nOAuth/xms_edov mitigation for when it's picked up).
- SD-1: merge LivOS `detectCli` into the `/api/agents` overlay so the picker reflects what livinityd can run independent of AionUi's startup scan.
</deferred>

---

*Phase: 272-oauth-completion (scoped to cli-auth-dialog AUTH-1/2/3)*
*Context gathered: 2026-06-15 (smart discuss, autonomous)*
