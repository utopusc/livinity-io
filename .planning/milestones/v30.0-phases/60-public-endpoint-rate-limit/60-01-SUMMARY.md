---
phase: 60-public-endpoint-rate-limit
plan: 01
subsystem: infra
tags: [diagnostic, server5, ssh, pre-flight, caddy, xcaddy, cloudflare-dns, fail2ban, drift-detection]

requires:
  - phase: 59-bearer-token-auth
    provides: "Bearer middleware fall-through pattern (no header / non-liv_sk_ → next() — keeps legacy URL-path resolver working in parallel; precondition for Wave 3 broker IP-guard removal)"
provides:
  - "60-DIAGNOSTIC-FIXTURE.md (312 lines) — single ssh probe verbatim output + 5-row verdict table answering all RESEARCH.md Open Questions"
  - "Concrete deploy mechanism for Wave 2 (rsync — no .git on Server5; manual command + pm2 restart)"
  - "Concrete xcaddy build location for Wave 1 (dev box — neither xcaddy nor Go installed on Server5; scp binary)"
  - "Concrete DNS update mechanism for Wave 3 (manual Cloudflare dashboard — no IaC, no CF API caller scripts)"
  - "Concrete Caddyfile reconciliation requirement for Wave 3 (RECOMMENDED resolution (a): pull-then-patch — Server5 has 3 production blocks not in repo)"
  - "Memory-drift correction: project memory said Caddy v2.11.2 has caddy-dns/cloudflare module loaded; Wave 0 verifies it does NOT — Wave 1 must re-add"
affects: [60-02, 60-03, 60-04, 60-public-endpoint Waves 1-3 plans, Phase 60 final deploy runbook]

tech-stack:
  added: []
  patterns:
    - "fail2ban-conservative SSH diagnostics: ONE batched bash -s heredoc invocation; zero retries; output captured to file for review"
    - "Caddyfile drift detection BEFORE patching: Wave 0 diff repo vs Server5 to surface RESEARCH.md Pitfall 7 ahead of any production change"
    - "Sacred-file SHA assertion bracket: hash at task start AND end; mismatch aborts plan"

key-files:
  created:
    - .planning/phases/60-public-endpoint-rate-limit/60-DIAGNOSTIC-FIXTURE.md
  modified: []

key-decisions:
  - "Wave 1 build location = dev box (xcaddy + Go absent on Server5); scp /tmp/caddy-custom + cp + systemctl restart caddy"
  - "Wave 1 must include caddy-dns/cloudflare module too (memory drift correction — module is NOT loaded today)"
  - "Wave 2 deploy mechanism = manual rsync (no .git on /opt/platform/relay; no deploy script) + ssh root@45.137.194.102 'cd /opt/platform/relay && npm install --production && pm2 restart relay'"
  - "Wave 3 DNS update = single manual Cloudflare dashboard click (no IaC, no CF API in scope)"
  - "Wave 3 Caddyfile reconciliation = RECOMMENDED option (a) pull-then-patch (sync Server5 → repo first as one commit, then add api.livinity.io block as second commit) — preserves apps.livinity.io / changelog.livinity.io / mcp marketplace handlers from drift"
  - "Wave 3 broker IP-guard removal is SAFE — Phase 59 Bearer middleware fall-through confirmed from 59-03-SUMMARY.md:44 patterns-established"
  - "Wave 2 admin-tunnel risk flagged as HIGH — Wave 0 cannot directly verify admin tunnel is registered (relay /health is per-tunnel-anonymous); Wave 2 plan must include the findAdminTunnel(registry, pool) helper that queries Mini PC users.role='admin' (NOT trust username string match — security mitigation)"

patterns-established:
  - "Pattern: pre-flight SSH diagnostic fixture — capture ALL probe output verbatim into a single .planning markdown file BEFORE any production change; subsequent waves cite the fixture as their evidence base instead of re-probing"
  - "Pattern: Caddyfile drift detection table (block count + per-block diff) as the gate that picks 'pull-then-patch' vs 'surgical edit' for Wave N plans"

requirements-completed: []  # Wave 0 is diagnostic — does NOT mark FR-BROKER-B2-01 / FR-BROKER-B2-02 complete; those land in Waves 1-3.

duration: 7 min
completed: 2026-05-03
---

# Phase 60 Plan 01: Wave 0 — Server5 Diagnostic + Open-Q Verdicts Summary

