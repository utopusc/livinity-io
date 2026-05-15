# Phase 122 — Design Tokens (Additive Port, Step 1 of 8)

**Milestone:** v36 LivOS Design Port
**Goal:** Add Livinity Design System tokens to `@livinity/design-tokens` package **without removing or renaming any existing token**. After this phase ships, new Tailwind utility classes (`bg-fg`, `text-fg-mute`, `border-line`, `rounded-r-lg`, `shadow-window-soft`, etc.) are usable across `livos/packages/ui/` but **no component visibly changes**.

**Source of truth:** `.planning/design-system/livinity-design-system.html` §01 Colors + §03 Rhythm + §20 Port guide (lines 13-66 for the `:root` block; lines 1133-1164 for the Tailwind config snippet).

---

## Why additive

Per `feedback_v36_no_bold_redesigns.md` (saved 2026-05-15 after Phase 122 v1 rejection): bold one-shot redesigns are rejected. New tokens MUST ship as **opt-in** utilities; consumers migrate one-by-one in Phases 123–129.

A 1:1 token swap (e.g., renaming `--accent-blue` → `--accent`) would change every shadcn primitive and every `bg-accent-blue` callsite instantly — exactly the rejected pattern. The additive approach guarantees zero visible delta for Phase 122.

---

## Locked decisions

- **D-122-ADDITIVE** — Zero existing `tokens.css` vars renamed or value-changed. Existing `--accent-blue`, `--dash-line`, `--dash-line-strong`, `--card-bg`, `--card-bg-2`, `--card-shadow`, `--hero-grad`, `--accent-green/amber/red`, `--font-mono`, `--font-serif`, `--dash-pad`, `--dash-radius` byte-identical pre/post.
- **D-122-NO-CONSUMER-CHANGES** — `livos/packages/ui/src/**` untouched. No component imports, no className edits.
- **D-122-NAMESPACE** — New vars use the design-system.html names verbatim (`--fg`, `--bg`, `--surface`, `--line`, `--r-xs..2xl`). No prefix bikeshed.
- **D-122-SHADOW-CARD-EXISTS** — `--card-shadow` already byte-identical to the new `--shadow-card` (verified by `grep` against tokens.css line 16). Don't duplicate — alias the new name to the existing var: `--shadow-card: var(--card-shadow);` OR just declare both with the same literal.
- **D-122-INSTRUMENT-SERIF-EXISTS** — `--font-serif` already declared (line 23). Alias new `--serif` similarly, don't re-load fonts.
- **D-122-NO-DARK-NO-IRIDESCENT** — Dark mode + iridescent body classes remain PENDING per D-116-FOLLOW-UP. Phase 122 ships light-mode tokens only.

---

## Files touched (3)

1. `livos/packages/design-tokens/tokens.css` (+ ~35 lines)
2. `livos/packages/design-tokens/tailwind.preset.cjs` (+ ~30 lines)
3. `livos/packages/design-tokens/DESIGN-SYSTEM.md` (+ ~40 lines doc only)

## Files NOT touched (verified pre-flight)

- `livos/packages/ui/tailwind.config.ts` — already extends preset; auto-picks new utilities
- `livos/packages/ui/src/**` — D-122-NO-CONSUMER-CHANGES
- `livos/packages/design-tokens/fonts.css` — already ships Geist + Instrument Serif via Phase 116
- `livos/packages/design-tokens/index.css` — token import already wired

---

## Plan steps (atomic commits)

### 122-01 — Extend `tokens.css` with v36 design system block

**File:** `livos/packages/design-tokens/tokens.css`
**Action:** Append a new `/* === v36 Design System (additive — Livinity Design Port) === */` block under `:root` with new vars verbatim from design-system.html lines 13-66. Existing block byte-unchanged.

