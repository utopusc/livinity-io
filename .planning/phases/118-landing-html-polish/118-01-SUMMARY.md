---
phase: 118
plan: 01
subsystem: landing-static-html
tags: [landing, design-system, server5, tokens]
requires:
  - Phase 116 (@livinity/design-tokens)
provides:
  - "/opt/landing/livinity.io/_shared/tokens.css (canonical)"
  - "/opt/landing/livinity.io/_shared/fonts.css (self-hosted woff2)"
  - "8 landing HTML pages linked to shared tokens"
affects:
  - Server5 landing static HTML (no repo source edits)
tech-stack:
  added: []
  patterns:
    - "_shared/ subdir under Caddy file_server root"
    - "Idempotent <link> injection via Python regex marker `p118-01: shared design tokens`"
    - "Defense-in-depth: canonical files keep inline :root AND link _shared/tokens.css"
key-files:
  created:
    - "/opt/landing/livinity.io/_shared/tokens.css (Server5)"
    - "/opt/landing/livinity.io/_shared/fonts.css (Server5)"
    - "/opt/landing/livinity.io/_shared/fonts/Geist-Variable.woff2"
    - "/opt/landing/livinity.io/_shared/fonts/GeistMono-Variable.woff2"
    - "/opt/landing/livinity.io/_shared/fonts/InstrumentSerif-Regular.woff2"
    - "/opt/landing/livinity.io/_shared/fonts/InstrumentSerif-Italic.woff2"
    - ".planning/phases/118-landing-html-polish/118-01-SUMMARY.md"
  modified:
    - "/opt/landing/livinity.io/dashboard.html (Server5; +link tags only)"
    - "/opt/landing/livinity.io/dashboard-install.html (Server5; +link tags only)"
    - "/opt/landing/livinity.io/auth.html (Server5; +link tags + hex scrub)"
    - "/opt/landing/livinity.io/profile.html (Server5; +link tags + hex scrub, 3 replacements)"
    - "/opt/landing/livinity.io/customize.html (Server5; +link tags)"
    - "/opt/landing/livinity.io/download.html (Server5; +link tags)"
    - "/opt/landing/livinity.io/index.html (Server5; +link tags)"
    - "/opt/landing/livinity.io/forgot-password.html (Server5; +link tags + hex scrub, 1 replacement)"
decisions:
  - "D-118-CANONICAL-IS-DASHBOARD-HTML — honored: dashboard.html + dashboard-install.html kept their inline `:root { --dash-pad: 28px; ... }` block AND received the _shared/tokens.css link (defense-in-depth)."
  - "D-118-CADDY-FILE_SERVER-COMPATIBLE — honored: no Caddyfile edits required; new _shared/ subdir served immediately by existing `file_server` block."
  - "D-118-OFFLINE-RESILIENT — honored: 4 .woff2 files self-hosted under _shared/fonts/; fonts.css references local `./fonts/*.woff2` via @font-face."
  - "D-118-CROSS-REPO — honored: only SUMMARY committed in repo; Server5 source edits not mirrored (Server5 isn't a git checkout). Per-file `.pre-118-01.bak` rollback backups on Server5."
metrics:
  duration: ~20min
  completed: 2026-05-14
---

# Phase 118 Plan 01: Shared landing tokens + 8-page link foundation Summary

## Outcome

Canonical `_shared/tokens.css` + `_shared/fonts.css` deployed to Server5 under `/opt/landing/livinity.io/_shared/`. All 8 landing HTML pages now link both files in `<head>` (idempotent, marker `p118-01: shared design tokens`). Six needs-migration files were hex-scrubbed per the canonical replacement map; canonical dashboard pages retained their inline `:root` block (defense-in-depth per D-118-CANONICAL-IS-DASHBOARD-HTML). Foundation ready for Plan 118-02 (`_shared/nav.jsx`).

## Artifacts created on Server5

| Path | Size | SHA-1 | Byte-identical to repo? |
|---|---|---|:---:|
| `/opt/landing/livinity.io/_shared/tokens.css` | 1769 B | `35b1523fdc9b700b5a4beac04a2ecb3efee6ef99` | YES |
| `/opt/landing/livinity.io/_shared/fonts.css` | 1943 B | `a95d78654d662e3361b43a30e20332b5ee6628f1` | YES |
| `/opt/landing/livinity.io/_shared/fonts/Geist-Variable.woff2` | 69 436 B | `b56352040736c0238b9d7b2ab52c2b19625cf6f0` | YES |
| `/opt/landing/livinity.io/_shared/fonts/GeistMono-Variable.woff2` | 71 004 B | `9d76d5f55ee84013fbeb5e4926d5639b64633a1d` | YES |
| `/opt/landing/livinity.io/_shared/fonts/InstrumentSerif-Regular.woff2` | 21 032 B | `37ddf465bbcc252776a37dcf28179a3ca590363b` | YES |
| `/opt/landing/livinity.io/_shared/fonts/InstrumentSerif-Italic.woff2` | 22 128 B | `24e6c99ca08b1e5acc92cf106c586f491ed15151` | YES |

