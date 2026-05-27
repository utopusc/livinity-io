---
phase: 232-livinity-brand-overlay
status: SHIPPED (REDUCED SCOPE — 4/6 SCs GREEN)
tags: [v42, branding, caddy, livinity-design-system, mini-pc, reduced-scope, architectural-deferral]
plans:
  - 232-01-PLAN.md (SHIPPED via commit fab62d8c)
  - 232-02-PLAN.md (SHIPPED via commits 26e956cf + fd88a454)
verdict: 4/6 SCs GREEN — SC-02, SC-04, SC-05, SC-06 PASS; SC-01 + SC-03 deferred to architectural follow-up
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f (UNCHANGED across all 3 commits)
mini_pc_sha256: 62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe (UNCHANGED)
completed: "2026-05-27T14:10:00Z"
duration: "~40 min end-to-end"
---

# Phase 232 — Livinity Brand Overlay: SHIPPED (Reduced Scope)

Static /liv/branding/* asset serving deployed live on Mini PC; HTML injection deferred to architectural follow-up.

## Outcome

- ✅ **Static branding assets serving live** on `https://bruce.livinity.io/liv/branding/{livinity-overlay.css,favicon.svg,manifest.json}` — all 3 return HTTP 200 with correct content-types (text/css, image/svg+xml, application/json) and sizes (669/240/203 bytes matching repo).
- ✅ **Caddy reload health restored** post-hot-fix. `caddy validate` GREEN.
- ✅ **update.sh idempotency proven** across 4 RUNs — `cmp -s` skip-if-identical guard + marker-file `find -newer` EMPTY proof.
- ✅ **Sacred SHA preserved** — repo `git hash-object liv/packages/core/src/sdk-agent-runner.ts` and Mini PC `sha256sum` both byte-identical to baseline across all 3 commits.
- ⏸ **HTML overlay injection** (the `<link rel="stylesheet" href="/liv/branding/livinity-overlay.css">` insertion before `</head>`) is **DEFERRED to architectural follow-up phase** — requires custom Caddy build via xcaddy + `caddyserver/replace-response` plugin (the plugin is NOT in the standard Caddy v2.11.3 distribution that the Mini PC's apt package ships).

## Plans

| Plan | Commit(s) | Result |
|------|-----------|--------|
| 232-01: repo-side scaffold (branding assets + caddy.ts patch + tests + install-liv-assistant.sh step) | `fab62d8c` | ✅ SHIPPED (4 tasks, 72/72 vitest PASS, sacred SHA hook PASS) |
| 232-02: Mini PC deploy + 6-SC smoke | `26e956cf` + `fd88a454` | ✅ SHIPPED **REDUCED SCOPE** (4/6 SCs GREEN, hot-fix included, DEPLOY-LOG.md 1002 lines) |

## Per-SC Verdict (final, rolled up)

| SC | Description | Verdict |
|----|-------------|---------|
| SC-01 | Caddy `replace`/`sub` directive emits | **FAIL → REVERTED** (Caddy v2.11.3 lacks `replace-response` module — Rule 4 architectural deferral) |
| SC-02 | `/liv/branding/*` static file handler emits | **PASS** (handle/root counts = 1 each; caddy validate GREEN) |
| SC-03 | HTML at /liv/ contains injected `<link>` | **FAIL → DEFERRED** (depends on SC-01) |
| SC-04 | CSS at `/liv/branding/livinity-overlay.css` returns 200 | **PASS** (HTTP 200, text/css, 669 B externally + via Cloudflare relay) |
| SC-05 | Sacred SHA unchanged | **PASS** (all 3 commits + 4 Mini PC sha256 verifies byte-identical to baseline) |
| SC-06 | update.sh re-run idempotent | **PASS** (find -newer EMPTY + md5-stable across 4 RUNs + log `Branding asset *: unchanged`) |

## Architectural Follow-up Required (Rule 4 escalation)

To unblock SC-01 + SC-03, the operator needs to decide between:

1. **Recommended path:** Rebuild Caddy with xcaddy:
   ```bash
   sudo apt install -y golang-go
   go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
   xcaddy build v2.11.3 --with github.com/caddyserver/replace-response
   sudo systemctl stop caddy
   sudo cp ./caddy /usr/bin/caddy
   sudo systemctl start caddy
   ```
   Then revert the `fix(232-02)` commit (or apply a forward patch re-adding the `replace` directive). Cost: ~30 MB binary + 1 install step + ~5 min build. Net benefit: full HTML overlay injection works.

2. **Alternative:** Browser-side overlay via AionUi plugin/extension or Service Worker (NOT recommended — more invasive than xcaddy build).

3. **Status quo:** Ship Phase 232 in reduced scope; do not block v42 milestone close on visual brand identity.

## Locked Invariants (preserved)

- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` — UNCHANGED across all 3 Phase 232 commits. Pre-commit hook `[sacred-sha] PASS: 20 files verified` on every commit.
- **D-V42-SACRED** (no source patches to vendored AionUi tarball): respected — branding strategy is Caddy-layer only, no AionUi files touched.
- **D-V42-NO-PHONE-HOME** (no telemetry from livinityd): respected — Space Grotesk @import is CLIENT-side; livinityd makes zero outbound calls for branding.
- **D-V42-ROLLBACK:** Phase 232 IS reversible — `git revert fab62d8c 26e956cf` would remove all repo changes, and the next `update.sh` on Mini PC would regenerate /etc/caddy/Caddyfile without the branding handle. `/etc/liv-assistant/branding/` would remain on disk but unreachable (not blocking).

## Key Files

- `caddy/branding/livinity-overlay.css` — 669 B
- `caddy/branding/favicon.svg` — 240 B
- `caddy/branding/manifest.json` — 203 B
- `caddy/branding/README.md` — 74 lines (operator doc)
- `livos/packages/livinityd/source/modules/domain/caddy.ts` — added `LIV_BRANDING_HANDLE` constant + 3-site interpolation (replace directive REMOVED in hot-fix)
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — added Phase 232 describe block with 9 vitest assertions (72/72 PASS)
- `scripts/install-liv-assistant.sh` — added Phase 232 step (idempotent cmp -s + install -m 0644)
- `.planning/phases/232-livinity-brand-overlay/232-01-SUMMARY.md`
- `.planning/phases/232-livinity-brand-overlay/232-02-SUMMARY.md`
- `.planning/phases/232-livinity-brand-overlay/232-02-DEPLOY-LOG.md` — 1002 lines audit trail

## Phase 232 closes — v42 milestone advances

222 ✅ + 223 ✅ + 224 ✅ + 225 ✅ + 226 ✅ + 227 ✅ + 228 ✅ + 232 ✅ (reduced) → **8/12 v42 phases shipped** (229, 230, 231, 233 still open).

## Self-Check: PASSED

- 3 commits (`fab62d8c`, `26e956cf`, `fd88a454`) all on origin/master: VERIFIED
- 4 branding asset files in repo: FOUND
- caddy.ts patched (static handler only): FOUND
- caddy.test.ts 72/72 PASS: VERIFIED
- install-liv-assistant.sh Phase 232 step: FOUND
- DEPLOY-LOG.md 1002 lines: FOUND
- Sacred SHA preserved: VERIFIED via 4 separate checks (pre-commit hook ×3 + Mini PC sha256 ×4)
- Mini PC services all active: VERIFIED
- External curl /liv/branding/livinity-overlay.css → HTTP 200 + text/css + 669 B: VERIFIED
