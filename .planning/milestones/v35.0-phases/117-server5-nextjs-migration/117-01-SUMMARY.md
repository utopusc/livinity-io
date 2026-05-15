---
phase: 117-server5-nextjs-migration
plan: 01
subsystem: ui
tags: [v35, design-system, server5, nextjs, tailwind4, design-tokens, foundation, geist, instrument-serif]

requires:
  - phase: 115-ui-component-inventory
    provides: "Server5 file inventory (INVENTORY-SERVER5.md) + dead-tree finding F-115-MAP-SRC-SRC-DUPLICATE"
  - phase: 116-design-tokens-package
    provides: "@livinity/design-tokens npm package (tokens.css, fonts.css, tailwind.preset.cjs, fonts/*.woff2)"

provides:
  - "@livinity/design-tokens v1.0.0 staged in /opt/platform/web/node_modules/@livinity/design-tokens/ on Server5"
  - "Server5 Next.js layout.tsx imports tokens.css + fonts.css before globals.css"
  - "Server5 globals.css @theme inline block migrated to canonical tokens (accent-blue/green/amber/red, card-bg, dash spacing/radius/shadow, Geist/Instrument fonts)"
  - "Dead /opt/platform/web/src/src/ tree (52 files, 424K, 2026-03-26 duplicate) removed with safety tarball at _pre-117-src-src.tar.gz"
  - "Per-file .pre-117-01.bak backups for all 3 patched files + 1 package.json"
  - "Wave 2 (117-02..05) can now consume @livinity/design-tokens via Tailwind 4 utility classes (font-sans/font-mono/font-serif/bg-accent-blue/...) and raw CSS vars (var(--accent-blue), var(--dash-pad))"

affects: [117-02-auth-restyle, 117-03-dashboard-install-audit, 117-04-store-restyle, 117-05-download-dashboard-polish, 118-static-landing, 119-ui-kit]

tech-stack:
  added: ["@livinity/design-tokens@1.0.0 (Server5 node_modules, tarball-installed)"]
  patterns:
    - "Tailwind 4 CSS-first config via globals.css `@theme inline` block (no tailwind.config.ts on Server5)"
    - "Token imports in layout.tsx BEFORE globals.css so @font-face declarations are available when @theme inline references them"
    - "Cross-repo backup discipline: every Server5 file edit gets a .pre-117-01.bak sibling before scp"

key-files:
  created:
    - "/opt/platform/web/node_modules/@livinity/design-tokens/ (tokens.css, fonts.css, tailwind.preset.cjs, theme.json, fonts/*, *.md, package.json, .do-not-prune sentinel)"
    - "/opt/platform/web/_pre-117-src-src.tar.gz (40280 bytes — dead src/src/ tree rollback archive)"
    - "/opt/platform/web/src/app/layout.tsx.pre-117-01.bak"
    - "/opt/platform/web/src/app/globals.css.pre-117-01.bak"
    - "/opt/platform/web/package.json.pre-117-01.bak"
    - ".planning/phases/117-server5-nextjs-migration/117-01-SUMMARY.md"
  modified:
    - "/opt/platform/web/src/app/layout.tsx (added @livinity/design-tokens imports + font-sans body class)"
    - "/opt/platform/web/src/app/globals.css (replaced bespoke @theme inline with canonical tokens; dropped Space Grotesk; kept .store-layout block)"
    - "/opt/platform/web/package.json (recorded @livinity/design-tokens 1.0.0 dep + sync-design-tokens script stub)"

key-decisions:
  - "Skipped tailwind.config.ts route — Server5 runs Tailwind 4.2.1 with CSS-first config via @theme inline. Migrated all preset values into globals.css @theme block instead. Rule 3 auto-fix."
  - "Token imports placed BEFORE ./globals.css in layout.tsx so the @font-face families declared in fonts.css are registered when globals.css's @theme inline { --font-sans: \"Geist\" ... } is evaluated."
  - "Dropped Space Grotesk @import url(...) — Geist is now canonical per D-116. Old Space Grotesk import preserved as a comment in globals.css for rollback context."
  - "Did NOT delete src/src/ permanently — captured to _pre-117-src-src.tar.gz (40280 bytes) first per plan task 1 contract."
  - "Did NOT run npm install on Server5 — @livinity/design-tokens is not on the npm registry, package was tarball-installed and a .do-not-prune sentinel guards against future npm prune."

