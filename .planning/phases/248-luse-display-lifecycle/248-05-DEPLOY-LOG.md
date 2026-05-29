# Phase 248 Plan 05 — Mini PC Deploy Log

**Started:** 2026-05-29 (sequential executor `/gsd-execute-phase 248`, Wave 4)
**Operator:** Claude (Opus 4.7) sequential executor
**Target:** Mini PC `bruce@10.69.31.68` (ONLY LivOS deployment that matters — D-V44-MINI-PC-ONLY)
**Sacred SHA invariant (repo blob):** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
**Sacred AionUi binary (Mini PC disk):** `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` (PRE — must be unchanged POST)
**Status:** see "## Status" at bottom.

---

## SSH reachability gate

**Result:** ✅ **REACHABLE** — `bruce@10.69.31.68:22` accepted ed25519 key on first attempt.

```
$ ssh -i .../minipc -o ConnectTimeout=15 bruce@10.69.31.68 "hostname && whoami && date -u +%FT%TZ"
bruce-EQ
bruce
2026-05-29T01:34:03Z
```

Unlike Phase 246-06 (ECDH timeout, escape hatch engaged), this session's executor host CAN reach the Mini PC SSH. All Tasks 1+2 will run live.

---

## Repo-side verification (pre-push)

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f   ✅ MATCH (sacred git blob preserved)

$ git push origin master
   997af552..49ba1965  master -> master   ✅ pushed
```

**Pre-deploy expected SHA on Mini PC (post-`update.sh`):** `49ba1965` (tip of Phase 248-04 work, includes 248-01 → 248-04 commits).

---

## PRE snapshot

Executed `2026-05-29T01:34Z` via one batched SSH session:

```text
=== PRE snapshot ===
current deployed SHA: db83a7d63ef2a5a72f28b5d5c1da3bf4c6e9f7a8
sacred AionUi sha256: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
xserver-xephyr: xserver-xephyr 2:21.1.12-1ubuntu1.5
xvfb: xvfb 2:21.1.12-1ubuntu1.5
xdpyinfo: /usr/bin/xdpyinfo
Xephyr binary: /usr/bin/Xephyr
Xvfb binary: /usr/bin/Xvfb
redis luse:display:* count: 0
services: active active active active active active
```

| Probe                  | Expected                                              | Observed                                | Status |
| ---------------------- | ----------------------------------------------------- | --------------------------------------- | ------ |
| Deployed SHA marker    | present (any sha)                                     | `db83a7d63ef2a5a72f28b5d5c1da3bf4c6e9f7a8` | ✅      |
| Sacred AionUi sha256   | present (locked PRE; must match POST byte-identical)  | `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` | ✅ baseline |
| xserver-xephyr         | ii install                                            | `xserver-xephyr 2:21.1.12-1ubuntu1.5`   | ✅      |
| xvfb                   | ii install                                            | `xvfb 2:21.1.12-1ubuntu1.5`             | ✅      |
| xdpyinfo               | present                                               | `/usr/bin/xdpyinfo`                     | ✅      |
| Xephyr / Xvfb binaries | present in PATH                                       | both present                            | ✅      |
| Redis luse:display:*   | 0 (clean slate)                                       | `0`                                     | ✅      |
| Services (6/6 active)  | livos liv-core liv-worker liv-memory liv-assistant caddy | all 6 `active`                       | ✅      |

## Xephyr/Xvfb install

**Result:** ✅ NO APT-GET INSTALL REQUIRED — both `xserver-xephyr` and `xvfb` (plus `xdpyinfo` from `x11-utils`) were already installed at the noted versions. The "Step 3 install" branch of the plan was skipped.

---

## Deploy timeline

Executed `2026-05-29T01:36Z` via `ssh bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'`. Last 30 lines of transcript:

```text
━━━ Phase 225: install liv-assistant.service unit (if missing) ━━━
[OK]    liv-assistant.service installed at /etc/systemd/system/liv-assistant.service

━━━ Fixing /opt/livos + /opt/liv ownership (bruce:bruce) ━━━
[OK]    Ownership normalised to bruce:bruce

━━━ Restarting services ━━━
[INFO]  Restarting livos...
[INFO]  Restarting liv-core...
[INFO]  Restarting liv-worker...
[INFO]  Restarting liv-memory...
[OK]    Restarted livos-app-liv-ai (Next.js :3010)
[OK]    Restarted liv-claw-gateway (openclaw + plugin :18789)
[OK]    Restarted liv-assistant (AionUi WebUI :3020)
[INFO]  Probing http://127.0.0.1:3020/api/auth/status (5s timeout)...
[OK]    liv-assistant /api/auth/status = 200/204 OK
...
[OK]    LivOS service running
[OK]    Liv-core service running
[OK]    liv-assistant service running

━━━ Recording deployed SHA ━━━
[OK]    Deployed SHA recorded: 49ba196

━━━ Cleanup ━━━
[OK]    Temp files cleaned

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LivOS updated successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Update.sh exit: clean. `Deployed SHA recorded: 49ba196` matches the push tip.

---

## POST snapshot

```text
=== POST snapshot ===
deployed SHA: 49ba196501ae481a337645970d6cef2e2ba71f7d
sacred AionUi sha256: 293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b
services: active active active active active active
=== displays module on-disk ===
display-manager.ts
display-ttl-gc.ts
index.ts
redis-keys.ts
__tests__
types.ts
```

| Probe                                 | Expected                                                                  | Observed                                                              | Status |
| ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| Deployed SHA                          | `49ba1965` (push tip)                                                     | `49ba196501ae481a337645970d6cef2e2ba71f7d`                            | ✅      |
| Sacred AionUi sha256 byte-identical   | `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` (= PRE) | `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b`    | ✅      |
| Services 6/6 active                   | livos, liv-core, liv-worker, liv-memory, liv-assistant, caddy             | all 6 `active`                                                        | ✅      |
| displays/ module files on disk        | 4 .ts + index.ts + __tests__                                              | all present                                                           | ✅      |

### Boot log line (`displayManager=wired` / `displayTtlGc=started`)

The plan's `must_haves.truths` claims:

> "Live livinityd boot shows '[luse-mcp] connected ... (displayManager=wired) (displayTtlGc=started)' in stderr after MCP child spawn"

`grep -E '\[luse-mcp\]|displayManager|displayTtlGc'` of journalctl since boot returned **zero lines**. Investigated: the `[luse-mcp]` log line emits inside the MCP child process when `connectStdioTransport()` returns. The child is spawned **lazily** by `McpBridge` on first agent invocation — not at livinityd boot. The parent journal line that proves the MCP child IS registered is:

```
[webapps] Luse MCP source enabled (tsx /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts)
```

That parent line is verified present. The child-side `(displayManager=wired)` boot signature will be emitted on first agent call from the UAT walk and is the operator-pickup probe in `248-05-UAT-CHECKLIST.md`. The 5 wire-level probes A-E below directly exercise the **same code path** the MCP child would (`createDisplayManager` + Xephyr spawn + Redis HSET), and they pass — so the displayManager wiring is proven correct at the module layer even though the [luse-mcp] log line itself is deferred to first agent use.

---

## Wire-level probes (A–E)

All probes use `tsx` to invoke the on-disk `displays/index.ts` directly with the live `LUSE_REDIS_URL` from `/opt/livos/.env`. Cwd is `/opt/livos/packages/livinityd` so the workspace `node_modules/ioredis` symlink resolves.

### Probe A — `mgr.create({mode:'xephyr', ownerSession:'bruce'})`

Script `/opt/livos/packages/livinityd/probe-A-create.mts`:

```typescript
import {createDisplayManager} from './source/modules/computer-use/displays/index.ts'
import {Redis} from 'ioredis'
const redis = new Redis(process.env.LUSE_REDIS_URL!)
const mgr = createDisplayManager({redis})
await mgr.initialized
const r = await mgr.create({mode: 'xephyr', ownerSession: 'bruce'})
console.log('PROBE_A_RESULT', JSON.stringify(r))
```

Output:

```text
PROBE_A_RESULT {"display":":10","name":"display-10","pid":3784721}
```

**GREEN.** Display `:10` allocated (allocator start verified), name auto-derived, Xephyr PID `3784721` recorded.

### Probe B — `xdpyinfo -display :10` (X server live)

```text
$ sudo -u bruce xdpyinfo -display :10
name of display:    :10
version number:    11.0
vendor string:    The X.Org Foundation
vendor release number:    12101011
X.Org version: 21.1.11
maximum request size:  16777212 bytes
...
```

**GREEN.** The Xephyr process is actually serving X11 protocol — not just a Redis ghost. Display reports `1920x1080 pixels`, `depth 24`, `21 extensions`.

### Probe C — `redis-cli HGETALL luse:display::10`

```text
$ redis-cli HGETALL luse:display::10
owner_session   bruce
mode            xephyr
created_at      2026-05-29T01:41:22.573Z
name            display-10
width           1920
height          1080
```

**GREEN.** All 6 expected fields present (D-248-01-D drift-lock). `created_at` is a valid ISO timestamp. SCAN returns exactly `luse:display::10`.

### Probe D — `mgr.list()`

Script `/opt/livos/packages/livinityd/probe-D-list.mts` (same shape as Probe A, calling `mgr.list()`):

```text
PROBE_D_RESULT [
  {
    "display": ":10",
    "name": "display-10",
    "mode": "xephyr",
    "created_at": "2026-05-29T01:41:22.573Z",
    "owner_session": "bruce",
    "width": 1920,
    "height": 1080,
    "running_apps": []
  }
]
```

**GREEN.** 8-field record matches `DisplayRecord` type surface from 248-01 + 248-03 (last_app_at correctly absent because no app was attached).

### Probe E — `mgr.kill({display:':10', callerSession:'bruce'})`

```text
PROBE_E_RESULT {"ok":true,"killed_apps_count":0}

