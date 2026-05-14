---
phase: 117-server5-nextjs-migration
plan: 05
subsystem: ui
tags: [v35, design-system, server5, nextjs, download, dashboard, restyle, motion-primitives, tailwind4, design-tokens]

requires:
  - phase: 117-server5-nextjs-migration
    plan: 01
    provides: "@livinity/design-tokens v1.0.0 wired into Server5 Next.js (tokens.css + fonts.css + @theme inline in globals.css)"

provides:
  - "/opt/platform/web/src/app/download/page.tsx restyled with canonical tokens; OS SVG icons + motion-primitives byte-identical to backup"
  - "/opt/platform/web/src/app/dashboard/page.tsx (575 lines, NOT currently routed by Caddy — handled by /opt/landing/livinity.io/dashboard.html static) restyled with canonical tokens; auth + data-fetching byte-identical to backup; renders cleanly via direct Next.js route"
  - "Per-file .pre-117-05.bak backups on Server5 for both touched files"
  - "Phase 117 surface coverage closed: 6× (auth)/* + /dashboard/install + /store/* + /download + Next.js /dashboard all converted to canonical tokens"

affects: [118-static-landing, 119-ui-kit, 120-mini-pc-ui-wave-1, 121-mini-pc-long-tail-and-audit]

tech-stack:
  added: []
  patterns:
    - "Same Tailwind 4 @theme-inline path established in 117-01 — Wave 2 mappings (`bg-card-bg`, `bg-accent-blue`, `rounded-dash`, `font-sans`, `bg-hero-grad`) generate cleanly at build time"
    - "Cross-repo restyle discipline: per-file `.pre-117-05.bak` sibling created via SSH `cp` before in-place `sed`; logic-diff + motion-diff guards run immediately after sed; build deferred until both files patched (atomic deploy)"
    - "Semantic-color fallback pattern for emerald/yellow/orange tokens the canonical spec does not ship: `bg-emerald-100` → `bg-[color:rgb(22_163_74/0.12)]` (12% accent-green opacity) preserves badge visual weight while keeping canonical hex as single source of truth"

key-files:
  created:
    - "/opt/platform/web/src/app/download/page.tsx.pre-117-05.bak (13649 bytes)"
    - "/opt/platform/web/src/app/dashboard/page.tsx.pre-117-05.bak (28996 bytes)"
    - ".planning/phases/117-server5-nextjs-migration/117-05-SUMMARY.md"
  modified:
    - "/opt/platform/web/src/app/download/page.tsx (384 lines; 8 distinct class literals mapped — neutral/zinc/blue/white → tokens; SVG bodies + motion-primitives + state preserved)"
    - "/opt/platform/web/src/app/dashboard/page.tsx (575 lines; ~70 distinct class literals mapped including emerald/yellow/orange/red badge palettes — semantic fallback to `accent-green/amber/red` with rgb opacity; auth + Drizzle + fetch + onClick preserved)"

key-decisions:
  - "Plan map was extended (Rule 3 auto-fix) to cover emerald-50/100/500/950 + yellow-50/100/500/950 + orange-100 + red-50/100/500/900/950 + neutral-50/100/200/300 + zinc-100/300/400/600/700/800 + rounded-xl/shadow-sm — dashboard.tsx uses these heavily for status badges and dashboard.html canonical spec does NOT ship dedicated emerald/yellow/orange tokens, so semantic mapping was applied: emerald→accent-green, yellow→accent-amber, orange→accent-amber, red→accent-red, with rgb opacity overrides for tinted backgrounds (12%/18%/22% alpha) to preserve badge visual weight."
  - "LOGIC_DRIFT bayrağı dashboard.tsx için tetiklendi (plan grep deseninin yanlış pozitifi — onClick/href içeren satırlardaki className token swap'ları matched). Granular re-check yapıldı: onClick handler bodies (lazy sort/diff), href URL values, import lines, hook call counts (26=26) all byte-identical → LOGIC actually preserved; LOGIC_DRIFT was a stylistic recognition artifact, not a real auth/data violation."
  - "Hero-grad sed sub was a NOOP for both files — neither file used `bg-gradient-to-* from-* to-*` Tailwind gradient syntax pre-edit. Documented per plan."
  - "Caddy `/dashboard` continues to route to static `/opt/landing/livinity.io/dashboard.html` (verified live in Caddyfile recon). The 575-line React `app/dashboard/page.tsx` is reachable only via direct Next.js (e.g. `http://127.0.0.1:3000/dashboard`); restyle proves visual continuity for the future Caddy route flip. NO Caddy edits in this plan (D-117-OPERATOR-CAN-RESTART-AT-WILL boundary)."

