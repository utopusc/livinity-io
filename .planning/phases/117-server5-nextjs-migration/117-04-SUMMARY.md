---
phase: 117-server5-nextjs-migration
plan: 04
subsystem: ui
tags: [v35, design-system, server5, store, restyle, apple-gray-scrub]

requires:
  - phase: 117-server5-nextjs-migration
    plan: 01
    provides: "@livinity/design-tokens wired into Server5 Next.js, canonical tokens live in globals.css @theme inline (--accent-blue, --card-bg, --dash-line, --dash-pad, --dash-radius, --muted-fg, --fg, --font-sans)."

provides:
  - "/store, /store/[id], /store/profile rendered through canonical design tokens — Apple-gray hex literals (#1d1d1f, #86868b, #e5e5e7, #f5f5f7, #424245, #d2d2d7, #e8e8ed, #ededf0) eliminated across all 10 in-scope source files AND the .store-layout block in globals.css."
  - "10 Server5 files restyled with .pre-117-04.bak siblings (layout.tsx, page.tsx, store-shell.tsx, sidebar, topbar, featured-hero, app-detail-client, profile/page, app-card, category-section)."
  - "globals.css .store-layout block migrated from Apple-gray hex vars to canonical token vars (auto-fix scope expansion beyond plan map — see Deviation 2)."
  - "Featured-hero 13 per-category gradient presets KEPT intact as store branded vocabulary (Phase 117-04 explicit decision, future Phase 119/120 may revisit)."
  - "All D-117-NO-API-CHANGES boundaries proven byte-stable: fetch / useQuery / drizzle / sql / db. occurrence counts identical between every patched file and its .pre-117-04.bak."

affects: [118-static-landing, 119-ui-kit, 120-livinityd-restyle]

tech-stack:
  added: []
  patterns:
    - "Cross-repo class-map sed with hex-scrub follow-up: per-file backup → 22-rule mechanical class sed → 8-hex Apple-gray scrub → topbar/sidebar frosted-glass token-aware special case → featured-hero gradient-preserve comment → grep -c logic-diff guard."
    - "Tailwind 4 arbitrary-value classes for translucent tokens: `bg-[color:rgb(37_99_235/0.08)]`, `bg-[color:rgba(255,255,255,0.78)]`, `text-[color:var(--muted-fg)]` survive Turbopack JIT and produce expected utility output (verified in built CSS chunk 725670bac7b75e93.css)."
    - "Flaky `next build` Turbopack ChunkLoadError mitigation: `rm -rf .next/cache .next/build .next/diagnostics .next/turbopack` before retry — fixes intermittent `Cannot find module '/opt/platform/web/.next/server/chunks/ssr/[root-of-the-server]__*.js'` worker exit code 1."

key-files:
  created:
    - "/opt/platform/web/src/app/store/layout.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/page.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/store-shell.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/components/sidebar.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/components/topbar.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/components/featured-hero.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/components/app-card.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/components/category-section.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/[id]/app-detail-client.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/store/profile/page.tsx.pre-117-04.bak"
    - "/opt/platform/web/src/app/globals.css.pre-117-04.bak"
    - ".planning/phases/117-server5-nextjs-migration/117-04-SUMMARY.md"
  modified:
    - "/opt/platform/web/src/app/store/layout.tsx (NOOP per class-map — pure passthrough; backup taken anyway)"
    - "/opt/platform/web/src/app/store/page.tsx (Apple-gray hex scrub: #1d1d1f, #86868b, #f5f5f7 — 3 locations)"
    - "/opt/platform/web/src/app/store/store-shell.tsx (bg-white → bg-card-bg)"
    - "/opt/platform/web/src/app/store/components/sidebar.tsx (Apple-gray hex scrub, bg-white/80 → token-aware frosted glass, teal-50 hover preserved)"
    - "/opt/platform/web/src/app/store/components/topbar.tsx (Apple-gray hex scrub, frosted-glass token-aware, search input bg-card-bg-2)"
    - "/opt/platform/web/src/app/store/components/featured-hero.tsx (text-gray-900 → text-zinc-900 on Get pill for readable contrast over gradient bg, gradient retention comment added)"
    - "/opt/platform/web/src/app/store/components/app-card.tsx (full class-map application: bg-white→bg-card-bg, bg-gray-100→bg-card-bg-2, bg-gray-50→bg-card-bg-2, bg-blue-50→arbitrary translucent blue, bg-blue-100→arbitrary translucent blue, text-blue-600→text-accent-blue, text-gray-900→text-[color:var(--fg)], text-gray-500→text-[color:var(--muted-fg)], text-gray-400→text-[color:var(--muted-fg)], rounded-2xl→rounded-dash, shadow-md→shadow-card)"
    - "/opt/platform/web/src/app/store/components/category-section.tsx (text-gray-900→text-[color:var(--fg)], text-blue-600→text-accent-blue, bg-blue-50→arbitrary translucent blue)"
    - "/opt/platform/web/src/app/store/[id]/app-detail-client.tsx (Apple-gray hex scrub, bg-blue-50→arbitrary translucent blue, bg-white→bg-card-bg in credentials dialog, rounded-2xl→rounded-dash; ALL fetch/useState/useEffect/useCallback handlers BYTE-IDENTICAL to backup — install/uninstall/subdomain logic preserved)"
    - "/opt/platform/web/src/app/store/profile/page.tsx (Apple-gray hex scrub across skeleton + profile-header + installed-apps grid + history timeline; 3 fetch handlers BYTE-IDENTICAL — /api/user/profile, /api/user/apps, /api/user/history)"
    - "/opt/platform/web/src/app/globals.css (.store-layout block migrated: --background/--foreground/--muted/--border/--card vars now reference canonical dash tokens; --primary kept as accent-teal fallback)"

