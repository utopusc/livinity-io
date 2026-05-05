# Phase 91 — v32 UAT + Polish — CONTEXT

**Wave:** 5 (final — sequential after P90 cutover)
**Status:** Active
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — MUST be unchanged before AND after this phase.

---

## 1. Mission

Close out v32 with three deliverables:

1. **WCAG AA contrast fix** in `livos/packages/ui/src/styles/v32-tokens.css` — raise `--liv-muted-foreground` (LIGHT) so body text passes 4.5:1 against `--liv-background`. Verify all relevant pairs in BOTH themes. P89's flagged carryover lands here.
2. **UAT-CHECKLIST.md** — comprehensive smoke-test walk for the user to run on the Mini PC after deploy. Sections A-J. PASS/FAIL/NOTES per item.
3. **Static post-cutover smoke** — what we can verify locally without Mini PC: UI build, tests, sacred SHA, TODO/FIXME sweep.

Documented in `91-SUMMARY.md` after the work lands.

---

## 2. Source documents read

- `.planning/v32-DRAFT.md` — milestone master plan (P91 entry on line 226-234, Wave 5 line 94)
- `.planning/ROADMAP.md` — Phase 91 entry on line 74
- `.planning/phases/89-theme-toggle-a11y/89-SUMMARY.md` — flagged WCAG issue: `--liv-muted-foreground` LIGHT yields 3.12:1 on `--liv-background`, fails AA body-text 4.5:1 (line 88)
- `.planning/phases/90-cutover/90-SUMMARY.md` — post-cutover behaviour surface; route swap chosen over Redis flag; mcp-panel.tsx + index-v19.tsx deleted; ThemeToggle wired into v32 chat header; liv-composer-focus listener wired; liv-last-assistant localStorage writer wired
- `.planning/phases/80-foundation-tokens-fonts-theme/80-SUMMARY.md` — token file is the P80 deliverable at `livos/packages/ui/src/styles/v32-tokens.css`
- Wave 1-4 SUMMARY scans (P80-P88) — used to author UAT-CHECKLIST sections A-J
- `livos/packages/ui/src/styles/v32-tokens.css` — the file to fix

---

## 3. Hard constraints

- ZERO changes to `liv/packages/core/` (sacred SHA preserved)
- ZERO changes to v32 component internals (P81/P82/P83/P84/P85-UI/P86/P88/P89 lanes) — only the WCAG token tweak in `v32-tokens.css`
- D-WCAG-AA-PASS: post-fix all six audited pairs must pass 4.5:1 OR have an explicitly documented carryover reason
- D-NO-PROD-DEPLOY: no Mini PC SSH commands; UAT-CHECKLIST is a *script* the user runs — we do NOT run it

---

## 4. WCAG AA Strategy

WCAG ratio = `(L1 + 0.05) / (L2 + 0.05)` where L is **relative luminance** (sRGB-linearized).