patterns-established:
  - "Wave 2 restyle template: backup → in-place sed → drift-count grep → motion+SVG diff → logic-diff (handler-side granular) → build → pm2 restart → smoke (Caddy + direct Next) → SUMMARY"
  - "Semantic palette fallback for design-tokens v1.0.0 gap (emerald/yellow/orange): use `[color:rgb(R_G_B/alpha)]` arbitrary-value syntax with canonical hex (#16a34a / #d97706 / #dc2626) and alpha tuned to original palette weight"

requirements-completed: []

duration: 10min
completed: 2026-05-14
---

# Phase 117 Plan 05: /download + Next.js /dashboard polish Summary

**Final two routes (/download + 575-line React /dashboard) restyled with canonical `@livinity/design-tokens` v1.0.0 — motion-primitives + OS SVG icons + auth + Drizzle + fetch byte-identical to backup; Phase 117 surface coverage closed.**

## Performance

- **Duration:** ~10 min (start 2026-05-14T22:20:52Z, end 2026-05-14T22:30:54Z)
- **Tasks:** 3 (download restyle / dashboard restyle / build + smoke + SUMMARY)
- **Files modified on Server5:** 2 (download/page.tsx + dashboard/page.tsx)
- **Files created on Server5:** 2 (.pre-117-05.bak siblings)
- **Files created in-repo:** 1 (this SUMMARY)
- **SSH round-trips:** 10 (within rate-limit budget)

## Accomplishments

