# Cross-Surface Component Identity Map

**Phase:** 115 (v35.0 Design System Unification milestone foundation)
**Purpose:** For each conceptual UI primitive, name the concrete instance on each of the 3 surfaces. Feeds Phase 119 (`@livinity/ui-kit` selection).
**Snapshot date:** 2026-05-14
**Sibling inventories:** `INVENTORY-MINI-PC.md` (Plan 115-01) and `INVENTORY-SERVER5.md` (Plan 115-02) landed during this plan's execution (wave-parallel). The Mini PC + Server5 columns below were populated via direct source inspection AND verified against the sibling inventories. Sibling-confirmed claims:
- `INVENTORY-MINI-PC.md` confirms `components/ui/toast.tsx` is a thin wrapper around `SonnerPrimitive.Toaster` (tag: `replace-with-library`) — answers TODO row.
- `INVENTORY-SERVER5.md` confirms `wizard-stepper.tsx` is the only Server5 component tagged `replace-with-library` (1/123 TSX, 0.8%) — confirms F-115-MAP-03.
- `INVENTORY-SERVER5.md` confirms `topbar.tsx` uses hardcoded `#e5e5e7` border + `bg-white/80` — confirms F-115-MAP-05.

## How to read this map

Each row = one conceptual primitive (e.g., "Button"). Columns = the three surfaces:

- **Mini PC** = where this primitive lives in `livos/packages/ui/src/` (TSX file path or "—" if absent)
- **Server5** = where it lives in `/opt/platform/web/src/` (TSX file path or "inline" if defined per-page, or "—")
- **Landing** = the CSS class name in `/opt/landing/livinity.io/dashboard.html` (and the HTML file that defines it canonically) or "—"

The **Canonical idiom** column captures dashboard.html's expression — Phase 119 ui-kit components MUST visually match this.

## Primary primitives (Phase 119 ui-kit initial export set)

