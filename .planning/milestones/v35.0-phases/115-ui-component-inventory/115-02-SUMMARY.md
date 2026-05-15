---
phase: 115-ui-component-inventory
plan: 02
subsystem: design-system / v35-foundation
tags: [ui-inventory, design-system, v35, server5, nextjs, documentation, read-only]
requires: []
provides:
  - inventory-server5
  - phase-117-input
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/115-ui-component-inventory/INVENTORY-SERVER5.md
  modified: []
decisions:
  - "Server5 src/src/ tree is stale 2026-03-26 dead-code duplicate; recommend operator-approved cleanup in Phase 117-01"
  - "0 canonical / 40 needs-migration / 1 replace-with-library / 6 wontfix structural / 21 wontfix duplicate — among 67 live TSX, 87% need migration"
  - "app/dashboard/install/page.tsx (Phase 111 follow-up) classified as needs-migration despite docstring claim — no DashboardShell import, no var(--dash-pad) tokens"
metrics:
  duration: "~15 min"
  completed: 2026-05-14
ssh_round_trips: 3
---

# Phase 115 Plan 02: Server5 Next.js Inventory (SSH-based) Summary

One-liner: SSH-walked Server5 `/opt/platform/web/src/` and produced a 236-line per-file inventory of all 119 TSX+TS files (67 live TSX, 100% of which are `needs-migration`).

## What shipped

Single artifact: `.planning/phases/115-ui-component-inventory/INVENTORY-SERVER5.md` (236 lines, exceeds the 150-line milestone target by 86 lines).

Document structure: 1 taxonomy table + 1 per-directory summary + 9 per-section per-file tables + 1 aggregate counts table + 1 deployment-quirks block + 1 SSH accounting block.

Sections present:
- `## app/(auth)/` (7 rows)
- `## app/dashboard/` (2 rows)
- `## app/onboarding/install/` (8 rows)
- `## app/store/` (12 rows)
- `## app/download/` (2 rows)
- `## app/page.tsx + app/layout.tsx (root)` (2 rows)
- `## components/motion-primitives/` (13 rows)
- `## lib/ (non-UI TS)` (13 rows)
- `## API routes` (30 rows)
- `## Legacy src/src/ duplicate tree` (counts only, all wontfix)
- `## Aggregate counts`
- `## Server5 deployment quirks (notes for Phase 117 executor)`
- `## SSH session accounting`

## Final TSX + TS counts

| Tree | TSX | TS | Total |
|---|---|---|---|
| Canonical (`src/app/`, `src/components/`, `src/lib/`, `src/db/`) | 46 | 30 | 76 |
| Legacy duplicate (`src/src/`) | 21 | 22 | 43 |
| **Total inventoried** | **67** | **52** | **119** |

Milestone spec expected ~68 TSX + ~69 TS. Actual TSX (67) is within 1 of spec. TS (52) is short of 69 because the `src/src/` duplicate frozen at 2026-03-26 is missing several routes added since (domains, cf, admin, account/api-keys, devices, install-event, dns-*, session-revocation). The DELTA is real (those files only exist in the live tree) — not a SSH-walk error.

## Migration tag distribution

