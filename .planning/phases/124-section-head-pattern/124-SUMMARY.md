---
phase: 124
name: Section-Head Pattern as <SettingsPageHeader/> (Step 3 of 8)
milestone: v36.0
status: SHIPPED
shipped_at: 2026-05-15
commits:
  - 780d668a feat(settings): add v36 SettingsPageHeader + migrate ai-config (Step 3 of 8) [v36/P124-01]
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved 1/1)
visible_delta: ai-config page header — eyebrow → italic-serif title → sub
acceptance_criteria: 5/5 PASS
---

# Phase 124 — Section-Head Pattern — SHIPPED

## What shipped

One atomic commit (`780d668a`) introduces the v36 section-head pattern as a shared component and migrates the first consumer:

1. **NEW** `livos/packages/ui/src/components/settings-page-header.tsx` — `<SettingsPageHeader eyebrow title titleAccent sub backTo />` (53 lines). Mono uppercase 11px eyebrow + 32px font-light h1 with optional `<em>` italic-serif accent + 14px body sub paragraph (max-width 560px). Uses v36 tokens (`text-fg`, `text-fg-mute`, `text-fg-faint`, `border-line`, `border-line-strong`, `font-serif italic`, `font-mono`).
2. **ADDITIVE** `livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx` — new `hideHeader?: boolean` prop. Default `false` → all 30+ settings pages render byte-identically. When `true`, suppresses the default title/back-button bar so the consumer can render its own `<SettingsPageHeader/>`.
3. **CONSUMER** `livos/packages/ui/src/routes/settings/ai-config.tsx` — first opt-in. Sets `hideHeader` + renders `<SettingsPageHeader eyebrow="01 · AI" title="Configure your" titleAccent="assistant." sub="..."/>`.

## Acceptance criteria (5/5 PASS)

- ✅ **AC-124-1** — `git diff master 780d668a -- livos/` shows exactly 3 files (new component + additive prop + first consumer). Zero other settings pages touched.
- ✅ **AC-124-2** — `SettingsPageLayout` default (without `hideHeader`) renders byte-identically. Existing 30+ settings pages unaffected.
- ✅ **AC-124-3** — v36 utility classes used (`text-fg`, `text-fg-mute`, `text-fg-faint`, `border-line`, `border-line-strong`, `font-serif italic`, `font-mono`) — Tailwind emits CSS for these classes from button.tsx (P123) and now also from settings-page-header.tsx (P124).
- ✅ **AC-124-4** — Overlay proof `.planning/phases/124-section-head-pattern/124-section-head-proof.png` shows the section-head pattern rendering correctly with all v36 tokens applied (eyebrow mono uppercase, italic-serif accent, sub paragraph).
- ✅ **AC-124-5** — Sacred SHA `f3538e1d...` preserved post-commit.

## Production visual delta

The `/settings/ai-config` page now opens with the v36 section-head pattern at top:

```
01 · AI

Configure your assistant.
Connect Kimi or Claude as your primary AI provider. Set the
active model and tune computer-use settings — these apply to
every Liv conversation across your devices.
```

(eyebrow Geist Mono uppercase + 32px light Geist headline with Instrument Serif italic accent + 14px body sub)

Other settings pages (~30) keep their existing basic title bar. Phases 125-129 may migrate more pages opt-in.

## Files changed

```
livos/packages/ui/src/components/settings-page-header.tsx                                    +73 / -0
livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx                   +15 / -8
livos/packages/ui/src/routes/settings/ai-config.tsx                                          +13 / -7
3 files changed, 101 insertions(+), 15 deletions(-)
```

## After this phase

- Phase 125 (Field-Card + List-Row) unblocked.
- The shared `SettingsPageHeader` is reusable from any page — Phases 125+ may use it where appropriate.

## Verification artifact

`.planning/phases/124-section-head-pattern/124-section-head-proof.png` — overlay probe showing the SectionHead with all v36 tokens applied.