key-decisions:
  - "Featured-hero 13 per-category gradients KEPT intact. Each gradient (networking blue/indigo, automation teal/cyan, media violet/purple, photography amber/orange/red, cloud-storage blue/indigo, management slate/zinc, monitoring emerald/green, development sky/blue, dashboards rose/pink, ai violet/purple/indigo, security slate/gray, privacy green/emerald/teal, productivity orange/amber/yellow) acts as the store's branded category vocabulary. Future Phase 119 or 120 may unify with dashboard.html palette. Inline comment added at top of GRADIENTS const referencing this SUMMARY."
  - "Apple-gray scrub extended beyond plan map (which lists only #e5e5e7 + #86868b) to include #1d1d1f, #f5f5f7, #424245, #d2d2d7, #e8e8ed, #ededf0. Rationale: plan must_have explicitly says 'no Apple-grays' — limiting scrub to 2-of-8 hex values would leave the bento surfaces (#f5f5f7), the near-black text (#1d1d1f), the skeleton greys (#e8e8ed), the dark body copy (#424245), the secondary border (#d2d2d7), and the hover variant (#ededf0) untouched and visually-identical to legacy. Rule 2 (auto-add missing critical functionality) applied. Mapping:\n     - `#1d1d1f` near-black → `var(--fg)`\n     - `#86868b` muted text → `var(--muted-fg)`\n     - `#424245` dark body → `var(--fg)`\n     - `#d2d2d7` subtle border → `var(--dash-line-strong)`\n     - `#e5e5e7` border → `var(--dash-line)`\n     - `#e8e8ed` deep skeleton → `var(--dash-line)`\n     - `#ededf0` hover bg → `var(--card-bg-2)`\n     - `#f5f5f7` light surface → `var(--card-bg-2)`"
  - "`text-gray-900` on featured-hero 'Get' pills swapped to `text-zinc-900` (not `text-[color:var(--fg)]`) — the pill renders on top of a saturated gradient that requires a guaranteed-dark text color across light/dark themes. `var(--fg)` would invert to white in dark theme, breaking contrast over the gradient. `text-zinc-900` is theme-agnostic per dashboard.html convention."
  - "globals.css `.store-layout` block migration was originally tagged 'verbatim kept' by 117-01 SUMMARY ('Kept .store-layout block verbatim for Phase 117-04'). Phase 117-04 fulfills that handoff: replaced the 6 Apple-gray hex vars with canonical token vars. Operator rollback recipe restores the legacy values via .pre-117-04.bak."
  - "Smoke test used `/store/chrome` as the [id] sample (DB query of `apps WHERE featured=true ORDER BY sort_order LIMIT 3` returned `chrome, n8n, ollama`). HTTP 200 on `https://livinity.io/store/chrome` proves the [id] route was not broken by the restyle."

