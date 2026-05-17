# Phase 139 — Onboarding Hardening (MASTER PLAN)

> Companion to `139-CONTEXT.md`. Executable roadmap for `/gsd-execute-phase 139`.

## Goal

Bring Phase 135's pixel-perfect English-desktop port up to production-readiness: full i18n for `en`+`tr`, WCAG 2.1 AA accessibility, mobile-responsive from 360px, LCP <1500ms on 4G cold reload, motion-reduced + dark-mode respect.

## Atomic commit roadmap

### Plan 139-01 — i18n extraction

**Files:**
- ➕ `livos/packages/ui/src/utils/i18n/locales/en/onboarding-v2.json` — 85 keys
- ➕ `livos/packages/ui/src/utils/i18n/locales/tr/onboarding-v2.json` — 85 keys (operator-translated; lean on `[[user-language]]` memory for tone guidance)
- ➕ `livos/packages/ui/src/utils/i18n/locales/{de,fr,es}/onboarding-v2.json` — `en` clone (translation TODO)
- ✏️ All 12 step / shell / effect components — replace hard-coded strings with `t('onboarding-v2.key')`
- ✏️ `STEP_NAMES` const in `constants.ts` → derive from `t('onboarding-v2.step.0.name')`...
- Smoke test: dropdown change from en→tr re-renders all visible text

### Plan 139-02 — a11y pass

**Files:**
- ✏️ `setup-wizard-v2.tsx` — add `role="application"`, `aria-label`, focus management on step transition (auto-focus first interactive on new step)
- ✏️ `top-bar.tsx` — progress buttons: `aria-current="step"` on active, `aria-disabled` on future, `aria-label` localized
- ✏️ `personalize-step.tsx` — tone slider: `aria-valuetext={toneLabel(data.tone)}`
- ✏️ `onboarding-tokens.css` (or new file in `onboarding-flow.css` since reference shipped it): darken `--fg-faint` from `#a1a1a6` (2.65:1) → `#8a8a8e` (3.45:1) to clear UI-component contrast
- ✏️ Step transition CSS: respect `:focus-visible` always (don't hide outline on click-induced focus)
- ➕ `__tests__/onboarding-a11y.spec.tsx` — programmatic axe-core run on each step state, fail on any violation

### Plan 139-03 — Mobile responsive

**Files:**
- ✏️ `onboarding-flow.css` (auto-regen target — update `scope-css.py` source OR add manual `@media` queries in a new `onboarding-mobile.css`):
  - `@media (max-width: 600px) { .onb-top { grid-template-rows: auto auto; ... }; .onb-top-meta .fx-sound-toggle { ... move into help menu } }`
  - `@media (max-width: 720px) { .tfa-layout { flex-direction: column; ... } }`
  - `@media (max-width: 500px) { .wallpaper-grid { grid-template-columns: repeat(2, 1fr); } }`
  - HelpBubble `bottom: 16px; right: 16px` → on mobile, hidden when keyboard open via `visualViewport` API listener
- ✏️ All step components — verify min tap-target sizes (chips need `min-height: 44px` on touch)

### Plan 139-04 — Perf

**Files:**
- ✏️ `parallax-orbs.tsx` — gate RAF loop on `document.visibilityState === 'visible'` + IntersectionObserver of `.onb-ambient` (pause when scrolled out)
- ✏️ `setup-wizard-v2.tsx` — defer xterm.js dynamic import to actual ConnectAi step mount (already `React.lazy` but verify chunk boundary)
- ➕ `.planning/phases/139-onboarding-hardening/perf-baseline.json` — captured Chrome Lighthouse score pre-139 + post-139 for the same flow

### Plan 139-05 — Reduced-motion + color-scheme

**Files:**
- ✏️ `onboarding-flow.css` — add `@media (prefers-reduced-motion: reduce) { .onb-step { transition: none; animation: none; } ... }` for: step transitions, fade-up classes, orb drift keyframes, confetti opacity ramp
- ✏️ `parallax-orbs.tsx` — early-return when `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
- ✏️ `confetti.tsx` — early-return same
- (optional) `prefers-color-scheme: dark` mapping if user is on dark OS — invert `--bg`/`--fg`. Out-of-scope if too risky; deferred to v37.

### Plan 139-06 — Cross-device UAT + memory

**Files:** docs only.
- `139-UAT-CHECKLIST.md` — explicit cells per (device × language × motion-pref × screen-reader)
- Device matrix to walk: desktop Chrome en, desktop Chrome tr, iPhone Safari en, iPhone Safari tr (reduced motion), Android Chrome en, Android Chrome with VoiceAssistant
- LCP measurement: Lighthouse `--throttling-method=devtools --throttling.cpuSlowdownMultiplier=4`
- Memory: `project_phase_139_complete.md`
- ROADMAP flip

## Acceptance recap

Re-verify against `139-CONTEXT.md` AC-139-M1..M11 before phase close.

## Rollback

Each plan is independent. Worst case revert: 139-01 (i18n) reverts onboarding to English-only; 139-02 reverts contrast; 139-03 reverts mobile (desktop still works); 139-04 reverts perf gating (orbs run always); 139-05 reverts motion respect.
