# Phase 135 — LivOS Onboarding/Setup Redesign per Livinity Design System

**Opened:** 2026-05-17
**Driver:** User directive — `livos kurulumu sayfasi` (LivOS onboarding/setup pages) need to be rebuilt to match the Livinity Design System aesthetic. Live development at `localhost:3000` with hot reload, backend pointed at the production Mini PC install (`burak.livinity.live`).
**Trigger context:** Phase 134 v2 just shipped (8 atomic commits, 5 bugs fixed). Fresh-wipe + universal one-liner install passes UAT. Mini PC is now stable on `burak.livinity.live` with all 6 services active. The user's next concern is the **visual** layer of the onboarding flow — currently a "gradient glassmorphism" feel that diverges from the monochrome Apple-like aesthetic defined in the Livinity Design System bundle.

## Live dev environment (pre-set, do not re-do)

- **Vite dev server:** `http://localhost:3000` — confirmed HTTP 200, hot reload active
- **Command (already running):** `cd livos && VITE_BACKEND_URL=https://burak.livinity.live pnpm --filter ui dev` → `/tmp/vite-dev.log` (background)
- **Backend:** `https://burak.livinity.live` (Mini PC, Phase 134 v2 install, fully working)
- **Restart command** (if killed): same as above. Use port 3000.

## Locked decisions

| # | Decision | Locked value |
|---|----------|--------------|
| D-135-DS-MONO | Apply Livinity DS monochrome aesthetic | YES — onboarding is "marketing-shaped" surface per memory `feedback_v36_monochrome_dock_rejected` ("Marketing-shaped surfaces (plan cards, pricing, onboarding) can go monochrome; app-shaped surfaces keep their color identity"). |
| D-135-LIVE-DEV | Develop with hot reload in browser | YES — localhost:3000 vite dev. Operator iterates visually, no plan-blind builds. |
| D-135-BACKEND | Backend for dev | `burak.livinity.live` (CF Tunnel, Phase 134 stable). Login + WebApp pipeline confirmed working. |
| D-135-SCOPE | Pages in scope | All `/onboarding/*` routes + `features/local-setup/*` components. 11 files, 2772 LOC total. No other routes touched. |
| D-135-LAYOUT | Wrapping layout | Replace `GradientLayout` (gradient glassmorphism) with a new DS-aligned `OnboardingShell` (monochrome, system fonts, DS tokens). Don't refactor non-onboarding callers of `GradientLayout`. |
| D-135-TOKENS | CSS tokens source | `.planning/design-system/styles.css` — port relevant `:root` vars into LivOS's `index.css` (or scope to `[data-flow="onboarding"]`). |
| D-135-SACRED-SHA | `liv/packages/core/src/sdk-agent-runner.ts` SHA | MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every commit. |

## Files in scope

### Routes (`livos/packages/ui/src/routes/onboarding/`)

| File | LOC | Role |
|------|-----|------|
| `index.tsx` | 64 | Entry screen — title + continue button. Auto-detect language. |
| `create-account.tsx` | 104 | Password setup + display name. |
| `account-created.tsx` | 61 | Success confirmation + advance to setup. |
| `setup-wizard.tsx` | **1402** | **THE BIG ONE.** Multi-step flow: language, restore-or-fresh choice, install-mode picker (cloud / local / hybrid / tunnel), platform-specific guides. |
| `restore.tsx` | 356 | Backup restore flow (separate entry point). |
| `onboarding-footer.tsx` | 46 | Shared footer: "Restore from backup" link, language switcher. |

### Local-setup feature (`livos/packages/ui/src/features/local-setup/`)

| File | LOC | Role |
|------|-----|------|
| `LocalSetupWizard.tsx` | 380 | Wizard shell — orchestrates the 4 steps. |
| `ModePickStep.tsx` | 94 | Step 1 — pick hybrid vs local-lan vs cloud. |
| `HybridDnsSetup.tsx` | 85 | Step 2a — DNS + CF token capture for hybrid. |
| `PlatformInstructions.tsx` | 124 | Step 2b — per-platform (Mac/iOS/Win) DNS instructions. |
| `QrCodeStep.tsx` | 56 | Step 3 — QR for mobile access. |
| `types.ts` | small | Shared types. |

**Total:** 11 files, ~2772 LOC.

### Router wiring (`livos/packages/ui/src/router.tsx`)

```
{
    path: '/onboarding',
    Component: GradientLayout,   // ← TO BE SWAPPED with OnboardingShell
    children: [
        { index: true, element: <SetupWizard /> },
        { path: 'restore', element: <OnboardingRestore /> },
    ],
}
```

