# Phase 134 Master Plan — CF Tunnel as Default Hybrid Transport

**Goal:** `--mode hybrid` (the default) transparently uses Cloudflare Tunnel as its transport mechanism. Direct-LAN retired. Wizard auto-provisions tunnel via CF API. Existing Mini PC migrates via automated script. Universal one-liner install preserved.

**Success criteria (UAT goal-backward):**
1. `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid --domain <domain> --api-key liv_k_<…> --cf-tunnel-token <auto-from-wizard>` succeeds on a fresh VPS / VDS / Mini PC / home box without further input.
2. The installed box serves `https://<domain>/` via CF Tunnel — verifiable from mobile data / external network.
3. No public IP, no port forward, no Caddy LE DNS-01 dance required by the operator.
4. The wizard at `https://livinity.io/dashboard/install` requires only a domain + click; emits a working one-liner with tunnel token already filled in.
5. Existing Mini PC (`bruce@10.69.31.68`, `bruce.livinity.live`) migrates via `migrate-to-cf-tunnel.sh` and `bruce.livinity.live` becomes mobile-data-reachable.
6. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit.

## Sub-plan execution order

```
134-01  ─→  134-04  ─→  134-05
   │
   ├─→  134-02 (Server5, parallel to 134-03/04)
   └─→  134-03
```

Waves:
- **Wave 1 (parallel):** 134-01 (install.sh refactor) + 134-02 (Server5 wizard) — independent surfaces
- **Wave 2 (sequential after 134-01):** 134-03 (migration script depends on new mode-hybrid.sh shape) + 134-04 (tests)
- **Wave 3 (after all):** 134-05 (UAT — Mini PC migration walk + push final state)

## Sub-plan table

| # | File | Title | Touches | Autonomous |
|---|------|-------|---------|-----------|
| 134-01 | `134-01-PLAN.md` | install.sh + mode-hybrid.sh refactor — fold tunnel transport into hybrid | `scripts/install/{install.sh,parse-cli.sh,mode-hybrid.sh}` + `__tests__/` | true |
| 134-02 | `134-02-PLAN.md` | Server5 wizard CF Tunnel auto-provision | Server5 `/opt/platform/web/src/lib/cloudflare-api.ts`, `…/app/api/account/api-keys/route.ts`, `/opt/landing/livinity.io/dashboard-install.html` | true (on-server canonical) |
| 134-03 | `134-03-PLAN.md` | `migrate-to-cf-tunnel.sh` — existing-install migration script | `scripts/install/migrate-to-cf-tunnel.sh` (new) | true |
| 134-04 | `134-04-PLAN.md` | Bash test fixtures for new mode-hybrid behavior | `scripts/install/__tests__/test-mode-hybrid-folded.sh` (new) | true |
| 134-05 | `134-05-PLAN.md` | UAT: Mini PC migration + anywhere-access proof | `.planning/phases/134-…/UAT-EVIDENCE/` + ROADMAP/STATE flip | true |

## Atomic commit policy

Each sub-plan is ONE atomic commit. Sacred SHA verified pre + post (`bash scripts/verify-sacred-sha.sh`). Pre-commit hook enforces.

Commit message format:
```
{feat|fix|refactor}(134-XX/<short>): <one-line summary>

<body — what changed, why, design contract refs>

Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved)
```

## Rollback

Each plan is reversible via `git revert <sha>`. Sub-plan 134-05 records evidence under `.planning/phases/134-cf-tunnel-default-hybrid-rebrand/UAT-EVIDENCE/`, allowing post-mortem if migration breaks.

## Phase verification gate

Phase 134 flips `🟡 CODE-COMPLETE` after Wave 2 push; `✅ Shipped` only after 134-05 UAT records:
- ✓ `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid --domain X --api-key Y` works on a fresh box (could be Mini PC re-install)
- ✓ `bruce.livinity.live` reachable from off-LAN device (mobile data screenshot OR external curl)
- ✓ Sacred SHA preserved on Mini PC post-deploy
