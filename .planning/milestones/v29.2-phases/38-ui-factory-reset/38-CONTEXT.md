# Phase 38: UI Factory Reset — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** ROADMAP.md success criteria + REQUIREMENTS.md (FR-UI-01..07) + Phase 37 backend deliverables — synthesized as locked decisions (skip-discuss config + ui_phase=false → no UI-SPEC required)
**Milestone:** v29.2 Factory Reset (mini-milestone)
**Depends on:** Phase 37 (live tRPC route + JSON event row reader contract)

<domain>
## Phase Boundary

This phase ships the **UI half** of the factory reset feature:

1. A "Danger Zone" section in Settings > Advanced with a red destructive Factory Reset button (admin-only)
2. A confirmation modal with: explicit-deletion-list, preserve-account-vs-fresh radio, type-`FACTORY RESET`-to-confirm input, pre-flight blocking checks
3. A BarePage progress overlay (mirroring Phase 30 update overlay) that polls the JSON event row from livinityd and shows reinstall progress
4. Post-reset routing logic: `/login` (preserveApiKey + success) | `/onboarding` (no preserveApiKey + success) | error page (any failed status)

**Out of scope:** the tRPC route itself (Phase 37, shipped), the bash wipe script (Phase 37, shipped), changes to the auth flow, changes to the onboarding wizard.

**Mini PC integration:** UI lives in `livos/packages/ui/`. After build, deployed to Mini PC via `bash /opt/livos/update.sh` (which runs `pnpm --filter @livos/config build && pnpm --filter ui build`). v29.2 ships UI changes via the same update path; no manual Mini PC deploy required.

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Phase 37 backend contract (THE INPUT GATE)

**D-BE-01 (LOCKED):** The tRPC route is `system.factoryReset` taking `{preserveApiKey: boolean}` and returning `{accepted: true, eventPath: string, snapshotPath: string}`. The UI calls this via `trpc.system.factoryReset.useMutation()`. No retry on the client side — the route either accepts (returns the metadata) or throws (BAD_REQUEST for pre-flight failures, FORBIDDEN for non-admin).

**D-BE-02 (LOCKED):** The route is `adminProcedure` only — the UI must check `ctx.user.role === 'admin'` (or equivalent) before showing the Factory Reset button at all. Non-admin users see an explanatory note instead (per FR-UI-01 / SC1).

**D-BE-03 (LOCKED):** Progress is read via `trpc.system.listUpdateHistory.useQuery()` (Phase 33 OBS-02). The UI filters for `type === 'factory-reset'` events and shows the most recent. The progress overlay polls this every ~2 seconds.

**D-BE-04 (LOCKED):** JSON event row schema (per Phase 37 D-EVT-02):
```typescript
type FactoryResetEvent = {
  type: 'factory-reset'
  status: 'in-progress' | 'success' | 'failed' | 'rolled-back'
  started_at: string  // ISO timestamp
  ended_at: string | null
  preserveApiKey: boolean
  wipe_duration_ms: number
  reinstall_duration_ms: number
  install_sh_exit_code: number | null
  install_sh_source: 'live' | 'cache' | null
  snapshot_path: string
  error: 'api-key-401' | 'server5-unreachable' | 'install-sh-failed' | 'install-sh-unreachable' | null
}
```
The UI must NOT infer status from absence of fields — it MUST check the `status` field directly. (The bash writes the row incrementally; intermediate states are valid JSON but with some duration/exit_code fields still null.)

### Pre-flight blocking checks (FR-UI-07)