## Livinity Design System reference (out-of-tree, on disk)

- `.planning/design-system/SOURCE-README.md` — handoff bundle README
- `.planning/design-system/livinity-design-system.html` — primary mockup, full visual reference
- `.planning/design-system/styles.css` — token + utility CSS (Apple-monochrome, system fonts, clamps for `--pad` and `--max`)
- `.planning/design-system/chat2-port-intent.md` — chat transcript with design intent

**Key DS tokens** (from `styles.css`):
```css
--bg: #ffffff;           --bg-2: #f5f5f7;
--surface: #fafafa;      --surface-2: #ebebed;
--fg: #1d1d1f;           --fg-dim: #424245;
--fg-mute: #6e6e73;      --fg-faint: #a1a1a6;
--accent: #1d1d1f;       --accent-soft: rgba(0,0,0,0.06);
--sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Geist", system-ui, sans-serif;
--mono: "SF Mono", "Geist Mono", ui-monospace, Menlo, monospace;
--r-sm: 8px;             --r: 12px;             --r-lg: 18px;             --r-xl: 28px;
--max: 1200px;
--pad: clamp(22px, 4vw, 56px);
```

## Out of scope

- Server5 `livinity.io/dashboard/install` wizard (separate — that's the platform-side install command generator, already Phase 134-patched manually for `--cf-tunnel-token`)
- Login screen, dock, app store, settings — only `/onboarding` routes are touched
- Backend (livinityd, tRPC, Redis) — pure frontend redesign
- Translation files (`@/utils/i18n`) — copy stays; only visual presentation changes

## Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| `setup-wizard.tsx` is 1402 LOC — risk of regression breaking install flow | Split into clear sub-plan; live-test each step at localhost:3000 before merging |
| DS monochrome rejected previously (v36 dock) | Onboarding is marketing-shaped per memory; same rejection doesn't apply. If user pushes back mid-build, fall back to "DS typography + spacing + radii, keep brand color identity" hybrid (same compromise as v36 dock). |
| Hot reload + `VITE_BACKEND_URL` cross-origin issues | tRPC requests proxied via vite. If CORS issues surface, check vite.config proxies. |
| Locked sacred SHA invariant | Only `livos/packages/ui/` touched — `liv/` untouched. Pre-commit hook enforces. |

## Sub-plan breakdown (master in 135-PLAN.md)

| # | Plan | Surface | Wave |
|---|------|---------|------|
| 135-01 | Token + Shell — port DS tokens, create `OnboardingShell` layout | `index.css`, new `layouts/onboarding-shell.tsx`, `router.tsx` swap | 1 |
| 135-02 | Entry screen redesign | `routes/onboarding/index.tsx`, `onboarding-footer.tsx` | 2 |
| 135-03 | Setup wizard core (multi-step flow) | `routes/onboarding/setup-wizard.tsx` | 2 (parallel with 135-02 — different file) |
| 135-04 | Create-account + account-created | `routes/onboarding/create-account.tsx`, `account-created.tsx` | 3 |
| 135-05 | Local-setup feature components | `features/local-setup/*` (5 files) | 3 (parallel with 135-04) |
| 135-06 | Restore flow | `routes/onboarding/restore.tsx` | 4 |
| 135-07 | Live UAT walk | Operator walks every step at localhost:3000, captures screenshots | 5 |

## Resume protocol (post-`/clear`)

Next session must:
1. **Read this file FIRST.**
2. **Verify vite dev still up:** `curl -fsS http://localhost:3000/ -o /dev/null -w "%{http_code}"` should return 200. If not: `cd livos && VITE_BACKEND_URL=https://burak.livinity.live pnpm --filter ui dev &`.
3. Read `135-PLAN.md` for sub-plan order.
4. Read each sub-plan in order (135-01 first — DS tokens are foundational).
5. Implement → user verifies live at localhost:3000 → commit per sub-plan (atomic, sacred SHA preserved).

Also read these memories on resume:
- `[[project-phase-134-complete]]` — what just shipped, Mini PC live state
- `[[feedback-v36-monochrome-dock-rejected]]` — DS application boundary (marketing surfaces only)
- `[[feedback-livos-window-logic-no-url-routing]]` — DON'T add URL launchers in non-onboarding flows; onboarding routes are OK because they're one-shot pre-dock
- `[[project-v36-design-port-master]]` — broader v36 design-port intent (this is a v36.x extension)