patterns-established:
  - "Server5 Tailwind 4 token injection pattern: import tokens.css + fonts.css in app/layout.tsx; @theme inline in globals.css; no JS tailwind.config — Wave 2 plans follow this same wiring."
  - "Cross-repo deploy: bundle local /tmp tarball → scp → ssh tar xzf → grep verify markers (5 _OK checks). All 5 markers MUST print or abort."
  - "Per-file .pre-117-NN.bak backups (per D-V35-INCREMENTAL-COMMITS spirit) so the operator can revert any single file independently via `cp <file>.pre-117-NN.bak <file>`."

requirements-completed: []

duration: 18min
completed: 2026-05-14
---

# Phase 117 Plan 01: Foundation — @livinity/design-tokens wired into Server5 Next.js + dead-tree cleanup Summary

**@livinity/design-tokens v1.0.0 staged into Server5 Next.js (Tailwind 4 @theme-inline path), Geist/Instrument-Serif fonts hashed into .next/static/media/, dead src/src/ duplicate tree (52 files) removed with rollback tarball**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-14T21:58:00Z (estimate from task 1 SSH log)
- **Completed:** 2026-05-14T22:15:42Z
- **Tasks:** 5
- **Files modified:** 3 on Server5 + 1 in-repo (SUMMARY.md)
- **Files created:** 1 tarball + 4 .bak backups + 1 sentinel + 1 SUMMARY.md
- **SSH round-trips:** 7 (within rate-limit budget)

## Accomplishments

- `@livinity/design-tokens@1.0.0` staged into `/opt/platform/web/node_modules/@livinity/design-tokens/` with all 10 expected entries (tokens.css, fonts.css, tailwind.preset.cjs, theme.json, fonts/, DESIGN-SYSTEM.md, STYLE-GUIDE.md, LICENSE-FONTS.md, README.md, package.json) + `.do-not-prune` sentinel.
- Server5 `app/layout.tsx` now imports `@livinity/design-tokens/tokens.css` and `@livinity/design-tokens/fonts.css` BEFORE `./globals.css`; `<body>` className includes `font-sans antialiased`.
- Server5 `app/globals.css` `@theme inline` block migrated from bespoke Space-Grotesk + `--color-background/foreground/muted/border` to canonical tokens (`--color-accent-blue/green/amber/red`, `--color-card-bg/card-bg-2`, `--color-dash-line/strong`, `--spacing-dash`, `--radius-dash`, `--shadow-card`, `--background-image-hero-grad`, `--transition-duration-dash`, Geist/Geist Mono/Instrument Serif).
- Dead `/opt/platform/web/src/src/` tree (52 files, 424K, dated 2026-03-26) archived to `_pre-117-src-src.tar.gz` (40280 bytes) and removed.
- `npm run build` succeeded — 40/40 static pages prerendered, single 79485-byte CSS chunk at `/opt/platform/web/.next/static/chunks/670baf256e1e73a3.css` contains `--accent-blue`, `--card-bg`, `--dash-pad`, `--font-sans`, `Geist`, `InstrumentSerif` markers.
- 4 font files hashed into `/opt/platform/web/.next/static/media/`: `Geist-Variable.92592eb2.woff2`, `GeistMono-Variable.2f937313.woff2`, `InstrumentSerif-Regular.60c916e2.woff2`, `InstrumentSerif-Italic.b1508682.woff2`.
- `pm2 restart web` clean (PID 2214356, status `online`); direct Next.js `http://127.0.0.1:3000/login` → HTTP 200, body markup contains `font-sans antialiased` + `/_next/static/chunks/670baf256e1e73a3.css` link.

## Task Commits

This plan ships in-repo as a single squashed commit (cross-repo plan — all Server5 edits are atomic on the remote box, no per-task git commit on Server5; this in-repo commit records the SUMMARY + the proof). Per-task atomic commits do not apply to Server5 (it has no .git).

