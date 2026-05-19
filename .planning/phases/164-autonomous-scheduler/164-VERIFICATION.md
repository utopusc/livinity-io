---
phase: 164-autonomous-scheduler
plan: 05
type: verification
status: passed
deploy_date: 2026-05-19
verified_at: 2026-05-19T19:50:00Z
deployed_sha_local: 7f2e09b3ba9a498c911090ed7d3325e27f4a2cf4
deployed_sha_minipc_recorded: 7f2e09b3ba9a498c911090ed7d3325e27f4a2cf4
minipc_target: bruce@10.69.31.68
sacred_sha_local: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_minipc: f3538e1d811992b782a9bb057d1b7f0a0189f95f
d09_minipc_sha256: e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a
phase_161_02_helper_minipc: dc1831f5f284656dc3bd07babf972cfb02b815c6
phase161_02_helper_minipc_sha256: 3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d
agent_session_minipc: 7c690d59ea08b6450da1d5bd243d06e62a70d473
agent_session_minipc_sha256: 587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73
vault_scaffolder_minipc: 5ddfd06508e11554ae80a7a57b269a4835bf6cdb
vault_scaffolder_minipc_sha256: 74d78224014b1293fdbde0f36c340d82f977588b93c26a313f3707c4eb06d62d
services_healthy: [livos, liv-core, liv-worker, liv-memory]
sample_agents_deployed: yes
sample_agents_count: 2
manual_trigger_inbox_entry: yes
manual_trigger_inbox_file: 2026-05-19_19-41_nightly-backup-audit.md
manual_trigger_status: success
manual_trigger_cost_usd: 0.1045
manual_trigger_turns: 11
manual_trigger_duration_ms: 74768
daily_spend_increment: yes
daily_spend_after_probe_1_cents: 10
daily_spend_after_probe_2_cents: 28
concurrent_cap_enforced: yes
concurrent_cap_admitted: 3
concurrent_cap_blocked: 1
revert_safety_clean: yes
probes_run: 2
probes_passing: 2
probe_1_status: pass
probe_2_status: pass
phase_163_regression: pass
---

# Phase 164 Verification — Autonomous Scheduler LIVE-PROVEN on Mini PC

**Verified:** 2026-05-19 (in progress)
**Status:** VERIFICATION IN PROGRESS

## 1. Pre-Deploy State (Mini PC, before update.sh)

Captured via one batched `ssh` invocation per `feedback_ssh_rate_limit`:

| File | Mini PC SHA256 | Note |
|---|---|---|
| `/opt/liv/packages/core/src/sdk-agent-runner.ts` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | Sacred file content hash (LF; git blob `f3538e1d`) |
| `/opt/livos/.../computer-use/luse-system-prompt.ts` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | D-09 verbatim — pre-deploy |
| `/opt/livos/.../ai/agent-prompt-builder.ts` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` | Phase 161-02 helper — pre-deploy |
| `/opt/liv/packages/core/src/agent-session.ts` | `587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73` | Phase 163-02.5 deployed shape |
| `/opt/livos/.../claude-runner/vault-scaffolder.ts` | `74d78224014b1293fdbde0f36c340d82f977588b93c26a313f3707c4eb06d62d` | Phase 162-01 (LF; git blob `5ddfd065`) |

### Services Pre-Deploy

| Service | Status |
|---|---|
| `livos` | active |
| `liv-core` | active |
| `liv-worker` | active |
| `liv-memory` | active |

### Vault + Module State Pre-Deploy

| Location | State |
|---|---|
| `/opt/livos/packages/livinityd/source/data/vault-templates/livos-agents/` | empty (pre-164 — sample templates not deployed yet) |
| `/home/bruce/livinity-vault/livos-agents/` | empty (pre-164 — agents not scaffolded yet) |
| `/opt/livos/packages/livinityd/source/modules/autonomous-scheduler/` | not present (pre-164 — module not deployed yet) |
| `/opt/livos/.deployed-sha` | `6dd4a60c7916ad2bcd18aa92c3c45c2021078cf9` (Phase 163-04 ship) |

### Local Git State Pre-Push

| Check | Value |
|---|---|
| Local HEAD | `7f2e09b3ba9a498c911090ed7d3325e27f4a2cf4` |
| Push result | `76e69201..7f2e09b3  master -> master` |
| Local sacred SHA `sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (blob, byte-identical to repo lock) |
| Local `agent-session.ts` | `7c690d59ea08b6450da1d5bd243d06e62a70d473` (blob, byte-identical to Phase 163-02.5 lock) |
| Local `agent-prompt-builder.ts` | `dc1831f5f284656dc3bd07babf972cfb02b815c6` (blob, byte-identical to Phase 161-02 helper lock) |
| Local `luse-system-prompt.ts` | `2083f0a3dfc798b4841613b9576b94929f2faf2f` (blob, byte-identical to D-09 lock) |
| Local `vault-scaffolder.ts` | `5ddfd06508e11554ae80a7a57b269a4835bf6cdb` (blob, byte-identical to Phase 162-01 lock) |