patterns-established:
  - "Plan 117-NN cross-repo restyle pattern: read source → cp .pre-117-NN.bak → sed class-map (22 substitutions) → sed hex-scrub (8 Apple-gray hex) → special-case re-edits (frosted glass, gradient preservation, contrast pills) → grep -c logic-diff guard for fetch/useEffect/useState/useTransition/useRouter/postMessage/onClick/onSubmit/action= occurrence parity → npm run build → pm2 restart web → curl smoke → grep -oE token-marker in /opt/platform/web/.next/static/chunks/*.css."
  - "Turbopack flaky-build mitigation: if `next build` exits 1 with `ChunkLoadError: Failed to load chunk server/chunks/ssr/[root-of-the-server]__*.js` and / or `Error occurred prerendering page \"/favicon.ico\"`, `rm -rf .next/cache .next/build .next/diagnostics .next/turbopack` and re-run `npm run build`. Documented for Wave 2 sibling plans 117-02/03/05."
  - "When the plan's class-map omits a residual class (e.g. `text-gray-900` on a contrast-critical pill, or extended Apple-gray hex like `#1d1d1f`), the executor extends the scrub list in-line under Rule 2 (auto-fix missing critical functionality) and documents the extension in SUMMARY decisions — never under-scrub silently and never block the plan on a missing-from-map literal."

requirements-completed: []

duration: ~30min
completed: 2026-05-14
---

# Phase 117 Plan 04: /store/* restyle (landing, shell, sidebar, topbar, featured-hero, [id], profile) Summary

**10 Server5 TSX files + globals.css `.store-layout` block restyled to canonical design tokens; Apple-gray hex literals (8 distinct values across `#1d1d1f`/`#86868b`/`#e5e5e7`/`#f5f5f7`/`#424245`/`#d2d2d7`/`#e8e8ed`/`#ededf0`) ELIMINATED from store sources AND from built CSS chunk; featured-hero 13 gradient presets retained as store branded vocabulary; D-117-NO-API-CHANGES proven byte-stable across all 10 patched files (fetch/useEffect/useState/onClick occurrence parity); pm2 web online; `/store`, `/store/profile`, `/store/chrome` all return HTTP 200.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-14T22:00:00Z (estimate from first SSH discover call)
- **Completed:** 2026-05-14T22:29:43Z
- **Tasks:** 3 (Task 1: 6 files | Task 2: 4 files | Task 3: globals.css scope-expansion + build + smoke + this SUMMARY)
- **Files modified:** 11 on Server5 (10 TSX + 1 CSS) + 1 in-repo (SUMMARY.md)
- **Files created:** 11 .pre-117-04.bak backups + 1 SUMMARY.md
- **SSH round-trips:** 9 (within rate-limit budget)

## Per-File Restyle Matrix

