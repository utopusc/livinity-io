# v35.0 — Design System Unification (UI/UX)

**Status:** DRAFT 2026-05-14 — opens after v34.0 closes (operator UAT pending for P110+P111 binding walks).
**Owner:** bruce (operator) + Claude (executor agents).
**Goal:** Make every LivOS UI surface — Mini PC livinityd dashboard, Server5 platform Next.js, and landing static HTML — share a single, professional design language anchored on the existing `dashboard.html` aesthetic (Geist + Geist Mono + Instrument Serif fonts, custom CSS variables for color/spacing/radius, light/dark/iridescent themes, bento card layout, pill stepper, accent-blue/green/amber/red palette).
**End state:** A user navigating from `livinity.io/dashboard` → `livinity.io/dashboard/install` → `bruce.livinity.io` → app store → AI chat → Settings inside Mini PC livinityd cannot tell where one surface ends and the next begins. Single visual identity end-to-end. Every component lives in a known place, documented A→Z, and the entire UI is updateable from one design system source.

---

## Why this milestone now (the trigger)

The v34.0 milestone shipped Phase 111 (Server5 dashboard install wizard) and Phase 110 (WebApp VNC swap closure). During the Phase 111 binding UAT prep on 2026-05-14, the user navigated `https://livinity.io/onboarding/install` and observed a clear visual discontinuity:

- The Phase 111 wizard used **Tailwind + zinc palette + shadcn-ish styling** (`/opt/platform/web/` Next.js app)
- The live `https://livinity.io/dashboard` used **bespoke React UMD + Geist fonts + custom CSS variables + bento cards** (`/opt/landing/livinity.io/dashboard.html`, hand-coded)
- Mini PC's livinityd UI (`livos/packages/ui/`) used **Vite + Tailwind 3.4 + shadcn/ui** with yet another color palette

Three surfaces, three idioms. User-stated requirement (2026-05-14 in chat):

> "livinity.io nun tasarimini biliyorsun dashboardunda https://livinity.io/onboarding/install burayo dashboardun tasarimi ile birlestir … UI da cok profesyonel ol dashboard daki UI vs kullan"

We did a quick fix (Phase 111-04 wizard re-skinned to dashboard.html style on 2026-05-14, shipped as `/dashboard/install` static HTML page using identical CSS tokens). That proved the integration is possible. v35.0 generalizes the fix:

- Inventory every UI component on every surface (so the operator and Claude both know what exists and where)
- Extract a canonical design token spec (single source of truth)
- Migrate every surface to the canonical system, surface by surface
- Build a reusable component library so future UI work uses the system by default
- Audit cross-surface consistency and lock it in with regression tests

---

## What "the dashboard.html aesthetic" actually means (canonical reference)

The visual language we are unifying on is captured in `/opt/landing/livinity.io/dashboard.html` (the live `livinity.io/dashboard` page). Its core design tokens, in current shipped form:

### Typography
- **Sans body:** `Geist` 200/300/400/500/600/700/800
- **Mono:** `Geist Mono` 400/500 (uppercase labels with letter-spacing 0.06–0.10em)
- **Serif accent:** `Instrument Serif` italic (used in hero titles for "personality")
- All loaded from `https://fonts.googleapis.com/css2?family=Geist:wght@200;300;400;500;600;700;800&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap`

### Color tokens (CSS variables)
```css
:root {
  --dash-pad: 28px;
  --dash-radius: 18px;
  --dash-line: rgba(0,0,0,0.07);
  --dash-line-strong: rgba(0,0,0,0.12);
  --card-bg: #ffffff;
  --card-bg-2: #fafafa;
  --card-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -34px rgba(0,0,0,0.18);
  --hero-grad: linear-gradient(135deg, #fafafa 0%, #f0f0f3 100%);
  --accent-blue:  #2563eb;
  --accent-green: #16a34a;
  --accent-amber: #d97706;
  --accent-red:   #dc2626;
  --font-mono:  "Geist Mono", ui-monospace, monospace;
  --font-serif: "Instrument Serif", serif;
}
body.dark { /* dark variants for every var above */ }
body.iridescent { /* purple-tinted variant */ }
```

