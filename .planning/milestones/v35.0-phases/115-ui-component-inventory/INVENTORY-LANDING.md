# Landing Static HTML Inventory — `/opt/landing/livinity.io/`

**Phase:** 115 (v35.0 Design System Unification milestone foundation)
**Snapshot date:** 2026-05-14
**Host:** Server5 (45.137.194.102) — files served directly by Caddy from `/opt/landing/livinity.io/`
**Total HTML files:** 8
**Canonical reference:** `dashboard.html` (53.5 KB — see D-V35-CANONICAL-IS-DASHBOARD-HTML)
**Source data:** `.work/landing-headers.txt` (batched SSH fetch of `:root` blocks, font links, theme blocks, canonical class hits)

## Migration tag taxonomy

| Tag | Meaning |
|---|---|
| `canonical` | Matches `dashboard.html` token definitions and reusable class vocabulary (`--dash-pad`, `--card-bg`, `.h-btn`, `.b-card`, etc.) |
| `needs-migration` | Drift detected — token values or class definitions differ from canonical, OR canonical tokens absent entirely |
| `replace-with-library` | Not applicable for HTML pages (they consume tokens, not React components) |
| `wontfix` | Page intentionally diverges (none expected) |
| `unknown` | Agent could not classify; operator review needed |

## Per-file inventory