1. **Task 1: Dead-tree backup + remove** — Server5 only (`_pre-117-src-src.tar.gz` + `rm -rf src/src/`).
2. **Task 2: Stage @livinity/design-tokens** — Server5 only (`node_modules/@livinity/design-tokens/` + `package.json` patch + `.do-not-prune` sentinel).
3. **Task 3: Wire layout.tsx + globals.css** — Server5 only (.bak siblings + scp of new files).
4. **Task 4: Build + restart + smoke test** — Server5 only (npm run build + pm2 restart web + curl + grep token-in-css-bundle).
5. **Task 5: Local commit + this SUMMARY** — In-repo (`.planning/phases/117-server5-nextjs-migration/117-01-SUMMARY.md`).

**Plan metadata commit:** TBD by orchestrator final commit step.

## Files Created/Modified

### On Server5 (cross-repo edits)

| Path | Op | Notes |
|---|---|---|
| `/opt/platform/web/src/src/` | DELETED | Dead 2026-03-26 duplicate tree; 52 files / 424K. Captured to `_pre-117-src-src.tar.gz` (40280 bytes) first. |
| `/opt/platform/web/_pre-117-src-src.tar.gz` | CREATED | Rollback archive for the deletion above. |
| `/opt/platform/web/node_modules/@livinity/design-tokens/` | CREATED | 10 entries staged from /tmp/livinity-design-tokens-117-01.tar.gz (197023 bytes). |
| `/opt/platform/web/node_modules/@livinity/design-tokens/.do-not-prune` | CREATED | Sentinel guarding tarball install. |
| `/opt/platform/web/package.json` | PATCHED | Added `"@livinity/design-tokens": "1.0.0"` + `sync-design-tokens` script. |
| `/opt/platform/web/package.json.pre-117-01.bak` | CREATED | Rollback backup. |
| `/opt/platform/web/src/app/layout.tsx` | REWRITTEN | Added `@livinity/design-tokens/tokens.css` + `@livinity/design-tokens/fonts.css` imports (before `./globals.css`). Added `font-sans` to body className. Preserved full metadata + openGraph block. |
| `/opt/platform/web/src/app/layout.tsx.pre-117-01.bak` | CREATED | Rollback backup. |
| `/opt/platform/web/src/app/globals.css` | REWRITTEN | Replaced bespoke `@theme inline` with canonical tokens. Dropped Space Grotesk `@import`. Kept `.store-layout` block verbatim for Phase 117-04. |
| `/opt/platform/web/src/app/globals.css.pre-117-01.bak` | CREATED | Rollback backup. |

### In-repo

- `.planning/phases/117-server5-nextjs-migration/117-01-SUMMARY.md` — this file.

## Decisions Made

1. **Tailwind 4 CSS-first path adopted (Rule 3 auto-fix).** The plan's `tailwind.config.ts` route assumed Tailwind 3.4. Server5 actually runs Tailwind 4.2.1 (no tailwind.config.ts exists; PostCSS plugin `@tailwindcss/postcss@^4`). The design-tokens README explicitly anticipates this: "When migrating consumers to Tailwind 4 (CSS-first config), import tokens.css directly and use `@theme inline` instead of a JS preset." → Migrated all preset values into the `@theme inline` block in `globals.css`. The token NAMES match the preset 1:1 (`accent-blue`, `card-bg`, `dash-line`, `dash`, etc.), so Wave 2 plans can still write `bg-accent-blue` / `p-dash` / `rounded-dash` as Tailwind classes.
2. **Import order: tokens.css + fonts.css BEFORE globals.css.** This guarantees the `@font-face` declarations from `fonts.css` are registered when `globals.css`'s `@theme inline { --font-sans: "Geist" }` is evaluated.
3. **Dropped Space Grotesk Google Fonts `@import url(...)` from globals.css.** Per D-116-LOCK-CANONICAL, Geist (local woff2 via fonts.css) is the canonical sans. The old import is preserved as a comment in the new globals.css head for rollback context.
4. **No `npm install` after package.json patch.** The package is not on the npm registry; running `npm install` would 404. Documented in the new `sync-design-tokens` script stub.
5. **Smoke test bypasses Caddy.** `https://livinity.io/` and `https://livinity.io/login` are intercepted by Caddy and rewritten to static landing pages at `/opt/landing/livinity.io/*.html` (not Next.js). To prove the Next.js wiring works, smoke test hits `http://127.0.0.1:3000/login` directly — HTTP 200, body has `font-sans antialiased`, and the served HTML references `/_next/static/chunks/670baf256e1e73a3.css`. Phase 117-05 must coordinate the Caddy route swap when Next.js dashboards reach parity (already noted in 117-CONTEXT.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] tailwind.config.ts does not exist on Server5 — Tailwind 4 CSS-first path**