All 5 sacred-guard blob SHAs preserved on origin/master at push HEAD `7f2e09b3`.

## 2. Deploy

- **Command:** `nohup sudo bash /opt/livos/update.sh > /tmp/livos-update-164.log 2>&1 &`
- **Log:** `/tmp/livos-update-164.log` (134 lines)
- **Outcome:** exit 0 — `LivOS updated successfully!`
- **Deployed SHA recorded by update.sh:** `7f2e09b` (matches local HEAD `7f2e09b3ba9a498c911090ed7d3325e27f4a2cf4`)
- **Services post-deploy:** `livos liv-core liv-worker liv-memory` all `active`
- **pnpm-store dual-dir hazard:** did NOT fire (`Liv dist linked to 1 pnpm-store resolution dir(s)`)

Deploy log key markers:

```
━━━ Building Liv core ━━━
[VERIFY] @liv/core dist OK (/opt/liv/packages/core/dist)
[OK]    Liv core built
[OK]    Liv dist linked to 1 pnpm-store resolution dir(s)

━━━ Restarting services ━━━
[INFO]  Restarting livos...
[INFO]  Restarting liv-core...
[INFO]  Restarting liv-worker...
[INFO]  Restarting liv-memory...

━━━ Recording deployed SHA ━━━
[OK]    Deployed SHA recorded: 7f2e09b

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LivOS updated successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 3. Post-Deploy State

### Sacred SHA Pin (Mini PC, byte-identical pre/post deploy)

| File | Pre-Deploy SHA256 | Post-Deploy SHA256 | Status |
|---|---|---|---|
| `/opt/liv/packages/core/src/sdk-agent-runner.ts` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | **Sacred preserved** |
| `/opt/livos/.../computer-use/luse-system-prompt.ts` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | **D-09 verbatim** |
| `/opt/livos/.../ai/agent-prompt-builder.ts` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` | **Phase 161-02 helper preserved** |
| `/opt/liv/packages/core/src/agent-session.ts` | `587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73` | `587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73` | **Phase 163-02.5 preserved** |
| `/opt/livos/.../claude-runner/vault-scaffolder.ts` | `74d78224014b1293fdbde0f36c340d82f977588b93c26a313f3707c4eb06d62d` | `74d78224014b1293fdbde0f36c340d82f977588b93c26a313f3707c4eb06d62d` | **Phase 162-01 preserved** |

All 5 byte-identical — no sacred-guard regressions.

### Phase 164 Module Materialised

`/opt/livos/packages/livinityd/source/modules/autonomous-scheduler/` (11 files):

```
agent-definition-parser.test.ts
agent-definition-parser.ts
budget-gate.test.ts
budget-gate.ts
cli-trigger.ts
inbox-writer.test.ts
inbox-writer.ts
index.ts
sample-agents.test.ts
scheduler.test.ts
scheduler.ts
```

### Sample Agents Scaffolded

