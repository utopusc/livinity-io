---
phase: 104
slug: local-install-and-docker-uat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Distilled from `104-RESEARCH.md §Validation Architecture` (commit `6bac9e31`)
> and `104-CONTEXT.md` post-research refinements (commit `f729f6b6`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | (1) `vitest` for TypeScript changes (`livinityd/source/modules/local-dns/*`, `domain/caddy.ts`); (2) `bash` shell-test scripts for `install.sh` + mode helpers; (3) `node --test` + Chrome DevTools MCP for end-to-end UAT walk |
| **Config file** | `livos/packages/livinityd/vitest.config.ts` (existing); shell tests as `*.sh`; UAT walk as `node:test` ESM module |
| **Quick run command** | `pnpm --filter @livos/livinityd test -- modules/local-dns modules/domain` |
| **Full suite command** | `pnpm --filter @livos/livinityd test && bash docker/local-uat/scripts/test-install-sh.sh && docker compose -f docker/local-uat/docker-compose.yml up --abort-on-container-exit` |
| **Estimated runtime** | ~15s quick · ~3-5 min full · ~10 min phase-gate UAT walk |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @livos/livinityd test -- modules/local-dns modules/domain` (~15s)
- **After every plan wave:** Full vitest suite + `bash docker/local-uat/scripts/test-install-sh.sh` against freshly-built UAT container (~3-5 min)
- **Before `/gsd-verify-work`:** Full Docker UAT walk (~10 min) — `docker compose up` brings up systemd-in-Docker container, install.sh runs inside, `walk.mjs` drives Chrome DevTools MCP through every AC, generates `.planning/phases/104-.../UAT-EVIDENCE/` directory with screenshots + PASS/FAIL log per criterion.
- **Max feedback latency:** 15s for quick / 600s for full UAT

---

## Per-Task Verification Map

| AC ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| AC-104-1 | 01 | 1 | `install.sh \| bash -s -- --mode local-lan` succeeds on fresh Ubuntu 24.04 | T-104-INSTALL-FAIL | install fails LOUDLY (non-zero exit + diagnostic) on missing prereqs | integration | `docker compose -f docker/local-uat/docker-compose.yml up --build --abort-on-container-exit` | ❌ W0 | ⬜ pending |
| AC-104-2 | 02 | 2 | install.sh `--mode local-lan` is idempotent (re-run produces same state, no errors) | T-104-IDEMPOTENT | re-run does NOT corrupt existing state (dnsmasq config, Caddy CA, systemd units, postgres data) | shell | `bash docker/local-uat/scripts/test-install-idempotency.sh` | ❌ W0 | ⬜ pending |
| AC-104-3 | 06 | 5 | install.sh `--mode cloud` produces byte-equivalent runtime to current Mini PC `dab261cc` | T-104-NO-PROD-DRIFT | systemd unit hashes + env file shape + Caddyfile match Mini PC baseline within tolerance | shell | `bash docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh` | ❌ W0 | ⬜ pending |
| AC-104-4 | 03 | 3 | dnsmasq resolves `bruce.livinity.local` to host IP after install (local-lan mode only) | T-104-DNS-RESOLVE | wildcard rule actually applies; not just for explicit `bruce` entry | shell | `dig @localhost bruce.livinity.local +short` returns the host IP | trivial | ⬜ pending |
| AC-104-5 | 03 | 3 | dnsmasq survives `systemctl restart dnsmasq` (config persists in `/etc/dnsmasq.d/`) | T-104-PERSIST | restart does not blow away config | shell | `systemctl restart dnsmasq && dig @localhost bruce.livinity.local +short` | trivial | ⬜ pending |
| AC-104-6 | 03 | 3 | Caddy serves CA root at `http://<host>/api/local/ca.crt` with correct PEM (local-lan only) | T-104-CA-EXPORT | endpoint serves the actual `liv-local` CA, not Caddy's default | integration | `curl -fsSL http://localhost/api/local/ca.crt \| openssl x509 -noout -subject` shows `CN=LivOS Local Root` | trivial | ⬜ pending |
| AC-104-7 | 03 | 3 | Caddy serves `https://bruce.livinity.local` with cert chain rooted in `liv-local` CA (local-lan) | T-104-TLS-CHAIN | issued cert chains back to the named CA, not Caddy's default `local` | integration | `curl --cacert /tmp/ca.crt https://bruce.livinity.local -o /dev/null -w '%{http_code}'` returns 200 | trivial | ⬜ pending |
| AC-104-8 | 03 | 3 | `generateFullCaddyfile()` regeneration preserves `import /etc/caddy/pki-global.conf` line (local-lan) | T-104-PKI-DRIFT | named CA does NOT disappear on add/remove user — research §Pitfall 1 | unit | `pnpm --filter @livos/livinityd test -- domain/caddy.test.ts` (new test case) | ❌ W0 | ⬜ pending |
| AC-104-9 | 07 | 6 | Wildcard subdomain: `bruce.<TLD>` AND `alice.<TLD>` both route to different per-user containers | T-104-MULTI-TENANT | gateway middleware correctly selects user by subdomain in both modes | integration | UAT walk: navigate both, screenshot, assert different per-user content | UAT walk W0 | ⬜ pending |
| AC-104-10 | 07 | 6 | TLS cert valid (green padlock, not "Not secure") after CA install + page load | T-104-TRUST-UX | trust-store install instructions actually result in trusted cert | integration | Chrome DevTools MCP: assert no `net::ERR_CERT_*` errors on page load | UAT walk W0 | ⬜ pending |
| AC-104-11 | 07 | 6 | Reboot (UAT container restart) → all services come back healthy within 30s | T-104-BOOT-PERSIST | systemd units + database + Caddy survive restart | shell | `docker compose restart livos-uat && sleep 30 && curl https://bruce.${TLD}` returns 200 | trivial | ⬜ pending |
| AC-104-12 | 06 | 5 | `update.sh` against cloud-mode container succeeds; services stay active | T-104-NO-PROD-DRIFT | cloud mode is byte-equivalent enough that the existing `update.sh` still works | shell | `docker exec cloud-regression bash /opt/livos/update.sh && systemctl is-active livos liv-core liv-worker liv-memory` | ❌ W0 | ⬜ pending |
| AC-104-13 | 01 | 1 | Chrome DevTools MCP can connect from host to UAT container's Chrome via `:9223` | T-104-CDP-BIND | `--remote-debugging-address=0.0.0.0` actually applied (D-104-UAT-CDP-BIND) | integration | `walk.mjs` first step: `mcp.connect({ browserUrl: 'http://localhost:9223' })` | UAT walk W0 | ⬜ pending |
| AC-104-14 | 01 | 1 | `noVNC` accessible at `http://localhost:6080/vnc.html` showing container desktop (human escape hatch) | T-104-OBSERVABILITY | manual fallback exists when automated UAT can't diagnose a failure | manual | open URL in browser, see fluxbox + Chrome | manual | ⬜ pending |
| AC-104-15 | 04 | 3 | hybrid mode: install.sh provisions `<random>.home.livinity.io` via Server5 API; Cloudflare DNS-01 cert issued; LAN-direct routing | T-104-RELAY-ZERO | hybrid mode introduces NO data-plane Server5 traffic post-install (D-104-RELAY-ZERO-DATA-PLANE) | integration | UAT walk: assert `nslookup bruce.<random>.home.livinity.io` returns LAN IP; `curl --resolve` does NOT need Server5 in the path; tcpdump shows no Server5 traffic during page load | UAT walk W0 | ⬜ pending |
| AC-104-16 | 02 | 2 | `install.sh --help` prints all three modes with examples; unknown `--mode foo` exits non-zero with usage | T-104-USAGE | UX failure mode of "user picks unsupported flag silently" prevented | shell | `bash install.sh --help \| grep -E '(cloud\|local-lan\|hybrid)'; bash install.sh --mode foo; [ $? -ne 0 ]` | trivial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docker/local-uat/Dockerfile` — based on `trfore/docker-ubuntu2404-systemd:latest`; apt installs for Xvfb, fluxbox, x11vnc, noVNC, Chrome, jq, dig, openssl
- [ ] `docker/local-uat/docker-compose.yml` — cgroup + tmpfs flags (D-104-UAT-IMAGE); port mappings `:80, :443, :53/udp, :6080, :9223`
- [ ] `docker/local-uat/entrypoint.sh` — starts systemd, clones repo, runs install.sh inside container with chosen `--mode`
- [ ] `docker/local-uat/uat-driver/walk.mjs` — Chrome DevTools MCP smoke test (`node:test` style); drives all AC-104-{9,10,13,15} criteria
- [ ] `docker/local-uat/scripts/test-install-idempotency.sh` — bash test harness; runs install.sh twice, diffs state
- [ ] `docker/local-uat/scripts/test-install-sh.sh` — wrapper that runs Docker UAT and parses results
- [ ] `docker/cloud-regression/` — separate compose for AC-104-{3,12} cloud regression (`--mode cloud` variant)
- [ ] `docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh` — diffs systemd unit hashes + env file + Caddyfile against Mini PC `dab261cc` baseline
- [ ] `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — extend with `generateLocalCaddyfile` + `generateHybridCaddyfile` + import-preservation tests
- [ ] `livos/packages/livinityd/source/modules/local-dns/` — NEW directory; vitest config picks it up via existing glob (dnsmasq-config.test.ts, pki.test.ts, routes.test.ts stubs)
- [ ] Framework install: none needed (vitest + node:test + bash all already in repo)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real macOS/iOS device shows green padlock in hybrid mode | AC-104-10 (hybrid path) | Docker UAT cannot prove Apple resolution — no Apple stack inside the container | After Docker UAT passes, ship to Mini PC, point a real iPhone/Mac at `bruce.<random>.home.livinity.io`, screenshot the page |
| `local-lan` mode broken-on-Apple warning visible in wizard | D-104-INSTALL-MODES | UX language only — automated test would just be a string match (low value) | Walk the wizard manually after install, screenshot warning |
| Multi-NIC host: install.sh prompts for correct host IP | Q4 resolved | Docker container has one NIC; can't reproduce multi-NIC ambiguity | Install on Mini PC (which has multiple NICs via Tailscale + ZeroTier + physical) and verify prompt UX |
| Caddy `tls internal` cert rotation triggers re-enrollment UX (local-lan) | Q5 resolved | 90-day rotation cycle is impractical to test in CI | Document in wizard; verify on Mini PC after 90 days as Phase 105+ work |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (10 W0 items listed above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (quick), < 600s (UAT)
- [ ] `nyquist_compliant: true` set in frontmatter after gsd-planner produces plans that reference these ACs

**Approval:** pending — gsd-planner to assign AC IDs to plan task `<automated>` blocks; gsd-plan-checker to flip `nyquist_compliant: true` after coverage check.