- **Found during:** Task 3 (Wire tailwind config)
- **Issue:** Plan 117-01 Task 3 step C prescribes editing `/opt/platform/web/tailwind.config.ts` with `presets: [require('@livinity/design-tokens/tailwind.preset.cjs')]`. That file does not exist on Server5 — `ls /opt/platform/web/tailwind.config.*` returns "No such file or directory". The project uses Tailwind 4.2.1 (`@tailwindcss/postcss@^4` in devDependencies) which moved config into CSS via `@theme inline {}`. The design-tokens README explicitly documents this scenario.
- **Fix:** Migrated all `tailwind.preset.cjs` values into a canonical `@theme inline {}` block inside the new `globals.css`. Token names preserved 1:1 (`accent-blue`, `card-bg`, `dash`, etc.). Tailwind 4 utility class names produced are identical to what the preset would have produced (`bg-accent-blue`, `p-dash`, `rounded-dash`, `font-sans` → Geist, etc.). Created the in-CSS `@theme inline` block; left tailwind.config.ts uncreated since Tailwind 4 ignores it.
- **Files modified:** `/opt/platform/web/src/app/globals.css` (rewritten — `.bak` preserved).
- **Verification:** `npm run build` succeeds; built CSS chunk `670baf256e1e73a3.css` (79485 bytes) contains `--accent-blue`, `--card-bg`, `--dash-pad`, `--font-sans`, `Geist`, `InstrumentSerif`. Body class `font-sans` resolves to Geist in production HTML.
- **Committed in:** This plan's metadata commit (in-repo SUMMARY).

**2. [Rule 3 — Blocking] `set -e` aborts on missing tailwind.config.ts during recon**

- **Found during:** Task 1 read_first recon SSH
- **Issue:** The initial single-SSH recon used `set -e` and `cat /opt/platform/web/tailwind.config.ts` near the end of the heredoc. When that file did not exist, the whole script aborted before printing later-stage diagnostics.
- **Fix:** Split recon into a second SSH call without `set -e`-on-cat, plus added `ls /opt/platform/web/tailwind.config.*` and explicit `which node` / version checks. Discovered Tailwind 4 in deps, which led to Deviation 1.
- **Files modified:** None (recon-only).
- **Verification:** Second SSH printed full config inventory; led directly to Deviation 1 resolution.
- **Committed in:** N/A (recon).

**3. [Rule 1 — Bug awareness, no fix needed] `https://livinity.io/*` is Caddy-static, NOT Next.js**

- **Found during:** Task 4 smoke test
- **Issue:** Plan acceptance expects `curl https://livinity.io/` HTML to contain Geist / token markers. But Server5 Caddyfile routes `/login`, `/register`, `/dashboard`, `/dashboard/install`, etc. to `/opt/landing/livinity.io/*.html` static files (intercept before Next.js sees the request). The HTML served by the public URL is NOT Next.js output. This is a pre-existing routing topology (MEMORY.md note about `/dashboard` → dashboard.html), not a bug introduced by this plan, and Phase 117-CONTEXT.md already documents that "Phase 117-05 must coordinate a Caddy route swap."
- **Fix:** None applied — Caddy routing is out-of-scope for Plan 117-01 (D-117 boundaries). Instead, smoke test was redirected to `http://127.0.0.1:3000/login` (direct Next.js) to prove the wiring works. The user-facing Caddy → /opt/landing routes will be swapped later (Phase 117-05 or 118).
- **Files modified:** None.
- **Verification:** Direct Next.js `http://127.0.0.1:3000/login` → HTTP 200, body markup `font-sans antialiased`, CSS link `/_next/static/chunks/670baf256e1e73a3.css`, all token markers present in served CSS bundle.
- **Committed in:** N/A (documented here).