Specifically add:
```css
/* === v36 Design System (additive — Livinity Design Port) ===
 * Source: .planning/design-system/livinity-design-system.html §01 + §03
 * D-V36-ADDITIVE-ONLY: these vars coexist with the existing tokens above.
 * Consumers opt in via new Tailwind utilities (Phase 122-02).
 */
:root {
  /* Neutrals (Apple-like, monochrome) */
  --bg:           #ffffff;
  --bg-2:         #f5f5f7;
  --surface:      #fafafa;
  --surface-2:    #ebebed;
  --line:         rgb(0 0 0 / .08);
  --line-strong:  rgb(0 0 0 / .14);
  --fg:           #1d1d1f;
  --fg-dim:       #424245;
  --fg-mute:      #6e6e73;
  --fg-faint:     #a1a1a6;
  /* Accent — monochrome by default */
  --accent:       #1d1d1f;
  --accent-soft:  rgb(0 0 0 / .06);
  --blue:         #0a84ff;        /* use sparingly: focus rings, links */
  --green-bright: #28c840;
  /* Radii (v36 scale) */
  --r-xs:  6px;
  --r-sm:  8px;
  --r:    12px;
  --r-md: 14px;
  --r-lg: 18px;
  --r-xl: 22px;
  --r-2xl:28px;
  --r-full: 999px;
  /* Shadows (v36 scale; --shadow-card byte-equal to existing --card-shadow) */
  --shadow-card:   var(--card-shadow);
  --shadow-window: 0 1px 2px rgb(0 0 0 / .04), 0 30px 80px -30px rgb(0 0 0 / .22);
  --shadow-pop:    0 12px 30px -16px rgb(0 0 0 / .18);
  /* Easing (v36 — single canonical curve) */
  --ease-out-v36:    cubic-bezier(.2, .7, .2, 1);
  --ease-in-out-v36: cubic-bezier(.4, 0, .2, 1);
  /* Fonts (alias to existing --font-* — no new @font-face) */
  --sans:  -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Geist", system-ui, sans-serif;
  --mono:  var(--font-mono);
  --serif: var(--font-serif);
}
```

**Commit message:**
```
feat(design-tokens): add v36 design system tokens (additive) [v36/P122-01]

Source: Livinity Design System §01 Colors + §03 Rhythm.
Coexists with existing tokens — zero rename, zero value change to the
Phase 116 canonical block. Consumers opt in via new Tailwind utilities
in P122-02.

D-122-ADDITIVE: --accent-blue, --dash-line, --card-shadow, --hero-grad,
--card-bg, --dash-radius all byte-unchanged.
```

**Verify (before commit):**
- [ ] `git diff livos/packages/design-tokens/tokens.css` shows only ADDED lines
- [ ] `grep -c '^\s*--accent-blue\b' livos/packages/design-tokens/tokens.css` → still 1
- [ ] `grep -c '^\s*--dash-line\b' livos/packages/design-tokens/tokens.css` → still 1
- [ ] Smoke-test page renders: open `livos/packages/design-tokens/smoke-test/index.html` in browser → no console errors

---

### 122-02 — Map new tokens into Tailwind preset

**File:** `livos/packages/design-tokens/tailwind.preset.cjs`
**Action:** Add new entries to `theme.extend` (additive — no removals).

