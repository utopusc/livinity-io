# Phase 139 — Onboarding Hardening (CONTEXT)

**Opened:** 2026-05-17
**Driver:** Phase 135 ships a pixel-perfect visual port of the Livinity.io reference for English, desktop, Latin-script content with no accessibility audit. Production onboarding must pass: (1) i18n parity for all currently-supported languages (`en`, `tr`, `de`, `fr`, `es` per WelcomeStep dropdown), (2) keyboard-only + screen-reader operability at WCAG 2.1 AA, (3) mobile-responsive layout from 360px wide (iPhone SE) through tablet, (4) initial paint perf within 1500ms LCP on a cold reload over 4G. Phase 139 is the polish pass that gates Phase 135 from CODE-COMPLETE to SHIPPED.

**User context:** No explicit user ask yet, but production onboarding must clear these bars before public roll-out. This is the standard hardening phase that closes any new user-facing surface.

## Locked decisions

| # | Decision | Locked value | Source |
|---|----------|--------------|--------|
| D-139-I18N-FRAMEWORK | i18n library | Existing `i18next` + `react-i18next` (already in project; see `livos/packages/ui/src/utils/i18n.ts`) | Don't re-pick |
| D-139-I18N-LANGS | Languages to ship | `en` (source) + `tr` (user's L1) at GA; `de`/`fr`/`es` stub keys to fall back to `en` until human translation lands | Pragmatic — translate what's verifiable |
| D-139-I18N-KEY-LOCATION | Where keys live | New namespace `onboarding/v2` (so V1 keys retained for any back-port; not deleted) | Cleanly separated |
| D-139-A11Y-TARGET | Accessibility bar | WCAG 2.1 AA — keyboard nav, screen reader announcements, contrast 4.5:1 for text + 3:1 for UI, focus rings always visible, motion-reduced respect | Industry standard |
| D-139-A11Y-MOTION | Reduced-motion respect | `@media (prefers-reduced-motion: reduce)`: disable ambient orb drift + parallax + step transitions + confetti; sound stays toggleable via SoundToggle (user choice) | Standard |
| D-139-MOBILE-MIN | Minimum supported width | 360px (iPhone SE 1st gen) | Industry baseline |
| D-139-MOBILE-LAYOUT | Mobile adaptations | Top bar: brand on top row, progress on second row, hide ETA on <600px; sound + help collapse to a single overflow menu. Steps: single-column field-card (drop tfa-layout 2-col → stacked). Reduce ambient orb count to 1 (perf). | Best-effort port; not pixel-identical |
| D-139-PERF-LCP | LCP budget | <1500ms on cold reload over simulated 4G in DevTools Performance panel | Industry good-LCP threshold |
| D-139-PERF-BUNDLE | onboarding chunk size budget | <250KB gzipped (excluding xterm.js which only loads on ConnectAi step) | Aggressive but achievable; existing onboarding-flow.css is the biggest contributor |
| D-139-PERF-IMG | Image strategy | Wallpaper previews lazy-loaded; ambient orbs are pure CSS gradients (already no image) | Already aligned |
| D-139-SACRED-SHA | sdk-agent-runner.ts SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved every commit | Project invariant |

## Codebase baseline (audited 2026-05-17)

**i18n inventory (hard-coded strings in 135 components):**
- `welcome-step.tsx`: "A new kind of computer", "Welcome to Livinity", "Your home cloud server is ready to set up...", language labels in dropdown, "Start"
- `account-step.tsx`: "02 · Account", "Create your account", "Your info stays on your Livinity...", "Password", "Two-factor", "Your name", "e.g. Bruce Oz", "At least 8 characters", "Type it again", "Passwords match", "Passwords don't match yet", "Avoid using your name...", "This is on every leaked password list", "Scan with your authenticator app", "Install an authenticator", "Or paste this code manually", "Enter the 6-digit code", "Ready to verify", "Your password is the master key. We cannot recover it.", "Keep your authenticator app safe...", "Create account", "Verify & continue"
- `wallpaper-step.tsx`: "03 · Make it yours", "Choose a wallpaper", "Live preview shows...", 6 wallpaper names
- `personalize-step.tsx`: "04 · Personalize", "Help Liv understand you", "A few hints so the assistant...", role names, style names, "Tone", "Memory", "Use cases", "pick any", "auto-suggested from role"
- `connect-ai-step.tsx`: "05 · Connect AI", "Sign in with Claude", "Liv uses Anthropic's Claude...", CLAUDE_SCRIPT lines, "Or paste API key manually", "Continue when connected"
- `done-step.tsx`: "Welcome to", "06 · You're all set", "You're all set, {firstName}.", "Your Livinity server is ready...", "Account", "Wallpaper", "AI Role", "Engine", "Claude · connected", "Enter Dashboard"
- `top-bar.tsx`: progress aria-labels, step names (STEP_NAMES const)
- `footer-bar.tsx`: "Back", "Skip for now", default "Continue"
- `resume-banner.tsx`: "Welcome back", "We saved your setup progress...", "Start over", "Resume"
- `help-bubble.tsx`: FAQ items, "Chat with Liv", "Need a hand?", "Ask Liv, or skim the basics"

Total est: ~85 distinct i18n keys.

**A11y inventory (audit pending in 139-02):**
- TopBar segmented progress is `<button>` ✓ but disabled-future-steps need `aria-disabled` + `aria-current="step"` for active
- Onboarding flow lacks `role="application"` + `aria-label` on outer container
- xterm.js terminal (Phase 136 dep) needs ARIA live region announcing CLI output
- Confetti canvas needs `aria-hidden="true"` (already set ✓)
- Color contrast: subtle muted text (`--fg-mute: #6e6e73 on #ffffff`) = 5.66:1 ✓, `--fg-faint: #a1a1a6` = 2.65:1 ✗ — used in eyebrows + step counters; needs darkening to #8a8a8e (3.45:1) at minimum
- Tone slider currently lacks `aria-valuetext` (only label) — add humanized "Currently Friendly" annotation
- 2FA OTP boxes need `aria-label="Digit N of 6"` (already set ✓)
- Recovery codes modal (Phase 138 dep) needs focus trap

**Mobile inventory:**
- `.onb-top` uses `grid-template-columns: 1fr auto 1fr` — at <600px progress overflow squeezes; need re-stack
- `.onb-card` `max-width: 640px` works but card padding 32px is too generous on mobile (use 16px)
- `.tfa-layout` is 2-col flex — drop to 1-col stacked on <720px
- `.wallpaper-grid` is 3-col — drop to 2-col on <500px
- `.role-group` chips wrap fine — check for tap-target sizing (min 44x44px per Apple HIG)
- Bottom-right HelpBubble FAB may overlap mobile footer Continue button — reposition or auto-hide on focus

**Perf inventory (estimated; baseline on 139-04):**
- `onboarding-flow.css` 1702 LOC ≈ ~45KB raw / ~10KB gzip → in budget
- Ambient orbs (3 × 720×720 div with `backdrop-filter: blur(80px)`) — heavy GPU compositing, ~16ms/frame on iPhone SE
- ParallaxOrbs RAF loop runs even when offscreen — could pause via IntersectionObserver
- Confetti only fires on DoneStep — already lazy
- xterm.js (~50KB gzip) loads only on ConnectAiStep — already lazy via React.lazy

## Acceptance criteria (master)

- [ ] AC-139-M1: All 85 hard-coded onboarding strings ported to `onboarding/v2` i18n namespace; Turkish translations match meaning (operator-reviewed)
- [ ] AC-139-M2: Language dropdown swap (e.g. en→tr) re-renders entire onboarding without reload
- [ ] AC-139-M3: Keyboard-only walkthrough: Tab navigates focusable elements in DOM order, Enter advances, Esc backs, Space toggles segmented controls
- [ ] AC-139-M4: Screen reader (NVDA on Windows, VoiceOver on Mac) announces: page title, current step, instructions per step, form labels, error states
- [ ] AC-139-M5: `prefers-reduced-motion: reduce` disables ambient orb drift, step transitions, parallax, confetti — verified via DevTools rendering panel
- [ ] AC-139-M6: All text 4.5:1 contrast min; UI components 3:1 — verified via axe-core lint
- [ ] AC-139-M7: Mobile layouts at 360 / 414 / 768 / 1024px all render without horizontal scroll, tap targets ≥44px, content readable
- [ ] AC-139-M8: LCP <1500ms on simulated 4G cold reload of `/onboarding` (Chrome DevTools Performance panel record)
- [ ] AC-139-M9: Total onboarding chunk <250KB gzip (verify via `pnpm build && analyze`)
- [ ] AC-139-M10: Sacred SHA preserved across all commits
- [ ] AC-139-M11: No new console errors; no a11y violations from `axe-core` programmatic audit

## Non-goals

- Translation completeness for de/fr/es (English fallback acceptable for v1)
- RTL languages (no Arabic/Hebrew planned for onboarding v2)
- High-contrast theme support (separate phase)
- Print stylesheets
- Voice control (separate phase)

## Dependencies

- Phase 135 ✅
- Phase 137 nice-to-have (system.info text needs i18n too)
- Phase 138 nice-to-have (recovery-codes UI needs i18n)
- Phase 136 nice-to-have (xterm output is technical and English-only by nature; only surrounding chrome needs i18n)

This phase can ship without 136/137/138 — they bring their own strings which get added to the i18n namespace as those phases land.

## Sub-plans

| # | Plan file | Scope | Approx LOC | Depends on |
|---|---|---|---|---|
| 139-01 | `139-01-PLAN.md` | i18n: extract all 85 keys; populate en + tr; stub de/fr/es; verify dropdown swap | +400 (translations) | — |
| 139-02 | `139-02-PLAN.md` | a11y pass: ARIA labels, focus management, axe-core audit, contrast fix on `--fg-faint`, focus rings | +200 | — |
| 139-03 | `139-03-PLAN.md` | Mobile responsive: media queries on `.onb-top` / `.onb-card` / `.tfa-layout` / `.wallpaper-grid` / HelpBubble repositioning | +300 | — |
| 139-04 | `139-04-PLAN.md` | Perf: orb pause on tab-hidden, IntersectionObserver gate on ParallaxOrbs RAF, LCP measurement script | +120 | — |
| 139-05 | `139-05-PLAN.md` | Reduced-motion + prefers-color-scheme respect | +80 | 139-02 |
| 139-06 | `139-06-PLAN.md` | Cross-device UAT walkthrough — desktop EN/TR, iPhone Safari, Android Chrome, NVDA + VoiceOver | docs | 139-01..05 |

**Total est:** ~1100 LOC (mostly translations).

## Rollback

i18n + a11y + mobile + perf changes are all additive / non-breaking. Worst-case `git revert` of any plan leaves the phase 135 baseline intact. The contrast fix in 139-02 (darken `--fg-faint`) is a 1-token CSS variable change; trivially reversible.

## Related memories

- `[[project-phase-135-complete]]`
- `[[user-language]]` — Turkish-first preference (relevant for i18n priority)
- `[[feedback-v36-no-bold-redesigns]]` — small atomic patches preferred (respect: each 139 plan is one mostly-mechanical change)