### Spacing & layout
- Card padding `var(--dash-pad)` = 28px (consistent everywhere)
- Card radius `var(--dash-radius)` = 18px
- Bento grid: `repeat(12, 1fr)` with `.b-card.span-{4,5,6,7,8,12}` modifiers
- Mobile collapse at `1000px` → all cards span 12

### Reusable classes (current surface inventory)
- `.h-btn` / `.h-btn.solid` — primary button
- `.h-btn` (ghost) — secondary
- `.b-card.span-N` — bento card grid item
- `.hero-card` + `.hero-status-row` + `.status-dot.{on,off}` — landing hero
- `.cmd-box` + `.cmd-key` + `.copy` — command/key display (used in install wizard)
- `.stepper .step.{active,done}` — progress indicator
- `.pill.{ok,err,warn}` — status pill

### Motion
- Greeting overlay: `veilOut 0.7s 2.0s cubic-bezier(.4,0,.2,1)` + `greetIn/Out` for graceful fade
- Hover lift on buttons: `transform: translateY(-1px)` on hover
- All transitions: `0.18s ease`

### Theme switching
- Body class toggles: `body`, `body.dark`, `body.iridescent`
- Persisted via `localStorage.getItem("liv_theme")` (falls back to system preference)

---

## Surface inventory (what we are unifying)

### Surface 1: Mini PC livinityd UI — `livos/packages/ui/src/`
- **Stack:** Vite + React 18 + TypeScript + Tailwind 3.4 + shadcn/ui + Framer Motion
- **Build:** `pnpm --filter ui build` → static dist served by livinityd Express
- **Scope:** **654 TSX files** across:
  - `components/` (95 — generic UI atoms + dialogs + ui/ subfolder of shared primitives)
  - `modules/` (123 — feature modules: app-store, window, ai-chat, settings, etc.)
  - `routes/` (219 — router pages: each settings panel, each app, each route)
  - `shadcn-components/` (29 — shadcn/ui primitives that need replacement or restyle)
  - `features/` (142 — feature-specific UI: backups, files, factory-reset, local-setup)
  - `layouts/` (7 — shell layouts)
  - `providers/` (23 — context providers including theme, apps, available-apps)
- **Current state:** Tailwind utility-first, no canonical CSS variables, light/dark via Tailwind `dark:` classes, custom Apple-spotlight + cmdk + dock styling
- **Migration risk:** HIGH — touching 654 files needs phased waves with strict scope discipline

### Surface 2: Server5 platform Next.js — `/opt/platform/web/src/`
- **Stack:** Next.js 16.1.7 (Turbopack) + React 19 + Tailwind + Drizzle ORM
- **Build:** `npm run build` (Server5 is NOT a git repo — files edited via SSH)
- **Scope:** **68 TSX + 69 TS files** across:
  - `app/dashboard/page.tsx` — 566 lines (was migrated to integrate with first-run redirect 2026-05-14)
  - `app/(auth)/{login,register,verify,forgot-password,reset-password,device}/page.tsx`
  - `app/onboarding/install/page.tsx` + 7 components (current redirects to `/dashboard/install`)
  - `app/dashboard/install/page.tsx` — 244 lines (Phase 111 follow-up, dashboard-shell wrapped)
  - `app/store/[id]/page.tsx`
  - `app/download/page.tsx`
  - `app/api/**/route.ts` — 30+ API routes (no UI, but auth + DB + relay touchpoints)
  - `components/motion-primitives/` — animation primitives (existing)
  - `lib/{auth,api-auth,db,drizzle,session-revocation,...}.ts` — backend libs
