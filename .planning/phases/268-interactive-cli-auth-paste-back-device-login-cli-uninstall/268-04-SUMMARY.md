---
phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall
plan: 04
subsystem: ui
tags: [cli-installer, react, tsx, trpc, shadcn, tailwind, framer-motion, paste-back, uninstall, sendAuthInput, agent-refresh, aionui-patch, postmessage, rce-boundary]

# Dependency graph
requires:
  - phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall (plan 01)
    provides: "sendAuthInput({name, code}) module fn + live-child registry (keeps the bare login alive across the browser round-trip) + the liv:cli:auth:url:<name> URL surfacing the dialog polls"
  - phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall (plan 02)
    provides: "uninstallCli({name}) per-install-method removal (aion-cli refused via kind:'none' -> UNINSTALL_REFUSED)"
  - phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall (plan 03)
    provides: "cliInstaller.sendAuthInput + cliInstaller.uninstall adminProcedures (httpOnlyPaths-registered, production-wired); uninstall fires the debounced agent-refresh on ok"
  - phase: 267-ui-cli-install-auth-no-terminal
    provides: "the cli-auth-dialog Phase state machine (device/apikey/browser branches), the getDeviceCode poll + explicit-click open-link, the apikey clear-after-use idiom, the {kind:'ready', applied:false} + agentRefreshStatus 'Applying...' poll, and the use-cli-auth-bridge postMessage handler + the AionUi local-agents-install-section panel"
provides:
  - "cli-auth-dialog 'auth-paste-back' phase — device-style login URL ('Open link', explicit click, never auto-navigated) + a masked PasswordInput code field -> cliInstaller.sendAuthInput; the pasted code is cleared from React state immediately after submit (success OR failure), never echoed/logged/stored (E-9 / T-268-16)"
  - "branchToAuthPhase maps the backend 'paste-back' AuthBranch -> {kind:'auth-paste-back'}; the getDeviceCode poll is widened so paste-back ALSO renders the URL block"
  - "a dedicated pasteStarted ref fires authM.mutateAsync({name}) ONCE on entering paste-back; its {ok} resolution (the login child exiting after it consumes the stdin code) is the FINAL completion signal that flips to {kind:'ready'}"
  - "Uninstall affordance on DETECTED CLIs (NOT mid-install/auth/ready) — a subtle destructive-token 'Remove <label>' link -> inline two-step confirm (T-268-19) -> cliInstaller.uninstall -> {kind:'ready', applied:false} so the EXISTING 267-03 agentRefreshStatus 'Applying...' poll runs while the removed agent disappears from /api/agents"
  - "use-cli-auth-bridge.ts 'cli-uninstall' postMessage case -> openCliAuthDialog({cli, mode:'auth'}) on the detected CLI; inherits the origin-check + /^[a-z0-9-]+$/ && INSTALLABLE_CLIS NAME-only RCE gate (T-268-18)"
  - "AionUi panel (local-agents-install-section.js) Remove button on detected/installed rows (gated !authHidden so aion-cli never shows one) that posts NAME-only cli-uninstall to the shell, mirroring the Auth button"
