# Phase 135 — Onboarding Redesign — MASTER PLAN v2

**Re-scoped 2026-05-17** after user delivered the reference package `Livinity.io (1).zip` containing the production-grade onboarding (3086 LOC across `onboarding.jsx` + `onboarding.css` + `effects.jsx`). The original v1 plan (additive monochrome port from `.planning/design-system/styles.css`) is **SUPERSEDED**.

## Status of v1 work

| Plan | Commit | Status |
|---|---|---|
| 135-01 — DS tokens + OnboardingShell | `061e5613` | ✅ shipped — `[data-flow="onboarding"]` scoping infrastructure is reusable for v2; **KEEP** |
| 135-02 — StepWelcome monochrome | `80710482` | ⚠️ shipped but will be **SUPERSEDED** by 135-E full WelcomeStep port (spec card + branded mark + system fonts) |
| 135-03..07 | not started | ❌ DROPPED — replaced by 135-A..K below |

`?step=N` dev-helper (uncommitted) is **KEEP** through 135-K UAT.

## Reference architecture summary

**Files** (`.planning/phases/135-onboarding-redesign-livinity-ds/reference/`):
- `onboarding.html` — script loader + `.onb-ambient` orb divs (kept verbatim in shell)
- `onboarding.css` — 1708 LOC tokens + utilities + all step-specific styles
- `onboarding.jsx` — 1054 LOC: useStepper, Icon, FooterBar, 6 step components, App shell
- `effects.jsx` — 324 LOC: ParallaxOrbs, SoundProvider/useSound/SoundToggle, HelpBubble, Confetti
- `design-system.html` / `logo.html` / `topbar.html` — DS dictionaries (referenced for context only)

**6 steps:**
0. **Welcome** — brand mark + system spec card (CPU/RAM/storage/network/region) + lang picker + Start
1. **Account** — name + password mode (strength meter + warnings) OR 2FA mode (QR + base32 secret + 6-cell OTP)
2. **Wallpaper** — 6 named wallpapers + live dashboard preview (clock + name)
3. **Personalize** — role chips, AI style cards, tone slider, memory radio, use cases multi-select
4. **Connect AI** — terminal-style animated authorization (reference is FAKE; v2 will be REAL `claude /login`)
5. **Done** — success + confetti + Enter Dashboard

**Shell:**
- Ambient orbs (3 layered radial gradients with parallax + per-step color shifts via `body.step-N`)
- Top bar: brand · segmented progress · step name + counter + ETA · SoundToggle
- Card with directional slide transitions (`is-active`, `is-leaving-forward`, `is-leaving-back`, `is-back-in`)
- Resume banner (reference uses `localStorage.livos.onb.state`; v2 uses backend session)
- Footer bar: Back · keyboard hint · Skip · Continue
- Keyboard nav: Enter advances, Esc backs

## v2 user-locked decisions

- **D-135-V2-FULL** — Full visual port, no shortcuts on parallax/sound/help/confetti.
- **D-135-V2-2FA** — AccountStep must offer 2FA toggle (real TOTP, not the reference's mock).
- **D-135-V2-EXTRA-OUT** — LivOS's domain/network/advanced steps **REMOVED** from onboarding entirely; accessible only via Settings post-onboarding. Don't appear in the 6-step flow.
- **D-135-V2-CLAUDE-REAL** — ConnectAI step is **real** `claude /login` device flow: backend PTY → tRPC subscription → xterm.js render → clickable auth URL → user pastes verification code into terminal stdin → backend completes auth. Replaces reference's fake `CLAUDE_SCRIPT` animation.
- **D-135-V2-NO-KIMI** — Kimi already retired (P77); ConnectAI targets Claude only.
- **D-135-V2-SCOPE-CSS** — Port `onboarding.css` verbatim scoped under `[data-flow="onboarding"]` (single source of truth, no Tailwind config bloat). Class names from reference (`.onb-card`, `.btn-primary`, `.field-card`, etc.) used as-is in JSX.
- **D-135-V2-RESUME-BACKEND** — Resume state lives in backend `user_preferences` (key `onboarding_state`), not `localStorage`. Survives device switch.
- **D-135-V2-SACRED-SHA** — `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` **UNTOUCHED** across all commits. Pre-commit hook enforces.

## Sub-plan order (atomic commits)

| # | Plan | Files touched | Approx LOC | Depends on |
|---|---|---|---|---|
| 135-A | Port `onboarding.css` scoped | `src/styles/onboarding-flow.css` (new) | +1708 | 135-01 (shell) |
| 135-B | Port `effects.jsx` to React/TS | `src/features/onboarding-flow/effects/*` (4 files) | +400 | 135-A |
| 135-C | Port `Icon` + `useStepper` helpers | `src/features/onboarding-flow/icon.tsx`, `use-stepper.ts` | +120 | 135-A |
| 135-D | Build `SetupWizardV2` shell | `src/routes/onboarding/setup-wizard-v2.tsx` (skeleton) | +250 | 135-A,B,C |
| 135-E | Port `WelcomeStep` | `src/features/onboarding-flow/steps/welcome-step.tsx` | +120 | 135-D |
| 135-F | Port `AccountStep` (password+2FA) | `src/features/onboarding-flow/steps/account-step.tsx` + backend register2fa | +400 | 135-E |
| 135-G | Port `WallpaperStep` | `steps/wallpaper-step.tsx` | +180 | 135-F |
| 135-H | Port `PersonalizeStep` | `steps/personalize-step.tsx` | +250 | 135-G |
| 135-I | Real `claude /login` terminal | `steps/connect-ai-step.tsx` + backend PTY procedures + xterm wiring | +600 | 135-H |
| 135-J | Port `DoneStep` + Confetti hook-up | `steps/done-step.tsx` | +120 | 135-I |
| 135-K | Router swap + retire V1 + UAT | `src/router.tsx`, delete `setup-wizard.tsx` (1402 LOC removed) | -1402 net | 135-J |

**Total net delta:** ~+2746 LOC frontend + ~150 LOC backend (TOTP + PTY/login procedures) − 1402 LOC (V1 wizard) ≈ +1500 net LOC shipped.

## Acceptance criteria (master)

- [ ] AC-135-M1: All 6 steps reachable via `?step=N` dev helper, render identically to reference (within reasonable tolerance — fonts/dark-mode/breakpoints).
- [ ] AC-135-M2: `claude /login` step actually authenticates a real Anthropic account.
- [ ] AC-135-M3: 2FA enrollment in AccountStep yields a working TOTP secret usable in Authy/Google Authenticator.
- [ ] AC-135-M4: Resume from cold reload restores both `idx` and `data` from backend session.
- [ ] AC-135-M5: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all phase-135 commits.
- [ ] AC-135-M6: No console errors in DevTools at any step.
- [ ] AC-135-M7: Live UAT walk operator-confirmed before phase close.

## Files NOT touched

- `liv/packages/core/src/sdk-agent-runner.ts` (sacred)
- Any subscription-broker path code (per `[[feedback-subscription-only]]`)
- App Store, dock, desktop, settings UI outside of where domain/network configs need to land

## Rollback

Each commit is atomic. Worst case: `git revert HEAD~N..HEAD` for the phase-135 range; `setup-wizard.tsx` is restored from history; router falls back to V1. The DS tokens scoped under `[data-flow="onboarding"]` from 135-01 remain harmless if unused.
