---
phase: 122
name: Design Tokens (Additive Port, Step 1 of 8)
milestone: v36.0
status: SHIPPED
shipped_at: 2026-05-15
commits:
  - c2dbcd0c feat(design-tokens): add v36 design system tokens (additive) [v36/P122-01]
  - 518a0de6 feat(design-tokens): wire v36 tokens into Tailwind preset (additive) [v36/P122-02]
  - 658714ee docs(design-tokens): document v36 additive tokens [v36/P122-04]
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved 3/3 commits)
visible_delta: NONE expected (token additive)
acceptance_criteria: 7/7 PASS
---

# Phase 122 — Design Tokens (Additive Port, Step 1 of 8) — SHIPPED

## What shipped

Three atomic commits added the Livinity Design System tokens to `@livinity/design-tokens` **without renaming or value-changing any existing v35.0 token** — pure additive port:

1. **`c2dbcd0c`** — `tokens.css`: 50-line `:root` block appended with 22 new CSS vars (fg/fg-dim/fg-mute/fg-faint/bg/bg-2/surface/surface-2/line/line-strong/accent/accent-soft/blue/green-bright/r-xs..r-full/shadow-window/shadow-pop/ease-out-v36/ease-in-out-v36/sans/mono/serif). `--shadow-card` aliases existing `--card-shadow` (byte-equal). `--mono` / `--serif` alias existing `--font-mono` / `--font-serif`.
2. **`518a0de6`** — `tailwind.preset.cjs`: 38-line additive block ships Tailwind utility classes for the safe subset (`colors.fg/fg-dim/fg-mute/fg-faint/surface/surface-2/line/line-strong`, `boxShadow.window-soft/pop`, `transitionTimingFunction.out-v36/in-out-v36`).
3. **`658714ee`** — `DESIGN-SYSTEM.md`: 79-line section documenting new tokens + utility table + migration guide + 1.1.0 changelog entry.

## Deviation from PLAN.md

Phase 122-02 SKIPPED four utility groups from the original plan due to Tailwind 3.x semantic collisions discovered during pre-flight:

| Skipped | Reason | Consumer workaround |
|---------|--------|---------------------|
| `borderRadius.{r-xs, r-sm, r, r-md, r-lg, r-xl, r-2xl}` | Generates `rounded-r-lg` etc. which already exists as Tailwind's directional `rounded-{side}-{size}` alias. Real call-site found at `livos/packages/ui/src/features/files/components/sidebar/sidebar-network-storage.tsx` using `rounded-r-lg` in the directional sense (8px right-only); adding the v36 18px alias would silently re-resolve to 18px all-sides. | `rounded-[var(--r-lg)]` arbitrary value, or existing `rounded-dash` (already 18px). |
| `colors.{bg, bg-2}` | `bg-bg` reads weirdly; ambiguous. | `bg-[var(--bg)]` arbitrary value. |
| `colors.{accent, accent-soft}` | Radix UI reserves `accent` theme keys; collision risk. | `bg-[var(--accent)]` arbitrary value. |
| `fontFamily.v36-serif` | Existing `serif` already maps to Instrument Serif (Phase 116). | Use existing `font-serif` directly. |

The CSS vars themselves are fully shipped — only the Tailwind utility convenience classes were narrowed. Consumers needing the skipped tokens use `var(--…)` references via Tailwind's arbitrary value syntax. Deviation documented in DESIGN-SYSTEM.md "Deliberately NOT exposed" section.

## Acceptance criteria (7/7 PASS)

- ✅ **AC-122-1** — `git diff master HEAD -- livos/` shows ONLY `design-tokens/{tokens.css, tailwind.preset.cjs, DESIGN-SYSTEM.md}`. Zero `livos/packages/ui/src/**` files in the diff.
- ✅ **AC-122-2** — 6 existing canonical tokens byte-identical (grep proof: `--accent-blue`, `--dash-line`, `--card-shadow`, `--card-bg`, `--hero-grad`, `--dash-radius` all hit; `getComputedStyle(html).getPropertyValue('--accent-blue')` returns `#2563eb` post-change).
- ✅ **AC-122-3** — New utilities defined in preset source (verified via grep `"fg":|"surface":|"line":|"window-soft":|"pop":|"out-v36":` → 6/6 hits). Runtime emit deferred until first consumer use (Tailwind JIT — by design).
- ✅ **AC-122-4** — `livos/packages/ui` Vite dev build green; only pre-existing `@import must precede all other statements` warnings (caused by `livos/packages/ui/src/styles/index.css` import ordering, unrelated to Phase 122).
- ✅ **AC-122-5** — Vite dev HMR clean after each commit; zero red console errors.
- ✅ **AC-122-6** — Visual non-regression confirmed via screenshot diff `.planning/phases/122-design-tokens-additive-port/122-03-smoke.png` vs baseline `.planning/phases/v36-microstep-glass.png` = layout, icons, dock, wallpaper, glass effects all byte-equal.
- ✅ **AC-122-7** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved through all 3 Phase 122 commits (verified post each commit).

## After this phase

- Phase 123 (Button shadcn override) is now unblocked.
- The 8 new Tailwind utility classes are addressable from any consumer in `livos/packages/ui/src/**`; their CSS rules emit on first use (Tailwind JIT).
- No Mini PC deploy required (no visible delta).
- The deviation set (`r-*`, `bg`, `accent`, `fontFamily`) is documented; Phase 123+ consumers either use `bg-fg`/`text-fg-mute`/`border-line` directly OR fall back to `var(--…)` arbitrary values for the skipped tokens.

## Files changed

```
livos/packages/design-tokens/tokens.css           +50 / -0
livos/packages/design-tokens/tailwind.preset.cjs  +38 / -0
livos/packages/design-tokens/DESIGN-SYSTEM.md     +79 / -0
3 files changed, 167 insertions(+), 0 deletions(-)
```

## Verification artifact

`.planning/phases/122-design-tokens-additive-port/122-03-smoke.png` — post-122 screenshot, byte-equal to `v36-microstep-glass.png` baseline (no visible regression).