affects: [268-verify, cli-auth-dialog, aionui-patches, operator-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-phase reuse of the 267 device-code poll: a NEW phase (auth-paste-back) widens the getDeviceCode enabled/refetchInterval guard instead of adding a second poll"
    - "Bearer-secret clear-after-submit in React: setPasteCode('') on BOTH success and failure (mirror of 267's setApiKey('') E-9 contract) — the code is never persisted/logged/echoed"
    - "Per-phase fire-once start ref (pasteStarted mirrors deviceStarted) so the device + paste-back long-running auth mutations never cross-trigger; the Retry handler resets both"
    - "Destructive action behind an inline two-step confirm using the existing destructive2-lightest token — no new design system (operator no-aesthetic-redesign rule)"
    - "uninstall reuses the 267-03 {kind:'ready', applied:false} terminal state verbatim so the agentRefreshStatus 'Applying...' machinery handles the agent-disappears transition with ZERO new code"
    - "NAME-only postMessage RCE boundary extended additively: a 3rd message type (cli-uninstall) inherits the pre-switch origin + allowlist gate; the panel posts only {source, type, cli:NAME}"

key-files:
  created: []
  modified:
    - "livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx — Phase union + auth-paste-back; branchToAuthPhase 'paste-back' case; widened getDeviceCode poll; sendAuthInputM + uninstallM mutations; pasteCode/pasteError/confirmUninstall state; pasteStarted start-effect; handleSubmitPasteCode (clear-after-submit) + handleUninstall; paste-back render block (URL + masked code field); Uninstall confirm affordance; Submit-code footer button; Retry resets pasteStarted"
    - "livos/packages/ui/src/hooks/use-cli-auth-bridge.ts — 'cli-uninstall' postMessage case -> openCliAuthDialog({cli, mode:'auth'}); NAME-only RCE gate unchanged (runs before the switch)"
    - "scripts/aionui-patches/local-agents-install-section.js — Remove button in renderRow (gated !authHidden); uninstallBtn lookup + visibility toggle in setRowState (shown detected/installed, hidden undetected); hydrate Remove click handler posts NAME-only cli-uninstall"

key-decisions:
  - "Uninstall reuses mode:'auth' through the bridge (CliAuthDialogDetail union stays 'install'|'auth') — the dialog detects the CLI and surfaces the Remove confirm; no new detail mode needed"
  - "The Remove button render is gated on !meta.authHidden in the panel so aion-cli (genuinely not uninstallable, UninstallSpec kind:'none') never shows a Remove affordance, honoring the operator hard rule even though the server also refuses it"
  - "handleUninstall sets a transient {kind:'authenticating'} spinner (no new phase, per plan) then flips to {kind:'ready', applied:false}; the brief 'Saving...' text is sub-second and the plan explicitly accepted reusing the existing phase rather than adding one"
  - "paste-back stays in {kind:'auth-paste-back'} after a successful sendAuthInput — the authM effect's resolution (the login child's own exit) is what flips to 'ready', so submitting the code does NOT prematurely declare success"

patterns-established:
  - "UI paste-back flow: poll the device URL + show a masked code field; the stdin write is decoupled from completion (completion arrives on the login child's exit, not the paste mutation)"
  - "Operator-facing destructive flow: explicit two-step confirm + destructive token, reusing the success-state poll for the post-action transition"

requirements-completed:
  - paste-back UI branch (URL → browser → paste code back)
  - preserve 267 device/apikey branches + agent-refresh
  - uninstall UI button
  - removed agent disappears from /api/agents

# Metrics
duration: 18 min
completed: 2026-06-14
---

# Phase 268 Plan 04: Paste-back dialog branch + Uninstall button Summary

**The operator-facing surface for paste-back + uninstall: cli-auth-dialog.tsx gains an `auth-paste-back` phase (explicit-click login URL + a masked code field → `cliInstaller.sendAuthInput`, code cleared the instant it is submitted) and a two-step Uninstall confirm (→ `cliInstaller.uninstall` → the existing 267-03 "Applying…" poll runs while the removed agent drops out of `/api/agents`); `use-cli-auth-bridge.ts` routes a new `cli-uninstall` postMessage and the AionUi Local Agents panel renders a NAME-only Remove button on detected rows.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-14T03:58:00Z (approx)
- **Completed:** 2026-06-14T04:16:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **`auth-paste-back` phase** — a sibling of `auth-device`: the bare login prints a URL (surfaced via the SAME `getDeviceCode` poll, now widened to enable for paste-back) AND blocks on stdin. The dialog renders the "1 · Open this link" `hostOf(url)` + an explicit `Open link ↗` Button (NEVER auto-navigated — 267-02 / T-268-17) and "2 · Paste the code from your browser" with a masked `<PasswordInput label='Code'>`. The `Submit code` footer button calls `sendAuthInputM.mutateAsync({name, code})`; the code is cleared via `setPasteCode('')` on BOTH success and failure (E-9 / T-268-16 — never echoed, logged, or persisted).
- **Completion decoupled from the paste** — a dedicated `pasteStarted` ref fires `authM.mutateAsync({name})` ONCE on entering the phase; its `{ok}` resolution (the login child exiting after it consumes the stdin code from the live-child registry, plan 01) is the FINAL completion signal that flips to `{kind:'ready'}`. Submitting the code does not prematurely declare success.
- **Uninstall affordance** — rendered only when `detectQ.data?.detected === true` and NOT during install/auth/ready/loading: a subtle `text-destructive2-lightest` "Remove `<label>`" link → an inline two-step confirm "Remove `<label>` from this server? [Remove] [Cancel]" (T-268-19). Remove → `handleUninstall` → `uninstallM.mutateAsync({name})` → on ok `{kind:'ready', applied:false}` so the EXISTING 267-03 `agentRefreshStatus` "Applying…" poll runs while the agent disappears (the 268-03 router fires the debounced agent-refresh on uninstall ok; E-6).
- **Bridge `cli-uninstall` case** — `use-cli-auth-bridge.ts` maps `data.type === 'cli-uninstall'` → `openCliAuthDialog({cli, mode:'auth'})`. The detail union (`'install' | 'auth'`) is unchanged; the dialog detects the CLI and surfaces the Uninstall confirm. The origin-check + `/^[a-z0-9-]+$/ && INSTALLABLE_CLIS.has(cli)` NAME-only RCE gate runs BEFORE the switch (T-268-18), so the uninstall path inherits it.
- **AionUi panel Remove button** — `local-agents-install-section.js` renders a `liv-240-btn-uninstall` button on detected/installed rows (gated `!meta.authHidden` so aion-cli never shows one), toggled visible in `setRowState`'s detected/installed branch and hidden in undetected; the `hydrate` click handler posts NAME-only `cli-uninstall` to the shell (mirroring the Auth button) and shows the Re-detect pending affordance.

## Task Commits

Each task was committed atomically:

1. **Task 1: auth-paste-back phase + Uninstall button + confirm in cli-auth-dialog.tsx** — `1f175be2` (feat)
2. **Task 2: route cli-uninstall through the bridge + panel Remove button** — `acfe9c39` (feat)

**Plan metadata:** docs commit (this SUMMARY + STATE.md + ROADMAP.md, force-staged — `.planning/` is gitignored).

## Files Created/Modified

- `livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx` — `auth-paste-back` Phase + `branchToAuthPhase` case; widened `deviceCodeQ` guard (`devicePolling`); `sendAuthInputM` + `uninstallM` mutations; `pasteCode`/`pasteError`/`confirmUninstall` state; `pasteStarted` start-effect; `handleSubmitPasteCode` (clear-after-submit) + `handleUninstall`; the paste-back render block (URL open-link + masked code field); the Uninstall two-step confirm affordance; the `Submit code` footer button; the Retry handler resets `pasteStarted`/`confirmUninstall`/`pasteCode`.
- `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` — `'cli-uninstall'` postMessage case → `openCliAuthDialog({cli, mode:'auth'})`; NAME-only RCE gate unchanged.
- `scripts/aionui-patches/local-agents-install-section.js` — Remove button in `renderRow` (gated `!authHidden`); `uninstallBtn` lookup + visibility toggle in `setRowState`; `hydrate` Remove click handler posting NAME-only `cli-uninstall`.

## Decisions Made

- **Uninstall reuses `mode:'auth'`** through the bridge — the `CliAuthDialogDetail` union stays `'install' | 'auth'`; the dialog detects the CLI and surfaces the Remove confirm, so no new detail mode was needed.
- **aion-cli never shows a Remove button** — the panel gates the Remove render on `!meta.authHidden`. aion-cli is genuinely not uninstallable (its `UninstallSpec` is `kind:'none'` → `UNINSTALL_REFUSED` server-side), so even though the route would refuse it, the UI never offers it, honoring the operator hard rule.
- **No new phase for the uninstall spinner** — `handleUninstall` reuses the transient `{kind:'authenticating'}` spinner (per the plan's "add NO new phase" guidance) before flipping to `{kind:'ready', applied:false}`. The brief "Saving…" copy is sub-second; the plan explicitly accepted reusing the existing phase.
- **paste-back completion is the login child's exit, not the paste** — after a successful `sendAuthInput` the dialog STAYS in `{kind:'auth-paste-back'}`; the `authM` effect's resolution flips to `ready`, so a paste never prematurely declares success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSX block comment contained `*/` and closed the expression-comment early**
- **Found during:** Task 1 (vite build gate)
- **Issue:** The Uninstall affordance's JSX comment read `auth-*/install-failed steps`. The literal `*/` inside the `{/* … */}` JSX comment terminated the comment block early, so esbuild parsed the following text as JSX and failed: `Expected "}" but found "steps"` at `cli-auth-dialog.tsx:771`.
- **Fix:** Reworded the comment to `auth and install-failed steps` (no `*/` sequence).
- **Files modified:** `livos/packages/ui/src/features/liv-ai/cli-auth-dialog.tsx`
- **Verification:** `pnpm --filter ui build` then exits 0; the file was already committed only after the green build.
- **Committed in:** `1f175be2` (Task 1 commit — caught and fixed before commit)

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Trivial — a comment-syntax footgun in newly-written JSX, fixed before the Task 1 commit. No scope change; the deploy gate (vite) is clean.

## Issues Encountered

None beyond the auto-fixed JSX-comment bug above. The `@livos/config` build and the `ui` vite build both exit 0; `node --check` on the panel patch JS passes.

## User Setup Required

None — no external service configuration required.

## Operator UAT / Deploy Note

**CODE ONLY — NOT DEPLOYED.** Deploy the UI via `cd /opt/livos && pnpm --filter @livos/config build && pnpm --filter ui build` (vite) then `bash /opt/livos/update.sh` (release-based as of Phase 266 — cut a GitHub Release tag first). The AionUi panel patch (`scripts/aionui-patches/local-agents-install-section.js`) ships with update.sh's aionui-patches apply. **Hard-refresh / clear the PWA service worker** to pick up the new bundle (the SW aggressively caches — a normal refresh may serve the stale bundle).

Operator UAT on the Mini PC:
1. **Paste-back** — a paste-back CLI (claude-code, bare `claude` login) shows the URL + a masked code field; sign in → paste the code → "ready" within ~10s with NO terminal.
2. **Uninstall** — a detected CLI's Remove button → confirm → "Applying…" → the agent disappears from `/api/agents`.

**A5 deferred follow-up (RESEARCH Open Question 1):** if the bare `claude` login does NOT emit the URL/stdin prompt under a pipe (only under a real TTY), the backend (plan 01) may need the node-pty fallback in the live-child registry. This is backend territory — surface it as a follow-up only if live UAT shows the paste-back phase never receives a URL (the dialog will sit on "Waiting for the sign-in link…").

## Next Phase Readiness

- This is the FINAL plan of Phase 268. The full feature is code-complete: backend (sendAuthInput + the live-child registry, uninstallCli), transport (the two adminProcedures + httpOnlyPaths + DI wiring), and now the operator-facing UI (paste-back dialog branch + Uninstall button + the bridge + the AionUi panel Remove button).
- Ready for `/gsd-verify-work 268` and operator UAT on the Mini PC after the next Release ships.
- No blockers (the A5 paste-back-under-a-pipe question is the only open item, deferred to live UAT).

## Self-Check: PASSED

- All 3 modified files exist on disk (edits applied + greps hit).
- Both task commits exist in git log (`1f175be2` feat Task 1, `acfe9c39` feat Task 2).
- Acceptance greps: `auth-paste-back`, `sendAuthInputM`, `uninstallM`, `case 'paste-back'`, `setPasteCode('')` all hit in cli-auth-dialog.tsx; `cli-uninstall` hits in use-cli-auth-bridge.ts; `liv-240-btn-uninstall` + `cli-uninstall` hit in local-agents-install-section.js.
- Deploy gate: `pnpm --filter @livos/config build` exit 0; `pnpm --filter ui build` (vite) exit 0; `node --check` on the panel JS passes.
- 267 device/apikey/browser/n-a branches + the agentRefreshStatus poll preserved (verified in the union + the switch).

---
*Phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall*
*Completed: 2026-06-14*