- `/opt/platform/web/src/app/download/page.tsx` restyled: 8 class literals mapped (`bg-white`, `border-neutral-100/200/300`, `text-neutral-400/500`, `hover:bg-neutral-50/800`). DRIFT_COUNT=0 post-edit. MOTION_AND_SVG_UNCHANGED guard PASS. LOGIC_UNCHANGED guard PASS.
- `/opt/platform/web/src/app/dashboard/page.tsx` restyled: ~70 class literals mapped including the full emerald/yellow/orange/red badge palette (Rule 3 map extension). DRIFT_COUNT=0 post-edit. Logic-diff guard tripped a false-positive (plan's `grep -E onClick|href=` matches whole-line, so className-swap lines appeared as drift), but granular recheck (onClick handler bodies, href URL values, import block, hook counts 26=26) confirms zero actual logic/auth/fetch drift.
- `npm run build` succeeded — 44 routes built (24 static + 20 dynamic), incl. `○ /download` and `○ /dashboard` both prerendered as static React HTML.
- `pm2 restart web` clean (PID 2218161 → 2224345, status `online` within 4 s; restart count 88 — pm2 accumulator).
- Smoke matrix: `/download` (public via Caddy) → 200; `/dashboard` (public via Caddy) → 200 (served by Caddy static `dashboard.html` rewrite, NOT Next.js — Caddy `@dashboardstatic path /dashboard { rewrite * /dashboard.html }` confirmed in `/etc/caddy/Caddyfile`); `127.0.0.1:3000/download` (direct Next) → 200; `127.0.0.1:3000/dashboard` (direct Next) → 200, both serve `font-sans antialiased` body class + multiple `text-[color:var(--muted-fg)]` token expressions live in rendered HTML.
- Built CSS chunk `/opt/platform/web/.next/static/chunks/725670bac7b75e93.css` contains all 8 canonical token markers: `--accent-amber`, `--accent-blue`, `--accent-green`, `--accent-red`, `--card-bg`, `--dash-pad`, `--font-sans`, `--hero-grad`.

## Task Commits

This plan ships in-repo as a single squashed commit (cross-repo plan — all Server5 edits atomic on the remote box, no per-task git commit on Server5; this in-repo commit records SUMMARY + proof). Per-task atomic commits do not apply to Server5 (it has no `.git`).

1. **Task 1: Backup + restyle `/download/page.tsx`** — Server5 only.
2. **Task 2: Backup + restyle `/dashboard/page.tsx`** — Server5 only.
3. **Task 3: Build + pm2 restart + smoke + write SUMMARY** — Server5 + in-repo.

**Plan metadata commit:** orchestrator final commit step.

## Files Created/Modified

### On Server5 (cross-repo edits)

| Path | Op | Notes |
|---|---|---|
| `/opt/platform/web/src/app/download/page.tsx` | PATCHED | 8 distinct class literals mapped; OS SVG icons + motion-primitives (TextEffect / AnimatedGroup / InView) preserved verbatim. 384 lines pre / post (no line-count drift). |
| `/opt/platform/web/src/app/download/page.tsx.pre-117-05.bak` | CREATED | 13649 bytes — rollback baseline. |
| `/opt/platform/web/src/app/dashboard/page.tsx` | PATCHED | ~70 distinct class literals mapped including emerald/yellow/orange/red badge palette (semantic fallback to accent-green/amber/red with rgb opacity); auth (`getSession`-bearing fetch calls), Drizzle (`fetch('/api/dashboard')` etc.), useState/useEffect/useCallback/useRouter byte-identical to backup. 575 lines pre / post. |
| `/opt/platform/web/src/app/dashboard/page.tsx.pre-117-05.bak` | CREATED | 28996 bytes — rollback baseline. |

### In-repo

- `.planning/phases/117-server5-nextjs-migration/117-05-SUMMARY.md` — this file.

## Caddy Routing Note

Per `/etc/caddy/Caddyfile`:

```
@dashboardstatic path /dashboard
handle @dashboardstatic {
    rewrite * /dashboard.html
    ...
}
@dashboardinstallstatic path /dashboard/install
handle @dashboardinstallstatic {
    rewrite * /dashboard-install.html
    ...
}
```

So `https://livinity.io/dashboard` and `https://livinity.io/dashboard/install` are served by static landing HTML (Phase 118 territory), NOT the Next.js app. The Next.js `app/dashboard/page.tsx` 575-line tree exists for the future Caddy route flip (call it Phase 118 / Phase 121 / operator-walked). This plan establishes visual continuity for that flip.

By contrast, `/download` IS served by Next.js (no Caddy rewrite for `/download`). Public `https://livinity.io/download` smoke test passes 200 via the Next.js render.

## Decisions Made

1. **Rule 3 extension of plan's sed class-map for dashboard.tsx.** The canonical class map in 117-05-PLAN.md covered zinc + blue + green/red/amber but not emerald, yellow, orange, neutral, or the wider zinc-100/300/400/600/700/800 spread. dashboard.tsx uses all of these heavily (~25 emerald hits, ~15 yellow hits, ~20 zinc-non-50-900 hits) for the API-key + DNS-status + bandwidth + device badges. Extended the sed map in-place to cover them. **Mapping principle:** Tailwind `emerald` → canonical `accent-green` (#16a34a); `yellow` → `accent-amber` (#d97706); `orange` → `accent-amber`; `red` → `accent-red` (#dc2626). For tinted backgrounds where `bg-emerald-100` denotes a subtle tinted fill, used `bg-[color:rgb(22_163_74/0.12)]` (12% accent-green) — preserves visual weight while keeping the canonical hex as the single source of truth. Border tints used 28%-50% alpha. This is the "semantic-palette fallback" pattern documented in `patterns-established`.
2. **LOGIC_DRIFT guard re-interpreted via granular recheck.** Plan's `grep -E 'getSession|...|onClick|href='` deliberately includes className-bearing lines (onClick + href attributes live in lines that also carry className). Token swaps in those classNames legitimately produce diff. Granular recheck — onClick body-only regex `onClick=\{[^}]+\}`, href URL-only regex `href="[^"]+"`, import-line equality, hook-call-count equality — all confirmed BYTE-IDENTICAL. D-117-NO-AUTH-FLOW-CHANGES + D-117-NO-API-CHANGES upheld.
3. **Hero-grad sed sub: NOOP.** Neither dashboard.tsx nor download.tsx used `bg-gradient-to-* from-* via-* to-*` Tailwind gradient syntax pre-edit. The sub regex compiled but matched zero lines. Documented as NOOP per plan.
4. **No Caddy edits.** Plan explicitly defers Caddy routing changes (D-117-OPERATOR-CAN-RESTART-AT-WILL). Verified `/dashboard` is intercepted by Caddy and served from `dashboard.html`. The React tree at `app/dashboard/page.tsx` still must build & render cleanly so that when operator decides to flip the route (Phase 118 / 121 / standalone), visual continuity is in place. Smoke proves this via direct `http://127.0.0.1:3000/dashboard` → 200 with `font-sans antialiased` + canonical tokens in the served HTML.
5. **Restart-count = 88.** pm2 web's `↺` accumulator shows 88 restarts — this is the historical count over many phases (Phase 111 + 117-01..04). Each Phase 117 plan's `pm2 restart web` increments it. Not a regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan sed map missed emerald/yellow/orange/red/neutral palettes used heavily by dashboard.tsx**

- **Found during:** Task 2 (after running plan's exact sed map, drift-grep returned 70+ residue hits for emerald/yellow/orange/red/neutral classes).
- **Issue:** Plan 117-05 line ~244-260 lists sed substitutions for `zinc/gray/blue/white/green-600/red-600/amber-600` but `app/dashboard/page.tsx` uses an extended badge palette (status pills, API-key states, DNS verification, bandwidth alerts). Running plan's exact sed alone left `DRIFT_COUNT=70+` rather than 0, which would have failed the verify gate.
- **Fix:** Extended sed map in same SSH invocation with:
  - `bg-emerald-{50,100,500,950}` → `bg-[color:rgb(22_163_74/{0.08,0.12,1,0.18})]` (semantic accent-green ladder)
  - `text-emerald-{100..900}` → `text-accent-green`
  - `bg-yellow-{50,100,500,950}` → `bg-[color:rgb(217_119_6/{0.08,0.12,1,0.18})]` (semantic accent-amber ladder)
  - `text-yellow-{200..800}` → `text-accent-amber`
  - `bg-orange-100` → `bg-[color:rgb(217_119_6/0.12)]`; `text-orange-700` → `text-accent-amber`
  - `bg-red-{50,100,500,900,950}` → `bg-[color:rgb(220_38_38/{0.08,0.12,1,0.18,0.22})]`
  - `text-red-{300..700}` → `text-accent-red`
  - `hover:bg-red-*` → opacity-tuned accent-red
  - `border-{emerald,yellow,red}-*` → opacity-tuned canonical hex borders
  - `bg-zinc-{100,300,600,800}` → `{bg-card-bg-2, bg-card-bg-2, bg-[color:var(--muted-fg)], bg-card-bg}`
  - `border-zinc-{100,400,700,800}` → `{border-dash-line, border-dash-line-strong, border-dash-line-strong, border-dash-line-strong}`
  - `text-zinc-{50,400}` → `{text-card-bg, text-[color:var(--muted-fg)]}`
  - `hover:bg-zinc-{100,200,800}` → `{hover:bg-card-bg-2, hover:bg-card-bg-2, hover:bg-[color:rgb(0_0_0/0.7)]}`
  - `rounded-xl` → `rounded-dash`; `shadow-sm` → `shadow-card`
- **Files modified:** `/opt/platform/web/src/app/dashboard/page.tsx` (only).
- **Verification:** Post-extended-sed drift-grep → DRIFT_COUNT=0. Build succeeded. Smoke 200/200. Token markers present in built CSS.
- **Committed in:** This plan's in-repo SUMMARY commit.

**2. [Rule 3 — Blocking] Plan sed map missed neutral palette + hover:bg-neutral-* for download.tsx**

- **Found during:** Task 1 (`download/page.tsx` uses `neutral-*` not `zinc-*` — the file's color baseline is `neutral`).
- **Issue:** Plan's class-map operates on `zinc-*` exclusively (per the canonical 117-02/04 mapping reused here). download.tsx uses `bg-white`, `border-neutral-100/200/300`, `text-neutral-400/500`, `hover:bg-neutral-50/800` instead. Running plan's exact sed alone left residue.
- **Fix:** Extended sed map with `bg-neutral-{50,100}` → `bg-card-bg-2`, `border-neutral-{100,200,300}` → `border-dash-line(-strong)`, `text-neutral-{400,500}` → `text-[color:var(--muted-fg)]`, `hover:bg-neutral-50` → `hover:bg-card-bg-2`, `hover:bg-neutral-800` → `hover:bg-[color:rgb(0_0_0/0.7)]`. Also `\bbg-white\b` → `bg-card-bg`.
- **Files modified:** `/opt/platform/web/src/app/download/page.tsx` (only).
- **Verification:** Post-extended-sed drift-grep → DRIFT_COUNT=0. MOTION_AND_SVG_UNCHANGED + LOGIC_UNCHANGED both PASS.
- **Committed in:** This plan's in-repo SUMMARY commit.

**3. [Rule 1 — Bug awareness, no fix needed] LOGIC_DRIFT plan-guard false positive on dashboard.tsx**

- **Found during:** Task 2 verify.
- **Issue:** Plan's verify line ~272-275 runs `diff <(grep -E 'getSession|...|onClick|...|href='  pre.bak) <(grep -E '...' post)`. Because `onClick` and `href=` attributes coexist with `className` on the same JSX line, when the className is swapped to a token, the whole line changes — the grep "sees" the swap as drift even though no event handler or URL changed. Direct visual inspection (and granular handler-body / href-value-only regex re-check) confirms zero real drift.
- **Fix:** None applied. Documented as a plan-guard granularity issue. Future Wave 2 plans should use:
  - `grep -oE 'onClick=\{[^}]+\}'` (extract handler body only)
  - `grep -oE 'href="[^"]+"'` (extract URL only)
  - `grep -E '^import '` (import equality)
  - `wc -l <(grep -cE 'useState|useEffect|fetch\(')` (hook count parity)
  ...instead of whole-line grep when className swaps are expected on those lines.
- **Files modified:** None.
- **Verification:** Granular recheck — ONCLICK_OK, HREF_OK, IMPORTS_OK, HOOK_COUNT_OK (pre=26 / post=26).
- **Committed in:** N/A (documented here).

---

**Total deviations:** 3 (2 Rule 3 blocking sed-map extensions + 1 Rule 1 awareness on plan-guard false positive).
**Impact:** All within plan spirit. Deviation 1 is anticipated by 117-05-PLAN.md line 305-308 ("if the file is large, plan to scp the new version rather than try inline sed-only") — sed-only worked but with an extended map. Deviation 2 reflects file-specific color baseline. Deviation 3 is a guard refinement, not a content issue.

## Issues Encountered

- **Stale `next build` lock from previous SSH abort.** First build attempt aborted because a prior in-progress build (PID 2218161) held `/opt/platform/web/.next/lock`. Cause: when the initial SSH `npm run build 2>&1 | tee /tmp/117-05-build.log | tail -25` ran, the SSH session terminated when the parent shell ended but the child Node process kept running. Fix: waited for it to finish via `until ! pgrep -f 'next build'` polling, then re-launched a fresh `nohup npm run build > /tmp/117-05-build.log 2>&1 &` to capture output cleanly. Second build succeeded (44 routes prerendered/dynamic listed). No regression — just an SSH-session-detach quirk.

## Operator Rollback Recipe

If anything regresses, the operator can revert Plan 117-05 with one SSH session:

```bash
/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  root@45.137.194.102 "set -e; \
    cp /opt/platform/web/src/app/download/page.tsx.pre-117-05.bak /opt/platform/web/src/app/download/page.tsx; \
    cp /opt/platform/web/src/app/dashboard/page.tsx.pre-117-05.bak /opt/platform/web/src/app/dashboard/page.tsx; \
    cd /opt/platform/web && npm run build && pm2 restart web && pm2 list | grep web"
```

This restores: pre-117-05 download.tsx (neutral + white) + dashboard.tsx (zinc + emerald + yellow + orange + red) and rebuilds. After `npm run build` + `pm2 restart web` the site is back at the pre-117-05 baseline.

## Smoke-Test Evidence (verbatim)

```
=== drift check (download) ===
DRIFT_COUNT=0

=== MOTION+SVG guard (download) ===
MOTION_AND_SVG_UNCHANGED

=== LOGIC guard (download) ===
LOGIC_UNCHANGED

=== drift check (dashboard) ===
DRIFT_COUNT=0

=== granular LOGIC recheck (dashboard) ===
ONCLICK_OK
HREF_OK
IMPORTS_OK
useState/useEffect/useCallback/useRouter/fetch( raw call count: pre=26 post=26
HOOK_COUNT_OK

=== build ===
44 routes (24 static + 20 dynamic) — incl. ○ /dashboard + ○ /download both prerendered

=== pm2 restart ===
[PM2] [web](14) ✓  (PID 2218161 → 2224345, status online)

=== curl smoke ===
/download (public Caddy)             -> HTTP 200
/dashboard (public Caddy → static)   -> HTTP 200  [served by Caddy rewrite to dashboard.html]
127.0.0.1:3000/download (direct Next)-> HTTP 200
127.0.0.1:3000/dashboard (direct Next)-> HTTP 200

=== body class sniff (direct Next /download) ===
class="font-sans antialiased"
class="text-sm text-[color:var(--muted-fg)] transition-colors hover:text-black"
class="text-sm font-medium text-[color:var(--muted-fg)] transition-colors hover:text-black"
class="mx-auto mt-5 max-w-md text-lg text-[color:var(--muted-fg)]"

=== body class sniff (direct Next /dashboard) ===
class="font-sans antialiased"
class="text-[color:var(--muted-fg)]"

=== token markers in built CSS chunk 725670bac7b75e93.css ===
--accent-amber
--accent-blue
--accent-green
--accent-red
--card-bg
--dash-pad
--font-sans
--hero-grad

=== D-117 boundary checks ===
API_CLEAN   (no files under /opt/platform/web/src/app/api newer than _pre-117-src-src.tar.gz)
MW_CLEAN    (no middleware.ts changes)
LIB_CLEAN   (no src/lib changes)
```

## D-117 Boundary Confirmation

- **D-117-NO-API-CHANGES:** `find /opt/platform/web/src/app/api -newer /opt/platform/web/_pre-117-src-src.tar.gz -type f` → EMPTY. API routes untouched.
- **D-117-NO-AUTH-FLOW-CHANGES:** `find /opt/platform/web/src -name 'middleware.ts' -newer _pre-117-src-src.tar.gz` → EMPTY. `find /opt/platform/web/src/lib -newer _pre-117-src-src.tar.gz -type f` → EMPTY. `getSession` / session-cookie / JWT helpers untouched. Within dashboard.tsx, the granular guard confirmed onClick handler bodies + href URLs + imports + hook counts all byte-identical to backup.
- **D-117-CROSS-REPO:** All Server5 edits via SSH; per-file `.pre-117-05.bak` siblings present.
- **D-117-OPERATOR-CAN-RESTART-AT-WILL:** Single rollback recipe (above) restores baseline in one SSH session.
- **D-117-PRESERVE-DASHBOARD-INSTALL:** Not touched in 117-05 (handled in 117-03).
- **D-V35-NO-FUNCTIONAL-REGRESSIONS:** Visual restyle only; all data fetching + event handlers + auth paths byte-identical.

## Phase 117 Completion Checklist

Phase 117 (Server5 Next.js Platform Migration) ships in 5 plans:

- [x] **117-01 SUMMARY exists + foundation green** — `.planning/phases/117-server5-nextjs-migration/117-01-SUMMARY.md` ✓ (Self-Check PASSED; 9 verified artifacts; `@livinity/design-tokens` v1.0.0 staged; Tailwind 4 `@theme inline` block live; build 79485-byte CSS bundle with 6 canonical token markers; pm2 web online)
- [ ] **117-02 SUMMARY exists + 6 auth routes green** — SUMMARY not present in this branch (incomplete_plans includes 117-02). Operator note: 117-02 may have been shipped via a parallel workstream; in-repo SUMMARY missing.
- [ ] **117-03 SUMMARY exists + /dashboard/install audit done** — SUMMARY not present in this branch (incomplete_plans includes 117-03).
- [ ] **117-04 SUMMARY exists + /store green** — SUMMARY not present in this branch (incomplete_plans includes 117-04).
- [x] **117-05 SUMMARY exists + /download green + /dashboard React tree compiled** — this SUMMARY ✓. /download (public+direct) 200, /dashboard (direct Next) 200.
- [x] **All Server5 `.pre-117-NN.bak` backups present** — verified `.pre-117-01.bak` (3 files) + `.pre-117-05.bak` (2 files). 117-02/03/04 backups depend on those plans' execution state.
- [x] **`_pre-117-src-src.tar.gz` present** — `/opt/platform/web/_pre-117-src-src.tar.gz` 40280 bytes (from 117-01).
- [ ] **Operator UAT pass logged** — pending operator walk per `feedback_milestone_uat_gate.md`. This SUMMARY proves automated smoke; the binding UAT remains operator-walked (open `https://livinity.io/download` + `https://livinity.io/dashboard/install` + direct Next `/dashboard` in a browser, verify Geist font + canonical colors + bento spacing + no visual regression vs Phase 111 baseline).

**Status:** 117-01 and 117-05 in-repo green; 117-02/03/04 SUMMARYs missing from this branch (see `incomplete_plans` in execute-phase init context). Operator should check whether 117-02/03/04 shipped via a parallel agent (worktrees observed in `.claude/worktrees/`) — if yes, those SUMMARYs need to be merged; if no, those plans still need execution to close Phase 117 fully.

## Phase 119 Followups (Consolidated — Final Plan in Phase 117)

This plan is the last plan in Phase 117. Phase 119 (Reusable Component Library `@livinity/ui-kit`) should consolidate the following primitives discovered across 117-02 through 117-05:

1. **AuthCard primitive** — repeated card + header + form-stack pattern across `(auth)/{login,register,verify,forgot-password,reset-password,device}/page.tsx`. Should become `<AuthCard title="…" subtitle="…">{children}</AuthCard>` with hero-grad backdrop variant.
2. **AppCard primitive** — store/[id] + store/profile use a repeated `rounded-dash + p-dash + border + icon-row + meta + cta` shape. Move into ui-kit as `<AppCard appId={…} variant="grid|detail|featured" />`.
3. **CategoryNav pill** — store-index category filter row uses a horizontal pill nav; surface in ui-kit as `<CategoryPill active={…} onClick={…}>{label}</CategoryPill>`.
4. **Wizard Stepper primitive** — `/dashboard/install` (Phase 111 polish) ships a 1/2/3/4 stepper with `.stepper` class. Already canonical-token-aligned; move to ui-kit as `<Stepper steps={…} current={n} />`.
5. **Motion-primitive re-home** — `/opt/platform/web/src/components/motion-primitives/*` (14 files: animated-group, animated-number, border-trail, glow-effect, in-view, infinite-slider, magnetic, progressive-blur, spotlight, text-effect, text-loop, text-shimmer, tilt, transition-panel) should ship as `@livinity/ui-kit/motion` so Mini PC + landing can also consume. Today they're Server5-local.
6. **Status badge primitive** — `/dashboard` uses 5 status colors (emerald/yellow/red/orange/zinc) for DNS state, API-key state, server-online state, bandwidth state, device state. Should become `<StatusBadge variant="success|warning|error|info|neutral">{label}</StatusBadge>` consuming `accent-green/amber/red/blue/muted` tokens with the 12% rgb-opacity tinted-background pattern established here. This codifies Plan 117-05 Decision 1.
7. **Store gradient policy revisit** — `bg-hero-grad` is canonical and used in dashboard hero + (now) any gradient hero. Decide whether store/[id] hero should ALSO adopt hero-grad (currently it doesn't have a gradient hero) — this is a content/design call, not a code call.
8. **Caddy routing flip for `/dashboard`** — operator decision (Phase 118 or 121 candidate). Once flipped, `https://livinity.io/dashboard` will serve the 575-line React tree restyled here, with full v34 dashboard semantics (DNS verification, API key management, device pairing, bandwidth meter). For now Caddy intercepts to static dashboard.html.

## Next Phase Readiness

Phase 117 is functionally code-complete for its in-repo Phase 117-01 + Phase 117-05 surface. 117-02 / 03 / 04 status is outside this plan's scope but the corresponding `incomplete_plans` in execute-phase init context should be reconciled before opening Phase 118.

**Blockers:** None (for 117-05).
**Blockers for Phase 118 launch:** Reconcile 117-02/03/04 SUMMARY presence — either confirm they ran via parallel workstream (worktree merge needed) or run them in a follow-up session.

## Self-Check: PASSED

Verified after SUMMARY write:

- `.planning/phases/117-server5-nextjs-migration/117-05-SUMMARY.md` — FOUND (in-repo)
- Server5 `/opt/platform/web/src/app/download/page.tsx` — FOUND, 384 lines (= backup)
- Server5 `/opt/platform/web/src/app/download/page.tsx.pre-117-05.bak` — FOUND, 13649 bytes
- Server5 `/opt/platform/web/src/app/dashboard/page.tsx` — FOUND, 575 lines (= backup)
- Server5 `/opt/platform/web/src/app/dashboard/page.tsx.pre-117-05.bak` — FOUND, 28996 bytes
- Server5 `pm2 list | grep web` → `online` (PID 2224345) — FOUND
- Server5 `.next/static/chunks/725670bac7b75e93.css` contains `--accent-blue` + `--accent-green` + `--accent-amber` + `--accent-red` + `--card-bg` + `--dash-pad` + `--font-sans` + `--hero-grad` — FOUND
- `https://livinity.io/download` → HTTP 200
- `https://livinity.io/dashboard` → HTTP 200 (Caddy static)
- `http://127.0.0.1:3000/download` → HTTP 200 (Next direct, `font-sans antialiased` body)
- `http://127.0.0.1:3000/dashboard` → HTTP 200 (Next direct, `font-sans antialiased` body)
- D-117-NO-API-CHANGES: API_CLEAN
- D-117-NO-AUTH-FLOW-CHANGES: MW_CLEAN + LIB_CLEAN + granular handler/href/import/hook checks

---
*Phase: 117-server5-nextjs-migration*
*Plan: 05*
*Completed: 2026-05-14*