| Path | Files |
|---|---|
| `/opt/livos/packages/livinityd/source/data/vault-templates/livos-agents/` | `nightly-backup-audit.md`, `pr-watcher.md` |
| `/home/bruce/livinity-vault/livos-agents/` | `nightly-backup-audit.md`, `pr-watcher.md` (scaffolder picked up both samples on boot) |

### Boot Journal Evidence

```
May 19 12:39:03 ... [livinityd] vault-scaffolder: partial — 2 new files, 11 preserved existing
May 19 12:39:03 ... [livinityd] [autonomous-scheduler] disabled (liv:config:autonomous_enabled=unset) — skipping
```

- **vault-scaffolder partial copy:** 2 new files (the sample agents) materialised into vault, 11 existing files preserved (no overwrites of operator state).
- **autonomous-scheduler boot wire-up:** fired AND correctly defaulted to `disabled` because `liv:config:autonomous_enabled` is unset.

### Services Post-Deploy

| Service | Status |
|---|---|
| `livos` | active |
| `liv-core` | active |
| `liv-worker` | active |
| `liv-memory` | active |

Deploy complete. All sacred guards green. Phase 164 code-side materialised on production.

## 4. Live UAT — Single Trigger (Probe 1)

### Pre-Trigger Setup

```bash
sudo redis-cli -u "$REDIS_URL" SET liv:config:autonomous_enabled true   # → OK
sudo sed -i 's/^enabled: false$/enabled: true/' /home/bruce/livinity-vault/livos-agents/nightly-backup-audit.md
sudo grep "^enabled:" /home/bruce/livinity-vault/livos-agents/nightly-backup-audit.md   # → enabled: true
```

| Pre-Trigger Redis State | Value |
|---|---|
| `liv:autonomous:daily_spend_cents:2026-05-19` | (null — first run of day) |
| `liv:autonomous:active_count` | (null — no in-flight) |
| `/home/bruce/livinity-vault/inbox/` `*.md` count | 0 |

### Trigger Invocation

```bash
sudo bash -c "cd /opt/livos && BROKER_FORCE_ROOT_HOME=true HOME=/root \
  /usr/bin/npx tsx /opt/livos/packages/livinityd/source/cli.ts \
  autonomous-trigger nightly-backup-audit" 2>&1 | tee /tmp/livos-uat-164-trigger.log
```

| Outcome | Value |
|---|---|
| CLI exit code | **0** (success) |
| stdout tail | `autonomous-trigger: nightly-backup-audit completed` |
| Wall-clock duration | ~75 seconds |

### Inbox Entry Materialised

**Path:** `/home/bruce/livinity-vault/inbox/2026-05-19_19-41_nightly-backup-audit.md`

Frontmatter (locked 7-field shape from Phase 164-03):

```yaml
---
agent: nightly-backup-audit
status: success
started: 2026-05-19T19:41:07.513Z
duration_ms: 74768
cost_usd: 0.1045
turns: 11
model: claude-sonnet-4-6
---
```

| Frontmatter Field | Expected | Actual | Status |
|---|---|---|---|
| agent | nightly-backup-audit | nightly-backup-audit | PASS |
| status | success | success | PASS |
| started | ISO 8601 UTC | `2026-05-19T19:41:07.513Z` | PASS |
| duration_ms | numeric ms | `74768` | PASS |
| cost_usd | 4dp number | `0.1045` | PASS |
| turns | integer | `11` | PASS |
| model | claude-* literal | `claude-sonnet-4-6` | PASS |

### Body + Backlinks

The agent produced a **real structured audit report** (WARN status — backup files missing in `/opt/livos/data/backups/`, disk pressure 7%, daemon restart churn detected, with 3 specific recommendations). Full body contains the expected `## Summary / ## Detail / ## Recommendations` sections from the agent definition's prompt template.

`## Backlinks` section present with `[[livos-agents/nightly-backup-audit]] — agent definition` wikilink.

### Post-Trigger Redis State

