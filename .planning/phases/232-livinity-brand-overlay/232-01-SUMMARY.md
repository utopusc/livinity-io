---
phase: 232-livinity-brand-overlay
plan: 01
subsystem: caddy-livinityd
tags: [v42, branding, caddy, sub-directive, livinityd, regen-survivable, livinity-design-system, mini-pc, code-only]
requires:
  - .planning/phases/226-caddy-liv-proxy-iframe-headers/226-04-SUMMARY.md  # LIV_ASSISTANT_HANDLE regen pattern
  - .planning/phases/223-vendor-aionui-install/223-05-SUMMARY.md           # install-liv-assistant.sh + D-V42-SACRED
  - .planning/milestones/v42/PROJECT.md                                    # D-V42-LIVINITY-BRAND + D-V42-NO-PHONE-HOME
provides:
  - LIV_BRANDING_HANDLE constant in caddy.ts (serves /liv/branding/* statically)
  - replace directive in LIV_ASSISTANT_HANDLE (injects <link> tag pre-</head>)
  - 4 brand assets under caddy/branding/ (CSS + SVG + JSON + README)
  - idempotent Phase 232 step in scripts/install-liv-assistant.sh
affects:
  - Mini PC /etc/caddy/Caddyfile (on next livinityd regen — Plan 02 deploy)
  - Mini PC /etc/liv-assistant/branding/ (on next install-liv-assistant.sh run — Plan 02 deploy)
tech-stack:
  added: []
  patterns: ["Caddy v2 replace-response module", "regen-survivable directive emission (Phase 226-04 pattern)", "cmp -s skip-if-identical idempotency"]
key-files:
  created:
    - caddy/branding/livinity-overlay.css        # Space Grotesk + #1d1d1f accent, 669 B
    - caddy/branding/favicon.svg                  # 32x32 Livinity L mark, 240 B
    - caddy/branding/manifest.json                # PWA manifest, 203 B
    - caddy/branding/README.md                    # operator-facing doc, 74 lines
  modified:
    - livos/packages/livinityd/source/modules/domain/caddy.ts        # +LIV_BRANDING_HANDLE const + replace directive in LIV_ASSISTANT_HANDLE + 3-site interpolation
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts   # +Phase 232 describe with 9 assertions (72 total tests PASS, +9 new)
    - scripts/install-liv-assistant.sh                                # +Phase 232 branding-copy step (cmp -s idempotent)
decisions:
  - "Strategy: Caddy directive injection at proxy layer (no fork of AionUi tarball) — honors D-V42-SACRED"
  - "Module: caddyserver/replace-response (positional `replace SEARCH REPLACE` form; matches text/html responses by default — JS/CSS/JSON pass through untouched)"
  - "Path scheme: /liv/branding/* served by LIV_BRANDING_HANDLE emitted IMMEDIATELY BEFORE LIV_ASSISTANT_HANDLE in every emit site (apex + multi-user subdomain + null-mainDomain :80 fallback)"
  - "Strip-prefix correctness: `uri strip_prefix /liv/branding` (NOT `/liv`) so /liv/branding/livinity-overlay.css resolves to /etc/liv-assistant/branding/livinity-overlay.css under root, NOT /etc/liv-assistant/branding/branding/livinity-overlay.css"
  - "Space Grotesk via fonts.googleapis.com @import is CLIENT-side (browser fetch); livinityd itself makes zero outbound calls — acceptable for v42 per D-V42-NO-PHONE-HOME; README documents the v43 woff2 self-host migration path"
  - "Idempotency: cmp -s skip-if-identical guard in install-liv-assistant.sh — install -m 0644 only runs when content differs (otherwise file mtime would tick on every re-run)"
metrics:
  duration: "~10 min (Tasks 1-4)"
  tasks: 4
  files-created: 4
  files-modified: 3
  tests-added: 9
  tests-total-passing: 72
  completed: "2026-05-27T13:49:22Z"
  commit: fab62d8c
---

# Phase 232 Plan 01: Livinity brand overlay (code-side scaffold) Summary

Repo-side scaffolding for the v42 milestone's Livinity brand overlay — applied via Caddy directive injection (zero source patches to vendored AionUi tarball per D-V42-SACRED). Single atomic commit `fab62d8c` lands 4 new brand assets + 3 patched files. All 72 caddy.test.ts tests PASS. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.

## Tasks Completed (4/4)

| # | Task | Verdict | Commit |
|---|------|---------|--------|
| 1 | Create branding assets under caddy/branding/ (CSS + favicon + manifest + README) | PASS | fab62d8c |
| 2 | Patch caddy.ts (LIV_BRANDING_HANDLE constant + replace directive + 3-site emission) | PASS | fab62d8c |
| 3 | Extend caddy.test.ts (+9 assertions) + install-liv-assistant.sh (+Phase 232 step) | PASS | fab62d8c |
| 4 | Atomic commit + sacred-SHA hook verify + push origin/master | PASS | fab62d8c |

Single atomic commit per plan policy — `feat(232-01):` lands 7 files together.

## Verification Evidence

### caddy.ts patch
- `LIV_BRANDING_HANDLE` constant declared at the doc-comment block above `LIV_ASSISTANT_HANDLE`
- 3 interpolations of `${LIV_BRANDING_HANDLE}` (one per emit site: fallback :80, apex, multi-user subdomain)
- `replace "</head>" "<link rel=\"stylesheet\" href=\"/liv/branding/livinity-overlay.css\"></head>"` added inside LIV_ASSISTANT_HANDLE between CSP header and closing brace

### caddy.test.ts — 72/72 PASS
```
✓ source/modules/domain/caddy.test.ts (72 tests) 12ms
Test Files 1 passed (1)
Tests 72 passed (72)
```
(was 63 pre-232; +9 new Phase 232 assertions)

### Shell syntax
- `bash -n scripts/install-liv-assistant.sh` → exit 0 (no syntax errors)
- Phase 232 step grep present
- Final-summary log line for branding directory present

### Sacred SHA
- `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` → `100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0` (UNCHANGED — pre-commit hook PASS: "20 files verified")

### Asset sizes
| File | Bytes | Budget | OK |
|------|-------|--------|-----|
| livinity-overlay.css | 669 | < 2048 | ✓ |
| favicon.svg | 240 | < 1024 | ✓ |
| manifest.json | 203 | < 512 | ✓ |
| README.md | 74 lines | ≥ 20 | ✓ |

## Deviations from Plan

None — plan executed exactly as written.

## Deferred (out of scope)

- Pre-existing TypeScript errors in livinityd (`webapps/trpc-router.ts`, `webapps/pipewire-portal.test.ts`, `widgets/routes.ts`, `xai-auth/*`, `webapps/xvfb-display.ts`) — unrelated to caddy.ts patches. Logged here for later cleanup; out-of-scope per executor Rule 4 (no architectural change in this plan's scope).
- Live Caddy validate verification — deferred to Plan 02 (caddy validate runs during update.sh Step on Mini PC).
- Live HTML injection verification + CSS HTTP 200 — deferred to Plan 02 external curl smoke.

## SC Scoreboard (Plan 01 code-side)

- **SC-01 PARTIAL (code side):** `replace "</head>"` emits in caddy.ts → asserted in test; live Caddy validation deferred to Plan 02
- **SC-02 PARTIAL (code side):** `handle /liv/branding/*` emits in caddy.ts → asserted in test; live HTTP 200 deferred to Plan 02
- **SC-03 DEFERRED:** HTML contains `<link>` tag → Plan 02 external curl smoke
- **SC-04 DEFERRED:** /liv/branding/livinity-overlay.css returns 200 → Plan 02 external curl smoke
- **SC-05 GREEN:** Sacred SHA UNCHANGED → pre-commit hook PASS + post-push verify
- **SC-06 PARTIAL (code side):** `cmp -s` guard in install-liv-assistant.sh → asserted via grep; live 2-RUN idempotency deferred to Plan 02

## Self-Check: PASSED

- caddy/branding/livinity-overlay.css: FOUND
- caddy/branding/favicon.svg: FOUND
- caddy/branding/manifest.json: FOUND
- caddy/branding/README.md: FOUND
- caddy.ts LIV_BRANDING_HANDLE: FOUND
- caddy.test.ts Phase 232 describe: FOUND
- install-liv-assistant.sh Phase 232 step: FOUND
- commit fab62d8c: FOUND on origin/master
- sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f: UNCHANGED