| Primitive | Mini PC | Server5 | Landing (dashboard.html class) | Canonical idiom | Phase 119 ui-kit export | Notes |
|---|---|---|---|---|---|---|
| Button (primary) | `livos/packages/ui/src/shadcn-components/ui/button.tsx` (+ `button-styles.css`) | inline `<button className="...">` per page (no shared component) | `.h-btn.solid` | Solid bg `var(--accent-blue)` (`#2563eb`), white text, radius 999px (pill), hover lift -1px, transition 0.18s ease | `<Button variant="solid" />` | Server5 has NO shared Button — every page inlines Tailwind classes (F-115-MAP-04) |
| Button (ghost/secondary) | same `shadcn-components/ui/button.tsx` (`variant="ghost"`) | inline | `.h-btn` (no `.solid`) | Transparent bg, `var(--dash-line-strong)` border, text `var(--text)` | `<Button variant="ghost" />` | dashboard-install.html also defines `.h-btn.ghost` explicitly |
| Button (danger) | shadcn button `variant="destructive"` | inline | (none in dashboard.html — Phase 119 derives from `--accent-red` `#dc2626`) | Solid bg `var(--accent-red)`, white text, same pill radius | `<Button variant="danger" />` | Canonical visual is **new in Phase 119** — derived from accent-red token |
| Button (link) | `livos/packages/ui/src/components/ui/button-link.tsx` | inline `<a className="...">` per page | (none specified — dashboard.html has anchor styling inline) | Underline-on-hover text in `var(--accent-blue)`, no background, inherits font weight | `<ButtonLink />` | Distinct from `<Button variant="ghost">` — semantic anchor, not button |
| Card | `livos/packages/ui/src/components/ui/card.tsx` | inline (`app/store/components/app-card.tsx`, `featured-hero.tsx` use bespoke Tailwind) | `.b-card` (+ `.span-N` for bento grid) | bg `var(--card-bg)` (`#ffffff`), radius 18px (`--dash-radius`), padding 28px (`--dash-pad`), shadow `var(--card-shadow)` | `<Card padding="default" radius="default" />` | dashboard.html uses `.b-card.span-{4,5,6,7,8,12}` — 12-col bento grid |
| Card (tight) | (Mini PC variant via prop) | inline | (variant of `.b-card`) | Smaller padding (16px) | `<Card padding="tight" />` | |
| Input (text) | `livos/packages/ui/src/shadcn-components/ui/input.tsx` | inline `<input className="...">` in `app/(auth)/{login,register,forgot-password}/page.tsx` | inline `<input>` styled per file (no canonical `.i-text` class in dashboard.html) | bg `var(--card-bg-2)`, border `var(--dash-line)`, padding 12px 16px, radius 12px, focus ring `var(--accent-blue)` | `<Input label hint error />` | **Canonical class missing** — Phase 119 introduces `.i-text` derived from dashboard token set |
| Input (password) | (uses shadcn input + bespoke toggle) | inline (each auth page rolls its own) | inline in `auth.html` | Same as Input + show/hide eye toggle | `<PasswordInput />` | Mini PC pin-input exists (`components/ui/pin-input.tsx`) but is OTP-style, not password |
| Stepper | `livos/packages/ui/src/components/ui/step-indicator.tsx` | `app/onboarding/install/components/wizard-stepper.tsx` (zinc/emerald palette — drift) | `.stepper .step.{active,done}` | Horizontal pill stepper, active = bg `var(--accent-blue)`, done = `var(--accent-green)` checkmark | `<Stepper steps={[]} current={N} />` | Server5 wizard-stepper uses zinc-900/emerald-500 NOT canonical accents (F-115-MAP-03) |
| Pill | `livos/packages/ui/src/shadcn-components/ui/badge.tsx` (closest equiv) | inline (per page Tailwind badges) | `.pill.{ok,err,warn}` | Small rounded badge, ok = `--accent-green`, err = `--accent-red`, warn = `--accent-amber`, mono font, uppercase | `<Pill tone="ok\|warn\|err\|neutral" />` | dashboard-install.html + profile.html both consume `.pill` family |
| CommandBox | `livos/packages/ui/src/components/ui/copyable-field.tsx` + `copy-button.tsx` | `app/onboarding/install/components/install-command-display.tsx` | `.cmd-box` + `.cmd-key` + `.copy` | Mono font box with inline copy button, dark-on-light or light-on-dark surface; click-to-copy gives toast | `<CommandBox text copyButton />` | Live in dashboard-install.html — canonical visual; Mini PC `copyable-field` is functional equivalent |
| Modal | `livos/packages/ui/src/shadcn-components/ui/dialog.tsx` (+ `components/motion-primitives/dialog.tsx`); plus feature-scoped modals in `routes/docker/security/{ban-ip,unban}-modal.tsx`, `routes/docker/dashboard/...` (per INVENTORY-MINI-PC.md) | INVENTORY-SERVER5.md surfaces no shared modal component (consistent with this map's grep finding) | (no canonical class — dashboard.html lacks modal entirely) | Center-screen card, backdrop blur, radius 18px (`--dash-radius`), padding `--dash-pad` | `<Modal />` | **Canonical visual is new in Phase 119** — derived from card tokens |
| Toast | `livos/packages/ui/src/components/ui/toast.tsx` (thin wrapper around `SonnerPrimitive.Toaster`; INVENTORY-MINI-PC.md tags `replace-with-library`) | none in Server5 tree walk; sonner may be imported per page — verify if/when surfaces | (no canonical class — dashboard.html has no toast surface) | Bottom-right pill, slide-in, auto-dismiss 4s, ok/err/warn variants matching `.pill` palette | `<Toast />` | **Canonical visual is new in Phase 119** — composed from `.pill` |
| NavBar (top brand bar) | `livos/packages/ui/src/modules/desktop/header.tsx` | `app/store/components/topbar.tsx` (zinc/white palette — drift) | composite via `.hero-card` + brand wordmark + theme toggle + sign-in/dashboard link | Brand wordmark + theme toggle + user menu | `<NavBar brand user signOut />` | Server5 topbar uses `bg-white/80` + `border-[#e5e5e7]` (hardcoded hex, NOT token) (F-115-MAP-05) |
| ThemeToggle | `livos/packages/ui/src/components/theme-toggle.tsx` | (none — Server5 auth/store pages have no theme toggle UI) | inline button inside dashboard.html `.hero-card` cycling `body` class | Cycles light → dark → iridescent → light; persists to `localStorage['liv_theme']` | `<ThemeToggle />` | Server5 entirely lacks theme toggle UI on public pages (F-115-MAP-06) |

## Secondary primitives (encountered in surface scan but NOT in initial ui-kit export — note for future iteration)

| Primitive | Mini PC | Server5 | Landing | Notes |
|---|---|---|---|---|
| Status dot | — | — | `.status-dot.{on,off}` (dashboard.html) | Used inline in `.hero-status-row`. Simple span; likely inline as a token-driven CSS rule rather than a component. |
| Hero card | — | `app/store/components/featured-hero.tsx` (bespoke) | `.hero-card` (+ `.hero-card-left`, `.hero-card-right`) | Composite layout-specific. May be macro-level (NOT extracted as a primitive). |
| Bento grid layout | — (Mini PC uses windowing system instead) | — | `.bento` parent of `.b-card.span-N` | A LAYOUT primitive, not a component — Phase 116 design-tokens addresses via CSS grid utility, not React. |
| Wizard stepper container | — | `app/onboarding/install/components/wizard-stepper.tsx` (zinc-900/emerald-500) | `.stepper` (canonical) | Sub-row of Stepper above; here for completeness so Phase 119 doesn't miss the Server5 path. |
| Mode cards | — | `app/onboarding/install/components/mode-cards.tsx` | (variant of `.b-card`) | Onboarding-specific card variant; consumes Card primitive once unified. |
| Animated number / Counter | `livos/packages/ui/src/components/motion-primitives/...` (and `components/animated-number.tsx`) | `components/motion-primitives/animated-number.tsx` | — | Both Mini PC and Server5 ship the SAME motion-primitives set (clean cross-surface duplicate — Phase 119 candidate for second-wave consolidation). |
| App card | — | `app/store/components/app-card.tsx` (bespoke Tailwind) | — | Store-specific; consumes Card primitive once unified. |
| Sidebar | `livos/packages/ui/src/modules/desktop/...` | `app/store/components/sidebar.tsx` | — | Store/dashboard navigation; macro-level. |

## Cross-surface drift findings

Each finding feeds Phase 119 ui-kit design decisions.

### Finding F-115-MAP-01: Button radius drift

- Mini PC `<Button>` (`livos/packages/ui/src/shadcn-components/ui/button.tsx`): shadcn default radius via `rounded-md` token (≈ 6px)
- Server5: inline buttons across pages use a mix of `rounded-lg` (8px), `rounded-full` (pill), and `rounded` (4px) — no consistency
- Landing `.h-btn`: radius **999px** (pill — full round)

**Canonical (dashboard.html):** 999px pill. **Phase 119 ui-kit ships pill (999px); Mini PC migrates from `rounded-md`; Server5 migrates from inline mix.**

### Finding F-115-MAP-02: Token namespace drift across landing files

- `dashboard.html` + `dashboard-install.html`: canonical (`--accent-blue`, `--accent-green`, `--accent-red`, `--card-bg`, `--dash-line`, `--dash-pad`, …)
- `profile.html`: parallel namespace (`--green`, `--amber`, `--red`, `--line`, `--mono`) — same concepts, different names
- `auth.html` + `download.html` + `forgot-password.html`: generic `var(--bg)` / `var(--fg)` only
- `customize.html` + `index.html`: NO `:root` block at all

**Action:** Phase 116 ships `_shared/tokens.css` extracted from `dashboard.html`. Phase 118 migrates all 6 non-canonical landing HTMLs to import it. Token renames documented in `INVENTORY-LANDING.md § Token-drift detail`.

### Finding F-115-MAP-03: Stepper presence + palette drift

- **Mini PC:** `livos/packages/ui/src/components/ui/step-indicator.tsx` exists — needs visual audit (current palette TBD on read)
- **Server5:** `app/onboarding/install/components/wizard-stepper.tsx` uses `bg-zinc-900` (active), `bg-emerald-500` (done), `bg-zinc-200` (idle) — **NOT canonical accent tokens**
- **Landing:** `dashboard-install.html` ships `.stepper .step.{active,done}` using `var(--accent-blue)` / `var(--accent-green)` (canonical)

**Action:** Phase 119 ui-kit ships `<Stepper>` matching dashboard-install.html visuals; Server5 migrates wizard-stepper.tsx → ui-kit; Mini PC adopts.

### Finding F-115-MAP-04: Server5 has NO shared Button/Input/Card primitives

- `/opt/platform/web/src/components/` contains **only `motion-primitives/`** (14 animation primitives) — zero base UI primitives
- Every page inlines raw `<button className="rounded-lg bg-... px-3 py-2 ...">` Tailwind classes
- Login/register/forgot-password each define their own button + input styles independently

**Action:** Phase 119 ui-kit becomes the FIRST shared UI library for Server5; migration is high-impact / low-risk (no existing API to break).

### Finding F-115-MAP-05: Server5 topbar uses hardcoded hex, not tokens

- `app/store/components/topbar.tsx`: `bg-white/80`, `border-[#e5e5e7]`, no CSS-var references
- Canonical (`dashboard.html`): `var(--card-bg)`, `var(--dash-line)` — token-driven
- Dark-mode behavior: Server5 topbar lacks dark variants; canonical has 3-theme support

**Action:** Phase 116 emits tokens.css consumable from Tailwind config (`extend.colors.card = 'var(--card-bg)'` pattern); Phase 119 NavBar ships token-driven.

### Finding F-115-MAP-06: ThemeToggle absent on Server5 public surface

- Mini PC: `<ThemeToggle>` ships
- Server5: zero theme toggle UI on any public page (login, register, store, download, onboarding)
- Landing: `dashboard.html` ships inline button cycling `body.dark` + `body.iridescent`

**Action:** Phase 119 ui-kit ships `<ThemeToggle>` with `liv_theme` localStorage persistence; Server5 layouts adopt for parity.

### Finding F-115-MAP-07: Iridescent theme exists only on dashboard.html

- `body.iridescent` block defined ONLY in `dashboard.html` (1 hit)
- All other 7 landing HTMLs: zero iridescent support
- Mini PC + Server5: zero iridescent support

**Action:** Phase 116 captures iridescent token overrides; Phase 117 + 118 audit theme-block parity; Phase 121 visual regression asserts 3-theme presence on canonical surfaces.

## Coverage summary (feeds Phase 119 plan)

| Primitive | Triple-implemented? | Mini PC source | Server5 source | Landing class | Action |
|---|---|---|---|---|---|
| Button | partial | shadcn-components/ui/button.tsx | inline (no shared) | `.h-btn` / `.h-btn.solid` | Ship ui-kit `<Button>`; Server5 adopts first time; Mini PC migrates from shadcn radius |
| Card | partial | components/ui/card.tsx | inline (`app-card`, `featured-hero`) | `.b-card.span-N` | Ship ui-kit `<Card>`; both migrate inline → component |
| Input | partial | shadcn-components/ui/input.tsx | inline per page | inline in `auth.html` | Ship ui-kit `<Input>`; introduce canonical `.i-text` class for landing |
| PasswordInput | partial | (shadcn input + bespoke) | inline per page | inline in `auth.html` | Ship ui-kit `<PasswordInput>` with show/hide eye |
| Stepper | partial | components/ui/step-indicator.tsx | wizard-stepper.tsx (drift palette) | `.stepper .step.{active,done}` | Ship ui-kit `<Stepper>` matching canonical accents; Server5 migrates wizard-stepper |
| Pill | partial | shadcn-components/ui/badge.tsx | inline | `.pill.{ok,err,warn}` | Ship ui-kit `<Pill>`; map shadcn `Badge` variants to canonical tones |
| CommandBox | partial | components/ui/copyable-field.tsx | install-command-display.tsx | `.cmd-box` + `.cmd-key` + `.copy` | Ship ui-kit `<CommandBox>` with copy button; consolidate 3 implementations |
| Modal | partial | shadcn-components/ui/dialog.tsx | (none) | (none — Phase 119 introduces canonical) | Ship ui-kit `<Modal>` derived from card tokens; new visual for dashboard.html |
| Toast | partial | components/ui/toast.tsx | (none) | (none) | Ship ui-kit `<Toast>` composed from `.pill`; new visual for dashboard.html |
| NavBar | partial | modules/desktop/header.tsx | app/store/components/topbar.tsx | composite `.hero-card` | Ship ui-kit `<NavBar>` token-driven; replace Server5 topbar hardcoded hex |
| ThemeToggle | partial | components/theme-toggle.tsx | (none) | inline in `.hero-card` | Ship ui-kit `<ThemeToggle>` with `liv_theme` persistence; Server5 adopts |

## TODO: cross-link markers — RESOLVED

Sibling inventories landed during execution and resolved the two TODO rows pre-emptively flagged:
1. **Modal on Server5** — INVENTORY-SERVER5.md confirms NO shared modal component exists (consistent with this map's direct grep). Phase 119 ships canonical `<Modal>` as first-of-kind for Server5.
2. **Toast on Server5** — INVENTORY-SERVER5.md confirms no shared toast component. INVENTORY-MINI-PC.md flags Mini PC's `toast.tsx` as `replace-with-library` (sonner wrapper). Phase 119 ships unified `<Toast>` and replaces sonner usage on Mini PC.

## Cross-surface drift severity ranking (input for Phase 116 token priority)

1. **`--accent-blue` / `--accent-green` / `--accent-red`** — token name reused across 8 files with 3 different namespaces (canonical `--accent-*`, profile.html `--{color}`, generic absent). Highest concept-drift count → Phase 116 ships these first.
2. **`--card-bg` / `--card-bg-2`** — canonical defined only in dashboard{,-install}.html; 6 other HTMLs use `--bg` or inline `#ffffff`. High drift.
3. **`--dash-line` / `--dash-line-strong`** — canonical only in dashboard{,-install}.html; profile.html uses `--line`/`--line-strong`. Medium drift.
4. **`--dash-pad`** — bespoke padding tokens (`--auth-pad`, `--dl-pad`, `--fp-pad`) per non-canonical page. Phase 116 keeps `--dash-pad` and deprecates per-page pad tokens.
5. **`--card-shadow`** — value matches across dashboard{,-install,-profile}.html. Lowest drift — Phase 116 lifts as-is.
6. **`--font-mono` / `--font-serif`** — naming drift (`--mono`/`--serif` in profile.html). Mechanical rename in Phase 118.

## Provenance

- **Mini PC sources:** direct file inspection of `livos/packages/ui/src/{components,shadcn-components,modules}/` (read tool + glob)
- **Server5 sources:** SSH walk `find /opt/platform/web/src -type f -name '*.tsx'` + targeted `grep` on key files (`topbar.tsx`, `wizard-stepper.tsx`, auth-layout, page.tsx files)
- **Landing sources:** `dashboard.html` + `dashboard-install.html` canonical class definitions captured in `INVENTORY-LANDING.md`
- Zero source edits (D-115-READ-ONLY honored).