| Key | Pre-Trigger | Post-Trigger | Expected | Status |
|---|---|---|---|---|
| `liv:autonomous:daily_spend_cents:2026-05-19` | null | **10** | `round(0.1045 * 100) = 10` (±1 cent rounding) | PASS |
| `liv:autonomous:active_count` | null | **0** | 0 (try/finally decrement) | PASS |
| TTL on `daily_spend_cents` | n/a | **172787 sec** | `86400 * 2 = 172800` (±13 sec) | PASS |

### Probe 1 Verdict

**probe_1_status: PASS**

- Live Anthropic SDK round-trip completed against Mini PC subscription credentials (`/root/.claude/.credentials.json`)
- 11 turns over ~75s, $0.1045 actual cost
- Real disk audit performed (the agent actually ran journalctl + ls + df + stat against the live Mini PC filesystem)
- Inbox entry materialised with full frontmatter + backlinks (Phase 164-03 contract LIVE)
- Daily spend counter atomically incremented with correct TTL (Phase 164-02 budget gate LIVE)
- active_count returned to 0 — try/finally decrement worked (T-164-02-03 mitigation LIVE-PROVEN)

## 5. Live UAT — Concurrent Cap (Probe 2)

### Pre-Fan-Out State

| Key | Value |
|---|---|
| `liv:config:autonomous_max_concurrent` | (null — defaults to 3 per Phase 164-02 budget-gate) |
| `INBOX_BEFORE` (count of `*nightly-backup-audit*.md`) | 1 (from Probe 1) |
| `BEFORE_SPEND` | 10 cents |
| `BEFORE_ACTIVE` | 0 |

### Fan-Out Invocation

Fired 4 simultaneous triggers in parallel via bash background:

```bash
for i in 1 2 3 4; do
  BROKER_FORCE_ROOT_HOME=true HOME=/root /usr/bin/npx tsx \
    /opt/livos/packages/livinityd/source/cli.ts \
    autonomous-trigger nightly-backup-audit > /tmp/164-cap-$i.log 2>&1 &
done
wait
```

### Per-Trigger CLI Output

| Trigger | Result | Stdout Tail |
|---|---|---|
| T1 | exit 0 | `autonomous-trigger: nightly-backup-audit completed` |
| T2 | exit 0 | `autonomous-trigger: nightly-backup-audit completed` |
| T3 | exit 0 with reject log | `[autonomous-scheduler] nightly-backup-audit blocked: concurrent cap 3 exceeded` + `autonomous-trigger: nightly-backup-audit completed` |
| T4 | exit 0 | `autonomous-trigger: nightly-backup-audit completed` |

Note: which of T1-T4 hits the cap depends on race order. T3 caught the cap-reject this run — exactly 1 of 4 was blocked, the other 3 ran.

### Inbox Materialisation

`/home/bruce/livinity-vault/inbox/` after fan-out:

```
2026-05-19_19-43_nightly-backup-audit_3.md  (cap probe, run 3)
2026-05-19_19-43_nightly-backup-audit_2.md  (cap probe, run 2)
2026-05-19_19-43_nightly-backup-audit.md    (cap probe, run 1)
2026-05-19_19-41_nightly-backup-audit.md    (Probe 1, single-trigger)
```

| Metric | Expected | Actual | Status |
|---|---|---|---|
| INBOX_AFTER count | 4 (1 + 3 success) | 4 | PASS |
| DELTA from Probe 1 | 3 (cap enforced, 4th SKIPPED writeback) | 3 | PASS |
| Collision suffixing (Phase 164-03) | `_2` + `_3` filenames | `_2.md` + `_3.md` present | PASS |

### Post-Fan-Out Redis State

| Key | Pre-Fan-Out | Post-Fan-Out | Expected | Status |
|---|---|---|---|---|
| `liv:autonomous:daily_spend_cents:2026-05-19` | 10 | **28** | 10 + (3 × ~6 cents) | PASS (3 runs billed, NOT 4) |
| `liv:autonomous:active_count` | 0 | **0** | 0 (try/finally decrement) | PASS — NO LEAK |

