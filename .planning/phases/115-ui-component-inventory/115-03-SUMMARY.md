---
phase: 115-ui-component-inventory
plan: 03
subsystem: ui
tags: [ui-inventory, design-system, v35, landing-html, baseline-screenshots, chrome-headless-fallback]

requires:
  - phase: 115-ui-component-inventory
    provides: "Surface-3 (landing HTML) source SSH access + dashboard.html canonical token set"
provides:
  - "INVENTORY-LANDING.md — 8 landing HTML files inventoried with per-file drift detail + theme-support matrix"
  - "COMPONENT-MAP.md — cross-surface element identity map (13 primary primitives + 8 secondary) with 13 F-115-MAP-NN drift findings"
  - "baseline-screenshots/ — 48 PNG captures (12 routes × 4 viewports) via headless Chrome fallback"
  - "MCP-unavailability fallback procedure documented in baseline-screenshots/README.md"
affects: [116-design-tokens, 117-dashboard-port, 118-landing-migration, 119-ui-kit, 120-tailwind-config, 121-visual-regression]

tech-stack:
  added: []
  patterns:
    - "Headless Chrome `--screenshot` flag as MCP fallback for visual baseline capture"
    - "SSH batched grep harness for landing HTML drift detection (token namespace + canonical class hits)"

key-files:
  created:
    - .planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md
    - .planning/phases/115-ui-component-inventory/COMPONENT-MAP.md
    - .planning/phases/115-ui-component-inventory/baseline-screenshots/ (48 PNGs + README.md)
    - .planning/phases/115-ui-component-inventory/.work/landing-headers.txt
    - .planning/phases/115-ui-component-inventory/.work/shoot.sh
    - .planning/phases/115-ui-component-inventory/.work/shoot.log
  modified: []

key-decisions:
  - "Adopted headless Chrome `--screenshot` as MCP fallback when port 9223 returned connection-refused; captured 48 PNGs vs zero with strict-MCP-only path"
  - "Used `--force-dark-mode` Chrome flag for dark captures; logged in baseline-screenshots/README.md that pixel-true dark requires later MCP replay (only dashboard.html has explicit body.dark blocks)"
  - "Resolved both wave-parallel cross-link TODOs after sibling INVENTORY-MINI-PC.md + INVENTORY-SERVER5.md landed mid-execution — zero remaining inline TODO row markers"
  - "Flagged 7 cross-surface drift findings (F-115-MAP-01 through F-115-MAP-07) feeding Phase 116 token priority + Phase 119 ui-kit selection"

patterns-established:
  - "Three-surface component identity map format (Mini PC TSX path | Server5 TSX path or 'inline' | landing CSS class)"
  - "Token-drift detail per landing file (vars present, vs canonical, classes used, theme blocks, font links)"

requirements-completed: []

duration: 8min
completed: 2026-05-14
---

# Phase 115 Plan 03: Landing inventory + baseline screenshots + cross-surface component-map Summary

**Three documentation artifacts (INVENTORY-LANDING.md, COMPONENT-MAP.md, baseline-screenshots/) feeding the v35.0 Design System Unification milestone — landing canonical-vs-drift map for all 8 HTML files, cross-surface primitive identity table covering 13 components + 7 drift findings, and 48 PNG visual baselines captured via headless Chrome fallback when Chrome DevTools MCP at :9223 was unreachable.**

## Performance

- **Duration:** ~8 min (single autonomous session)
- **Completed:** 2026-05-14T21:25Z
- **Tasks:** 3/3 (auto)
- **Files created:** 3 user-facing artifacts + 3 `.work/` provenance files + 48 PNGs + 1 README

## Accomplishments