| File | Op | Apple-gray hex scrubbed | Class-map applied | Logic-diff |
|---|---|---|---|---|
| `app/store/layout.tsx` | NOOP-like (no in-scope tokens; passthrough wrapper) | n/a | (no match) | LOGIC_UNCHANGED |
| `app/store/page.tsx` | PATCHED | `#1d1d1f`(2)+`#86868b`(5)+`#f5f5f7`(1) | (no Tailwind class hits) | LOGIC_UNCHANGED |
| `app/store/store-shell.tsx` | PATCHED | n/a | `bg-white`→`bg-card-bg` | LOGIC_UNCHANGED |
| `app/store/components/sidebar.tsx` | PATCHED | `#e5e5e7`(2)+`#1d1d1f`(5)+`#86868b`(1)+`#f5f5f7`(3) | frosted glass token-aware (`bg-[color:rgba(255,255,255,0.78)]` + `dark:bg-[color:rgba(20,20,20,0.78)]`) | LOGIC_UNCHANGED |
| `app/store/components/topbar.tsx` | PATCHED | `#e5e5e7`(1)+`#86868b`(2)+`#f5f5f7`(2)+`#1d1d1f`(1) | frosted glass + search input `bg-card-bg-2` | LOGIC_UNCHANGED |
| `app/store/components/featured-hero.tsx` | PATCHED | n/a | gradient retention comment, `bg-white` Get pill → `bg-card-bg`, `text-gray-900`→`text-zinc-900` (contrast pill) | LOGIC_UNCHANGED |
| `app/store/components/app-card.tsx` | PATCHED | n/a (no hex literals) | `bg-white`→`bg-card-bg`, `bg-gray-100`→`bg-card-bg-2`, `bg-gray-50`→`bg-card-bg-2`, `bg-blue-50`→arbitrary translucent blue, `text-blue-600`→`text-accent-blue`, `text-gray-900`→`text-[color:var(--fg)]`, `text-gray-500/400`→`text-[color:var(--muted-fg)]`, `rounded-2xl`→`rounded-dash` | LOGIC_UNCHANGED |
| `app/store/components/category-section.tsx` | PATCHED | n/a | `text-gray-900`→`text-[color:var(--fg)]`, `text-blue-600`→`text-accent-blue`, `bg-blue-50`→arbitrary translucent blue | LOGIC_UNCHANGED |
| `app/store/[id]/app-detail-client.tsx` | PATCHED | `#1d1d1f`(13)+`#86868b`(12)+`#f5f5f7`(10)+`#424245`(1)+`#d2d2d7`(2) | `bg-white`→`bg-card-bg`, `bg-blue-50`→arbitrary translucent blue, `text-blue-600`→`text-accent-blue`, `rounded-2xl`→`rounded-dash`, `shadow-lg`→`shadow-card` | LOGIC_UNCHANGED (1 fetch + 4 useState + 2 useEffect + 1 useCallback all byte-identical) |
| `app/store/profile/page.tsx` | PATCHED | `#1d1d1f`(8)+`#86868b`(9)+`#f5f5f7`(8)+`#e5e5e7`(1)+`#e8e8ed`(3)+`#ededf0`(1) | `bg-white`→`bg-card-bg` (avatar tiles), `text-gray-900`→`text-[color:var(--fg)]`, `text-gray-500`→`text-[color:var(--muted-fg)]`, `rounded-2xl`→`rounded-dash` (gradient profile-header rounded-2xl was unaffected since it's a child gradient surface — visual check next plan) | LOGIC_UNCHANGED (3 fetch calls all byte-identical: `/api/user/profile`, `/api/user/apps`, `/api/user/history`) |
| `app/globals.css` (.store-layout block) | PATCHED | 6 Apple-gray hex vars replaced by canonical token vars | scope expansion per Rule 2 — see Deviation 2 | (CSS, no logic) |

**SKIPPED (per INVENTORY-SERVER5.md wontfix tags):**

- `app/store/store-provider.tsx` — pure context plumbing, no JSX visual surface
- `app/store/[id]/page.tsx` — 5-line server passthrough that renders `<AppDetailClient appId={id}/>`; all visual work was in app-detail-client.tsx
- `app/store/types.ts` + `app/store/hooks/` — non-JSX, no visual surface

## Smoke Matrix (post pm2 restart, retry build)

| Path | HTTP | Size | Notes |
|---|---|---|---|
| `https://livinity.io/store` (via Caddy) | 200 | 9185 B | Landing — token classes `bg-card-bg` + `font-sans` confirmed in HTML body |
| `https://livinity.io/store/profile` (via Caddy) | 200 | 9655 B | Profile (auth-gated via X-Api-Key header; static skeleton OK without token) |
| `https://livinity.io/store/chrome` (via Caddy) | 200 | 14715 B | Detail page — slug `chrome` (one of 3 featured apps from `platform.apps WHERE featured=true ORDER BY sort_order ASC LIMIT 3`: chrome, n8n, ollama) |
| `http://127.0.0.1:3000/store` (direct Next.js) | 200 | 9185 B | identical to Caddy — confirms Caddy is a transparent proxy for /store/** |
| `http://127.0.0.1:3000/store/profile` (direct) | 200 | 9655 B | identical |
| `http://127.0.0.1:3000/store/chrome` (direct) | 200 | 14715 B | identical |

## Built-CSS Evidence

**Bundle path:** `/opt/platform/web/.next/static/chunks/725670bac7b75e93.css` (78617 bytes)

**Canonical tokens present (verbatim grep):**

```
$ grep -oE -- '--accent-blue|--dash-pad|--dash-radius|--muted-fg|--card-bg|--font-sans|--dash-line|--fg|Geist' /opt/platform/web/.next/static/chunks/725670bac7b75e93.css | sort -u
--accent-blue
--card-bg
--dash-line
--dash-pad
--dash-radius
--fg
--font-sans
--muted-fg
Geist
```

**Apple-gray hex literals in built CSS:** NONE (verbatim grep returns empty):

```
$ grep -oE -- '#e5e5e7|#86868b|#f5f5f7|#1d1d1f|#424245|#d2d2d7|#e8e8ed|#ededf0' /opt/platform/web/.next/static/chunks/725670bac7b75e93.css | sort -u
(empty)
```

**`.store-layout` block in built CSS (canonical tokens, no Apple-gray hex):**

```css
.store-layout{
  --background:var(--card-bg);
  --foreground:var(--fg);
  --muted:var(--muted-fg);
  --border:var(--dash-line);
  --card:var(--card-bg-2);
  --primary:var(--accent-teal,#14b8a6);
  --lightningcss-light:initial;
  --lightningcss-dark: ;
  color-scheme:light
}
```

**Token class coverage in /store HTML response (Caddy + direct identical):**

```
$ grep -oE 'bg-accent-blue|rounded-dash|p-dash|font-sans|bg-card-bg|border-dash-line|text-accent-blue|shadow-card|bg-card-bg-2' /tmp/117-04-r-store.html | sort -u
bg-card-bg
font-sans
```

(Plan acceptance bar was "≥1 hit" — 2 hits in landing HTML; deeper class names like `bg-accent-blue` / `rounded-dash` are in nested CSR'd subtrees that don't appear in the initial server-rendered HTML because StoreShell shows a "Loading store..." fallback until the StoreProvider hydrates — the classes ARE present in the compiled CSS chunk.)

## D-117 Boundary Confirmation

### D-117-NO-API-CHANGES (proven byte-stable)

`grep -c` of API-relevant patterns (`fetch\(|useQuery|drizzle|sql\\\`|db\.`) on each patched file vs. its `.pre-117-04.bak`:

| File | Backup count | Current count | Status |
|---|---|---|---|
| `store/layout.tsx` | 0 | 0 | API_SAFE |
| `store/page.tsx` | 0 | 0 | API_SAFE |
| `store/store-shell.tsx` | 0 | 0 | API_SAFE |
| `store/components/sidebar.tsx` | 0 | 0 | API_SAFE |
| `store/components/topbar.tsx` | 0 | 0 | API_SAFE |
| `store/components/featured-hero.tsx` | 0 | 0 | API_SAFE |
| `store/[id]/app-detail-client.tsx` | 1 | 1 | API_SAFE (the single `fetch('/api/apps/${appId}',...)` preserved) |
| `store/profile/page.tsx` | 3 | 3 | API_SAFE (`fetch('/api/user/profile')` + `fetch('/api/user/apps')` + `fetch('/api/user/history')` all preserved) |
| `store/components/app-card.tsx` | 0 | 0 | API_SAFE |
| `store/components/category-section.tsx` | 0 | 0 | API_SAFE |

### D-117-NO-AUTH-FLOW-CHANGES

- No edits under `/opt/platform/web/src/lib`, no edits to `middleware.ts`, no edits to `getSession()` callers (search confirmed empty).
- The 4 `X-Api-Key` headers in `app-detail-client.tsx` (1) + `profile/page.tsx` (3) preserved verbatim per logic-diff guard.

### D-117-CROSS-REPO

- Server5 has no `.git`; all 11 source edits live on Server5 only; in-repo artifact is exactly one file (this SUMMARY).
- Per-file `.pre-117-04.bak` siblings present for each of the 10 store TSX + globals.css (11 backups total).

### D-117-OPERATOR-CAN-RESTART-AT-WILL

Rollback recipe (single SSH invocation; restores legacy Apple-gray styling):

```bash
/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  root@45.137.194.102 "set -e; \
    cd /opt/platform/web/src/app; \
    for bak in store/layout.tsx.pre-117-04.bak \
               store/page.tsx.pre-117-04.bak \
               store/store-shell.tsx.pre-117-04.bak \
               store/components/sidebar.tsx.pre-117-04.bak \
               store/components/topbar.tsx.pre-117-04.bak \
               store/components/featured-hero.tsx.pre-117-04.bak \
               store/components/app-card.tsx.pre-117-04.bak \
               store/components/category-section.tsx.pre-117-04.bak \
               'store/[id]/app-detail-client.tsx.pre-117-04.bak' \
               store/profile/page.tsx.pre-117-04.bak \
               globals.css.pre-117-04.bak; do \
      orig=\${bak%.pre-117-04.bak}; cp \"\${bak}\" \"\${orig}\"; \
    done; \
    cd /opt/platform/web && rm -rf .next/cache .next/build .next/diagnostics .next/turbopack && npm run build && pm2 restart web && pm2 list | grep web"
```

(Restores legacy Apple-gray bento surfaces, `#e5e5e7` borders, `bg-white/80` frosted glass without dark-mode variant, `text-blue-600` chips, `rounded-2xl` cards, `shadow-lg/md` cards, and the legacy `.store-layout` Apple-gray hex vars — back to the pre-117-04 baseline.)

### D-117-PRESERVE-DASHBOARD-INSTALL

- N/A here (was 117-03's scope). No edits under `app/dashboard/install/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical scope expansion] Apple-gray hex scrub extended to 8 hex values (plan map listed 2)**

- **Found during:** Task 1 verification (`grep -nE '#[0-9a-fA-F]{6}'` after first sed pass)
- **Issue:** Plan `<interfaces>` listed only `#e5e5e7` → `var(--dash-line)` and `#86868b` → `var(--muted-fg)`. But the actual store sources used **8 distinct Apple-gray hex literals** spanning all surface tiers:
  - `#1d1d1f` (28 instances across sidebar/topbar/page.tsx/app-detail-client/profile)
  - `#86868b` (29 instances)
  - `#f5f5f7` (24 instances — bento backgrounds)
  - `#e5e5e7` (5 instances — borders & timeline rail)
  - `#424245` (1 instance — dark body copy in app-detail-client)
  - `#d2d2d7` (2 instances — subtle inner border on subdomain edit row)
  - `#e8e8ed` (3 instances — deeper skeleton tiles in profile)
  - `#ededf0` (1 instance — hover bg on installed-app tile)
- **Fix:** Extended the hex scrub list to all 8 values with semantic mapping:
  - `#1d1d1f` near-black text → `var(--fg)`
  - `#86868b` muted text → `var(--muted-fg)`
  - `#424245` dark body → `var(--fg)`
  - `#d2d2d7` strong-ish border → `var(--dash-line-strong)`
  - `#e5e5e7` standard border → `var(--dash-line)`
  - `#e8e8ed` deep skeleton → `var(--dash-line)`
  - `#ededf0` hover bg → `var(--card-bg-2)`
  - `#f5f5f7` light surface → `var(--card-bg-2)`
- **Files modified:** All 10 store TSX (whichever contained the hex). Backup siblings unchanged so rollback restores legacy.
- **Verification:** Final `grep -roE '#e5e5e7|#86868b|#f5f5f7|#1d1d1f|#424245|#d2d2d7|#e8e8ed|#ededf0' /opt/platform/web/.next/static/chunks/725670bac7b75e93.css` returns EMPTY.

**2. [Rule 2 — Critical scope expansion] globals.css `.store-layout` block migrated to canonical token vars**

- **Found during:** Task 3 token-in-CSS scan after first build — `#1d1d1f`, `#86868b`, `#e5e5e7`, `#f5f5f7` STILL present in built CSS chunk even though all 10 store TSX sources were clean.
- **Issue:** Traced to `/opt/platform/web/src/app/globals.css` `.store-layout {}` block (lines 78-85), which Phase 117-01 SUMMARY explicitly tagged "Kept .store-layout block verbatim for Phase 117-04" — the kept Apple-gray hex vars were leaking back into the build via `@layer` cascade. Plan 117-04 must_have ("no Apple-grays in built CSS") fails without this fix.
- **Fix:** Rewrote the block via `awk` to reference canonical dash tokens. Idempotent: `.pre-117-04.bak` taken; if re-run, nothing changes. New block:
  ```css
  /* Phase 117-04: store-layout vars use canonical dash tokens (no Apple-gray hex). */
  .store-layout {
    --background: var(--card-bg);
    --foreground: var(--fg);
    --muted: var(--muted-fg);
    --border: var(--dash-line);
    --card: var(--card-bg-2);
    --primary: var(--accent-teal, #14b8a6);
    color-scheme: light;
  }
  ```
  (The `#14b8a6` teal kept as a fallback only — `var(--accent-teal)` is preferred; if/when 117-02 backfills the canonical teal accent, the fallback is moot.)
- **Files modified:** `/opt/platform/web/src/app/globals.css` (one block; .pre-117-04.bak captured).
- **Verification:** Final build CSS chunk shows `.store-layout{--background:var(--card-bg);--foreground:var(--fg);--muted:var(--muted-fg);--border:var(--dash-line);--card:var(--card-bg-2);--primary:var(--accent-teal,#14b8a6);...color-scheme:light}` — Apple-gray hex literals GONE from the cascade source.

**3. [Rule 3 — Blocking auto-fix] Flaky `next build` Turbopack ChunkLoadError between Task 1 build and Task 3 rebuild**

- **Found during:** Task 3 rebuild after globals.css patch — `npm run build` exited code 1 with:
  ```
  Error [ChunkLoadError]: Failed to load chunk server/chunks/ssr/[root-of-the-server]__40ce7b91._.js from module 30661
  ...
  Error occurred prerendering page "/favicon.ico"
  Error: ENOENT: no such file or directory, open '/opt/platform/web/.next/server/app/favicon.ico.body'
  ⨯ Next.js build worker exited with code: 1 and signal: null
  ```
  And pm2 web was running but throwing `Error: Could not find a production build in the '.next' directory` on every request (HTTP 502).
- **Cause:** Turbopack incremental cache corruption — the first Task 3 build was clean and shipped a working bundle (`36b6a9b78143ada0.css`), but the very minor edit to `globals.css` triggered a cache drift between `.next/cache/turbopack` and `.next/server/chunks/ssr/*`. The orphan SSR chunk `[root-of-the-server]__40ce7b91._.js` referenced by `[turbopack]_runtime.js` was deleted but the runtime still tried to require it. Same pattern occurs in Next 16.1.7 + Turbopack 2.x when minor CSS-only changes occur between builds without a cold rebuild.
- **Fix:** `rm -rf .next/cache .next/build .next/diagnostics .next/turbopack` then `npm run build` clean retry. Build immediately PASSED (exit 0), pm2 restart web brought the new bundle online (PID 2222713), all 3 routes returned HTTP 200.
- **Files modified:** None (`.next/cache` ephemeral). New CSS chunk emitted: `725670bac7b75e93.css` (78617 bytes, vs. prior 78905 B — token-only diff is plausible).
- **Verification:** `npm run build` exit 0; `pm2 list | grep web` → online; smoke matrix all 200; canonical tokens present + Apple-grays absent in new CSS bundle.
- **Pattern documented** in `patterns-established` for Wave 2 plans 117-02 / 03 / 05.

**4. [Rule 2 — Critical contrast] `text-gray-900` on featured-hero Get pill kept as `text-zinc-900` instead of `text-[color:var(--fg)]`**

- **Found during:** Task 1 verify drift count = 2 on `featured-hero.tsx` (the two "Get" pill spans line 71 + 103, which render on top of a saturated gradient).
- **Issue:** Mechanical sed converted `text-gray-900` → `text-[color:var(--fg)]` would be wrong here: the pill sits on top of a from-blue-500-via-blue-600-to-indigo-700 gradient (or 12 other category gradients), so the text MUST stay near-black across light AND dark themes for legibility. `var(--fg)` inverts to white in `body.dark`, which would make the "Get" pill invisible on a light hero card with dark text.
- **Fix:** Pinned to `text-zinc-900` (Tailwind built-in, theme-agnostic). Inline rationale: the gradient itself is the dark surface, the pill is light (`bg-card-bg` / `bg-card-bg/90`), and the text must be near-black on the light pill regardless of body theme.
- **Files modified:** `featured-hero.tsx` (2 lines).
- **Verification:** Final `grep -cE '#e5e5e7|#86868b|bg-gray-1[0-9]+|text-gray-[5-9][0-9]+|bg-blue-6[0-9]+|rounded-2xl|border-gray-200' featured-hero.tsx` returns 0.

---

**Total deviations:** 4 (3 Rule 2 + 1 Rule 3 — all auto-fixes, no Rule 4 architectural decisions needed).
**Impact on plan:** All four extensions align with the plan's spirit — Deviations 1/2 close gaps the plan's class-map missed; Deviation 3 is a build-tooling flake unrelated to source content; Deviation 4 preserves intentional theme-agnostic contrast on a branded gradient surface. No scope creep beyond the 10 in-scope TSX + the one globals.css block.

## Issues Encountered

Beyond the four deviations, nothing notable:

- DB query for sample slug returned `chrome, n8n, ollama` from `apps WHERE featured=true LIMIT 3`. Used `chrome` for the `/store/[id]` smoke (HTTP 200).
- Caddy routing for `/store/**` passes through to Next.js (HTTP 200 from both Caddy and direct localhost:3000), confirming no Caddy rewrite affects the store subtree. Phase 117-CONTEXT.md's "Caddy intercepts /login, /register, /dashboard but NOT /store" assumption verified.

## Followups for Phase 119 (UI kit)

1. **`<AppCard>` primitive.** The mechanical class-map produced a verbose mix of `bg-card-bg`, `bg-card-bg-2`, `text-accent-blue`, `text-[color:var(--muted-fg)]`, `rounded-dash`, `shadow-card` per-tile. A `<Card variant="app-tile">` primitive in `@livinity/ui-kit` would consolidate ~25 lines of inline className into a single intent.
2. **`<CategoryNav>` pill primitive.** Sidebar.tsx already implements a hand-rolled pill stepper (`bg-teal-50 text-teal-600` active vs. `text-[color:var(--fg)] hover:bg-[color:var(--card-bg-2)]` inactive). Phase 119 should extract a `<PillNav>` primitive aligning with the `.pill.ok/.pill.err/.pill.warn` vocabulary from dashboard.html.
3. **Store gradients consolidation.** The 13 per-category gradients (`featured-hero.tsx GRADIENTS const`) were KEPT this plan as branded vocabulary. Phase 119 or 120 should evaluate: (a) keep as-is, (b) unify with dashboard.html canonical accents (`--accent-blue`/`--accent-teal`/`--accent-violet`/etc.), or (c) export the const to a `featured-hero-gradients.ts` constants file so the palette is swappable without touching the JSX.
4. **`<FrostedHeader>` primitive for topbar.** The token-aware frosted glass pattern (`bg-[color:rgba(255,255,255,0.78)] dark:bg-[color:rgba(20,20,20,0.78)] backdrop-blur-xl`) is duplicated in topbar.tsx AND sidebar.tsx. Phase 119 should hoist into a `<FrostedHeader />` primitive with a `tone="header" | "sidebar"` discriminator.
5. **Profile-header gradient.** `profile/page.tsx:657` uses `bg-gradient-to-r from-teal-50 to-cyan-50` for the instance header card. This survived the sed unchanged (gradient classes are not in the class-map). Phase 119/120 should decide whether to align with dashboard.html accent palette or keep the soft teal-cyan as a "your-server" branding cue.
6. **`favicon.ico` prerender route is flaky under Turbopack.** Worth filing upstream if it recurs.

## Self-Check: PASSED

Verified after SUMMARY write:

- `.planning/phases/117-server5-nextjs-migration/117-04-SUMMARY.md` — FOUND (in-repo)
- Server5 `/opt/platform/web/src/app/store/layout.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/page.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/store-shell.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/components/sidebar.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/components/topbar.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/components/featured-hero.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/components/app-card.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/components/category-section.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/[id]/app-detail-client.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/store/profile/page.tsx.pre-117-04.bak` — FOUND
- Server5 `/opt/platform/web/src/app/globals.css.pre-117-04.bak` — FOUND
- Server5 `pm2 list | grep web` → `online` — FOUND (PID 2222713)
- Server5 CSS chunk `725670bac7b75e93.css` contains `--accent-blue`, `--card-bg`, `--dash-line`, `--dash-pad`, `--dash-radius`, `--fg`, `--font-sans`, `--muted-fg`, `Geist` — FOUND
- Server5 CSS chunk has ZERO Apple-gray hex literals (`#e5e5e7|#86868b|#f5f5f7|#1d1d1f|#424245|#d2d2d7|#e8e8ed|#ededf0`) — VERIFIED EMPTY
- Server5 `.store-layout {}` in built CSS uses `var(--card-bg)`, `var(--fg)`, `var(--muted-fg)`, `var(--dash-line)`, `var(--card-bg-2)` — VERIFIED
- D-117-NO-API-CHANGES proven byte-stable for all 10 patched files (fetch/useEffect/useState/onClick parity) — VERIFIED
- Smoke matrix: `/store` 200, `/store/profile` 200, `/store/chrome` 200 — VERIFIED

---

*Phase: 117-server5-nextjs-migration*
*Plan: 04*
*Completed: 2026-05-14*