### Cap-Reject Evidence

T3 captured the explicit budget-gate rejection log line:

```
[autonomous-scheduler] nightly-backup-audit blocked: concurrent cap 3 exceeded
```

This is emitted by Phase 164-02 `budget-gate.ts → checkAndIncrementConcurrent()`'s MULTI(INCR+GET)+DECR-rollback atomic gate.

### Probe 2 Verdict

**probe_2_status: PASS**

- **DELTA = 3** new inbox entries (NOT 4) — cap enforced atomically
- **4th run skipped writeback** per 164-02 Task 2 Test 6 chosen behaviour (no `status: skipped` inbox entry, the operator sees the silence + the journal log)
- **Spend counter incremented by 3 runs only** (10 → 28 cents) — proves billing happened only for the 3 admitted runs
- **active_count returned to 0** — proves the cap-gate's DECR rollback fired on the rejected 4th, AND the try/finally decremented after the 3 successful runs
- **Collision-sequencing path LIVE** — Phase 164-03's `_2` `_3` filename suffixing works in production for same-minute concurrent fires
- **Concurrent-cap budget gate (T-164-02-03) LIVE-PROVEN** — race past cap blocked atomically

## 6. Safety Wind-Down

After both probes completed, the live-trigger state was reverted on Mini PC:

```bash
sudo redis-cli -u "$REDIS_URL" SET liv:config:autonomous_enabled false   # → OK
sudo sed -i 's/^enabled: true$/enabled: false/' /home/bruce/livinity-vault/livos-agents/nightly-backup-audit.md
```

| Check | Pre-Probe | Post-Revert | Status |
|---|---|---|---|
| `liv:config:autonomous_enabled` | unset | **false** | reverted (no overnight self-fire) |
| `nightly-backup-audit.md` `enabled:` field | true (set for probe) | **false** | reverted (cron-disabled until operator opts in) |
| All 4 services active | yes | **yes** (livos, liv-core, liv-worker, liv-memory) | preserved |
| Mini PC autonomous loop dormant | no | **yes** | T-164-05-02 + T-164-05-04 mitigated |

The autonomous scheduler is now in the same disabled state it was in pre-deploy. No agent will fire on its own. Operator must:
1. Set `liv:config:autonomous_enabled=true` in Redis, AND
2. Flip `enabled: true` on a specific agent file in `/home/bruce/livinity-vault/livos-agents/`

before any cron-driven autonomous run can happen.

## 7. Sacred Guardrails Final Audit

| File | Expected (locked) | Pre-Deploy SHA256 | Post-Deploy SHA256 | Post-Revert SHA256 | Status |
|---|---|---|---|---|---|
| `sdk-agent-runner.ts` | git blob `f3538e1d...` | `62f92459...` | `62f92459...` | `62f92459...` | **Sacred preserved end-to-end** |
| `luse-system-prompt.ts` | git blob `2083f0a3...` | `e63773d7...` | `e63773d7...` | `e63773d7...` | **D-09 verbatim end-to-end** |
| `agent-prompt-builder.ts` | git blob `dc1831f5...` | `3d8e2a75...` | `3d8e2a75...` | `3d8e2a75...` | **Phase 161-02 helper preserved end-to-end** |
| `agent-session.ts` | git blob `7c690d59...` | `587e94ce...` | `587e94ce...` | `587e94ce...` | **Phase 163-02.5 preserved end-to-end** |
| `vault-scaffolder.ts` | git blob `5ddfd065...` | `74d78224...` | `74d78224...` | `74d78224...` | **Phase 162-01 preserved end-to-end** |

All 5 byte-identical across all 3 measurement points — zero sacred-guard regressions across the deploy + 2 live probes + revert.

### Final Services Status

```
$ sudo systemctl is-active livos liv-core liv-worker liv-memory
active
active
active
active
```

4 / 4 active post-UAT and post-revert.

## 8. Phase 164 Summary

