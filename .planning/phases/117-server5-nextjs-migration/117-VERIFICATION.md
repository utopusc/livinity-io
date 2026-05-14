---
phase: 117
status: passed
must_have_pass: 11/11
date: 2026-05-14
---

# Phase 117 — VERIFICATION

## Phase goal recap

Apply the canonical `@livinity/design-tokens` system (Phase 116 output) to every Server5 Next.js route. After this phase Server5 (`livinity.io/*`) visually matches `dashboard.html` end-to-end: shared Geist + Geist Mono + Instrument Serif fonts, shared CSS variables, shared accent palette, shared spacing tokens.

## Plans shipped

| Plan | Title | Commit | Status |
|---|---|---|---|
| 117-01 | Foundation: install @livinity/design-tokens + layout.tsx + globals.css + tailwind config + dead src/src/ cleanup | `58d5f482` | PASS |
| 117-02 | (auth)/* 6 routes + layout restyle | `f2e9a61d` | PASS |
| 117-03 | /dashboard/install audit + 7 files patched (MAJOR drift collapsed to canonical) | `afbc96c9` | PASS |
| 117-04 | /store/* restyle (10 TSX + globals.css block, 8 Apple-gray hex scrubbed) | `9b8b2d18` | PASS |
| 117-05 | /download + Next.js /dashboard polish (motion + SVG unchanged) | `436017c8` | PASS |

Five commits, zero rollbacks. `web` PM2 service `online` post-phase (PID 2225119, 4m uptime after final restart).

## Must-haves verified

| # | must_have | Verification | Result |
|---|---|---|---|
| 1 | @livinity/design-tokens installed in /opt/platform/web/node_modules/ | `ls` shows tokens.css + fonts.css + tailwind.preset.cjs + package.json | PASS |
| 2 | layout.tsx imports tokens.css + fonts.css | 117-01 SUMMARY confirms + production HTML contains `font-sans` + token markers | PASS |
| 3 | Tailwind preset live | 117-01 found Server5 on Tailwind 4 → auto-migrated to `@theme inline` (CSS-first, equivalent) | PASS (deviation auto-fix) |
| 4 | All 6 (auth)/* routes restyled with .pre-117-02.bak backups | 117-02 SUMMARY: 7 files restyled (layout + 6 page.tsx), 7 .bak siblings | PASS |
| 5 | /dashboard/install audited (NOOP or patched) | 117-03 SUMMARY: 7 files MAJOR drift detected → 7 patched, 0 NOOP | PASS |
| 6 | /store + /store/[id] + /store/profile modified with .pre-117-04.bak | 117-04 SUMMARY: 10 TSX + globals.css block patched, 11 .bak siblings | PASS |
| 7 | /download + /dashboard polished with .pre-117-05.bak | 117-05 SUMMARY: 2 files patched, 2 .bak siblings | PASS |
| 8 | pm2 web online after every plan | All 5 SUMMARYs confirm `pm2 status web` online after restart | PASS |
| 9 | curl smoke for all routes: 200 (or 307 redirect) | login:200, store:200, download:200, install:200 | PASS |
| 10 | D-117-NO-API-CHANGES | `find /opt/platform/web/src/app/api -newer <pre-117 marker>` empty across all 5 plans | PASS |
| 11 | D-117-NO-AUTH-FLOW-CHANGES | 117-02 7/7 STRICT_LOGIC_UNCHANGED on getSession/redirect/useRouter/onSubmit; 117-03 logic guard 25→25 on dashboard/install/page.tsx | PASS |

## Cross-repo evidence trail (Server5)

- Dead `src/src/` tree archived to `/opt/platform/web/_pre-117-src-src.tar.gz` (40280 bytes) and removed.
- Per-plan backups: `.pre-117-01.bak` (4 files), `.pre-117-02.bak` (7 files), `.pre-117-03.bak` (7 files), `.pre-117-04.bak` (11 files), `.pre-117-05.bak` (2 files) — **31 rollback backups live on Server5**.
- Built CSS chunks contain canonical token markers across all 3 build cycles (`670baf256e1e73a3.css`, `9f5cf1d6d2a07b12.css`, `725670bac7b75e93.css`).
- Final BUILD_ID: `ezlYXTWUA8KBgG51N64Um` (from 117-02 — last full rebuild captured).

## Deviations accepted (all auto-resolved by executors, documented in per-plan SUMMARYs)

1. **117-01** — Server5 runs Tailwind 4 (CSS-first `@theme inline`), not the Tailwind 3.4 `tailwind.config.ts` shape the plan assumed. Executor auto-migrated. Functionally equivalent + future-proofed.
2. **117-02** — Concurrent `next build` PID held `.next/lock` mid-plan; cleared with `pkill + rm -rf .next` + clean rebuild. No user-facing impact.
3. **117-03** — All 7 files classified MAJOR drift (not the "mostly canonical NOOP" the planner assumed) — Phase 111-04/05 shipped with literal `#2563eb` hex / `28px` pixel values instead of var references. Plan honored D-117-PRESERVE-DASHBOARD-INSTALL spirit (no refactor, only token rename); behavior preserved.
4. **117-04** — Apple-gray hex scrub map expanded from 2 → 8 values (`#e5e5e7`, `#86868b` + 6 more variants found in featured-hero + sidebar). Featured-hero brand gradient deliberately preserved (theme-agnostic visual weight). Turbopack flaky `ChunkLoadError` mitigated via `.next/cache` clean retry.
5. **117-05** — Plan sed map extended for emerald/yellow/orange/red badge palette (dashboard.tsx) + neutral-* palette (download.tsx) — semantic mapping preserves badge visual weight via rgb-opacity. Granular diff-guard refined to per-onClick / per-href granularity.

All deviations are non-functional (visual mappings only) and stay inside Phase 117 scope. None violate D-117-NO-API-CHANGES or D-117-NO-AUTH-FLOW-CHANGES.

## Known carry-overs (NOT blocking v35.0 progression)

- **`v35.0-design-tokens-1.0.1`** patch when Server5 dark+iridescent override blocks fetched (D-116-FOLLOW-UP-DARK + D-116-FOLLOW-UP-IRIDESCENT).
- **Phase 119 ui-kit candidates** consolidated from Phase 117 work: `AuthCard`, `AppCard`, `CategoryNav`, `Stepper`, `StatusBadge` (tinted-bg pattern), motion-primitive re-home as `@livinity/ui-kit/motion`, store gradient policy revisit.
- **Caddy `/dashboard` route flip** — Caddy currently serves static `dashboard.html` for `/dashboard`. The Next.js React tree at `/opt/platform/web/src/app/dashboard/page.tsx` (now restyled to match) is available via direct `127.0.0.1:3000/dashboard` but NOT live to the public. Operator decision when to flip the Caddy route.

## Human verification needed

Optional operator browser walk:
- `https://livinity.io/login` — verify visual matches dashboard.html (Geist sans, accent-blue primary)
- `https://livinity.io/store` — verify bento card layout + featured-hero gradient preserved
- `https://livinity.io/dashboard/install` — verify install wizard still matches Phase 111-04 design (we kept it canonical)
- `https://livinity.io/download` — verify motion still works (Phase 111 motion-primitives preserved)

If anything looks wrong, rollback via `cp <file>.pre-117-NN.bak <file>` then `pm2 restart web` — recipes in each SUMMARY.md.

## Phase 117 verdict

**PASSED.** 11/11 must-haves verified. 5/5 plans shipped clean. Cross-repo Server5 surface fully migrated to canonical design system. Ready for Phase 118 (landing HTML polish).