---

**Total deviations:** 3 (2 Rule 3 blocking auto-fixes + 1 Rule 1 awareness with no fix needed).
**Impact on plan:** All three deviations align with the spirit of the plan and are explicitly anticipated by either the design-tokens README (Tailwind 4 note) or Phase 117-CONTEXT.md (Caddy route swap deferred to 117-05). No scope creep. Acceptance criteria all met via the Tailwind 4 path.

## Issues Encountered

None beyond the three deviations above. Build was clean (40/40 static pages prerendered), pm2 restart was clean (`web` went from PID 2198280 → 2214356, status `online` within 3 s), and the token markers are present in the built CSS bundle.

## Operator Rollback Recipe

If anything regresses, the operator can revert Plan 117-01 with one SSH session:

```bash
/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  root@45.137.194.102 "set -e; \
    cd /opt/platform/web; \
    cp package.json.pre-117-01.bak package.json; \
    cp src/app/layout.tsx.pre-117-01.bak src/app/layout.tsx; \
    cp src/app/globals.css.pre-117-01.bak src/app/globals.css; \
    rm -rf node_modules/@livinity; \
    tar xzf _pre-117-src-src.tar.gz; \
    npm run build && pm2 restart web && pm2 list | grep web"
```

This restores: bespoke globals.css (`Space Grotesk` + bespoke `@theme inline`), Mar-2026 layout.tsx (no design-tokens imports, no `font-sans` body class), package.json without the design-tokens dep, deleted node_modules/@livinity tree, and the resurrected src/src/ duplicate tree. After `npm run build` + `pm2 restart web` the site is back at the pre-117-01 baseline.

## Smoke-Test Evidence (verbatim)

```
=== final acceptance verify ===
LAYOUT_BAK_OK
GLOBALS_BAK_OK
PKG_BAK_OK
TOKENS_IMPORT_OK
FONTS_IMPORT_OK
GLOBALS_HEADER_OK
GLOBALS_TOKENS_OK
TARBALL_OK
SRC_SRC_GONE
PM2_ONLINE
/opt/platform/web/.next/static/chunks/670baf256e1e73a3.css
TOKEN_IN_CSS_BUNDLE
200 (HTTP code for /login direct Next.js)
=== D-117-NO-API-CHANGES check ===
(empty — no files under /opt/platform/web/src/app/api newer than _pre-117-src-src.tar.gz)
=== D-117-NO-AUTH-FLOW-CHANGES check ===
(empty — no middleware.ts or lib/ files newer than _pre-117-src-src.tar.gz)
=== summary recap ===
package.json patch: "1.0.0"
CSS chunk size: 79485
Fonts in build: 4 (Geist-Variable, GeistMono-Variable, InstrumentSerif-Regular, InstrumentSerif-Italic)
```

Token presence inside the built CSS chunk (verbatim grep):

```
$ grep -oE -- '--accent-blue|--dash-pad|--card-bg|--font-sans|Geist|InstrumentSerif' /opt/platform/web/.next/static/chunks/670baf256e1e73a3.css | sort -u
--accent-blue
--card-bg
--dash-pad
--font-sans
Geist
InstrumentSerif
```

## D-117 Boundary Confirmation