Phase 164 is **SHIPPED** to Mini PC. The autonomous scheduler is live-proven end-to-end:

1. **164-01..04 code-complete deploy** — `bash /opt/livos/update.sh` exit 0, deployed SHA `7f2e09b` matches local HEAD `7f2e09b3`.
2. **Boot wire-up engages + defaults disabled** — `[autonomous-scheduler] disabled (liv:config:autonomous_enabled=unset) — skipping` proves the gate fires on every boot.
3. **vault-scaffolder picks up both sample agents** — `partial — 2 new files, 11 preserved existing` proves the Phase 162-01 scaffolder + Phase 164-04 sample agents compose correctly.
4. **Probe 1 (single trigger) PASS** — `nightly-backup-audit` ran 11 turns in 75s, $0.1045, produced a real disk audit, materialised an inbox entry with full Phase 164-03 frontmatter + backlinks, incremented daily spend counter to 10c.
5. **Probe 2 (concurrent cap of 3) PASS** — 4 simultaneous fires → 3 inbox entries (NOT 4), 18c additional spend (3 runs billed, NOT 4), explicit `concurrent cap 3 exceeded` log line, active_count returned to 0.
6. **Safety wind-down clean** — `autonomous_enabled=false`, sample agents `enabled: false`, all sacred guards byte-identical end-to-end.

Phase 164 unlocks Phase 165 (Settings UI + Memory Linter + Dock notifications), which builds on this proven autonomous loop.

## 9. Self-Check: PASSED

- [x] Local push successful: `76e69201..7f2e09b3 master -> master`
- [x] Mini PC `update.sh` exit 0, deployed SHA `7f2e09b` matches local HEAD `7f2e09b3`
- [x] Boot journal shows autonomous-scheduler gate fired with correct disabled-default
- [x] vault-scaffolder materialised 2 new sample agents into vault
- [x] Probe 1 (single trigger) PASS — inbox entry with full frontmatter + backlinks, spend counter 0→10c, active_count 0
- [x] Probe 2 (4 simultaneous → 3 admitted) PASS — cap-reject log captured, spend counter 10→28c, active_count 0
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (git blob) preserved on Mini PC + across all 164 commits
- [x] D-09 verbatim byte-identical pre/post deploy
- [x] Phase 161-02 helper byte-identical pre/post deploy
- [x] Phase 163-02.5 `agent-session.ts` byte-identical pre/post deploy
- [x] Phase 162-01 `vault-scaffolder.ts` byte-identical pre/post deploy
- [x] Safety wind-down complete (autonomous_enabled=false, sample agent enabled:false)
- [x] All 4 services active post-revert

---

## Status Verdict

## VERIFICATION PASSED + LIVE-PROVEN

**Phase 164 is SHIPPED to Mini PC.**

The autonomous scheduler loop — agent definition parser (164-01) + scheduler module + budget gate + CLI trigger + boot wire-up (164-02) + inbox writer (164-03) + sample agents (164-04) — works end-to-end on production with real Anthropic API round-trips, atomic budget gating, and clean safety reverts.

---

*Verified static: 2026-05-19T19:25:00Z (local HEAD `7f2e09b3` pushed to origin/master)*
*Verified deploy: 2026-05-19T19:38:00Z (Mini PC update.sh exit 0, deployed SHA `7f2e09b`)*
*Verified Probe 1 (single trigger): 2026-05-19T19:42:00Z (75s round-trip, $0.1045, 11 turns)*
*Verified Probe 2 (concurrent cap): 2026-05-19T19:43:00Z (4 fan-out, 3 admitted, 1 cap-rejected)*
*Verified revert: 2026-05-19T19:50:00Z (Mini PC autonomous_enabled=false, sample agent enabled:false, 4 services active)*
*Phase: 164-autonomous-scheduler*
*Commits in scope: 23a0a357..(this commit) (5 plans + verification = ~20 commits)*
*Mini PC deployed SHA: 7f2e09b (matches local HEAD `7f2e09b3`)*
*Mini PC sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved verbatim)*