- **Current state:** zinc-only Tailwind palette, no Geist font globally, mostly bespoke per-page styling, no shared shell component
- **Migration risk:** MEDIUM — 68 files manageable; existing dashboard.html is the migration target

### Surface 3: Landing static HTML — `/opt/landing/livinity.io/`
- **Stack:** React UMD + @babel/standalone in-browser compile + custom CSS
- **Served by:** Caddy `livinity.io` block with per-path `@*static` rewrites
- **Scope:** **8 HTML files**:
  - `dashboard.html` (52KB — **the canonical design reference**)
  - `dashboard-install.html` (15KB — built 2026-05-14 to match dashboard.html)
  - `auth.html` (login/register page)
  - `profile.html`
  - `customize.html`
  - `download.html`
  - `index.html` (landing/marketing)
  - `forgot-password.html`
- **Current state:** All 8 HTML files include the same Geist font stylesheet link, BUT inline CSS variables and component classes drift between them
- **Migration risk:** LOW — 8 files, mostly already aligned, mostly cosmetic drift to fix

---

## Phase plan (115 → 121, seven phases)

### Phase 115 — UI Component Inventory & Visual Baseline

**Goal:** Produce an exhaustive A→Z inventory of every UI component on every surface, plus baseline screenshots so we can measure visual progress through the rest of the milestone.

**What it ships:**
- `.planning/phases/115-ui-component-inventory/INVENTORY-MINI-PC.md` — every TSX file in `livos/packages/ui/src/` mapped to: file path, primary purpose, route/feature it powers, current visual idiom (Tailwind classes used, color palette, font stack), migration tag (`canonical | needs-migration | replace-with-library | wontfix`)
- `.planning/phases/115-ui-component-inventory/INVENTORY-SERVER5.md` — same for `/opt/platform/web/src/`
- `.planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md` — same for `/opt/landing/livinity.io/`
- `.planning/phases/115-ui-component-inventory/baseline-screenshots/` — Chrome DevTools MCP screenshots of every public route, both light and dark mode
- `.planning/phases/115-ui-component-inventory/COMPONENT-MAP.md` — cross-surface map: "the same conceptual component (button, card, stepper, modal) appears HERE on Mini PC, HERE on Server5, HERE on landing — these are the candidates for the unified component library"

**Plans (3, parallel-safe):**
- 115-01 — Mini PC inventory (livos/packages/ui/) — gsd-codebase-mapper-style agent
- 115-02 — Server5 inventory (/opt/platform/web/) — same pattern, SSH-based
- 115-03 — Landing inventory + visual baseline screenshots (/opt/landing/livinity.io/) — Chrome DevTools MCP captures all 8 HTML pages

**Estimated time:** 2-3 hours of agent work (mostly automated mapping + screenshot capture).

---

### Phase 116 — Canonical Design System Spec (single source of truth)

**Goal:** Codify the dashboard.html aesthetic into a portable, version-controlled spec that every surface can consume.

**What it ships:**
- `.planning/phases/116-canonical-design-system/DESIGN-SYSTEM.md` — long-form spec: typography scale, color tokens (light/dark/iridescent), spacing, radius, shadow, motion curves, accessibility tokens (focus rings, contrast targets), interaction patterns (hover lift, transition timing)
- `livos/packages/design-tokens/tokens.css` — pure CSS file with `:root` + `body.dark` + `body.iridescent` token blocks, importable by any HTML page or built bundle
- `livos/packages/design-tokens/tailwind.preset.cjs` — Tailwind preset that maps the same tokens to Tailwind theme colors / spacing scale
- `livos/packages/design-tokens/theme.json` — JSON manifest for tooling (Storybook, Figma plugin, future design tools)
- `livos/packages/design-tokens/fonts.css` — Geist + Geist Mono + Instrument Serif font-face declarations (self-hosted fallbacks for offline LivOS deploys)
- Tagged release `v35.0-design-tokens-1.0.0`

