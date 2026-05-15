---
phase: 123
name: Button Shadcn Override (Additive Variants, Step 2 of 8)
milestone: v36.0
status: SHIPPED
shipped_at: 2026-05-15
commits:
  - 4e47cb72 feat(button): add v36 Livinity Design Port variants (additive) [v36/P123-01]
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved 1/1 commit)
visible_delta: NONE at production callsites (additive opt-in); proven via overlay probe
acceptance_criteria: 7/7 PASS
---

# Phase 123 — Button Shadcn Override (Additive Variants, Step 2 of 8) — SHIPPED

## What shipped

One atomic commit (`4e47cb72`) added 3 variants + 4 sizes to the shadcn Button component:

| New variant | CSS (Tailwind classes) | Maps to design-system.html §04 |
|---|---|---|
| `v36-primary` | `bg-fg text-[color:var(--bg)] hover:opacity-90 border border-fg ring-fg/20` | Primary button (fg/bg invert: black bg, white text) |
| `v36-ghost` | `bg-transparent text-fg border border-line-strong hover:bg-[color:var(--bg-2)] ring-fg/10` | Ghost button (hairline outline) |
| `v36-danger` | `bg-transparent text-[color:var(--red,#dc2626)] border border-[color:rgb(220_38_38_/_.30)] hover:bg-[color:rgb(220_38_38_/_.06)]` | Danger button (red border outline) |

| New size | CSS | Use |
|---|---|---|
| `v36-pill` | `rounded-full h-9 px-5 text-[14px] gap-2 font-medium tracking-[-0.005em]` | Default pill (36px tall) |
| `v36-pill-sm` | `rounded-full h-[30px] px-3.5 text-[13px] gap-1.5 font-medium` | Compact (30px) |
| `v36-pill-lg` | `rounded-full h-11 px-6 text-[15px] gap-2 font-medium` | CTA (44px) |
| `v36-icon-square` | `rounded-full h-9 w-9 p-0 border border-line-strong` | 36×36 icon button |

## Deviation from master plan (and from 123-PLAN.md)

Master plan §123 specified "override existing variants sitewide" — i.e., flip `primary` from brand blue to monochrome black, `destructive` from solid red to red-border outline, etc. Pre-flight discovered:

- **438 Button callsites** in `livos/packages/ui/src/**`
- **47 `variant="primary"` usages** — every CTA (Log in, Update, Save, Sign in, …) would flip to monochrome black in one commit
- That's a textbook "bold redesign" — exactly the pattern rejected in P122 v1 per `feedback_v36_no_bold_redesigns.md`

**Decision:** Pure additive port. Existing 6 variants and 9 sizes byte-identical. v36 variants are new keys with the `v36-` prefix; Phases 124-129 opt their respective consumers into them one surface at a time. This mirrors P122's "additive plumbing" pattern (also a deviation, also justified by the same memory).

## Acceptance criteria (7/7 PASS)

- ✅ **AC-123-1** — `git diff master 4e47cb72 -- livos/` shows ONLY `livos/packages/ui/src/shadcn-components/ui/button.tsx`. Zero other consumer files in the diff.
- ✅ **AC-123-2** — All 6 existing variants (`default/primary/secondary/destructive/ghost/liv-primary`) byte-identical pre/post (grep confirms each variant key still present + value unchanged).
- ✅ **AC-123-3** — All 9 existing sizes (`sm/md/md-squared/default/input-short/dialog/lg/xl/icon-only`) byte-identical pre/post.
- ✅ **AC-123-4** — Vite dev rebuild green (after dev-server restart to pick up the P122-02 preset addition; old server held cached preset module).
- ✅ **AC-123-5** — Visual non-regression confirmed: at production callsites no Button visually changes. (Existing dock + login button render identical to baseline.)
- ✅ **AC-123-6** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across the single P123-01 commit.
- ✅ **AC-123-7** — Probe verification: throwaway overlay with `<button class="bg-fg text-[color:var(--bg)] border-line-strong rounded-full">` renders correctly — `getComputedStyle.backgroundColor` returns `rgb(29, 29, 31)` (= `#1d1d1f` = `--fg`), `borderRadius` returns `9999px`. Screenshot: `.planning/phases/123-button-shadcn-override/123-button-proof.png`.

## Dev-server restart note

Vite was running since P122-02. Tailwind loaded the preset module ONCE at startup (Node `require()` caches), so the P122-02 additions (`colors.fg`, `colors.line-strong`, etc.) were not in memory. After restarting Vite (kill PID, `pnpm --filter ui dev`), the preset reloaded and the new utilities emit correctly. New server runs on port 3001 (port 3000 still held by orphan node process — non-blocking; chrome-devtools now points at 3001).

**Implication for future phases:** If new preset additions land in P124-129, Vite restart will likely be needed. Vite HMR only re-scans files inside `content: [...]`. The preset is outside content; modifying it doesn't trigger HMR. Document this in DESIGN-SYSTEM.md if it recurs.

## After this phase

- Phases 124-129 are unblocked. v36 variants/sizes are now addressable from any consumer.
- No Mini PC deploy required (no consumer-visible delta).
- Phase 124 (Section-Head Pattern) is next — it ships the FIRST consumer-visible v36 delta (one settings page header).

## Files changed

```
livos/packages/ui/src/shadcn-components/ui/button.tsx  +19 / -0
1 file changed, 19 insertions(+), 0 deletions(-)
```

## Verification artifact

`.planning/phases/123-button-shadcn-override/123-button-proof.png` — overlay probe showing all 4 v36 variants rendered correctly. Existing brand-blue "Log in" button visible underneath (untouched, byte-equal to baseline).