# Post-kill redis EXISTS luse:display::10
0

# Post-kill redis SCAN luse:display:*
(0 keys)
```

**Redis side GREEN.** Owner-scope check passed (caller `bruce` matched stored `owner_session=bruce`), both Redis keys deleted.

**X-server side: KNOWN LIMITATION — see Deviation 1 below.** Post-kill `xdpyinfo -display :10` still SUCCEEDED in this probe (X server still running). This is a probe artifact, not a runtime bug — the Probe A process exited after recording its return value (`process.exit(0)`), the Xephyr child got reparented to PID 1 (`PPID=1` confirmed via `ps`), and Probe E's separately spawned `tsx` process had an **empty** `handles: Map` (per-instance per D-248-01-D from 248-01-SUMMARY), so kill() correctly DEL'd Redis and tried to SIGTERM via the spawn-handle but found nothing in the local Map. In production MCP usage the manager is a singleton inside livinityd's MCP child process, so the handle Map is always populated and `handle.kill('SIGTERM')` succeeds. The probes are a CLI test scenario that bypasses the singleton.

Orphan Xephyr cleanup performed manually (`sudo kill -TERM 3784721` + `sudo rm /tmp/.X10-lock /tmp/.X11-unix/X10`) — final state pristine (verified post-cleanup: `pgrep -af Xephyr` returns no results, redis SCAN returns 0 keys).

---

## Probe outcomes table

| Probe | Check                                                                              | Expected                                                       | Actual                                                                                       | Status |
| ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| A     | `mgr.create({mode:'xephyr', ownerSession:'bruce'})`                                | `{display:':10', name:'display-10', pid:<number>}`             | `{"display":":10","name":"display-10","pid":3784721}`                                        | ✅ GREEN |
| B     | `xdpyinfo -display :10`                                                            | `name of display: :10` + `version number: 11.0`                | matches; X.Org 21.1.11 serving 1920x1080                                                     | ✅ GREEN |
| C     | `redis-cli HGETALL luse:display::10`                                               | 6 fields: owner_session, mode, created_at, name, width, height | all 6 present, owner_session=bruce, mode=xephyr, ISO created_at                              | ✅ GREEN |
| D     | `mgr.list()`                                                                       | array with the `:10` record + running_apps array               | 1-element array, all 8 DisplayRecord fields, running_apps:[]                                 | ✅ GREEN |
| E.1   | `mgr.kill({display:':10', callerSession:'bruce'})`                                 | `{ok:true, killed_apps_count:0}`                               | `{"ok":true,"killed_apps_count":0}`                                                          | ✅ GREEN |
| E.2   | Post-kill `redis EXISTS luse:display::10`                                          | `0`                                                            | `0`                                                                                          | ✅ GREEN |
| E.3   | Post-kill `redis SCAN luse:display:*`                                              | empty                                                          | 0 keys                                                                                       | ✅ GREEN |
| E.4   | Post-kill `xdpyinfo -display :10`                                                  | unable to open display                                         | **succeeded** — probe-artifact, see Deviation 1 (cross-process spawn-handle absence by design D-248-01-D) | ⚠️ KNOWN LIMITATION |
| -     | Sacred AionUi sha256 byte-identical PRE/POST                                       | `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` | identical PRE+POST                                                                          | ✅ GREEN |
| -     | 6/6 services active POST                                                           | all `active`                                                   | all 6 `active`                                                                               | ✅ GREEN |
| -     | Sacred repo blob SHA preserved                                                     | `f3538e1d811992b782a9bb057d1b7f0a0189f95f`                     | preserved on every commit (pre-commit hook PASS each time)                                   | ✅ GREEN |

**Score: 9 GREEN / 1 KNOWN LIMITATION (documented, by-design).**

---

## Deviation 1 — Probe E.4 cross-process artifact (per D-248-01-D)

**Found:** Post-kill `xdpyinfo -display :10` still succeeded because the Xephyr X server child process was NOT SIGTERM'd by the Probe E `mgr.kill()` call.

**Root cause:** Per `248-01-SUMMARY.md` D-248-01-D ("Spawn-handle map is per-DisplayManager-instance, not Redis-backed"), the `handles: Map<string, SpawnHandle>` lives in JS memory inside the `createDisplayManager` closure. The CLI probe scenario creates a fresh manager per `tsx` invocation, so:

1. Probe A's manager spawned Xephyr → stored handle in its OWN Map → exited via `process.exit(0)` → Xephyr child reparented to PID 1 (`PPID=1` confirmed).
2. Probe E's manager constructed a NEW Map (empty) → kill() reads `handles.get(':10')` → undefined → skips the `handle.kill('SIGTERM')` call → DELs Redis keys → returns `{ok:true, killed_apps_count:0}`.

This is **exactly** the limitation D-248-01-D flagged as "deferred to v45+": a future micro-phase could read PID from Redis HSET and use `process.kill(pid, 'SIGTERM')` for cross-restart kill. Production MCP usage is unaffected: the MCP child is a singleton inside livinityd's lifetime, so the handle Map persists across all `computer_create_display` + `computer_kill_display` calls.

**Action taken:** NONE in code. This is a probe-shape artifact; the runtime contract is correct. Documented in this DEPLOY-LOG.md + carried forward to `248-SUMMARY.md` "Deferred items" section. Manually killed orphan Xephyr `3784721` and removed `/tmp/.X10-lock` + `/tmp/.X11-unix/X10` to restore pristine state.

**Rule classification:** Not Rule 1 (no bug — D-248-01-D explicit design choice). Not Rule 2 (no missing critical functionality — singleton MCP child case works). Not Rule 3 (probe ran fine). **Documented limitation only.**

The UAT browser walk (Task 3) WILL exercise the production singleton path: the operator asks Liv AI agent to create a display → MCP child's persistent DisplayManager spawns Xephyr → operator asks to kill → same DisplayManager's `handles.get(':N')` returns the handle → `handle.kill('SIGTERM')` reaches the Xephyr child → Redis cleared. That's the true wire-level proof of E.4.

---

## D-V44 invariant checklist

- ✅ **D-V44-SACRED** — `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at commit `6f2445e0` + Task 2 commit. Disk SHA-256 = `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` PRE = POST (byte-identical).
- ✅ **D-V44-MINI-PC-ONLY** — Plan 05 touches only Mini PC `bruce@10.69.31.68`. Server4 not referenced anywhere. Server5 not referenced.
- ✅ **D-V44-CADDY-REUSE-226-04** — Phase 248 did not touch `caddy.ts`. update.sh logged `Caddy /liv reverse-proxy (livinityd-emitted; bruce.livinity.io/liv → :3020, iframe CSP override) [Phase 226-04]` — unchanged.
- ✅ **D-V44-DISPLAY-XEPHYR-DEFAULT** — Probe A used default `mode:'xephyr'` (would default if omitted); Probe B confirms Xephyr binary executed (X.Org via Xephyr binary).
- ✅ **D-V44-DISPLAY-OWNER-SCOPED** — Probe E passed owner_session `bruce` matching create's ownerSession `bruce`, returned `ok:true`. Different-session denial drift-locked at 248-01 Case 11 + 248-02 Case G (vitest). Operator UAT item F will exercise the live different-session path.

---

## Status

**Plan 05 artifact layer:** ✅ COMPLETE (Tasks 1+2 done).
**Plan 05 deploy layer:** ✅ COMPLETE — 5 wire-level probes GREEN at the contract layer; E.4 cross-process X-kill is a known D-248-01-D limitation, not a regression.
**Plan 05 UAT layer:** ⏳ OPERATOR-PENDING — see `248-05-UAT-CHECKLIST.md`.

Phase status will flip to ✅ SHIPPED once operator confirms UAT walk passes 7/7 mandatory items.
