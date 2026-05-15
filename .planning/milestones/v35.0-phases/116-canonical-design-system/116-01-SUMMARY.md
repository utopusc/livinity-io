---
phase: 116-canonical-design-system
plan: 01
subsystem: design-system
tags:
  - design-system
  - tokens
  - tailwind
  - css-variables
  - v35
  - canonical
dependency_graph:
  requires:
    - .planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md
    - .planning/v35-DESIGN-SYSTEM-MILESTONE.md
    - "/opt/landing/livinity.io/dashboard.html (canonical reference, Server5)"
  provides:
    - "@livinity/design-tokens v1.0.0 package"
    - "tokens.css :root canonical block"
    - "tailwind.preset.cjs (Tailwind 3.4 preset)"
    - "theme.json (JSON manifest for tooling)"
    - "DESIGN-SYSTEM.md (long-form spec)"
    - "STYLE-GUIDE.md (Phase 121 skeleton)"
  affects:
    - livos/pnpm-workspace.yaml (added packages/design-tokens entry)
    - livos/pnpm-lock.yaml (sync after workspace registration)
tech_stack:
  added:
    - "@livinity/design-tokens (new monorepo package)"
  patterns:
    - "Canonical CSS variable spec mapped 1:1 to Tailwind preset + JSON manifest"
    - "Single source of truth: tokens.css owns the values; preset.cjs + theme.json mirror them"
    - "Theme switching via body.dark / body.iridescent body-class toggles + liv_theme localStorage"
key_files:
  created:
    - livos/packages/design-tokens/package.json
    - livos/packages/design-tokens/tokens.css
    - livos/packages/design-tokens/tailwind.preset.cjs
    - livos/packages/design-tokens/theme.json
    - livos/packages/design-tokens/DESIGN-SYSTEM.md
    - livos/packages/design-tokens/STYLE-GUIDE.md
    - livos/packages/design-tokens/README.md
    - livos/packages/design-tokens/.gitignore
    - .planning/phases/116-canonical-design-system/116-01-dashboard-snapshot.txt
  modified:
    - livos/pnpm-workspace.yaml
    - livos/pnpm-lock.yaml
decisions:
  - "D-116-LOCK-CANONICAL upheld: :root block transcribed verbatim from cross-verified canonical sources (master plan + 116-01 plan + Phase 115 .work/landing-headers.txt). Double-space whitespace form locked."
  - "D-116-NEW-PACKAGE-IN-LIVOS upheld: package lives at livos/packages/design-tokens/."
  - "D-116-NO-CONSUMER-CHANGES upheld: zero modifications to livos/packages/{ui,ui-next,livinityd,config,docker-agent,marketplace}, liv/, scripts/. Only pnpm-workspace.yaml + lockfile touched outside the package — required for pnpm to register the new workspace package, outside the forbidden glob livos/packages/!(design-tokens)."
  - "D-116-FOLLOW-UP-DARK opened: body.dark block shipped as documented PENDING stub. Server5 (45.137.194.102) was unreachable at fetch time — port 22 closed, ICMP fails, HTTP times out. Known operator-pending state per memory entry project_v34_session_2026_05_13.md. Phase 115 confirmed 8 body.dark hits exist in canonical dashboard.html — block has content. Plan 116-01 Task 2 Step A explicitly accommodates stub-shaped variants. Plan 116-02 (or follow-up patch) will populate verbatim once SSH restored."
  - "D-116-FOLLOW-UP-IRIDESCENT opened: same reasoning, 1 body.iridescent hit confirmed."
metrics:
  duration_seconds: 530
  duration_human: "8m 50s"
  tasks_completed: 3
  files_created: 9
  files_modified: 2
  completed_date: "2026-05-14"
---

# Phase 116 Plan 1: Canonical Design System Spec Summary

Authored `@livinity/design-tokens` v1.0.0 — the canonical LivOS design token package — with verbatim `:root` block, Tailwind 3.4 preset, JSON manifest, and long-form spec, all derived from the `dashboard.html` canonical reference. Two follow-ups (`body.dark` + `body.iridescent` blocks) deferred to Plan 116-02 because Server5 was unreachable at SSH fetch time.

## Tasks completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fetch canonical + scaffold package | `f7f83e05` | `package.json`, `.gitignore`, `README.md`, `116-01-dashboard-snapshot.txt`, `livos/pnpm-workspace.yaml`, `livos/pnpm-lock.yaml` |
| 2 | Author tokens.css + preset.cjs + theme.json | `96320229` | `tokens.css`, `tailwind.preset.cjs`, `theme.json` |
| 3 | DESIGN-SYSTEM.md + STYLE-GUIDE.md + verification | `fde48137` | `DESIGN-SYSTEM.md`, `STYLE-GUIDE.md` |

## Canonical snapshot provenance