- **INVENTORY-LANDING.md** (140 lines) — 8/8 HTML files inventoried with token-drift detail. Aggregate: 2 `canonical` (dashboard.html, dashboard-install.html) + 6 `needs-migration`.
- **COMPONENT-MAP.md** (151 lines) — 13 primary primitives + 8 secondary primitives mapped across all 3 surfaces. 7 F-115-MAP-NN findings (Button radius, token namespace, Stepper palette, Server5 no-shared-primitives, NavBar hardcoded hex, ThemeToggle absent, iridescent presence). 13 total F-findings counting all sub-findings.
- **baseline-screenshots/** — 48 PNGs covering 12 public routes × 4 viewports (1920-light, 1920-dark, 375-light, 375-dark). Total disk weight ~2.0 MB.
- **MCP-fallback procedure** documented for future re-runs once chrome-devtools-mcp at :9223 is restored.

## Landing inventory drift summary

| Migration tag | Count | Files |
|---|---|---|
| `canonical` | 2 | `dashboard.html`, `dashboard-install.html` |
| `needs-migration` | 6 | `auth.html`, `profile.html`, `customize.html`, `download.html`, `index.html`, `forgot-password.html` |
| `unknown` | 0 | — |

**Theme-support matrix highlight:** Only `dashboard.html` ships full 3-theme (`body.dark` + `body.iridescent`). 5/8 files have `body.dark`. Zero non-canonical files have `body.iridescent`.

## Cross-surface drift findings (F-115-MAP-NN summaries)

1. **F-115-MAP-01: Button radius drift** — Mini PC `rounded-md` (≈6px), Server5 inline mix, Landing 999px pill. Phase 119 ships pill.
2. **F-115-MAP-02: Landing token namespace drift** — 3 namespaces in use across 8 HTMLs (canonical `--accent-*`, profile.html `--{color}`, generic `var(--bg)`). Phase 116 ships canonical `_shared/tokens.css`.
3. **F-115-MAP-03: Stepper palette drift** — Server5 `wizard-stepper.tsx` uses zinc-900/emerald-500, not canonical accent tokens. Confirmed by INVENTORY-SERVER5.md tagging it `replace-with-library`.
4. **F-115-MAP-04: Server5 has NO shared Button/Input/Card primitives** — Only `motion-primitives/` exists; every page inlines Tailwind. Phase 119 ui-kit is high-impact / low-risk for Server5.
5. **F-115-MAP-05: Server5 topbar hardcoded hex** — `border-[#e5e5e7]` + `bg-white/80`, no CSS-var references. Confirmed by INVENTORY-SERVER5.md drift note.
6. **F-115-MAP-06: ThemeToggle absent on Server5 public surface** — Mini PC has `<ThemeToggle>`, Server5 zero theme-toggle UI on any public page. Phase 119 adds parity.
7. **F-115-MAP-07: Iridescent theme exists only on dashboard.html** — One `body.iridescent` block across all 8 files + 0 hits on Mini PC + 0 on Server5. Phase 116 captures iridescent token overrides; Phase 121 visual regression asserts 3-theme presence.

## Baseline screenshot count + failed captures

- **48/48 captures succeeded** — all `>2KB` (no truncated PNGs).
- **No failed captures.** Edge cases: `bruce.livinity.io/` and `bruce.livinity.io/login` captured at whatever no-auth landing point headless Chrome reached (relay was up at execution time).
- **Iridescent theme not captured** — requires `body.classList.add('iridescent')` injection, only achievable via Chrome DevTools MCP. Documented as Phase 117/121 follow-up in `baseline-screenshots/README.md`.

## Files Created/Modified

- `.planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md` — 140 lines, 8 HTML files inventoried + theme matrix + Phase 118 sequencing recommendations.
- `.planning/phases/115-ui-component-inventory/COMPONENT-MAP.md` — 151 lines, 13 primary + 8 secondary primitives × 3 surfaces + 7 F-findings + coverage summary + drift severity ranking.
- `.planning/phases/115-ui-component-inventory/baseline-screenshots/` — 48 PNGs (12 routes × 4 viewports) + README.md (capture method, MCP fallback rationale, replay instructions).
- `.planning/phases/115-ui-component-inventory/.work/landing-headers.txt` — 229-line batched SSH dump of `:root` blocks, font links, body.dark counts, canonical class hits (provenance).
- `.planning/phases/115-ui-component-inventory/.work/shoot.sh` — headless Chrome screenshot harness (12 routes × 4 viewports loop).
- `.planning/phases/115-ui-component-inventory/.work/shoot.log` — capture-by-capture success log.

## Decisions Made

1. **Headless Chrome fallback over zero-captures.** The plan's `<action>` step explicitly permits documenting the MCP gap in `.work/screenshot-blocked.md` and skipping; the executor chose to ship 48 real PNGs via `chrome.exe --headless=new --screenshot=...` instead, because the user's machine has Chrome installed and Chrome's `--force-dark-mode` flag covers the dark theme half of the matrix mechanically. Iridescent theme deferred to Phase 117+ MCP replay (documented in README).
2. **Sibling-inventory cross-references resolved live.** `INVENTORY-MINI-PC.md` (Plan 115-01) and `INVENTORY-SERVER5.md` (Plan 115-02) landed during this plan's execution. The executor checked them mid-run and updated COMPONENT-MAP.md Modal + Toast + Stepper rows to cite the sibling-inventory tagging (`replace-with-library` for `toast.tsx`, etc.) — collapsing all 5 initial `TODO: cross-link` markers to **zero** inline row TODOs (better than the plan's ≤2 allowance).
3. **Drift severity ranking added** at end of COMPONENT-MAP.md to feed Phase 116 token priority ordering — six-step ranked list (`--accent-*` highest, `--card-shadow` lowest, value-matches-already).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Chrome DevTools MCP at :9223 unreachable; substituted headless Chrome**
- **Found during:** Task 2 pre-flight (`curl -v http://127.0.0.1:9223/json/version` → connection refused; `mcp__chrome-devtools__*` tools absent from agent's tool roster)
- **Issue:** Plan's primary capture method depends on chrome-devtools-mcp server on port 9223 + `mcp__chrome-devtools__*` tool calls. Neither was available. Plan's fallback option was "document the gap in `.work/screenshot-blocked.md` and proceed with zero captures."
- **Fix:** Used local Chrome (`/c/Program Files/Google/Chrome/Application/chrome.exe --headless=new --screenshot=...`) with `--force-dark-mode` for dark variants. Wrote driver script `.work/shoot.sh`. Captured 48 PNGs (exceeds 20 minimum). Documented MCP-vs-headless caveats in `baseline-screenshots/README.md` for Phase 117/121 to re-run dark + iridescent via MCP body-class injection.
- **Files created:** `.work/shoot.sh`, `.work/shoot.log`, `baseline-screenshots/*.png`, `baseline-screenshots/README.md`
- **Verification:** `ls baseline-screenshots/*.png | wc -l` → 48; smallest file >3 KB (visible content); per-route coverage confirmed via grep.
- **Committed in:** (single Task 3 commit — see below)

**2. [Rule 2 - Missing critical] Added TODO-resolution section after sibling inventories landed mid-execution**
- **Found during:** Final acceptance check
- **Issue:** Plan anticipated wave-parallel race with siblings ("INVENTORY-MINI-PC.md and INVENTORY-SERVER5.md may not yet exist when this task starts"). At Task 3 start they did not. At Task 3 end they did. Original COMPONENT-MAP.md cited "TODO: cross-link if 115-02 surfaces any" inline, but that's outdated as of write.
- **Fix:** Re-checked siblings post-write, updated 3 rows (Modal, Toast, Stepper) with sibling-inventory citations, converted "TODO: cross-link markers" section to "TODO: cross-link markers — RESOLVED" with the actual sibling-confirmed findings. Zero inline TODO row markers remain.
- **Files modified:** `.planning/phases/115-ui-component-inventory/COMPONENT-MAP.md` (4 Edit calls)
- **Verification:** `grep -E '^\|.*TODO: cross-link' COMPONENT-MAP.md | wc -l` → 0.
- **Committed in:** (single Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical) — both within Rule 3 / Rule 2 scope.
**Impact on plan:** Plan acceptance criteria fully met. MCP gap was anticipated by plan's fallback path; this executor chose the more-data branch (real headless captures). Sibling-inventory cross-link upgrade is a freebie made possible by wave timing.

## Issues Encountered

- **`mcp__chrome-devtools__*` tools absent from agent tool roster.** Verified via direct port-9223 probe (connection refused). Plan permits two fallback paths; selected the more-productive one (headless Chrome).
- **Class-hit grep returned empty on first pass** due to single-quote escaping inside nested SSH command. Second pass (separate SSH call) recovered canonical class data (`.h-btn.solid`, `.b-card.span-N`, `.stepper`, `.pill.{ok,err,warn}`, etc.). Documented in `INVENTORY-LANDING.md § Provenance`.

## User Setup Required

None. Pure documentation phase per D-115-READ-ONLY.

## Next Phase Readiness

- Phase 116 (design tokens) has explicit token priority ordering from COMPONENT-MAP.md § Cross-surface drift severity ranking — start with `--accent-*`, end with `--card-shadow`.
- Phase 117 (dashboard port) has 48-PNG baseline + dashboard.html canonical extraction in INVENTORY-LANDING.md.
- Phase 118 (landing migration) has 6-step migration sequencing per drift severity in INVENTORY-LANDING.md § Landing deployment notes.
- Phase 119 (ui-kit) has 13-primitive export list with sibling-confirmed Mini PC source paths.
- Phase 121 (visual regression) has baseline-screenshots/ ready as diff target; README.md flags iridescent + pixel-true-dark as MCP-replay follow-ups.

**Pending:** Re-run baseline capture under Chrome DevTools MCP for pixel-true dark + iridescent variants (Phase 117 or earlier).

## Self-Check: PASSED

Final verifications (all pass):

- `test -f .planning/phases/115-ui-component-inventory/INVENTORY-LANDING.md` → 140 lines ≥ 60 ✓
- `test -f .planning/phases/115-ui-component-inventory/COMPONENT-MAP.md` → 151 lines ≥ 80 ✓
- `ls baseline-screenshots/*.png | wc -l` → 48 ≥ 20 ✓
- All 8 HTML files referenced in INVENTORY-LANDING.md (`dashboard, dashboard-install, auth, profile, customize, download, index, forgot-password`) ✓
- COMPONENT-MAP.md contains Button, Card, Input, Stepper, Modal, NavBar, Pill ✓ (7/7)
- F-115-MAP-NN findings: 13 hits (≥3 required) ✓
- `git diff HEAD -- livos/ liv/ scripts/ packages/` → empty (0 lines diff) ✓ — D-115-READ-ONLY honored.
- D-115-SCREENSHOT-EVERY-PUBLIC-ROUTE: 12 routes × 4 viewports = 48 captures across landing, Server5 public routes, and 2 Mini PC routes ✓.
- ≤2 `TODO: cross-link` inline row markers → 0 (better than spec) ✓.

---
*Phase: 115-ui-component-inventory*
*Completed: 2026-05-14*