**D-PF-01 (LOCKED):** The Factory Reset button is DISABLED (with tooltip showing reason) if any of:
1. **Update in progress** — read `trpc.system.updateStatus.useQuery()` (Phase 30); if `running: true`, disable. Tooltip: "An update is currently running. Try again after it completes."
2. **Network unreachable** — pre-flight `fetch('https://livinity.io', {method: 'HEAD', mode: 'no-cors'})` in the modal (run on modal-open, before showing Confirm). If non-2xx (or fetch error), disable. Tooltip: "Cannot reach livinity.io. Reinstall would fail. Check your internet connection and try again."
3. **Backup in progress** (forward-compat) — v29.2 SKIPS this check entirely. v30.0 will add it via `BAK-SCHED-04` lock; v29.2 button code includes a `// TODO: backup mutex (v30.0)` comment-out for the future check.
4. **Non-admin** — handled at component-render level (button doesn't render at all for non-admins); see D-BE-02.

**D-PF-02 (LOCKED):** Network reachability check uses `fetch('https://livinity.io', {method: 'HEAD'})` with a 5-second timeout. Modal shows "Checking…" for the first <500ms; after that, if check is still in flight, the button is disabled with "Checking network…" tooltip. After 5s timeout: treat as unreachable. The check runs once per modal open, not continuously — opening and closing the modal triggers a fresh check.

### UI structure (FR-UI-01 + R1 mitigation)

**D-UI-01 (LOCKED):** Path: Settings > Advanced. The button lives in a new "Danger Zone" section, positioned BELOW all existing Advanced settings (NOT inline with safe options). Section has a clear visual divider — destructive style (red border, muted background, warning icon header).

**D-UI-02 (LOCKED):** Button visual: red (destructive variant per project's existing destructive button pattern — likely shadcn/ui `Button` with `variant="destructive"`), label "Factory Reset", icon to the LEFT of label (shield-warning or trash-outline icon from the project's existing icon library).

**D-UI-03 (LOCKED):** Non-admin fallback: instead of the button, show a `<p>` (or shadcn/ui `Alert`) with text: "Factory reset is restricted to admin users. Contact your LivOS administrator if you need to perform a factory reset." NO faded button (it would invite mis-clicks); a plain note is the design.

### Confirmation modal (FR-UI-02 — explicit list IS the consent)

**D-MD-01 (LOCKED):** Modal is **NOT a generic AlertDialog "Are you sure?"**. The explicit deletion list is the modal's body. Use shadcn/ui `Dialog` (or equivalent project pattern). The list reads as a real bulleted list, not a paragraph. Lines (verbatim — copy these into the modal):

> "This will permanently delete:"
> - All installed apps and their data
> - All user accounts (admin, members, guests)
> - All sessions, JWT tokens, and stored secrets
> - All AI keys (Anthropic, OpenAI, Kimi, etc.)
> - All schedules and automations
> - All Docker volumes managed by LivOS
> - All system settings and preferences

The list is rendered as a `<ul>` inside the modal body. Each item is a `<li>` with the item text exactly as above. This is the consent surface — the user must read it.

**D-MD-02 (LOCKED):** Below the list: a sentence "If you previously chose 'Restore my account' the reinstalled LivOS will recognize your Livinity account and current credentials still work. Otherwise the host onboards as new."

### Account preservation radio (FR-UI-03)

**D-RD-01 (LOCKED):** Radio component (shadcn/ui `RadioGroup`) with two options:

1. **"Restore my account"** (preserveApiKey=true)
   - Description: "Your Livinity API key is preserved. After reinstall, log in with your existing credentials."
   - Default selection (radio is pre-selected on `Restore my account`)

2. **"Start fresh as new user"** (preserveApiKey=false)
   - Description: "Wipe everything including the Livinity API key. After reinstall, you'll go through the onboarding wizard as a new user."

The radio is required — both options are visible, exactly one selected, default is "Restore my account" (the safer default).

### Type-to-confirm input (FR-UI-04)

**D-CF-01 (LOCKED):** Below the radio, a text input labeled "Type FACTORY RESET to enable the destructive button:". Placeholder: empty. The expected literal string is `FACTORY RESET` (case-sensitive, exactly one space, no trailing whitespace).

**D-CF-02 (LOCKED):** The destructive Confirm button is DISABLED until the input value is exactly `FACTORY RESET`. Comparison is strict equality (`input.value === 'FACTORY RESET'`). Variants like `factory reset`, `FactoryReset`, `FACTORY-RESET` keep the button disabled. The disabled-button has a tooltip: "Type FACTORY RESET (case-sensitive) to enable.".

**D-CF-03 (LOCKED):** Modal close behavior: clicking outside the modal does NOT dismiss it (no `closeOnPointerDownOutside`). Pressing Escape DOES dismiss it (`closeOnEscape`). There's an explicit "Cancel" button. This prevents accidental dismissal-mid-confirm-flow.

### BarePage progress overlay (FR-UI-05)

**D-OV-01 (LOCKED):** On confirm, the modal closes. The UI immediately shows a full-screen "BarePage" overlay (mirror Phase 30 update overlay — search the codebase for `BarePage` or "update progress" component to find the precedent).

**D-OV-02 (LOCKED):** Overlay content:
- Heading: "Reinstalling LivOS"
- Animated progress bar OR animated spinner (whichever the project's BarePage component uses)
- Status text reflecting the JSON event row's current state — see D-OV-03 for the state→text mapping
- Estimated time text: "Estimated 5-10 minutes. Do not close this tab."
- NO cancel button — once started, the reset cannot be cancelled (the bash is detached and running)

**D-OV-03 (LOCKED):** Status text mapping (from JSON event row `status` + sub-state derivable from durations):
- `status: in-progress` AND `wipe_duration_ms === 0` → "Stopping services and stashing API key…"
- `status: in-progress` AND `wipe_duration_ms > 0` AND `reinstall_duration_ms === 0` → "Wipe complete. Fetching install.sh…"
- `status: in-progress` AND `reinstall_duration_ms > 0` → "Reinstalling LivOS… ({install_sh_source} install.sh source)"
- `status: success` → redirect (D-RT-01)
- `status: failed` → error page (D-RT-02)
- `status: rolled-back` → recovery success page (D-RT-03)

**D-OV-04 (LOCKED):** Polling: `trpc.system.listUpdateHistory.useQuery({ limit: 10, type: 'factory-reset' })` with `refetchInterval: 2000`. The overlay shows the most recent entry by `started_at` desc. If the query fails (livinityd unreachable mid-wipe — expected during the brief restart window between wipe-end and reinstall-start), retain the last-known status and show "Reconnecting to LivOS…" overlay text. After 90s of consecutive query failures, show "Connection lost. Wait or check `/diagnostic` (manual SSH)." but DO NOT redirect.

### Post-reset routing (FR-UI-06)

**D-RT-01 (LOCKED):** On `status: success`:
- If `preserveApiKey: true` → redirect to `/login`. Existing JWT may still be valid (livinityd's first-boot recognizes the persisted API key); if not, the login form appears. Either way, the user is at /login.
- If `preserveApiKey: false` → redirect to `/onboarding` wizard. Fresh install flow.

**D-RT-02 (LOCKED):** On `status: failed`: show the error page at the same URL (no redirect). Error page content:
- Heading: "Factory Reset Failed"
- Body: error-tag-specific message (FR-UI-06 + D-ERR mapping):
  - `api-key-401`: "Your Livinity API key was rejected (HTTP 401). The key may have been revoked. Log into livinity.io and re-issue, then try again."
  - `server5-unreachable`: "Cannot reach the install server (livinity.io). Try again in a few minutes."
  - `install-sh-failed`: "The reinstall script failed (exit code: {install_sh_exit_code}). Check the event log for details."
  - `install-sh-unreachable`: "Cannot fetch install.sh (live URL and cache both unavailable). Manual recovery required."
  - `null` (somehow status=failed with no error tag): "Reinstall failed for an unspecified reason. Check the event log."
- Button: "View event log" — links to `/admin/diagnostic/<eventPath>` (existing Phase 33 OBS view)
- Button: "Try again" — re-opens the confirmation modal (only enabled if pre-flight checks pass)
- Button: "Manual SSH recovery instructions" — links to `/help/factory-reset-recovery` (NEW page; just static instructions: "If you can SSH to your Mini PC, run `tar -xzf $(cat /tmp/livos-pre-reset.path) -C / && systemctl restart livos liv-core liv-worker liv-memory` to restore the pre-wipe snapshot.")

**D-RT-03 (LOCKED):** On `status: rolled-back`: show a SEPARATE recovery page:
- Heading: "Factory Reset Rolled Back"
- Body: "The reinstall failed but the pre-wipe snapshot was successfully restored. Your LivOS is back to the state it was in before you started the factory reset. The original error: {error}."
- Button: "Return to dashboard" — redirects to `/`

### Tests

**D-TS-01 (LOCKED):** Unit tests for the modal logic — type-to-confirm enabling, radio default, pre-flight check rendering, error-tag-to-message mapping, polling state machine. Use the project's existing test runner (likely vitest + react-testing-library; mirror existing UI test patterns).

**D-TS-02 (LOCKED):** No integration tests against a real Mini PC in this phase — the destructive integration test from Phase 37 is the system-level test. Phase 38 tests are component-level only.

### Out-of-scope / Deferred

**D-DEF-01:** Backup-mutex pre-flight check (FR-UI-07 forward-compat) → v30.0 Backup milestone.
**D-DEF-02:** "Schedule a factory reset" feature (no — destructive ops are immediate by design).
**D-DEF-03:** Multi-step wizard for the modal (no — the modal IS the wizard; one screen, full consent).
**D-DEF-04:** "Email me when reset completes" (no — the user is on the progress page, not leaving).

### Claude's Discretion

- Exact component file layout under `livos/packages/ui/` (one factory-reset module vs. split components)
- Choice of icon library (mirror existing destructive icons in the codebase)
- BarePage progress overlay: reuse exact Phase 30 component if it exists, else clone-and-rename. The planner reads the existing code to decide.
- Test placement (co-located vs. central `__tests__/`) — mirror existing pattern
- Error page route path: `/factory-reset/failed` vs. inline same-route render — planner picks based on existing routing pattern
- Whether to add a NEW route file for the BarePage overlay or wire it into existing Settings > Advanced layout — planner decides

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v29.2 milestone artifacts
- `.planning/ROADMAP.md` — Phase 38 success criteria
- `.planning/REQUIREMENTS.md` — FR-UI-01..07 verbatim
- `.planning/STATE.md` — confirms milestone v29.2, current_phase 38

### Phase 37 backend deliverables (THE INPUT CONTRACT)
- `livos/packages/livinityd/source/modules/system/factory-reset.ts` — exports `factoryResetInputSchema`, route returns `{accepted, eventPath, snapshotPath}`
- `livos/packages/livinityd/source/modules/system/routes.ts` — `system.factoryReset` route at line ~284 (adminProcedure)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — `'system.factoryReset'` in httpOnlyPaths
- `.planning/phases/37-backend-factory-reset/37-04-failure-handling-integration-SUMMARY.md` — error-tag definitions (api-key-401 / server5-unreachable / install-sh-failed / install-sh-unreachable)
- `.planning/phases/37-backend-factory-reset/37-CONTEXT.md` — D-EVT-02 JSON schema (the row the UI polls)

### Phase 30 prior-art (REUSE THIS PATTERN)
- BarePage update overlay used during system updates. Search the codebase for `BarePage` component, "update progress overlay", or `system.update` invocation site (likely in `livos/packages/ui/src/...`). Phase 38 BarePage progress mirrors the structure and visual feel.

### Phase 33 prior-art (UPDATE-HISTORY READER)
- `livos/packages/livinityd/source/modules/system/routes.ts` — `listUpdateHistory: adminProcedure` and `readUpdateLog: adminProcedure` at lines ~121, ~163
- `.planning/milestones/v29.0-phases/33-update-observability-surface/` — original schema spec

### Project memory
- `C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md`:
  - Frontend: React 18 + Vite + Tailwind 3.4 + shadcn/ui + Framer Motion
  - Mini PC deploy via `bash /opt/livos/update.sh` (which builds @livos/config + ui via pnpm)
  - **Server4 OFF-LIMITS** — never reference, even in error help text

### NOT canonical
- `.planning/milestones/v22.0-phases/` — archived, irrelevant
- Any Server4-related path or example

</canonical_refs>

<specifics>
## Specific Ideas

- **Test the type-to-confirm matching with Turkish keyboards.** Some users on Turkish keyboards have the `İ` (capital I with dot) vs `I` distinction. The expected literal `FACTORY RESET` uses ASCII `F`/`A`/`C`/`T`/`O`/`R`/`Y`/space/`R`/`E`/`S`/`E`/`T`. Strict equality on the input value is what we want — the user must type ASCII chars only. If their keyboard substitutes Turkish-I for I, the comparison fails and the button stays disabled. This is correct behavior.

- **Polling the event row during the wipe**: livinityd is killed mid-wipe (the wipe process detaches via systemd-run, but livinityd.service is one of the services the wipe stops). So `listUpdateHistory` will return errors during the ~3-5 second window between wipe-step "stop livos.service" and reinstall-step "start livos.service". The UI MUST handle this gracefully — don't error out, just retain last-known status and show "Reconnecting…" with a softer style (not error red).

- **The error page must NOT auto-redirect on its own.** The user has actively initiated a destructive op, the host is now in a failed/recovered state — they need to consciously read the error and decide. The "Try again" / "View event log" / "SSH recovery" buttons are user-driven.

- **D-OV-04 90s threshold**: this is a long-tail timeout for the case where the post-reinstall livinityd is having trouble booting. After 90s of failed queries, shift the message to a manual-recovery hint. Don't redirect away from the BarePage — the user might recover momentarily and we want to preserve their context.

- **Test selector**: when writing tests, use `data-testid` attributes — the existing project may already use this pattern. Mirror what's already there.

</specifics>

<deferred>
## Deferred Ideas

- Backup-mutex pre-flight check → v30.0 (forward-compat comment in code, NOT implemented in v29.2)
- "Schedule reset for later" → never (destructive immediate by design)
- Multi-step wizard modal (3 screens for select → confirm → final-confirm) → never (single-screen consent is the design)
- Email/SMS notification on completion → never (the user is on the page)

</deferred>

---

*Phase: 38-ui-factory-reset*
*Context gathered: 2026-04-29 via PRD-style express path (ROADMAP success criteria + REQUIREMENTS.md FR-UI-01..07 + Phase 37 backend contract as locked decisions)*