Specifically extend:
```javascript
// (under existing module.exports.theme.extend)
extend: {
  colors: {
    // Existing v35.0 tokens kept verbatim above (accent-blue, card-bg, dash-line, etc.)
    // === v36 additive — Livinity Design Port ===
    "fg":          "#1d1d1f",
    "fg-dim":      "#424245",
    "fg-mute":     "#6e6e73",
    "fg-faint":    "#a1a1a6",
    "bg":          "#ffffff",
    "bg-2":        "#f5f5f7",
    "surface":     "#fafafa",
    "surface-2":   "#ebebed",
    "line":        "rgb(0 0 0 / .08)",
    "line-strong": "rgb(0 0 0 / .14)",
    "accent":      "#1d1d1f",
    "accent-soft": "rgb(0 0 0 / .06)",
    // "blue" intentionally NOT added as a Tailwind color (avoids clobbering tailwind's blue-* scale); use bg-[color:var(--blue)] when needed.
  },
  borderRadius: {
    // existing "dash": "18px" kept
    // === v36 additive ===
    "r-xs":  "6px",
    "r-sm":  "8px",
    "r":     "12px",
    "r-md":  "14px",
    "r-lg":  "18px",
    "r-xl":  "22px",
    "r-2xl": "28px",
    "r-full": "999px",
  },
  boxShadow: {
    // existing "card": "..." kept (byte-identical to v36 --shadow-card)
    // === v36 additive ===
    "window-soft": "0 1px 2px rgb(0 0 0 / .04), 0 30px 80px -30px rgb(0 0 0 / .22)",
    "pop":         "0 12px 30px -16px rgb(0 0 0 / .18)",
  },
  transitionTimingFunction: {
    "out-v36":    "cubic-bezier(.2, .7, .2, 1)",
    "in-out-v36": "cubic-bezier(.4, 0, .2, 1)",
  },
  fontFamily: {
    // existing "mono" + "serif" kept
    // === v36 additive ===
    "v36-serif": ["Instrument Serif", "New York", "Georgia", "serif"],
    // Don't re-declare "sans" — Tailwind would override host's; v36 components use system stack via raw CSS or default sans.
  },
},
```

**Commit message:**
```
feat(design-tokens): wire v36 tokens into Tailwind preset (additive) [v36/P122-02]

Adds Tailwind utility classes for the v36 monochrome palette + r-* radii
scale + shadow-window-soft + shadow-pop + ease-out-v36. Coexists with the
existing accent-blue/dash-line/dash/card preset entries — Tailwind merges
extend keys shallowly so no name collides.

D-122-NO-CONSUMER-CHANGES upheld: livos/packages/ui/src/** untouched.
```

**Verify (before commit):**
- [ ] `pnpm --filter @livinity/design-tokens build` → exits 0
- [ ] `pnpm --filter ui build` → exits 0 with no new Tailwind warnings
- [ ] Vite dev (running) reloads without error
- [ ] `git diff livos/packages/design-tokens/tailwind.preset.cjs` shows only ADDED entries; existing `"accent-blue"`, `"card-bg"`, `"dash-line"`, `"dash": "18px"`, `"card": "0px 4px ..."` lines untouched
- [ ] Spot-test new utility: `grep -r 'bg-fg\b\|text-fg-mute\|border-line\b\|rounded-r-lg\|shadow-window-soft' livos/packages/ui/src/` → expected ZERO hits (no consumers yet)

---

### 122-03 — Smoke verification (no file changes, no commit)

**Action:** End-to-end visual smoke that Phase 122 produces **zero visible delta**.

Steps:
1. Reload `http://localhost:3000` in the existing Chrome session
2. Screenshot full viewport → save as `.planning/phases/122-design-tokens-additive-port/122-after.png`
3. Diff vs the baseline `.planning/phases/v36-microstep-glass.png` (last approved state) — expected diff = noise only (JPEG/PNG compression jitter), no structural change
4. Open browser console — expected zero new warnings/errors after the build

**If the diff shows ANY visible change:** STOP, do NOT proceed to 122-04. Investigate which tokens.css or preset edit leaked a value change. The most likely cause: an existing Tailwind utility shadows-resolved to a different value because of preset merge order.

---

### 122-04 — DESIGN-SYSTEM.md doc update

**File:** `livos/packages/design-tokens/DESIGN-SYSTEM.md`
**Action:** Append a new section "v36 Tokens (additive — Livinity Design Port)" documenting the new vars + Tailwind utilities + migration path.