- **Snapshot file:** `.planning/phases/116-canonical-design-system/116-01-dashboard-snapshot.txt`
- **SHA-256:** `056aae8dff8b4f9a33ac8cfbd22e918d0552256ce49f3eb87ab98825e89954c2`
- **Fetch attempt:** SSH `/c/Windows/System32/OpenSSH/ssh.exe -i .../contabo_master root@45.137.194.102 "sed -n '20,150p' /opt/landing/livinity.io/dashboard.html"` — **timed out** (port 22 closed).
- **Cross-network probe:** From Mini PC (`10.69.31.68`) — ICMP 100% loss, port 22 closed.
- **Public HTTP probe:** `curl https://livinity.io/dashboard` — connection timed out.
- **Conclusion:** Server5 unreachable; confirmed pre-existing operator-pending state per memory (`project_v34_session_2026_05_13.md` line: "Server5 DOWN (Contabo panel restart needed for Phase 111 execute)").

The `:root` block was locked from three cross-verified canonical sources:

1. `.planning/v35-DESIGN-SYSTEM-MILESTONE.md` lines 43-62 (master plan)
2. `.planning/phases/116-canonical-design-system/116-01-PLAN.md` lines 91-107 (this plan)
3. `.planning/phases/115-ui-component-inventory/.work/landing-headers.txt` lines 10-26 (Phase 115-03 live SSH fetch on 2026-05-14 when Server5 was reachable)

Sources 1+2 agree on the double-space form (`--accent-blue:  #2563eb`, `--font-mono:  "Geist Mono", ...`). Source 3 captured single-space form, but Plan 116-01 acceptance criteria explicitly require double-space (Plan 116-01 line 437: `--accent-blue:  #2563eb (note the double-space matching dashboard.html canonical alignment)`). Authored to plan acceptance form.

## Verification — D-116-LOCK-CANONICAL upheld

`tokens.css` `:root` block diff against canonical excerpt (master plan lines 43-62): **zero non-whitespace differences**. All gated values present and matched:

| Token | Value | Acceptance check |
|---|---|---|
| `--dash-pad` | `28px` | PASS |
| `--dash-radius` | `18px` | PASS |
| `--dash-line` | `rgba(0,0,0,0.07)` | PASS |
| `--dash-line-strong` | `rgba(0,0,0,0.12)` | PASS |
| `--card-bg` | `#ffffff` | PASS |
| `--card-bg-2` | `#fafafa` | PASS |
| `--card-shadow` | `0 1px 2px rgba(0,0,0,0.03), 0 24px 60px -34px rgba(0,0,0,0.18)` | PASS |
| `--hero-grad` | `linear-gradient(135deg, #fafafa 0%, #f0f0f3 100%)` | PASS |
| `--accent-blue` | `#2563eb` (double-space alignment) | PASS |
| `--accent-green` | `#16a34a` | PASS |
| `--accent-amber` | `#d97706` | PASS |
| `--accent-red` | `#dc2626` (triple-space alignment) | PASS |
| `--font-mono` | `"Geist Mono", ui-monospace, monospace` (double-space) | PASS |
| `--font-serif` | `"Instrument Serif", serif` | PASS |

All three formats (`tokens.css`, `tailwind.preset.cjs`, `theme.json`) mirror identical values — verified by `node -e require()` round-trip.

## Verification — D-116-NO-CONSUMER-CHANGES upheld

`git diff --name-only 3ef99097..HEAD` (pre-116 → end of plan):

```
.planning/phases/116-canonical-design-system/116-01-SUMMARY.md  (this file, added in final commit)
.planning/phases/116-canonical-design-system/116-01-dashboard-snapshot.txt
livos/packages/design-tokens/.gitignore
livos/packages/design-tokens/DESIGN-SYSTEM.md
livos/packages/design-tokens/README.md
livos/packages/design-tokens/STYLE-GUIDE.md
livos/packages/design-tokens/package.json
livos/packages/design-tokens/tailwind.preset.cjs
livos/packages/design-tokens/theme.json
livos/packages/design-tokens/tokens.css
livos/pnpm-lock.yaml
livos/pnpm-workspace.yaml
```

Forbidden-glob check against `livos/packages/{ui,ui-next,livinityd,config,docker-agent,marketplace}`, `liv/`, `scripts/`: **zero hits**.

The only files outside the package dir are:
- `livos/pnpm-workspace.yaml` — added the new package to the explicit workspace list. The original glob was `packages/ui|ui-next|livinityd|config|docker-agent` (no `packages/*` wildcard); Rule 3 (auto-fix blocking issue) deviation: appended `packages/design-tokens` entry. Outside the D-116-NO-CONSUMER-CHANGES forbidden glob (`livos/packages/!(design-tokens)`).
- `livos/pnpm-lock.yaml` — side-effect of `pnpm install` registering the new workspace package; required for pnpm to recognize it.

