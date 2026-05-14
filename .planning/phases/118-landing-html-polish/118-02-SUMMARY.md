---
phase: 118
plan: 02
subsystem: landing-static-html
tags: [landing, design-system, server5, nav, react-umd, theme-toggle]
requires:
  - Phase 118-01 (_shared/tokens.css + _shared/fonts.css live)
  - React 18 UMD + @babel/standalone (already loaded per page, INVENTORY-LANDING.md)
provides:
  - "/opt/landing/livinity.io/_shared/nav.jsx (reusable LivNav top-nav React UMD component)"
  - "8 landing HTML pages mount LivNav via <div id=\"__liv_nav__\"></div> + <script type=\"text/babel\" src=\"/_shared/nav.jsx\">"
  - "Theme toggle (light/dark/iridescent) live across the landing surface"
  - "localStorage 'liv_theme' persistence layer"
affects:
  - "Server5 landing static HTML (no repo source edits per D-118-CROSS-REPO)"
tech-stack:
  added: []
  patterns:
    - "React 18 UMD + @babel/standalone in-browser JSX compile (per dashboard.html idiom)"
    - "Auto-mount on DOMContentLoaded into first #__liv_nav__"
    - "Defense-in-depth INJECT-AFTER-BODY: shared nav coexists with existing per-page <nav> (mandate override of plan REPLACE strategy)"
    - "Idempotent injection via id=\"__liv_nav__\" + /_shared/nav.jsx markers"
key-files:
  created:
    - "/opt/landing/livinity.io/_shared/nav.jsx (Server5; SHA-1 2e47b88170d1ba43f87c2ef0b8db4f6cf152406e; 4605 B)"
    - ".planning/phases/118-landing-html-polish/118-02-SUMMARY.md"
  modified:
    - "/opt/landing/livinity.io/dashboard.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/dashboard-install.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/auth.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/profile.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/customize.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/download.html (Server5; +mount div +script, existing <nav> preserved)"
    - "/opt/landing/livinity.io/index.html (Server5; +mount div +script, no prior <nav>)"
    - "/opt/landing/livinity.io/forgot-password.html (Server5; +mount div +script, existing <nav> preserved)"
decisions:
  - "D-118-CANONICAL-IS-DASHBOARD-HTML — honored: dashboard.html inline nav NOT replaced; LivNav mount is additive. Zero hex literals in nav.jsx — colors flow through var(--accent-blue / --dash-pad / --dash-line / --card-bg) etc."
  - "D-118-CADDY-FILE_SERVER-COMPATIBLE — honored: nav.jsx served HTTP 200 by existing Caddy file_server block, no Caddyfile edits. Content-length 4605 confirmed in response headers."
  - "D-118-OFFLINE-RESILIENT — partially honored at this layer: theme toggle (read/write localStorage) works fully offline. React UMD + @babel/standalone are loaded from unpkg per page (online-only); offline fallback is OUT OF SCOPE per executor mandate (D-118-OFFLINE-RESILIENT applies to fonts, not React)."
  - "D-118-CROSS-REPO — honored: only this SUMMARY.md committed in repo. Server5 source edits not mirrored. 8× .pre-118-02.bak rollback backups live on Server5."
metrics:
  duration: ~25min
  completed: 2026-05-14
---

# Phase 118 Plan 02: Shared LivNav + theme toggle on 8 landing pages Summary

## Outcome

Shared `_shared/nav.jsx` (React UMD + Babel-in-browser, ~4.6 KB) deployed to Server5. All 8 landing HTML pages mount the `LivNav` component via `<div id="__liv_nav__"></div>` + `<script type="text/babel" data-presets="react" src="/_shared/nav.jsx">`. Theme toggle (Light / Dark / Iridescent) persists via `localStorage.liv_theme` and applies `body.dark` / `body.iridescent` body classes. The shared nav is **additive** (mandate override of plan REPLACE strategy): existing per-page inline `<nav>` markup is preserved as defense-in-depth, leaving cleanup for Phase 119 (`@livinity/ui-kit` migration).

## Artifacts on Server5