Section outline:
- One-line scope ("monochrome palette, r-* radii, shadow-window-soft/pop, ease-out-v36")
- Var-table for `--fg/--bg/--surface/--line/--r-*/--shadow-*/--ease-*`
- Tailwind utility-table (`bg-fg`, `text-fg-mute`, `border-line`, `rounded-r-lg`, etc.)
- Migration note: "v36 tokens are opt-in. Components on `--accent-blue` stay on `--accent-blue`; new components and migrated components use the v36 palette."
- Pointer: "See `.planning/v36-DESIGN-PORT-MASTER.md` for the 8-step migration roadmap."

**Commit message:**
```
docs(design-tokens): document v36 additive tokens [v36/P122-04]

References .planning/v36-DESIGN-PORT-MASTER.md as the migration plan.
```

---

## Acceptance criteria

- [ ] **AC-122-1:** `git diff master HEAD` after Phase 122 ships shows ONLY 3 files: `tokens.css`, `tailwind.preset.cjs`, `DESIGN-SYSTEM.md`. Zero ui/src/** files in the diff.
- [ ] **AC-122-2:** All existing `--accent-blue`, `--dash-line`, `--dash-line-strong`, `--card-bg`, `--card-bg-2`, `--card-shadow`, `--hero-grad`, `--dash-radius`, `--dash-pad`, `--accent-green/amber/red` values byte-identical pre/post (regex grep proof in 122-SUMMARY.md).
- [ ] **AC-122-3:** New Tailwind utilities emit correct CSS — manual test via a throwaway `<div className="bg-fg text-fg-mute border-line rounded-r-lg shadow-window-soft" />` in a scratch story; CSS-output check via DevTools Computed panel.
- [ ] **AC-122-4:** `pnpm --filter ui build` exits 0 with no new warnings.
- [ ] **AC-122-5:** Vite dev (`pnpm --filter ui dev`) HMRs cleanly after each commit; zero red console errors.
- [ ] **AC-122-6:** Visual non-regression — `localhost:3000` screenshot diff against `v36-microstep-glass.png` baseline = noise only.
- [ ] **AC-122-7:** Sacred SHA preserved across all Phase 122 commits — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

---

## Non-goals (defer to later phases)

- ❌ Any `livos/packages/ui/src/**` file edits → Phases 123-129
- ❌ Dark mode tokens → D-116-FOLLOW-UP-DARK (separate ticket)
- ❌ Iridescent theme → D-116-FOLLOW-UP-IRIDESCENT (separate ticket)
- ❌ Removing or aliasing existing `--accent-blue` → v37 cleanup pass
- ❌ Font self-hosting changes → fonts.css already ships Geist + Instrument Serif via Phase 116
- ❌ Storybook stories for new tokens → optional v37 polish

---

## Risks + mitigations

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | Tailwind preset name collision (existing `accent-blue` vs new `accent`) | New names all distinct (`fg`, `bg`, `surface`, `line`, `r-*`). Existing names retained. Verified by grep against current preset before 122-02. |
| R2 | Build cache stale → utilities not emitted | Run `pnpm --filter @livinity/design-tokens build && pnpm --filter ui build` after each commit. design-tokens tsup chassis is fast (<2s). |
| R3 | New utility names accidentally already used in `tw\`\`` template literals → unintended consumer change | Pre-flight `grep -r 'bg-fg\b\|text-fg-mute\|border-line\b\|rounded-r-' livos/packages/ui/src/` → must return zero hits. |
| R4 | `--accent-blue` rgba ports in some shadcn primitive surprise-resolve via new `--accent` | Token vars use distinct CSS custom-property names. CSS doesn't cascade between unrelated names. Verified by Phase 116 lock test. |

---

## After this phase ships

- Phase 123 (Button shadcn override) becomes unblocked.
- Update `MEMORY.md` `[v36 LivOS Visual Redesign DRAFT]` entry to point at this master + Phase 123 next.
- Mini PC deploy: NOT required after 122 (no visible delta). Defer the `bash /opt/livos/update.sh` deploy until Phase 123 ships its first visible Button delta.

---

## Sacred-SHA check pre-commit hook

After every commit in this phase:
```bash
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# Expected: f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
