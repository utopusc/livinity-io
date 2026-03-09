---
phase: 04-onboarding-cleanup
plan: 01
subsystem: ui-onboarding
tags: [onboarding, kimi, setup-wizard, auth]
dependency-graph:
  requires: [02-configuration-layer]
  provides: [kimi-onboarding-step]
  affects: []
tech-stack:
  added: []
  patterns: [api-key-auth-onboarding]
key-files:
  created: []
  modified:
    - livos/packages/ui/src/routes/onboarding/setup-wizard.tsx
decisions:
  - id: ONBOARD-01
    decision: "Kimi API key input replaces Claude OAuth PKCE flow in setup wizard"
    rationale: "Kimi auth is API key only (established in Phase 2), no need for complex OAuth device flow"
  - id: ONBOARD-02
    decision: "PasswordInput label prop used as placeholder (component has no separate placeholder prop)"
    rationale: "PasswordInput component uses label internally as placeholder text"
metrics:
  duration: 5 min
  completed: 2026-03-09
---

# Phase 4 Plan 1: Onboarding Wizard Kimi Auth Step Summary

**One-liner:** Setup wizard Step 4 replaced from Claude OAuth PKCE flow to simple Kimi API key input with tRPC validation

## What Was Done

### Task 1: Replace StepClaudeAuth with StepKimiAuth

Replaced the entire `StepClaudeAuth` component (140 lines of Claude OAuth PKCE flow including device auth codes, login URL, code submission, and polling) with a streamlined `StepKimiAuth` component (48 lines) that provides:

- **API key input** via `PasswordInput` component
- **Validation** via `trpcReact.ai.kimiLogin.useMutation()` which proxies to the Nexus `/api/kimi/login` endpoint (established in Phase 2, Plan 1)
- **Status check** via `trpcReact.ai.getKimiStatus.useQuery()` to detect if already configured
- **Success state** with animated green checkmark (identical spring animation pattern as the old Claude success state)
- **Error display** via `AnimatedInputError` on mutation failure
- **Help link** to kimi.com for obtaining API keys
- **Skip button** always visible for users who want to configure later
- **Continue button** appears after successful authentication

Updated the main `SetupWizard` component to reference `StepKimiAuth` instead of `StepClaudeAuth`.

**Commit:** `ec45338`

## Verification Results

| Check | Result |
|-------|--------|
| Zero Claude/Anthropic/Gemini references in setup-wizard.tsx | 0 matches |
| StepKimiAuth/getKimiStatus/kimiLogin references exist | 10 matches |
| Zero StepClaudeAuth/getClaudeCliStatus/startClaudeLogin references | 0 matches |
| TypeScript compiles (no new errors) | Only pre-existing TransitionPanel type error |

## Decisions Made

1. **ONBOARD-01:** Kimi API key input replaces Claude OAuth PKCE flow. The complex device auth flow (login URL, code submission, polling) is unnecessary since Kimi uses simple API key authentication.
2. **ONBOARD-02:** Used `PasswordInput` label prop as placeholder text (the component has no separate `placeholder` prop; `label` serves as the placeholder internally).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PasswordInput placeholder prop**
- **Found during:** Task 1 verification
- **Issue:** Plan specified `placeholder` prop on `PasswordInput`, but the component only accepts `label` (used internally as placeholder)
- **Fix:** Removed explicit `placeholder` prop, used `label` with the placeholder text instead
- **Files modified:** setup-wizard.tsx
- **Commit:** ec45338

## Next Phase Readiness

- Setup wizard now correctly onboards users with Kimi API key flow
- All tRPC routes (`ai.getKimiStatus`, `ai.kimiLogin`) are already implemented from Phase 2
- No blockers for Phase 4 Plan 2 (cleanup of remaining Claude references elsewhere)