| File | Size | Primary purpose | Public route | Idiom | Migration tag | Drift notes |
|---|---|---|---|---|---|---|
| `dashboard.html` | 53.5 KB | THE canonical dashboard reference | `livinity.io/dashboard` | React UMD + custom CSS + Geist + dashboard tokens (`--dash-pad`, `--card-bg`, `.h-btn.solid`, `.b-card.span-N`, `.hero-card`, `.status-dot`) | `canonical` | Source of truth; no drift by definition. Has `body.dark` (8 hits) + `body.iridescent` (1 hit) — all 3 themes. |
| `dashboard-install.html` | 28.6 KB | First-run install wizard (Phase 111-04 build) | `livinity.io/dashboard/install` (static fallback) | React UMD + identical `:root` block to dashboard.html + canonical classes (`.stepper`, `.h-btn.solid`, `.h-btn.ghost`, `.cmd-box`, `.pill.{ok,err,warn}`) | `canonical` | Built 2026-05-14 to match dashboard.html. `body.dark` present (4 hits), `body.iridescent` absent (only 2-theme support — minor gap vs dashboard's 3-theme). |
| `auth.html` | 45.0 KB | Login + register page (live: signs users in to livinity.io) | `livinity.io/login` + `livinity.io/register` | React UMD + bespoke `--auth-pad` + uses `var(--bg)` / `var(--fg)` (NOT dashboard token names) | `needs-migration` | No dashboard `:root` tokens (`--dash-pad`, `--card-bg`, `--accent-blue`). Uses generic `--bg`/`--fg` instead. Only `.pill` from canonical vocabulary present. `body.dark` (7 hits) but no `body.iridescent`. Loads Geist + Geist Mono BUT NOT Instrument Serif. |
| `profile.html` | 43.7 KB | User profile page (authed) | `livinity.io/profile` | React UMD + bespoke `--line`/`--line-strong`/`--mono`/`--serif`/`--green`/`--amber`/`--red` (parallel naming, not dashboard tokens) | `needs-migration` | Inline `:root` defines its OWN parallel token set — collides conceptually with dashboard tokens (`--green` vs `--accent-green`, etc.). `--card-shadow` value matches dashboard. `.pill.ok` + `.pill.warn` from canonical vocabulary present. `body.dark` (9 hits) but no `body.iridescent`. Has Geist + Mono + Instrument Serif. |
| `customize.html` | 27.7 KB | Account customization | `livinity.io/customize` | React UMD + NO `:root` block at all (uses raw CSS values) | `needs-migration` | Zero `:root` tokens defined. Zero dashboard canonical classes used. Zero `body.dark` / `body.iridescent` blocks — light-mode only. Loads Geist + Mono but NOT Instrument Serif. Largest drift in the set. |
| `download.html` | 21.5 KB | LivOS Agent download | `livinity.io/download` | Bespoke `--dl-pad` + `var(--bg)`/`var(--fg)` only | `needs-migration` | Tiny `:root` (only `--dl-pad`). No dashboard tokens. No canonical classes. `body.dark` present (1 hit) — minimal dark support. Loads all 3 fonts (Geist + Mono + Instrument Serif). |
| `index.html` | 6.5 KB | Landing/marketing root | `livinity.io/` | Marketing copy + heavy serif font stack (Playfair, Cormorant, Garamond, Fraunces, Bodoni, etc.) | `needs-migration` | Zero `:root` block. Zero dashboard tokens. Zero canonical classes. Zero `body.dark`. Loads ~17 marketing serif fonts that do NOT appear in any other file — intentional landing aesthetic. Smallest file in set. |
| `forgot-password.html` | 12.7 KB | Password reset entry | `livinity.io/forgot-password` | Bespoke `--fp-pad` + `var(--bg)`/`var(--fg)` only | `needs-migration` | Tiny `:root` (only `--fp-pad`). No dashboard tokens. No canonical classes. `body.dark` present (3 hits). Loads all 3 fonts. Visually similar to `download.html` (likely same author/sprint). |

## Token-drift detail

### `dashboard.html` (canonical)
- `:root` tokens (canonical set): `--dash-pad`, `--dash-radius`, `--dash-line`, `--dash-line-strong`, `--card-bg`, `--card-bg-2`, `--card-shadow`, `--hero-grad`, `--accent-blue` (`#2563eb`), `--accent-green` (`#16a34a`), `--accent-amber` (`#d97706`), `--accent-red` (`#dc2626`), `--font-mono`, `--font-serif`
- Canonical classes used: `.h-btn`, `.h-btn.solid`, `.b-card`, `.b-card.span-{4,5,6,7,8,12}`, `.hero-card`, `.hero-card-left`, `.hero-card-right`, `.status-dot`, `.status-dot.{on,off}`
- Theme blocks: `body.dark` ✓ (8 hits) + `body.iridescent` ✓ (1 hit)
- Fonts: Geist + Geist Mono + Instrument Serif ✓

### `dashboard-install.html` (canonical)
- `:root` tokens: **EXACT** match to dashboard.html
- Canonical classes: `.stepper`, `.h-btn`, `.h-btn.solid`, `.h-btn.ghost`, `.cmd-box`, `.pill`, `.pill.ok`, `.pill.err`, `.pill.warn`
- Theme blocks: `body.dark` ✓ (4 hits), `body.iridescent` ✗ — **minor 3rd-theme gap**
- Fonts: Geist + Geist Mono + Instrument Serif ✓

### `auth.html` drift
- `:root` vars present: `--auth-pad` only
- vs dashboard canonical: missing ALL of `--dash-pad`, `--card-bg`, `--accent-*`, `--card-shadow`, `--hero-grad`
- Reusable classes used: `.pill` only (rest absent)
- Theme blocks: `body.dark` ✓ (7 hits), `body.iridescent` ✗
- Geist font link: ✓ Geist + Mono; ✗ Instrument Serif

### `profile.html` drift
- `:root` vars present: `--line`, `--line-strong`, `--card-shadow`, `--mono`, `--serif`, `--green`, `--amber`, `--red`
- vs dashboard canonical: parallel namespace (`--green` vs canonical `--accent-green`, etc.) — **token rename required**. `--card-shadow` value matches.
- Reusable classes used: `.pill`, `.pill.ok`, `.pill.warn` ✓
- Theme blocks: `body.dark` ✓ (9 hits), `body.iridescent` ✗
- Geist font link: ✓ all 3 (Geist + Mono + Instrument Serif)

### `customize.html` drift
- `:root` vars present: **none** (no `:root` block at all)
- vs dashboard canonical: max drift — no token system in place
- Reusable classes used: **none**
- Theme blocks: `body.dark` ✗ (light-mode only), `body.iridescent` ✗
- Geist font link: ✓ Geist + Mono; ✗ Instrument Serif

### `download.html` drift
- `:root` vars present: `--dl-pad` only
- vs dashboard canonical: bespoke scoped padding token; no shared color/surface tokens
- Reusable classes used: **none**
- Theme blocks: `body.dark` ✓ (1 hit — minimal), `body.iridescent` ✗
- Geist font link: ✓ all 3

### `index.html` drift
- `:root` vars present: **none**
- vs dashboard canonical: marketing page, completely independent visual system
- Reusable classes used: **none**
- Theme blocks: `body.dark` ✗, `body.iridescent` ✗
- Geist font link: ✓ Geist + Mono + Instrument Serif **plus** Playfair Display, Cormorant Garamond, EB Garamond, DM Serif Display, Cormorant, Fraunces, Libre Caslon Text, Italiana, Cardo, Lora, Bodoni Moda, Tenor Sans, Marcellus, Cormorant Infant (~14 extra fonts — landing-specific)

### `forgot-password.html` drift
- `:root` vars present: `--fp-pad` only
- vs dashboard canonical: same bespoke-pad-only pattern as `download.html`
- Reusable classes used: **none**
- Theme blocks: `body.dark` ✓ (3 hits), `body.iridescent` ✗
- Geist font link: ✓ all 3

## Aggregate counts

| Migration tag | Count |
|---|---|
| `canonical` | 2 (`dashboard.html`, `dashboard-install.html`) |
| `needs-migration` | 6 (`auth.html`, `profile.html`, `customize.html`, `download.html`, `index.html`, `forgot-password.html`) |
| `replace-with-library` | 0 |
| `wontfix` | 0 |
| `unknown` | 0 |
| **TOTAL** | 8 |

## Theme support matrix

| File | `body.dark` | `body.iridescent` | Geist | Geist Mono | Instrument Serif |
|---|:---:|:---:|:---:|:---:|:---:|
| `dashboard.html` | ✓ (8) | ✓ (1) | ✓ | ✓ | ✓ |
| `dashboard-install.html` | ✓ (4) | ✗ | ✓ | ✓ | ✓ |
| `auth.html` | ✓ (7) | ✗ | ✓ | ✓ | ✗ |
| `profile.html` | ✓ (9) | ✗ | ✓ | ✓ | ✓ |
| `customize.html` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `download.html` | ✓ (1) | ✗ | ✓ | ✓ | ✓ |
| `index.html` | ✗ | ✗ | ✓ | ✓ | ✓ |
| `forgot-password.html` | ✓ (3) | ✗ | ✓ | ✓ | ✓ |

**Observation:** Only `dashboard.html` ships the full 3-theme experience. Phase 118 must back-port `body.iridescent` to dashboard-install.html (closest to canonical) and audit dark-mode parity on every other file.

## Landing deployment notes (for Phase 118 executor)

- Files served by Caddy directly; no build step (raw HTML + in-browser React UMD via `@babel/standalone`).
- Path on Server5: `/opt/landing/livinity.io/<file>.html`.
- Edit pattern: SSH + backup `<file>.pre-v35-NN.bak` → edit → `systemctl reload caddy` only if `Caddyfile` changed (HTML edits hot-served — Caddy serves from disk).
- React UMD compile is in-browser via `@babel/standalone` — no build/deploy bottleneck.
- `_shared/tokens.css` does **NOT** exist yet — Phase 118 will create it. This inventory pre-flags where each file's inline `:root` block needs replacement.
- Phase 118 sequencing recommendation (by drift severity):
  1. `dashboard-install.html` — only missing `body.iridescent` block (smallest fix; preserves canonical adjacency)
  2. `auth.html` — rename `--bg`/`--fg` → canonical `--card-bg`/`--text`; add canonical accents; load Instrument Serif
  3. `profile.html` — rename parallel `--green`/`--amber`/`--red` → `--accent-{green,amber,red}`; align `--line` → `--dash-line`
  4. `forgot-password.html` + `download.html` — same lightweight pattern: introduce full canonical `:root` block; keep bespoke pad token
  5. `customize.html` — full token system insertion (currently zero tokens)
  6. `index.html` — marketing page; preserve serif stack but adopt canonical surface tokens for any cards/buttons added later
- Per D-V35-CANONICAL-IS-DASHBOARD-HTML: `dashboard.html`'s `:root` block is the source of truth that the upcoming `_shared/tokens.css` extracts verbatim.

## Snapshot provenance

- Fetched via single batched SSH command (see `.work/landing-headers.txt`):
  ```
  ssh root@45.137.194.102 "for f in /opt/landing/livinity.io/{dashboard,dashboard-install,auth,profile,customize,download,index,forgot-password}.html; do
    wc -c $f; head/title/font-link/:root block/body.dark grep count/class hits/token hits
  done"
  ```
- Class-hit second pass (`grep -oE '\.(h-btn|b-card|hero-card|cmd-box|stepper|pill|status-dot)[a-zA-Z0-9_.-]*'`) confirmed canonical class presence per file.
- Zero source edits applied (D-115-READ-ONLY honored).