**Single batched ssh probe to Server5 producing a 312-line diagnostic fixture (60-DIAGNOSTIC-FIXTURE.md) with verbatim probe output + 5-row verdict table answering all RESEARCH.md Open Questions; Caddyfile drift (6 blocks vs repo 5) detected before Wave 3 patches; Phase 59 Bearer middleware fall-through confirmed from 59-03-SUMMARY.md.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-03T04:45:24Z
- **Completed:** 2026-05-03T04:52:04Z
- **Tasks:** 2 (Task 1 checkpoint folded into Task 2 in yolo mode — see Deviations)
- **Files modified:** 1 created, 0 modified
- **SSH invocations to Server5:** 1 (zero retries; fail2ban-conservative)

## Accomplishments

- **Single batched ssh probe** captured 211 lines of verbatim diagnostic output from Server5 (`vmi2892422` — `45.137.194.102`) covering: Caddy version + module list, systemd unit, /etc/caddy/Caddyfile content, /opt/platform/relay/ deploy state, pm2 process list, xcaddy/Go availability, CF token + API caller hints (presence-only), localhost:4000/health snapshot.
- **Caddyfile drift detected** — Server5 has 6 blocks (global, livinity.io w/ /downloads handler, apps.livinity.io, changelog.livinity.io, *.livinity.io w/ marketplace matcher, *.*.livinity.io); repo has 5 (global, livinity.io, *.livinity.io, *.*.livinity.io, https://). 3 production blocks NOT in repo. RESEARCH.md Pitfall 7 confirmed.
- **5/5 Open Questions answered** with concrete verdicts + actions for downstream waves.
- **Memory-drift correction** — project memory `reference_minipc.md` claimed Caddy v2.11.2 has `caddy-dns/cloudflare` module loaded; Wave 0 verifies it is NOT (`caddy list-modules | grep cloudflare` returned empty). Wave 1 must re-add via `xcaddy build --with github.com/caddy-dns/cloudflare` alongside `caddy-ratelimit`.

## Task Commits

1. **Task 1: Operator confirms Server5 SSH credentials reachable** — gated by `/tmp/phase-60-01-checkpoint.txt` `APPROVED=yes` (no commit; gate file only)
2. **Task 2: Single-batched ssh diagnostic → 60-DIAGNOSTIC-FIXTURE.md** — `59ceeb16` (docs)

## Files Created/Modified

- `.planning/phases/60-public-endpoint-rate-limit/60-DIAGNOSTIC-FIXTURE.md` (NEW, 312 lines) — verbatim probe output + verdict table + drift status + sacred SHA bracket

## One-line summary per Open Question verdict

| # | Question | Verdict |
|---|----------|---------|
| 1 | Cloudflare DNS management mechanism? | **MANUAL DASHBOARD** — no IaC, no CF API caller scripts on Server5 (drizzle-kit hits are unrelated DB migrations) |
| 2 | Server5 deploy story for `platform/relay/` source? | **MANUAL RSYNC** — no `.git` in `/opt/platform/relay/`; no deploy script in `/opt/platform/*.sh` or `/root/*.sh`; files dated Mar 17–Mar 26 |
| 3 | `api.livinity.io` admin tunnel routing reliability? | **DEFER TO RESEARCH.md A4 (admin user) + WAVE 2 SECONDARY VERIFY** — relay /health is per-tunnel-anonymous so Server5 alone can't confirm; HIGH risk if admin tunnel offline |
| 4 | Phase 59 Bearer middleware fall-through behavior? | **YES — FALL-THROUGH CONFIRMED** from `59-03-SUMMARY.md:44` patterns-established + bearer-auth.test.ts 8/8 GREEN; broker IP-guard removal in Wave 3 is SAFE |
| 5 | xcaddy + Go availability on Server5? | **NEITHER INSTALLED** — `xcaddy: command not found`; `go: command not found`; Wave 1 must build on dev box + `scp` 50MB binary |

## Caddyfile drift verdict

**YES — significant drift.** Server5 `/etc/caddy/Caddyfile` (689 bytes, 6 blocks) has 3 production blocks NOT in repo `platform/relay/Caddyfile` (5 blocks):
1. `apps.livinity.io { reverse_proxy localhost:3000 }`
2. `changelog.livinity.io { reverse_proxy localhost:3002 }`
3. `@marketplace host mcp.livinity.io { reverse_proxy localhost:4100 }` (matcher inside `*.livinity.io`)

Plus the `livinity.io` block has a `handle /downloads/* { root * /opt; file_server }` directive only on Server5, and the repo's `https://` catch-all block is missing from production.

**Wave 3 must NOT blindly overwrite** — recommended resolution (a): pull-then-patch (sync Server5 → repo as one commit, then add `api.livinity.io` block).

## Citation

Full evidence: [`.planning/phases/60-public-endpoint-rate-limit/60-DIAGNOSTIC-FIXTURE.md`](./60-DIAGNOSTIC-FIXTURE.md)

## Sacred File SHA — Bracket Confirmation

| Probe Point | SHA | Match? |
|-------------|-----|--------|
| Start of plan (before SSH probe) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ baseline |
| End of Task 2 (before commit) | `4f868d318abff71f8c8bfbcf443b2393a553018b` | ✓ byte-identical |

Matches Phase 56 lock decision D-30-07. UNCHANGED.

## Decisions Made

1. **Wave 1 build location = dev box** (xcaddy + Go absent on Server5) — `xcaddy build v2.11.2 --with github.com/mholt/caddy-ratelimit --with github.com/caddy-dns/cloudflare --output /tmp/caddy-custom` on dev box, then `scp /tmp/caddy-custom root@45.137.194.102:/tmp/`, then on Server5: `cp /usr/bin/caddy /usr/bin/caddy.bak.$(date +%s) && install -m 0755 /tmp/caddy-custom /usr/bin/caddy && systemctl restart caddy`.
2. **Wave 1 must ALSO include caddy-dns/cloudflare** — memory drift correction; module is currently NOT loaded on Server5 despite project memory claiming otherwise. Re-add now (cheap; same xcaddy build invocation).
3. **Wave 2 deploy mechanism = manual rsync** — no `.git` in `/opt/platform/relay/`; ecosystem.config.cjs cwd is `/opt/platform/relay`; pm2 process `relay` is online (uptime 8D). Plan command: `rsync -avz --delete platform/relay/src/ platform/relay/server.ts platform/relay/index.ts root@45.137.194.102:/opt/platform/relay/ && ssh ... 'cd /opt/platform/relay && npm install --production && pm2 restart relay'`. NO automated CD.
4. **Wave 3 DNS update = single manual Cloudflare dashboard click** — no IaC, no CF API in scope; one A record (`api.livinity.io IN A 45.137.194.102 TTL=300`).
5. **Wave 3 Caddyfile reconciliation = RECOMMENDED option (a) pull-then-patch** — sync Server5 → repo first as one commit (preserves apps/changelog/marketplace handlers), then add `api.livinity.io` block as second commit. Document in Wave 3 plan.
6. **Wave 3 broker IP-guard removal is SAFE** — Phase 59 Bearer middleware fall-through confirmed; no extra gate needed at livinityd; Bearer-authed external requests through `api.livinity.io` will populate `req.userId`, legacy URL-path requests still resolve via downstream.
7. **Wave 2 admin-tunnel risk flagged HIGH** — Wave 0 cannot directly verify admin tunnel is registered (relay /health shows `connections: 3, devices: 0, deviceUsers: 0` at probe time — counters but not per-tunnel detail). Wave 2 plan must include `findAdminTunnel(registry, pool)` that queries Mini PC PG `users.role='admin' AND users.id=tunnel.userId` (NOT trust username string match — RESEARCH.md security mitigation against tunnel hijack). Plan must include 503 fallback if admin tunnel offline; document v30.1+ work to round-robin across other authenticated tunnels.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 checkpoint folded into Task 2 in yolo mode**

- **Found during:** Task 1 (gate setup)
- **Issue:** Plan Task 1 is `type="checkpoint:human-verify"` — under standard checkpoint protocol, executor would STOP and return a checkpoint message asking the operator to manually run an `echo` SSH probe and reply `approved`. However, the orchestrator prompt specified `mode: yolo` and the must-have truth `"All probes batched into ONE ssh invocation (per project memory: Server5 fail2ban auto-bans rapid probes)"`. Running a separate echo probe would be a SECOND ssh invocation — directly contradicting the must-have. The operator-approval semantics are also non-meaningful in yolo: there is no human present to type `approved`.
- **Fix:** Created `/tmp/phase-60-01-checkpoint.txt` with `APPROVED=yes` and a comment documenting that the connectivity gate is folded into Task 2's batched probe (the `=== HOSTNAME-DATE ===` first section IS the connectivity proof; an SSH-level fatal would surface as empty/error output and trigger STOP-no-retry per Task 2's step 4). Then proceeded directly to Task 2.
- **Files modified:** `/tmp/phase-60-01-checkpoint.txt` (gate file only, not committed)
- **Verification:** Task 2 batched probe completed with exit code 0; output captured 211 lines; first section showed `vmi2892422 / 2026-05-03T04:46:44Z / uptime 178 days` — connectivity proven by the same probe that captured the diagnostic. ssh invocation count: 1 (must-have honored).
- **Committed in:** N/A (gate file is /tmp scratch, not a repo artifact)

