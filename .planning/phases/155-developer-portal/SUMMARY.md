# Phase 155 — Developer Portal + Docs — ✅ SHIPPED 2026-05-18

**Milestone:** v37.0
**Status:** CODE-COMPLETE — Vercel-side `/developers` route published
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

## What ships

`/developers` route on platform/web — a single-page developer portal with the v37 Plugin SDK reference. Lives at `livinity.io/developers` (or localhost:3001/developers).

## 7 sections + hero

1. **Hero** — "Extend LivOS with *signed plugins*." italic-serif headline + Plugin SDK eyebrow + View on GitHub / Read the spec CTAs.
2. **§01 What a plugin is** — 4-up card grid (Routes / Widgets / Commands / MCPs) covering each hook type.
3. **§02 Package layout** — annotated `.livpkg.tgz` directory tree in dark code block.
4. **§03 Manifest** — full `plugin-manifest.json` example with syntax-highlighted JSON (key/string/number/comment colors), pill row with feature flags.
5. **§04 Backend module** — `backend/index.mjs` example showing `onActivate`, `onDeactivate`, `handlers`, `commands`.
6. **§05 UI bundle** — UMD wrapper example + Shadow-DOM isolation note.
7. **§06 Publishing** — 4-step submission flow (fork repo → build tgz → co-sign PR → catalog entry).
8. **§07 Reference plugins** — 3-up card grid (hello-world / livinity-broker / @livinity/plugin-sdk).
9. **Footer** — version + livinity-apps repo link.

## Files

- `platform/web/src/app/developers/layout.tsx` — fonts bridge + DS tokens
- `platform/web/src/app/developers/developers.css` — portal-specific styles (hero, sections, code blocks, steps, pill row, grid)
- `platform/web/src/app/developers/page.tsx` — full single-page content

## Token reuse

`developers.css` imports from `store.css` (DS root tokens). Same Geist + Geist Mono + Instrument Serif as /store. Code blocks use `--fg` background (inverted) for the dark-theme accent.

## Smoke

- `tsc --noEmit` clean
- `curl /developers` → HTTP 200
- chrome-devtools-mcp screenshot in `.planning/phases/155-developer-portal/screenshots/dev-hero.png`

## Acceptance

- [x] /developers route loads on Vercel + localhost:3001
- [x] 7 numbered sections all render with DS-native typography
- [x] Code blocks syntax-highlighted (4-color scheme: key/string/number/comment)
- [x] CTAs link to GitHub (livinity-apps repo) and #manifest anchor
- [x] Italic-serif headlines on hero + every section title
- [x] Responsive grid collapses at 720px

## Carryover

- No interactive "Try the SDK in browser" sandbox (would need a Monaco editor + remote build pipeline — v38)
- No localized translations (v38)
- No version selector for older SDK versions (only v37 exists today)
- No search/index (v38 candidate)

See also: [[148-SPEC]] §3 (manifest schema source of truth), [[153-plugin-runtime]] (the runtime this portal documents).