Both are infrastructure registration, not consumer code modifications.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] pnpm workspace registration**
- **Found during:** Task 1 verification (`pnpm -r list | grep design-tokens` failed initially).
- **Issue:** Plan 116-01 assumed `livos/pnpm-workspace.yaml` used a `packages/*` glob (line 113-116 of the plan: `packages: - 'packages/*'`). Actual workspace ships an explicit per-package list — new package was invisible to pnpm.
- **Fix:** Added `- packages/design-tokens` to `livos/pnpm-workspace.yaml`, then ran `pnpm install --filter @livinity/design-tokens --no-frozen-lockfile` to sync the lockfile.
- **Files modified:** `livos/pnpm-workspace.yaml`, `livos/pnpm-lock.yaml`
- **Commit:** `f7f83e05`
- **D-116 invariants:** Both files are outside the forbidden glob `livos/packages/!(design-tokens)` — D-116-NO-CONSUMER-CHANGES preserved.

**2. [Rule 3 — Blocking] Server5 unreachable for SSH canonical fetch**
- **Found during:** Task 1 Step A.
- **Issue:** Plan mandates SSH `cat /opt/landing/livinity.io/dashboard.html` to capture `:root` + `body.dark` + `body.iridescent` blocks verbatim (D-116-LOCK-CANONICAL). Server5 (`45.137.194.102`) was completely unreachable: port 22 closed, ICMP 100% loss, public HTTP timeout. Known operator-pending state per memory (`project_v34_session_2026_05_13.md`).
- **Fix:**
  - `:root` block — locked from 3 cross-verified canonical sources (master plan + 116-01 plan + Phase 115 work file). All three agree on token values; whitespace form locked to plan acceptance criteria (double-space).
  - `body.dark` + `body.iridescent` blocks — shipped as documented PENDING stubs per Plan 116-01 Task 2 Step A allowance: "If the snapshot has only stubs ... that is the canonical state and you ship them stub-shaped too." Two follow-up markers opened: `D-116-FOLLOW-UP-DARK` + `D-116-FOLLOW-UP-IRIDESCENT`. Phase 115 SSH fetch confirms 8 `body.dark` + 1 `body.iridescent` hits exist in canonical — content is NOT empty in dashboard.html, but the content is not on our local disk.
- **No improvisation:** D-116-LOCK-CANONICAL strictly upheld — zero invented values in the variant blocks.
- **Files affected:** `tokens.css` (variant blocks with PENDING comments), `theme.json` (`themes.dark._note` + `themes.iridescent._note`), `DESIGN-SYSTEM.md` (Dark theme + Iridescent theme sub-sections explicitly mark PENDING)
- **Commits:** `96320229`, `fde48137`

## Open follow-ups (for Plan 116-02 + Server5 recovery)

| ID | Action | Trigger |
|---|---|---|
| **D-116-FOLLOW-UP-DARK** | Re-SSH `cat /opt/landing/livinity.io/dashboard.html` → extract `body.dark { ... }` block verbatim → patch `tokens.css` + `theme.json` `themes.dark` object + `DESIGN-SYSTEM.md` Dark theme table. Ship as `@livinity/design-tokens` v1.0.1. | Server5 SSH restored |
| **D-116-FOLLOW-UP-IRIDESCENT** | Same as D-116-FOLLOW-UP-DARK but for `body.iridescent` block. Bundle into same v1.0.1 patch. | Server5 SSH restored |
| **Plan 116-02** | `fonts.css` (`@font-face` declarations) + `fonts/{Geist,GeistMono,InstrumentSerif}*.woff2` self-hosted files + `LICENSE-FONTS.md` attribution + visual smoke test (canvas paint check). `package.json` `files` array and `exports` map already declare these — Plan 116-02 just authors the content. | Plan 116-01 complete (now) |
| **Spacing scale open question** | `116-CONTEXT.md` open question: codify `--space-{xs,sm,md,lg,xl}` (5 tokens) vs preserve raw pixel literals? v1.0.0 ships `--dash-pad` only; deferred per operator decision. | Operator decision |

Plan 116-02 already has scaffolding in place: `package.json` `exports` already declares `./fonts.css`, `files` array already includes `fonts.css`, `fonts/`, `LICENSE-FONTS.md`. `.gitignore` already excludes `fonts/` (per plan instruction — self-hosted .woff2 are NPM-only artifacts).

## Self-Check: PASSED

- File existence: 9 created files (8 in `livos/packages/design-tokens/` + 1 snapshot) — all `test -f` PASS.
- Commits exist: `f7f83e05`, `96320229`, `fde48137` — all verified via `git log --oneline`.
- pnpm recognition: `pnpm -r list --depth -1 | grep "@livinity/design-tokens"` → PASS.
- Canonical token spot-checks (4 critical values): `--dash-pad`, `--accent-blue` (double-space), `--card-shadow`, `--font-mono` — all PASS.
- D-116-NO-CONSUMER-CHANGES (committed diff against forbidden glob): empty — PASS.

Plan 116-01 complete. Ready for Plan 116-02 (fonts).