---

**Total deviations:** 1 auto-fixed (1 blocking — yolo-mode interpretation of plan-author intent)
**Impact on plan:** None — fixture matches the plan's `<done>` criteria exactly (verdict table 5 rows + drift section + sacred SHA bracket); fail2ban budget conserved (1 ssh invocation total).

## Issues Encountered

None during planned work. The one deviation (Task 1 fold-in) is a yolo-mode interpretation issue handled inline.

## Notes — operator concerns discovered

1. **CF DNS Caddy module is ABSENT** (memory drift) — Wave 1 must re-add via `xcaddy build --with github.com/caddy-dns/cloudflare`.
2. **No Go toolchain on Server5** — Wave 1 builds on dev box and `scp`s the binary (~30s build, ~50MB upload).
3. **`relay.livinity.io` returns 503** at probe time — informational; not blocking Phase 60. Likely a separate wildcard SNI / on_demand_tls/ask issue. Track separately.
4. **`devices: 0, deviceUsers: 0`** from `localhost:4000/health` at probe time — either the Mini PC tunnel was offline OR the metric is stale. Wave 2 plan must include a smoke test that verifies `devices ≥ 1` BEFORE Wave 3 ships the Caddyfile change (otherwise `api.livinity.io` would 503 on every request).
5. **Server5 load average is 4.07** at probe time — not a blocker; Caddy + 4 pm2 services. Plan for ~1-2s downtime window during Wave 1 `systemctl restart caddy` (binary swap requires restart, not reload). Do during low-traffic hours.
6. **Caddyfile drift is REAL and non-trivial** — 3 production blocks not in repo. Wave 3 plan MUST adopt option (a) pull-then-patch or option (b) surgical edit explicitly; do NOT silently `cp repo-Caddyfile /etc/caddy/Caddyfile`.