**Plans (2):**
- 116-01 — Spec authoring + tokens.css + tailwind.preset.cjs + theme.json (writer-style agent)
- 116-02 — fonts.css with self-hosted Geist + visual regression smoke test (canvas paint check)

**Estimated time:** 3-5 hours.

---

### Phase 117 — Server5 Next.js Platform Migration

**Goal:** Apply the canonical design system to every Server5 Next.js route. After this phase, `livinity.io/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/dashboard/install`, `/store`, `/download`, plus the existing `/dashboard` (which already partially aligns) all share dashboard.html's exact visual identity.

**What it ships:**
- All `(auth)/*` pages restyled with canonical tokens + Geist
- `/dashboard/install` already aligns (Phase 111 follow-up); audit and patch any drift
- `/store/[id]` + `/store/profile` restyled
- `/download` restyled
- `app/layout.tsx` — globally inject `tokens.css` + `fonts.css` from `@livinity/design-tokens`
- `tailwind.config.ts` — extend with `@livinity/design-tokens` preset
- `globals.css` — replace bespoke styles with token references
- All 401/error fallback pages styled

**Plans (5):**
- 117-01 — Foundation: install design-tokens package, wire layout.tsx + globals.css + tailwind config
- 117-02 — (auth)/* restyle (login, register, verify, forgot-password, reset-password, device) — 6 routes
- 117-03 — /dashboard/install audit + patch (already mostly aligned)
- 117-04 — /store/[id] + /store/profile restyle
- 117-05 — /download + /dashboard polish (the Next.js /dashboard, which is currently NOT live but should match for future use)

**Estimated time:** 8-12 hours (mostly per-page restyle + visual review).

**D-117-NO-API-CHANGES:** API routes (`/api/**`) and DB schema untouched. UI-only.
**D-117-NO-AUTH-FLOW-CHANGES:** Session cookie + getSession + redirect logic untouched.

---

### Phase 118 — Landing Static HTML Polish & Drift Fix

**Goal:** All 8 HTML pages in `/opt/landing/livinity.io/` share dashboard.html's exact CSS variable definitions and reusable classes. Drift gets fixed. Common nav/header extracted.

**What it ships:**
- `index.html`, `auth.html`, `profile.html`, `customize.html`, `download.html`, `forgot-password.html` audited for token drift; patched where they drift from dashboard.html canonical values
- `/opt/landing/livinity.io/_shared/tokens.css` — canonical token CSS file, all HTML pages `<link>` it (replacing inline `:root` definitions)
- `/opt/landing/livinity.io/_shared/nav.jsx` — reusable React UMD component for the top nav (Livinity brand + theme toggle + sign-in/dashboard link), included in all HTML pages
- `dashboard.html` itself: backward-compat — keep inline tokens AND link to _shared/tokens.css (defense in depth in case the link fails)
- `dashboard-install.html` (2026-05-14 ship): same backward-compat treatment

**Plans (2):**
- 118-01 — Drift audit + fix per file + extract _shared/tokens.css and link from all HTML
- 118-02 — Reusable nav.jsx component + integration

**Estimated time:** 3-5 hours.

---

### Phase 119 — Reusable Component Library (`@livinity/ui-kit`)

**Goal:** Ship a single React component library that any surface can import. Mini PC livinityd UI (Vite), Server5 Next.js (Next), and landing HTML pages (React UMD) all consume the same components. New UI work defaults to the library.

**What it ships:**
- `livos/packages/ui-kit/` — TypeScript React library
- Exported components (initial set, locked to dashboard.html idioms):
  - `<Button variant="solid|ghost|danger" />`
  - `<Card padding="default|tight" radius="default|tight" />`
  - `<Stepper steps={[]} current={N} />`
  - `<Pill tone="ok|warn|err|neutral" />`
  - `<Input label hint error />`
  - `<PasswordInput />`
  - `<CommandBox text copyButton />`
  - `<Modal />`
  - `<Toast />`
  - `<ThemeToggle />`
  - `<NavBar brand user signOut />`
- Three build outputs:
  - ESM (for Vite + Next.js: `import { Button } from '@livinity/ui-kit'`)
  - CommonJS (legacy/Node SSR fallback)
  - UMD (for landing HTML pages: `<script src="@livinity/ui-kit/umd/index.js" />` + `window.LivKit.Button`)
- Storybook stories per component (visual regression friendly)
- Vitest unit tests per component

**Plans (4):**
- 119-01 — Package scaffolding, build pipeline, design tokens dependency wiring
- 119-02 — Atom components (Button, Card, Pill, Input, PasswordInput)
- 119-03 — Composite components (Stepper, CommandBox, Modal, Toast, NavBar, ThemeToggle)
- 119-04 — UMD build target + landing HTML integration smoke test

**Estimated time:** 12-16 hours.

**D-119-NO-CONSUMER-CHANGES:** This phase ships the library standalone. No consumer (Server5, Mini PC, landing) is migrated yet — that happens in Phase 120/121 + retrofit.

---

### Phase 120 — Mini PC livinityd UI Migration — Wave 1 (high-impact components)

**Goal:** Migrate the 30 highest-traffic Mini PC UI components to the canonical design system + ui-kit. After this phase, the user opening Mini PC dashboard sees the same fonts, spacing, and color tokens as `livinity.io/dashboard`.

**What it ships:**
- Foundation: install `@livinity/design-tokens` + `@livinity/ui-kit` into `livos/packages/ui/`
- `tailwind.config.ts` — extend with design-tokens preset
- `index.css` — import `tokens.css` + `fonts.css`, replace bespoke vars with token refs
- Theme provider — switch body class on `liv_theme` localStorage (light/dark/iridescent)
- Restyle the 30 highest-traffic components:
  - Layouts: desktop.tsx, bare layouts
  - Top-level chrome: dock, spotlight, cmdk, app-icon, window-content, window-manager
  - Settings shell + 5 most-used Settings panels
  - AI Chat input + chat panel + slash-command-menu
  - App Store window content
  - Login screen
- Visual diff vs Phase 115 baseline (regression check)

**Plans (5):**
- 120-01 — Foundation: design-tokens + ui-kit install + tailwind/css/theme wiring
- 120-02 — Layout + chrome restyle (dock + spotlight + cmdk + app-icon + window manager + login)
- 120-03 — Settings shell + 5 panels (general, account, advanced, troubleshoot, software-update)
- 120-04 — AI Chat surface restyle (chat input, panel, slash-command-menu)
- 120-05 — App Store window restyle (app-store-content + dependents)

**Estimated time:** 16-24 hours.

**D-120-NO-FUNCTIONAL-CHANGES:** Restyle visual layer only. No prop API changes, no behavior changes. Mini PC continues to work for the operator's daily OwnCloud use throughout (per `feedback_minipc_is_owncloud_primary`).
**D-120-INCREMENTAL-DEPLOY:** Each plan ships independently and can be reverted. Operator runs `update.sh` between plans to validate; if a plan breaks Mini PC OwnCloud usage, revert and retry without blocking the rest of the wave.

---

### Phase 121 — Mini PC UI Long-Tail Migration + Cross-Surface Audit

**Goal:** Migrate the remaining ~600 Mini PC components in feature batches, then audit cross-surface visual consistency and lock it in with regression tests.

**What it ships:**
- Long-tail migration in feature batches:
  - Backups feature (~30 components)
  - Files feature (~25 components)
  - Factory-reset feature (~10 components)
  - Local-setup feature (~10 components)
  - Window-content app dialogs (~50 components)
  - All remaining `routes/*` (~219 → batched by route group)
  - `shadcn-components/*` — replace any that the ui-kit covers; keep only what ui-kit doesn't yet have
  - Misc generic components (~150)
- Cross-surface visual audit:
  - Side-by-side screenshots: same conceptual element on each of 3 surfaces (button, card, stepper, modal, command box, etc.)
  - `.planning/phases/121-cross-surface-audit/CONSISTENCY-REPORT.md` — every diff documented; outliers fixed
- Visual regression test suite:
  - Playwright snapshots for canonical pages of each surface
  - GitHub Actions workflow to run on PRs
- Developer style guide:
  - `livos/packages/design-tokens/STYLE-GUIDE.md` — "How to add a new component to LivOS UI" (always start with ui-kit; only fork if ui-kit doesn't cover; document why; PR checklist)

**Plans (6):**
- 121-01 — Backups + Factory-reset + Local-setup batch
- 121-02 — Files feature batch
- 121-03 — Window-content app dialogs batch
- 121-04 — routes/* batch (split by route group as needed)
- 121-05 — Generic components + shadcn replacement audit
- 121-06 — Cross-surface audit + Playwright regression suite + style guide

**Estimated time:** 24-40 hours.

**D-121-OPERATOR-CHECKPOINTS:** Plan 121-04 (routes batch) is large. Insert operator UAT checkpoints between sub-batches so we don't ship 50 component changes without an OwnCloud-side sanity check.

---

## Dependencies & ordering

```
115 (inventory) ──┐
                  │
116 (tokens)  ────┼──→ 117 (Server5)  ──→ 118 (landing) ──→ 119 (ui-kit) ──→ 120 (Mini PC wave 1) ──→ 121 (Mini PC wave 2 + audit)
                  │
115 enables 116-121 (all need the inventory baseline).
116 enables 117-121 (everything consumes design-tokens).
117+118 can run in parallel after 116 (different surfaces, no overlap).
119 unblocks 120+121 fully but 117/118 don't strictly need ui-kit (they can hand-roll first then refactor).
```

## Locked invariants (across all 7 phases)

| ID | Decision |
|----|----------|
| **D-V35-CANONICAL-IS-DASHBOARD-HTML** | The single source of truth for visual identity is `/opt/landing/livinity.io/dashboard.html` as it stood when v35.0 opened. Every other surface migrates TO it, never the other way. |
| **D-V35-NO-FUNCTIONAL-REGRESSIONS** | Restyle is visual layer only. Prop APIs, business logic, auth flows, API contracts — UNTOUCHED. |
| **D-V35-MINI-PC-OPERATOR-PRIORITY** | Per `feedback_minipc_is_owncloud_primary`: every Mini PC plan respects the operator's daily OwnCloud use. Plans ship deployable + revertable; never break Mini PC mid-flight. |
| **D-V35-SACRED-SHA** | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) preserved across every commit. Pre-commit hook gates this. |
| **D-V35-SERVER5-IN-TREE-PATCH-LOG** | Server5 hot-patches (relay server.ts + index.ts done in v34.0) need back-port tracking. v35.0 does NOT block on these but the v35 migration may add to them. Track in handoff. |
| **D-V35-INCREMENTAL-COMMITS** | Every component restyle is a separate commit so partial reverts work cleanly. No mass-restyle commits. |
| **D-V35-NO-NEW-DEPENDENCIES-WITHOUT-AUDIT** | If a plan needs a new npm dependency (e.g., for the ui-kit Storybook), it goes through code-review-style audit first. Stick to dependencies already in use where possible. |
| **D-V35-LIGHT-DARK-IRIDESCENT-PARITY** | Every component must work in all three themes from day one. No "we'll add dark mode later" pattern. |
| **D-V35-ACCESSIBILITY-WHEN-MIGRATING** | Use the migration as an opportunity to fix focus rings, ARIA labels, contrast where the canonical token system makes it easy. Don't introduce a11y regressions. |

---

## Acceptance criteria (milestone-level)

When v35.0 ships, these all pass:

1. **Single design token source:** all 3 surfaces consume `@livinity/design-tokens`. No drift between dashboard.html `:root` and any other surface's design vars.
2. **Single component library:** `@livinity/ui-kit` is the default for new UI work. Phase 121 audit confirms no surface has hand-rolled a Button, Card, Stepper, Pill, Input, Modal, Toast, NavBar, or ThemeToggle that ui-kit already covers.
3. **Cross-surface visual parity:** Side-by-side screenshots in `121-cross-surface-audit/CONSISTENCY-REPORT.md` show same conceptual element rendering identically on each surface (modulo content/sizing differences).
4. **Geist + Instrument Serif live everywhere:** Every public-facing page loads the same font stylesheet. No Tailwind default sans-serif fallback.
5. **Light/dark/iridescent everywhere:** Theme toggle works on every page on every surface. localStorage `liv_theme` persists.
6. **Visual regression CI:** Playwright snapshot tests run on PRs, fail on visual drift.
7. **Inventory accuracy:** `INVENTORY-MINI-PC.md` + `INVENTORY-SERVER5.md` + `INVENTORY-LANDING.md` reflect post-migration state, with every component tagged `canonical` (no `needs-migration` or `replace-with-library` tags remaining).
8. **Operator-walked UAT:** Operator browses `bruce.livinity.io` → `livinity.io/dashboard` → `livinity.io/dashboard/install` → `livinity.io/login` → Mini PC livinityd UI → cannot tell where one surface ends and the next begins (visual continuity is the win condition).

---

## How to start (after `/clear`)

1. Memory + this milestone draft auto-load via `MEMORY.md` (we'll add a pointer there in this same writeup so resume works).
2. Run `/gsd-autonomous --from 115` — discovers phases 115-121 in ROADMAP.md and walks them sequentially with discuss → plan → execute per phase.
3. Or run individual phases with `/gsd-execute-phase 115` etc. for finer control.
4. Operator UAT checkpoints: when a Mini PC plan ships, the operator runs `bash /opt/livos/update.sh` to deploy + browse Mini PC dashboard to confirm OwnCloud functional + visual parity.

If you want to re-scope or split a phase further, run `/gsd-discuss-phase N` to gather more context before planning.

---

## Out of scope (future v36+ candidates)

- iOS/Android mobile app design (no mobile surface yet)
- LivOS Agent (Windows installer GUI) design system port — Agent has its own Electron/native UI, separate effort
- Marketing site copywriting / illustration refresh — design system is structural; copy is content
- Email template visual identity (transactional emails don't currently exist; future v36 if/when they do)
- Storybook → Figma sync (one-way for now; could become a v36 dev-experience phase)
- Server5 marketplace + changelog PM2 services — they have separate visual identities; not part of v35 surface set
- Dark/iridescent for `apps.livinity.io` (apps marketplace public site) — separate marketplace project, defer

---

## Reference: where the relevant files live (operator quick reference)

| Surface | Path | Build command | Deploy command |
|---|---|---|---|
| Mini PC livinityd UI | `livos/packages/ui/src/` (this repo) | `pnpm --filter @livos/config build && pnpm --filter ui build` | `git push` → operator `bash /opt/livos/update.sh` on Mini PC |
| Server5 Next.js | `/opt/platform/web/src/` (Server5 only — NOT in this repo) | `cd /opt/platform/web && npm run build` (on Server5) | `pm2 restart web` (on Server5) |
| Landing static HTML | `/opt/landing/livinity.io/*.html` (Server5 only — NOT in this repo) | none (HTML files served directly by Caddy) | `systemctl reload caddy` if Caddyfile changed |

Server5 is NOT a git repo here. v35 plans modifying Server5 follow the Phase 111-style cross-repo pattern: `.planning/` artifacts in this repo, source edits via SSH on Server5, backups (`*.pre-v35-NN.bak`) created in each plan for rollback.