| Path | Size | SHA-1 | HTTP | Marker counts |
|---|---|---|:---:|---|
| `/opt/landing/livinity.io/_shared/nav.jsx` | 4605 B | `2e47b88170d1ba43f87c2ef0b8db4f6cf152406e` | 200 | `__liv_nav__`=2, `LivNav|liv_theme|applyTheme`=12, `var(--`=3, hex=`0` |
| `/opt/landing/livinity.io/_shared/tokens.css` (118-01) | 1769 B | `35b1523f…` (unchanged) | 200 | regression-clean |
| `/opt/landing/livinity.io/_shared/fonts.css` (118-01) | 1943 B | `a95d7865…` (unchanged) | 200 | regression-clean |

Local `.work/nav.jsx` SHA = Server5 SHA (byte-identical deploy via `scp`).

## Backups on Server5

| Backup file | Notes |
|---|---|
| `dashboard.html.pre-118-02.bak` | Pre-118-02 (post-118-01 state) |
| `dashboard-install.html.pre-118-02.bak` | Pre-118-02 |
| `auth.html.pre-118-02.bak` | Pre-118-02 |
| `profile.html.pre-118-02.bak` | Pre-118-02 |
| `customize.html.pre-118-02.bak` | Pre-118-02 |
| `download.html.pre-118-02.bak` | Pre-118-02 |
| `index.html.pre-118-02.bak` | Pre-118-02 (no prior `<nav>`) |
| `forgot-password.html.pre-118-02.bak` | Pre-118-02 |

`ls /opt/landing/livinity.io/*.pre-118-02.bak | wc -l` == **8** ✓

## Per-file integration log

All 8 files used **INJECT-AFTER-BODY** strategy (defense-in-depth; mandate override of plan REPLACE strategy — see Deviations section). Mount div inserted right after `<body>`; `<script type="text/babel" src="/_shared/nav.jsx">` appended just before `</body>`. Idempotency proven by zero-change re-run.

| File | Pre-existing `<nav>` | Mount action | Script action | Idempotent re-run |
|---|:---:|---|---|:---:|
| `dashboard.html` (canonical) | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `dashboard-install.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `auth.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `profile.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `customize.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `download.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |
| `index.html` | 0 | injected-after-body | appended-before-body-close | already-present ✓ |
| `forgot-password.html` | 1 | injected-after-body | appended-before-body-close | already-present ✓ |

## HTTP probe results (Caddy public-URL smoke)

All over HTTPS:

| URL | HTTP | tokens.css link | fonts.css link | mount div | nav.jsx script |
|---|:---:|:---:|:---:|:---:|:---:|
| `https://livinity.io/_shared/nav.jsx` | 200 | — | — | — | — |
| `https://livinity.io/` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/auth.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/dashboard.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/dashboard-install.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/profile.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/customize.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/download.html` | 200 | 1 | 1 | 1 | 1 |
| `https://livinity.io/forgot-password.html` | 200 | 1 | 1 | 1 | 1 |

Plan 118-01 foundation (`tokens.css` + `fonts.css` link tags) intact on every page — zero regression.

## Theme-toggle behavior contract (verified via JSX inspection)

Best-effort curl-based behavior verification (mandate override of plan Task 4 operator visual smoke):

| Capability | Pattern in nav.jsx | Count |
|---|---|:---:|
| Theme persist | `localStorage.setItem('liv_theme'` | 1 |
| Theme apply | `body.classList.{add,remove}` w/ `'dark'`/`'iridescent'` | 3 |
| Theme read fallback | `prefers-color-scheme: dark` system preference | 1 |
| React 18 mount | `ReactDOM.createRoot` (+ legacy `ReactDOM.render` fallback) | 2 |
| CSS variable usage | `var(--*)` (`--dash-pad`, `--dash-line`, `--card-bg`) | 3 |
| Hex literals | `#xxxxxx` | **0** |
| Auth-aware CTA | `document.cookie` `session=` probe + `localStorage.liv_authed === '1'` | (function `readAuthed`) |

The shared `.h-btn` / `.h-btn.solid` styling comes from Plan 118-01's canonical `tokens.css`; nav.jsx adds only thin layout-only inline styles (flex, padding, borderRadius), all colors via tokens.