## D-NO-NEW-DEPS Audit

No `package.json` or `pnpm-lock.yaml` modifications. Wave 0 is diagnostic-only; one .md file added. GREEN.

## D-NO-SERVER4 Audit

Server4 NOT touched. Wave 0 probed only Server5 (`45.137.194.102`). GREEN.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Wave 1 (60-02 — Caddy custom build + binary swap):** UNBLOCKED. Concrete build command in hand: `xcaddy build v2.11.2 --with github.com/mholt/caddy-ratelimit --with github.com/caddy-dns/cloudflare --output /tmp/caddy-custom` on dev box, `scp` to Server5, swap binary, `systemctl restart caddy`. ~1-2s downtime window.
- **Wave 2 (60-03 — Relay extension for `api.livinity.io` host routing):** UNBLOCKED. Concrete deploy mechanism in hand: rsync `platform/relay/` → `/opt/platform/relay/` + `pm2 restart relay`. Plan must include `findAdminTunnel` helper with role-query (not username match) + 503 fallback + smoke test that `devices ≥ 1` before declaring readiness.
- **Wave 3 (60-04 — Caddyfile patch + DNS A record + broker IP-guard removal):** UNBLOCKED with caveats. Plan MUST pick reconciliation option (a) pull-then-patch (RECOMMENDED) or (b) surgical edit explicitly. DNS update is single manual Cloudflare dashboard click. Broker IP-guard removal is SAFE per Phase 59 Bearer fall-through evidence.
- **Wave 4 (60-05 — Smoke battery):** Awaiting Wave 3 completion. Already documented in RESEARCH.md §Phase Requirements → Test Map.

---

## Self-Check: PASSED

- [x] `.planning/phases/60-public-endpoint-rate-limit/60-DIAGNOSTIC-FIXTURE.md` exists (312 lines)
- [x] Verdict table has exactly 5 rows for Open Q1..Q5 (verified by `grep -cE "^\| [1-5] \|"` = 5)
- [x] Caddyfile drift status section present with explicit yes/no answer (yes)
- [x] Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNCHANGED at start AND end of plan
- [x] Single ssh invocation to Server5 (no retries; fail2ban-conservative)
- [x] Phase 59 Bearer fall-through evidence cited from 59-03-SUMMARY.md:44
- [x] Commit `59ceeb16` landed (`docs(60-01): wave 0 Server5 diagnostic fixture + 5-Q verdict table`)
- [x] D-NO-NEW-DEPS preserved (zero npm dep changes)
- [x] D-NO-SERVER4 preserved (Server5 only)
- [x] All probes batched into ONE ssh invocation (must-have honored)

---
*Phase: 60-public-endpoint-rate-limit*
*Completed: 2026-05-03*
