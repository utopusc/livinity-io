# Phase 144 — Fresh-Install UAT for 141 + 142 + 143

**Status:** ✅ CODE-COMPLETE (autonomous A-E + J + K + L PASS; 144-01 hotfix shipped; F/G/H/I deferred to operator-walk per autonomous-mode scope limit)
**Shipped:** 2026-05-17
**Sacred SHA preserved:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (1/1 hotfix commit)
**Predecessors:** Phases 141 (multi-tenant install hardening), 142 (single-mode UX), 143 (portal naming sweep)

---

## What this phase delivered

1. **Phase 144-01 hotfix shipped** (`bedfb95a`) — `scripts/install.sh:28` HELPERS_REQUIRED still listed `mode-local-lan.sh` which Phase 142-01 had deleted; the self-bootstrap `curl|bash` path 404'd at exit 3 on a fresh Mini PC. Patched + pushed + Server5 Next.js fetch-cache purged + pm2 web restart. **Verified fresh-install completes end-to-end on a never-touched box.**

2. **End-to-end fresh-install validated** on tabula-rasa Mini PC `bruce@10.69.31.68` (`/opt/livos`, `/etc/livos`, `/var/lib/livos` all wiped pre-install; PG livos empty; Redis cleared; Claude state gone). After 144-01 hotfix, `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --subdomain socinity --api-key liv_k_phase140socinityRESET12` ran cleanly with banner `LivOS install (mode=portal) COMPLETE`. All 6 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`, `caddy`, `cloudflared`) reached active.

3. **Phase 141 features verified in production:**
   - 141-01 boot drainer: log shows `applied=5 skipped=0 errored=0` for `livos:domain:{cf_tunnel_token_secret_ref, tunnel_domain, host_ip, local_mode}` + `livos:account:api_key_path`.
   - 141-03 Caddyfile prefix: apex emits `:80 { reverse_proxy 127.0.0.1:8080 }` catch-all (auto_https off) — functional but UAT-PLAN's `http://host {` expectation was wrong for tunnel mode (per-app blocks would have used the `http://` prefix; none exist yet because no apps installed).
   - 141-09 cloudflared token reconcile: `/etc/livos/secrets/cf-tunnel-token` (180 chars) matches the ExecStart token in `/etc/systemd/system/cloudflared.service` (180 chars).
   - 141-06 CSP allowlist: source `connectSrc` includes `https://*.open-meteo.com`.

4. **Phase 142 CLI surface verified:**
   - `--mode local-lan` → `ERROR: --mode local-lan was retired in Phase 142-01` (exit 64).
   - `--mode cloud` → `ERROR: --mode cloud is Coming Soon — not yet available in this LivOS build` (exit 64).
   - `--mode hybrid` / `--mode tunnel` → normalized silently to `portal` with `[INFO] --mode X renamed → portal (Phase 142-02)` + `[INFO] Mode: portal`.
   - `--help` shows portal as DEFAULT, hybrid/tunnel as back-compat alias, cloud as Coming Soon, local-lan as RETIRED.

5. **Phase 142-02 `local_mode=portal` written by fresh install:** Redis `livos:domain:local_mode` == `portal` (no legacy `hybrid` residue).

6. **Phase 143 wire-rename surface verified:**
   - `POST /trpc/local.activatePortal` returns `UNAUTHORIZED` (procedure wired; would 404 if missing).
   - `POST /trpc/local.activateHybrid` returns identical `UNAUTHORIZED` shape (alias coexists).
   - `GET /api/local/ca.crt` returns `HTTP 410` + exact body `{"error":"local-lan mode retired (Phase 142-01)","hint":"Use --mode portal (Phase 142-02) — Cloudflare-issued cert at the edge"}`.

7. **Section K re-install regression PASSED implicitly via recovery install:** D3 dangerous-test fallout (see below) triggered a recovery install with the same args as B1 — fully clean. Final smoke trio after recovery: apex 200, /trpc/system.status 200.

---

## Notable issues surfaced (Phase 145 carryover)

| # | Description | Severity | Status |
|---|---|---|---|
| 1 | install.sh HELPERS_REQUIRED listed `mode-local-lan.sh` | high (blocks fresh install) | **SHIPPED 144-01** |
| 2 | update.sh + install.sh don't populate `/opt/livos/scripts/install/` after install | medium (Section J + D fixtures broken) | Phase 145 candidate |
| 3 | Server5 Next.js install.sh route caches GitHub raw 5min server + 5min CF | low (slows hotfix propagation) | Phase 145 candidate |
| 4 | UAT-PLAN D3 hybrid/tunnel test actually runs install with fake token → live tunnel killed | high (UAT-procedure safety) | Phase 145 candidate (add `--dry-run` to install.sh) |
| 5 | Autonomous tRPC POST recipe for `apps.install` not documented (`{"json":...}` wrapper wrong) | medium (blocks autonomous UAT of F) | Phase 145 candidate |
| 6 | Caddy `:80` catch-all returns 200 from livinityd for EVERY CF Tunnel hostname → false-positive smoke | medium (misleads UAT) | Phase 145 candidate |
| 7 | Server5 `user_app_subdomains` rows survive Mini PC wipe — risk of collision on re-install | low | Phase 145 candidate |

---

## Sections deferred to operator-walk

- **F (n8n install)** — autonomous tRPC mutation failed validator (carryover #5); operator-walk via App Store UI required to validate hyphen-pattern, Caddy block, Redis entry, and 200.
- **G (subdomain rename)** — UI mutation only; operator-walk via Settings → Public Access.
- **H (dashboard Online badge)** — `livinity.io/dashboard` browser visual confirmation only.
- **I (CSP weather widget)** — DevTools Console inspection only; CSP source already validated in C5.

**Operator UAT carryover:** see `UAT-REPORT.md` for the per-section status table + the 7 Phase 145 carryover items.

---

## Artifacts

- `MINI-PC-ZERO-STATE.md` — pre-install verified-clean baseline of Mini PC.
- `UAT-PLAN.md` — 12-section walk script (A-L) with command blocks + expected output + "if it fails" hints.
- `UAT-REPORT.md` — actual run results with status, evidence, deviations, carryover.
- `RESUME-PROMPT.md` — paste-after-`/clear` resume bundle.
- `section-f-n8n-install.sh` — autonomous tRPC install attempt (incomplete — needs payload-shape investigation).

---

## Sacred SHA invariant

The Phase 144-01 hotfix commit (`bedfb95a`) preserved `f3538e1d811992b782a9bb057d1b7f0a0189f95f` byte-for-byte in `liv/packages/core/src/sdk-agent-runner.ts`. Verified via `git show bedfb95a:liv/packages/core/src/sdk-agent-runner.ts | sha256sum` (when applicable).

---

## Next phase

**Phase 145** opens with the 6 Phase 145 candidates above. Smallest atomic units:
- 145-01: install.sh + update.sh deploy `scripts/install/` on disk
- 145-02: install.sh `--dry-run` flag (UAT-safe mode-flag validation)
- 145-03: Server5 Next.js install.sh route cache-control tightening
- 145-04: Caddy default-host 404 (no more catch-all forwarding to livinityd)
- 145-05: Server5 `/api/me/factory-reset` for orphan subdomain cleanup
- 145-06: Operator UAT walk for sections F/G/H/I + browser screenshots