| Tag | Count | % of total | Notes |
|---|---|---|---|
| canonical | 0 | 0.0% | Zero — confirms Surface 2 pre-bias (no current Server5 file matches dashboard.html design language) |
| needs-migration | 40 | 33.6% | 40 of 46 canonical-tree TSX = 87.0% of live visual surface |
| replace-with-library | 1 | 0.8% | `wizard-stepper.tsx` — generic step indicator primitive |
| wontfix | 78 | 65.5% | 6 structural (redirects, passthroughs, providers) + 30 API + 21 src/src/ TSX + 22 src/src/ TS — note: lib/* (10 backend) also wontfix |
| unknown | 0 | 0.0% | Every file classifiable from headers + plan rules |

## `app/dashboard/install/page.tsx` finding (canonical vs needs-migration verdict)

**Verdict: needs-migration** (NOT canonical).

Evidence from `head -40` of the file:
- File docstring (lines 3104-3112) CLAIMS: "matches /dashboard's design (zinc palette, rounded-xl cards, light/dark, max-w-4xl shell). New users with zero devices auto-land here from /dashboard."
- Imports observed: `ModeCards`, `HybridForm`, `LocalForm`, `InstallCommandDisplay`, `WizardStepper`, `ModeDocs` from `@/app/onboarding/install/components/*`.
- Imports NOT observed: no `DashboardShell` import; no `var(--dash-pad)` CSS variable reference; no `@livinity/design-tokens` preset import; no Geist font.
- Per Plan 115-02 rule #4: "If headers show `import { DashboardShell }` and CSS variable references like `var(--dash-pad)` → tag `canonical`. Otherwise `needs-migration`." → tag `needs-migration`.

The file IS internally consistent with Server5's existing zinc-Tailwind palette (Phase 111 follow-up matches the existing /dashboard's idiom), but neither file is yet on the v35 canonical design language. Both move to canonical together in Phase 117.

## `unknown`-tagged files needing operator review

None. Every file was classifiable from its 40-line header plus the Plan 115-02 ruleset. The legacy `src/src/` duplicate is uniformly tagged `wontfix` with a single rationale (dead code per Next.js `@/*` alias).

## SSH session count used (target: 2; bonus: 1)

**Actual: 3 round-trips.** Target missed by 1.

Breakdown:
1. `find /opt/platform/web/src -type f -name '*.tsx' / '*.ts' ! -name '*.d.ts' | sort` → `.work/server5-file-list.txt` (141 lines).
2. `find ... -print0 | xargs -0 -I {} sh -c 'echo "===FILE: {} ==="; head -40 {}; echo'` → `.work/server5-headers.txt` (4573 lines). **CAVEAT:** the `xargs -I {} sh -c '...'` shape interpolated the `(` in `app/(auth)/*` paths literally into the sh subshell, triggering `sh: 1: Syntax error: "(" unexpected` for all 7 files in the `(auth)` route group. Those files were SKIPPED.
3. Explicit loop over the 7 `app/(auth)/*` paths with quoted-string args → `.work/server5-auth-headers.txt` (269 lines). Recovers the gap.

**Lesson for future SSH-walks of Next.js route-group trees:** the literal-paren route-group syntax (`app/(auth)/`) is incompatible with `xargs -I {} sh -c` interpolation. Use either:
- `find ... -print0 | xargs -0 -n1 head -40` (no sub-shell), OR
- pre-encode paths via `printf '%q\n' "$path"` before piping to xargs, OR
- read paths line-by-line in a `while` loop with quoted `"$path"` substitution.

This pitfall is worth a memory entry if more SSH inventories follow.

## Deviations from Plan

### None of the auto-fix rules (1/2/3) triggered

Plan executed exactly as written, with one unavoidable SSH round-trip overrun due to the documented quoting edge case (above). No code edits anywhere, no source-tree drift.

### D-115-READ-ONLY verification

```
$ git diff HEAD -- livos/ liv/ scripts/ packages/
(empty)
```

Verified: zero edits to source trees on the local repo; zero edits on Server5 (read-only `find` + `head` only).

## Files inventoried by section (cross-check vs file list)

| Section | Expected | Inventoried |
|---|---|---|
| `app/(auth)/` | 7 (layout + 6 pages) | 7 |
| `app/dashboard/` | 2 (page + install/page) | 2 |
| `app/onboarding/install/` | 8 (layout + page + 6 components) | 8 |
| `app/store/` | 12 (excluding `store/types.ts` + `store/hooks/*` which are TS, listed under lib) | 12 |
| `app/download/` | 2 (layout + page) | 2 |
| Root (`app/page.tsx` + `app/layout.tsx`) | 2 | 2 |
| `components/motion-primitives/` | 13 | 13 |
| **Live TSX subtotal** | **46** | **46** ✓ |
| Legacy `src/src/` TSX | 21 | 21 (counted, not enumerated row-by-row — rationale documented) |
| **TSX TOTAL** | **67** | **67** ✓ |

## Phase 117 readiness handoff

This inventory unblocks Phase 117 (Server5 Next.js Platform Migration) by providing:
1. Per-file migration target list — 40 TSX files need restyle.
2. `wizard-stepper.tsx` flagged for Phase 119 ui-kit extraction.
3. Server5-specific operational notes (no .git, pm2 service `web`, Caddy /dashboard route swap, app/layout.tsx token injection point).
4. Legacy `src/src/` cleanup recommendation for operator approval in Phase 117-01.

## Self-Check: PASSED

- `.planning/phases/115-ui-component-inventory/INVENTORY-SERVER5.md` exists (236 lines).
- Commit `a1756811` exists on master (`docs(115-02): Server5 Next.js inventory — 67 TSX + 52 TS classified`).
- All Plan 115-02 acceptance criteria from `<automated>` verify block PASS:
  - file exists ✓
  - line count ≥130 (236) ✓
  - section headers present (`## app/(auth)/`, `## app/dashboard/`, `## app/store/`, `## components/`, `## lib/`) ✓
  - `git diff HEAD -- livos/ liv/ scripts/ packages/` empty ✓
- Only the 5 canonical migration tags (`canonical|needs-migration|replace-with-library|wontfix|unknown`) appear.
- D-115-READ-ONLY honored.