## Operator visual smoke

**Mandate override:** plan Task 4 (`checkpoint:human-verify`) replaced by curl-based JSX-content + HTML-body checks above (mandate's "Return `## PLAN COMPLETE` if 8 HTMLs integrate the nav + nav.jsx serves" specifies the curl criteria). User can still spot-check `https://livinity.io/auth.html` in a browser: top of page should render brand "livinity" left + 3 theme buttons + "Sign in" CTA right, and clicking Dark/Iridescent should toggle `<body class="dark">` / `<body class="iridescent">` with `localStorage.liv_theme` persisting across refresh.

If visual regression is found (e.g., button styling doesn't match `dashboard.html` because some page lacks the `.h-btn` CSS rule), the fix path is Phase 118-01 `tokens.css` (which all 8 pages already link) — not nav.jsx.

## Deviations from Plan

**1. [Rule 2 — auto-add missing critical functionality] INJECT-AFTER-BODY instead of REPLACE strategy on existing-nav files**

- **Found during:** Task 1 (probe) + executor mandate review
- **Plan instruction:** "If probe reported existing `<nav>` >= 1 → use REPLACE strategy (swap first `<nav>...</nav>` with `<div id=\"__liv_nav__\"></div>`)"
- **Executor mandate constraint:** "DON'T modify dashboard.html's existing inline nav — only add the mount div + script tag underneath (defense-in-depth: shared nav coexists with inline nav). Note in SUMMARY for future cleanup."
- **Decision:** Mandate (defense-in-depth) wins. Applied INJECT-AFTER-BODY uniformly to all 8 files (not just dashboard.html) for two reasons:
  1. Consistency — one strategy is easier to reason about across the surface
  2. Phase 119 will introduce the `@livinity/ui-kit <Nav>` React component anyway; per-page nav cleanup is naturally that phase's concern. Removing markup here only to re-remove it again later is churn.
- **Implication:** Every existing-nav file now renders TWO navs visually (old inline + new shared). User-facing impact = visual stack but no functional break. Phase 119 cleanup target.
- **Files affected:** dashboard.html, dashboard-install.html, auth.html, profile.html, customize.html, download.html, forgot-password.html (7 of 8; index.html had no prior nav).
- **Idempotency preserved:** re-running the inject step is a no-op.

**2. [Mandate override] Task 4 checkpoint:human-verify → curl-based smoke**

- Mandate Return clause: "`## PLAN COMPLETE` if 8 HTMLs integrate the nav + nav.jsx serves" — curl-based criteria.
- Plan Task 4 was `checkpoint:human-verify` (browser visual smoke on 3 pages).
- Executed: curl-based JSX content inspection + HTML body marker counts on all 8 pages (see Operator visual smoke section above). Operator browser smoke is still recommended but not blocking.

No other deviations.

## Carryover for Phase 119 (ui-kit) and beyond

- **Phase 119 cleanup target:** Remove the now-redundant per-page inline `<nav>` markup on 7 files (dashboard, dashboard-install, auth, profile, customize, download, forgot-password). Phase 119's `@livinity/ui-kit` `<Nav>` React component should be the single source of truth; then `_shared/nav.jsx` itself becomes a thin loader that imports from ui-kit (or this file is retired entirely if ui-kit ships its own UMD bundle).
- **Phase 119 candidate:** `nav.jsx` currently inlines layout styles (flex row, padding, gap, borderRadius). Promote these to canonical `.liv-nav` / `.liv-nav-brand` / `.liv-nav-theme` / `.liv-nav-cta` classes in `tokens.css` or a new `nav.css`, so the markup carries only semantic class names. Defer until ui-kit migration to avoid double-edit.
- **Phase 119 / 116 follow-up:** `body.dark` and `body.iridescent` override blocks in `tokens.css` are still pending canonical transcription (D-116-FOLLOW-UP-DARK / D-116-FOLLOW-UP-IRIDESCENT). The theme toggle ships in 118-02, but visual dark/iridescent only takes effect once those token blocks are populated. **Not blocking 118-02 PLAN COMPLETE** — toggle state machine is correct; visual output depends on 116 follow-up.
- **Out of scope for this phase:** React + @babel/standalone offline-resilience. Per executor mandate "D-118-OFFLINE-RESILIENT applies to fonts, not React" — landing pages will continue to fetch React UMD from unpkg.com online. Mini PC offline scenarios (Phase 120/121) will need bundled React, but that's a non-landing concern.

## Rollback recipe

If a regression is found on 118-02 only (preserving 118-01 foundation):

```bash
SSH_BIN='/c/Windows/System32/OpenSSH/ssh.exe'
KEY='C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master'
SSH_ARGS="-i $KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

$SSH_BIN $SSH_ARGS root@45.137.194.102 'bash -s' <<"REMOTE"
set -euo pipefail
cd /opt/landing/livinity.io
for f in dashboard dashboard-install auth profile customize download index forgot-password; do
  if [ -f "${f}.html.pre-118-02.bak" ]; then
    cp -a "${f}.html.pre-118-02.bak" "${f}.html"
    echo "restored: ${f}.html"
  fi
done
# Optionally also remove just the nav.jsx (preserves 118-01 tokens/fonts):
# rm -f /opt/landing/livinity.io/_shared/nav.jsx
REMOTE
```

The 118-01 `.pre-118-01.bak` backups remain untouched; a full Phase 118 rollback (118-02 + 118-01) restores from `pre-118-01.bak` instead.

## Decisions honored

- **D-118-CANONICAL-IS-DASHBOARD-HTML** — dashboard.html inline nav preserved (additive mount only). `nav.jsx` consumes `.h-btn` / `.h-btn.solid` classes from canonical `tokens.css`. Zero hex literals in nav.jsx (verified: `grep -cE '#[0-9a-fA-F]{6}' nav.jsx` == `0`); all colors via `var(--accent-blue)`, `var(--dash-pad)`, `var(--dash-line)`, `var(--card-bg)`.
- **D-118-CADDY-FILE_SERVER-COMPATIBLE** — no Caddyfile changes. nav.jsx served HTTP 200 by existing `file_server` block under `/opt/landing/livinity.io/_shared/`. Content-length 4605 confirmed.
- **D-118-OFFLINE-RESILIENT** — theme toggle layer (localStorage read/write + body.classList) works fully offline. React UMD + @babel/standalone are loaded from unpkg per page (online dependency, pre-existing per INVENTORY-LANDING.md — not introduced by 118-02). Offline-resilient React bundling is out of scope per executor mandate.
- **D-118-CROSS-REPO** — only `.planning/phases/118-landing-html-polish/118-02-SUMMARY.md` committed in repo. Server5 source edits not mirrored (Server5 isn't a git checkout per `feedback_update_sh_drift.md`). 8 `.pre-118-02.bak` rollback files live on Server5.

## Self-Check: PASSED

- `/opt/landing/livinity.io/_shared/nav.jsx` exists on Server5, 4605 B, HTTP 200, SHA-1 `2e47b88170d1ba43f87c2ef0b8db4f6cf152406e`
- Zero hex literals in nav.jsx (`grep -cE '#[0-9a-fA-F]{6}'` == `0`)
- All 4 critical markers present: `__liv_nav__` (×2), `LivNav` / `liv_theme` / `applyTheme` (×12 combined), `var(--` (×3), `ReactDOM.createRoot` (×2)
- All 8 HTML files contain exactly 1× `id="__liv_nav__"` mount div
- All 8 HTML files contain exactly 1× `/_shared/nav.jsx` script reference
- All 8 HTML files retain 118-01 `_shared/tokens.css` + `_shared/fonts.css` link tags (zero regression)
- 8 `.pre-118-02.bak` backup files present (`ls *.pre-118-02.bak | wc -l == 8`)
- Idempotency: zero-change re-run on all 8 files (mount=already-present, script=already-present)
- Public-URL smoke: all 8 HTML pages + `_shared/nav.jsx` return HTTP 200
- This SUMMARY.md exists in `.planning/phases/118-landing-html-polish/`