All 6 assets byte-identical to `livos/packages/design-tokens/{tokens,fonts}.css` + `livos/packages/design-tokens/fonts/*.woff2` in repo (verified via `sha1sum`).

## Backups on Server5

| Backup file | Size | Notes |
|---|---|---|
| `dashboard.html.pre-118-01.bak` | 53 566 B | Pre-118 canonical |
| `dashboard-install.html.pre-118-01.bak` | 28 617 B | Pre-118 canonical |
| `auth.html.pre-118-01.bak` | 44 957 B | Pre-118 |
| `profile.html.pre-118-01.bak` | 43 674 B | Pre-118 |
| `customize.html.pre-118-01.bak` | 27 718 B | Pre-118 |
| `download.html.pre-118-01.bak` | 21 459 B | Pre-118 |
| `index.html.pre-118-01.bak` | 6 518 B | Pre-118 |
| `forgot-password.html.pre-118-01.bak` | 12 655 B | Pre-118 |

`ls /opt/landing/livinity.io/*.pre-118-01.bak | wc -l` == **8** ✓

## Per-file hex-scrub diff (6 needs-migration files)

DRY-RUN counts (pre-scrub) → POST-scrub residual:

| File | blue (`#2563eb`) | green (`#16a34a`) | amber (`#d97706`) | red (`#dc2626`) | card2 (`#fafafa`) | line (`rgba(0,0,0,0.07)`) | line-strong (`rgba(0,0,0,0.12)`) | Replacements |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `auth.html` | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | **0** (uses generic `--bg`/`--fg`) |
| `profile.html` | 0→0 | **1→0** | **1→0** | **1→0** | 0→0 | **1→0** | 0→0 | **4** ✓ |
| `customize.html` | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | **0** (no `:root` block; no canonical hex) |
| `download.html` | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | **0** |
| `index.html` | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | **0** (marketing page; no canonical hex) |
| `forgot-password.html` | 0→0 | **1→0** | 0→0 | 0→0 | 0→0 | 0→0 | 0→0 | **1** ✓ |

**Total hex-literal substitutions:** 5 (4 in `profile.html`, 1 in `forgot-password.html`).

Observation: pre-scrub counts were low because INVENTORY-LANDING.md identified that most needs-migration files use parallel naming (`--green`, `--bg`, `--fg`) rather than raw canonical hex literals. The scrub still hit `profile.html`'s parallel `--green: #16a34a; --amber: #d97706; --red: #dc2626;` and its `--line: rgba(0,0,0,0.07);`, plus `forgot-password.html`'s single `#16a34a` accent. Conservative scope per plan (no `#ffffff`/bare-px scrub) was honored — those require per-instance review and are deferred to a future Phase 119 polish pass.

## HTTP probe results (Caddy public-URL smoke)

All over HTTPS via Cloudflare DNS + Caddy `file_server`:

| URL | HTTP | tokens-link in body | fonts-link in body |
|---|:---:|:---:|:---:|
| `https://livinity.io/_shared/tokens.css` | 200 | — | — |
| `https://livinity.io/_shared/fonts.css` | 200 | — | — |
| `https://livinity.io/_shared/fonts/Geist-Variable.woff2` | 200 | — | — |
| `https://livinity.io/_shared/fonts/GeistMono-Variable.woff2` | 200 | — | — |
| `https://livinity.io/_shared/fonts/InstrumentSerif-Regular.woff2` | 200 | — | — |
| `https://livinity.io/_shared/fonts/InstrumentSerif-Italic.woff2` | 200 | — | — |
| `https://livinity.io/` | 200 | 1 | 1 |
| `https://livinity.io/auth.html` | 200 | 1 | 1 |
| `https://livinity.io/dashboard.html` | 200 | 1 | 1 |
| `https://livinity.io/dashboard-install.html` | 200 | 1 | 1 |
| `https://livinity.io/profile.html` | 200 | 1 | 1 |
| `https://livinity.io/customize.html` | 200 | 1 | 1 |
| `https://livinity.io/download.html` | 200 | 1 | 1 |
| `https://livinity.io/forgot-password.html` | 200 | 1 | 1 |

`curl https://livinity.io/_shared/tokens.css | grep -c -- '--dash-pad: 28px'` == **1** ✓ (canonical token served live)

## Canonical defense-in-depth audit (D-118-CANONICAL-IS-DASHBOARD-HTML)

Verified that dashboard.html + dashboard-install.html retain inline `:root` block AND received `_shared/tokens.css` link:

| File | Inline `--dash-pad: 28px` | `_shared/tokens.css` linked |
|---|:---:|:---:|
| `dashboard.html` | 1 | 1 |
| `dashboard-install.html` | 1 | 1 |

Both files have BOTH (defense-in-depth honored).

## Carryover for 118-02 (and beyond)

- **Non-blocking — Phase 119 candidate:** the conservative `#ffffff` / `#fafafa` (when used as text-color) and bare `28px` / `18px` (when used in non-padding contexts) substitutions were intentionally NOT scrubbed mechanically (too ambiguous for blanket sed; risk of font-size collisions). 6 needs-migration files still contain some inline literals that a manual per-instance review could promote to canonical `var(--card-bg)` / `var(--dash-pad)`. Deferred.
- **Non-blocking — Phase 116 follow-up:** `tokens.css` still ships empty `body.dark { /* PENDING canonical fetch */ }` + `body.iridescent { /* PENDING canonical fetch */ }` stubs (D-116-FOLLOW-UP-DARK/IRIDESCENT). Server5 is now reachable — a Plan 116 follow-up patch could finally transcribe the dashboard.html dark/iridescent override blocks verbatim. **Not blocking 118-02.**
- **Non-blocking — Phase 118-02 prep:** all 8 HTML pages now share token cascade order (shared link → inline `<style>`). 118-02 can safely add `<script src="/_shared/nav.jsx">` to the same `<head>` injection point without disturbing this layer.

## Rollback recipe

If a regression is found and a full rollback is desired:

```bash
SSH_BIN='/c/Windows/System32/OpenSSH/ssh.exe'
KEY='C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master'
SSH_ARGS="-i $KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

$SSH_BIN $SSH_ARGS root@45.137.194.102 'bash -s' <<"REMOTE"
set -euo pipefail
cd /opt/landing/livinity.io
for f in dashboard dashboard-install auth profile customize download index forgot-password; do
  if [ -f "${f}.html.pre-118-01.bak" ]; then
    cp -a "${f}.html.pre-118-01.bak" "${f}.html"
    echo "restored: ${f}.html"
  fi
done
# Optionally also remove the shared dir (preserves the assets for re-deploy):
# rm -rf _shared
REMOTE
```

To rollback hex scrub only (preserve link tags), edit per-file or restore from `.pre-118-01.bak` and re-run the Phase A inject step from 118-01-PLAN.md.

## Decisions honored

- **D-118-CANONICAL-IS-DASHBOARD-HTML** — dashboard.html + dashboard-install.html were audit-only (`<link>` added, inline `:root` block preserved). Verified both still contain `--dash-pad: 28px` post-patch.
- **D-118-CADDY-FILE_SERVER-COMPATIBLE** — created `/opt/landing/livinity.io/_shared/` under existing Caddy file_server root. No Caddyfile changes. All 6 new assets served HTTP 200 on first probe (no reload required).
- **D-118-OFFLINE-RESILIENT** — 4 `.woff2` files self-hosted in `_shared/fonts/`. `fonts.css` references them via relative `./fonts/Geist-Variable.woff2` etc. Online Google Fonts CDN documented as fallback only.
- **D-118-CROSS-REPO** — only `.planning/phases/118-landing-html-polish/118-01-SUMMARY.md` committed in repo. Server5 HTML edits not mirrored (Server5 isn't a git checkout — per `feedback_update_sh_drift.md`). 8 `.pre-118-01.bak` rollback files live on Server5.

## Deviations from Plan

None — plan executed exactly as written. The conservative hex-scrub map (no `#ffffff`/`#fafafa`-in-text, no bare-px) matched the plan's stated boundary. Pre-scrub hex counts came in lower than INVENTORY-LANDING.md's prose suggested (inventory listed parallel-naming drift, not raw-hex drift), so total mechanical substitutions = 5. Behaviour intended.

## Self-Check: PASSED

- `/opt/landing/livinity.io/_shared/tokens.css` exists on Server5, HTTP 200, SHA matches repo
- `/opt/landing/livinity.io/_shared/fonts.css` exists on Server5, HTTP 200, SHA matches repo
- 4 `.woff2` files in `_shared/fonts/`, all HTTP 200, all SHAs match repo
- 8 HTML files each have exactly 1× `_shared/tokens.css` link and 1× `_shared/fonts.css` link (verified per-file `grep -c`)
- 2 canonical files retain inline `--dash-pad: 28px` block (defense-in-depth)
- 6 needs-migration files have zero residual `#2563eb` / `#16a34a` / `#d97706` / `#dc2626` / `#fafafa` / `rgba(0,0,0,0.07)` / `rgba(0,0,0,0.12)` literals
- 8 `.pre-118-01.bak` backup files present (`ls *.pre-118-01.bak | wc -l == 8`)
- This SUMMARY.md exists in `.planning/phases/118-landing-html-polish/`