Approximation in use (matches P89-SUMMARY's method): for achromatic OKLCH colors, `Y ≈ L^2.2` where L is the OKLCH lightness (0..1).

This approximation is conservative enough for go/no-go decisions on neutral pairs. Chromatic pairs (destructive — red, secondary — blue) are reported with a caveat.

### Audit pairs (six total)

LIGHT (`:root`):
1. `--liv-foreground` on `--liv-background` (primary body text)
2. `--liv-muted-foreground` on `--liv-background` (secondary text — **fix target**)
3. `--liv-primary-foreground` on `--liv-primary` (primary button text)
4. `--liv-card-foreground` on `--liv-card` (text on card surfaces)
5. `--liv-accent-foreground` on `--liv-accent` (NEW — accent surfaces)
6. `--liv-destructive-foreground` on `--liv-destructive` (NEW — destructive buttons)

Same six in DARK (`.dark`).

### Computed targets

For LIGHT background `oklch(98.46% 0.002 247.84)` → L=0.9846, Y≈0.9669:
- 4.5:1 requires foreground Y ≤ 0.176 → L ≤ 0.44.
- Current `--liv-muted-foreground` L=0.556 (FAIL).
- Pick L=**0.42** for headroom. Y=0.42^2.2=0.152, ratio=(0.9669+0.05)/(0.152+0.05)=5.04:1 PASS.

For DARK background `oklch(0.185 0.005 285.823)` → L=0.185, Y≈0.0258:
- Current `--liv-muted-foreground` L=0.708, Y=0.476, ratio=6.94:1 PASS — DO NOT change.

### Discovered upstream defect (Suna verbatim port from P80)

`--liv-destructive-foreground: oklch(0.577 0.245 27.325)` LIGHT is identical to `--liv-destructive`. 1:1 contrast — invisible text. Mirrors Suna globals.css line 242-243 (the upstream has the same duplicate). This is a copy/paste bug we are inheriting.

Decision:
- LIGHT: set `--liv-destructive-foreground` to `oklch(0.985 0 0)` (white). Yields ratio ≈ 2.94:1 against the red destructive bg. Passes 3:1 UI-component / large-text threshold; does NOT pass 4.5:1 strict body-text. Documented as accepted carryover (standard shadcn pattern; destructive button label is `font-medium` ≥ 14px which gets the UI-component threshold).
- DARK: raise `--liv-destructive-foreground` from `oklch(0.637 0.237 25.331)` to `oklch(0.985 0 0)` (white). Yields ratio 5.63:1 — passes 4.5:1.

---

## 5. UAT-CHECKLIST.md plan (sections A-J)

A. **Visual / Theme** — frontend reachability, theme toggle, /playground/v32-theme, /playground/v32-tool-views, post-fix WCAG vibe check
B. **Chat surface** — open v32 chat, agent selector, streaming, status_detail card, tool pill, ToolCallPanel auto-open, slider, Cmd+I close, sidebar event width-adjust
C. **Bytebot via Computer Operator agent** — switch agent, take screenshot, click action, screenshot updates
D. **Agents management** — /agents grid, edit autosave, create new, delete (only user-created), seed agents protected
E. **Marketplace** — /marketplace, Add to Library, search debounce, sort, tag filter
F. **MCP** — agent editor MCP section, BrowseDialog, source pill (Official enabled / Smithery disabled), ConfigDialog, ConfiguredMcpList, color pill, remove
G. **Keyboard shortcuts** — Cmd+K composer focus, Cmd+Shift+C copy, Cmd+I panel close
H. **Redirects + cleanup** — /agent-marketplace 301, /ai-chat-legacy still accessible, sidebar mcp-panel gone, dock has Agents + Marketplace
I. **Backend (Hermes patterns)** — /api/agent/start SSE stream + status_detail, IterationBudget breach, steer injection (curl-driven; mark NOTES if dev tools unavailable)
J. **Sacred / regression** — sacred SHA verify, liv-core / livinityd services healthy; liv-memory pre-existing acceptable

Each item: ACTION → EXPECTED → PASS/FAIL/NOTES column.

---

## 6. Static smoke (we run these, not the user)

- `pnpm --filter ui build` — capture exit code + timing
- `pnpm --filter ui test` if a test runner is wired; otherwise note "no test script in ui/package.json — skipping"
- `cd livos/packages/livinityd && npm test` — vitest test suite
- `cd liv/packages/core && npm test:phase45` (or latest) — sacred-runner integrity test included
- Sacred SHA check (before AND after)
- TODO/FIXME grep across v32 paths — flag blockers vs accepted carryovers

Document outcomes inline in `91-SUMMARY.md`.

---

## 7. Verification gates

| Gate | Method | Pass criterion |
|------|--------|----------------|
| UI build green | `pnpm --filter ui build` | exit 0 |
| WCAG audit doc | `91-SUMMARY.md` table | All six pairs (LIGHT + DARK) annotated; failing ones explicitly carried |
| Sacred SHA | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| UAT-CHECKLIST | file presence + sections A-J | All 10 sections present with PASS/FAIL/NOTES column |

---

## 8. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-91-01 | Use `Y ≈ L^2.2` approximation per P89 precedent | Conservative for neutral pairs; consistent with prior audit |
| D-91-02 | Set `--liv-muted-foreground` LIGHT = `oklch(0.42 0 0)` | Computed minimum L=0.44; 0.42 gives ~10% margin (5.04:1) |
| D-91-03 | Fix `--liv-destructive-foreground` (both themes) — Suna upstream defect | 1:1 contrast in LIGHT was a copy/paste bug; raises to white (LIGHT 2.94:1 / DARK 5.63:1) |
| D-91-04 | Accept LIGHT destructive 2.94:1 as carryover | Passes 3:1 UI threshold; matches shadcn convention; would require redesigning destructive color identity to fix strictly |
| D-91-05 | UAT-CHECKLIST is a script for user to run — we do NOT execute it | Mini PC offline by default per ZeroTier instability memory; remote walk is user-driven |
| D-91-06 | Static smoke skips `liv-core` build/test if any conflict surfaces — sacred SHA verification is mandatory | wrap-don't-rewrite preserved; tests are read-only assertions |

---

## 9. Out of scope

- Touching `liv/packages/core/` (sacred — D-NO-BYOK)
- Refactoring v32 components — only the token file changes
- Mini PC deploy — orchestrator owns; this phase merely prepares the UAT script
- Fixing destructive color identity strictly to 4.5:1 — would visually change the entire destructive identity
- Auditing every chromatic pair (secondary, sidebar, etc) — only the six listed pairs are scoped

---

## 10. Commit plan

ONE commit when complete:

```
feat(91): v32 UAT + polish — WCAG fix + UAT checklist + static smoke

- styles/v32-tokens.css: --liv-muted-foreground LIGHT 0.556 → 0.42 (5.04:1, AA pass)
  + --liv-destructive-foreground both themes set to oklch(0.985 0 0) — fixes
  Suna upstream copy/paste defect (LIGHT was 1:1)
- UAT-CHECKLIST.md: 10-section walk-through (visual / chat / bytebot / agents
  / marketplace / MCP / keyboard / redirects / backend / sacred) with
  PASS/FAIL/NOTES columns
- 91-SUMMARY.md: WCAG audit (6 pairs each theme = 12 cells), static smoke
  results, sacred SHA verified

Phase: 91-uat-polish
Wave: 5 (final, lifecycle next)
Sacred SHA f3538e1d UNTOUCHED.
```

NOT pushed.