- **D-117-NO-API-CHANGES:** `find /opt/platform/web/src/app/api -newer /opt/platform/web/_pre-117-src-src.tar.gz -type f` → EMPTY. API routes untouched.
- **D-117-NO-AUTH-FLOW-CHANGES:** `find /opt/platform/web/src -name 'middleware.ts' -newer _pre-117-src-src.tar.gz` → EMPTY. `find /opt/platform/web/src/lib -newer _pre-117-src-src.tar.gz -type f` → EMPTY. Session-cookie / getSession / JWT helpers untouched. The layout.tsx rewrite preserves the full `metadata` + `openGraph` export verbatim; only imports + `<body>` className changed (`font-sans` added; `antialiased` preserved).
- **D-117-CROSS-REPO:** All Server5 edits via SSH; per-file `.pre-117-01.bak` siblings present; in-repo artifact is only this SUMMARY.md.
- **D-117-OPERATOR-CAN-RESTART-AT-WILL:** Single rollback recipe (above) restores baseline in one SSH session.
- **D-117-PRESERVE-DASHBOARD-INSTALL:** Not touched in 117-01 (handled in 117-03).

## Next Phase Readiness

Wave 2 (117-02 / 03 / 04 / 05) can now proceed in parallel.

**Notes for Wave 2 plans:**

1. **Tailwind 4 syntax in canonical class mappings.** All four mapping rows in the plan's `<interfaces>` block still hold — `bg-card-bg-2`, `bg-accent-blue`, `text-accent-red`, `rounded-dash`, `p-dash`, `gap-dash`, `shadow-card`, `font-sans` (Geist), `font-mono` (Geist Mono), `font-serif` (Instrument Serif) all generate properly under Tailwind 4 from the `@theme inline` block in `globals.css`. No tailwind.config.ts to modify.
2. **Body theme classes.** `body.dark` and `body.iridescent` are stubs (per D-116-FOLLOW-UP-DARK / -IRIDESCENT). Wave 2 plans that need theme toggling MUST NOT improvise — wait for Phase 116-02 to backfill the canonical dark + iridescent overrides from `/opt/landing/livinity.io/dashboard.html`.
3. **`.store-layout` block preserved.** Phase 117-04 (store restyle) will fold `--background/--foreground/--muted/--border/--card/--primary` inside `.store-layout` into canonical tokens. Until then it remains verbatim.
4. **Space Grotesk dropped.** Any Wave 2 caller that still expects Space Grotesk (none should — inventory says zero callers) will silently fall back to the Geist `font-sans` chain. Audit during 117-02 anyway.
5. **Caddy route swap deferred.** `https://livinity.io/login`, `/register`, `/forgot-password`, etc. still hit Caddy static `/opt/landing/livinity.io/auth.html`. Wave 2 tests MUST use direct Next.js (`http://127.0.0.1:3000/login` from Server5 shell, or via tunnel) until 117-05 coordinates the Caddy switch.
6. **CSS chunk hash will change** every build. Smoke tests should grep markers inside `/opt/platform/web/.next/static/chunks/*.css`, not hard-code `670baf256e1e73a3.css`.

**Blockers:** None. Wave 2 unblocked.

## Self-Check: PASSED

Verified after SUMMARY write:

- `.planning/phases/117-server5-nextjs-migration/117-01-SUMMARY.md` — FOUND (in-repo)
- Server5 `/opt/platform/web/node_modules/@livinity/design-tokens/tokens.css` — FOUND
- Server5 `/opt/platform/web/_pre-117-src-src.tar.gz` — FOUND (40280 bytes)
- Server5 `/opt/platform/web/src/app/layout.tsx` contains `@livinity/design-tokens/tokens.css` import — FOUND
- Server5 `/opt/platform/web/src/app/globals.css` contains `accent-blue` token — FOUND
- Server5 `pm2 list | grep web` → `online` — FOUND
- Server5 `.next/static/chunks/670baf256e1e73a3.css` contains `--accent-blue` + `--card-bg` + `--dash-pad` + `--font-sans` + `Geist` + `InstrumentSerif` — FOUND
- D-117-NO-API-CHANGES: `find /opt/platform/web/src/app/api -newer _pre-117-src-src.tar.gz -type f` → EMPTY (no api changes)
- D-117-NO-AUTH-FLOW-CHANGES: `find /opt/platform/web/src -name 'middleware.ts' -newer _pre-117-src-src.tar.gz` → EMPTY, `find /opt/platform/web/src/lib -newer _pre-117-src-src.tar.gz -type f` → EMPTY

---
*Phase: 117-server5-nextjs-migration*
*Plan: 01*
*Completed: 2026-05-14*
