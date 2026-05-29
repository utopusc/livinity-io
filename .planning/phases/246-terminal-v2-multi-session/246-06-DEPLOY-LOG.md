# Phase 246 Plan 06 — Mini PC Deploy Log

**Started:** 2026-05-28 (autonomous mode `/gsd-execute-phase 246` — Wave 4)
**Operator:** Claude autonomous executor (Opus 4.7), `soru sorma` policy
**Target:** Mini PC `bruce@10.69.31.68` (ONLY LivOS deployment that matters — per HARD RULE 2026-04-27)
**Sacred SHA invariant:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (git blob) / `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (file SHA-256)
**Status:** ⚠️ **OPERATOR-PENDING DEPLOY** — see "## SSH reachability gate" below.

---

## SSH reachability gate (Plan 06 escape hatch)

**Result:** ❌ Cannot reach `bruce@10.69.31.68:22` from this executor host.

**Evidence captured:**

```
$ ssh -i .../minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o ConnectTimeout=20 -o ServerAliveInterval=3 bruce@10.69.31.68 \
      "hostname && whoami && date -u +%FT%TZ"

debug1: Local version string SSH-2.0-OpenSSH_for_Windows_9.5
debug1: Remote protocol version 2.0, remote software version OpenSSH_9.6p1 Ubuntu-3ubuntu13.16
debug1: SSH2_MSG_KEXINIT sent
debug1: SSH2_MSG_KEXINIT received
debug1: kex: algorithm: curve25519-sha256
debug1: kex: host key algorithm: ssh-ed25519
debug1: expecting SSH2_MSG_KEX_ECDH_REPLY
ssh_dispatch_run_fatal: Connection to 10.69.31.68 port 22: Connection timed out
```

**Diagnosis:** TCP three-way handshake completes (banner exchange visible: Ubuntu OpenSSH_9.6p1), but the ECDH key-exchange reply never returns. Classic symptom of:
- Executor host is NOT on the bruce-EQ LAN (10.69.31.0/24 is a LAN-only range)
- No WireGuard / Tailscale / Cloudflare-Access tunnel currently bridging Windows host → Mini PC
- OR: Mini PC's `fail2ban sshd` jail has temporarily banned this WAN IP (per `feedback_ssh_rate_limit.md` — note: only ONE ssh attempt this session, so a fresh ban is unlikely; tunnel/route issue is the more probable cause)

**Decision (per Plan 06 escape hatch in the executor brief):**
Switching to operator-pending status. All artifacts (UAT checklist, SUMMARY, ROADMAP, STATE) will still be produced. Deploy itself + 5 wire-level smoke probes (probes 1–5) are deferred to operator with explicit copy-paste commands listed in the "Operator deploy script" section below.

**Sacred SHA not yet verified on Mini PC disk.** Repo-side sacred SHA verified pre-push (see "Repo-side verification" below).

---

## Repo-side verification (executor host, pre-push)

```bash
$ git -C C:/Users/hello/Desktop/Projects/contabo/livinity-io \
      rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f   ✅ MATCH (sacred git blob preserved)

$ git -C ... log --oneline -n 1
c72a87d4 docs(246-05): complete TTL GC + Active Terminals admin panel plan

$ git -C ... push origin master
   2b07bed7..c72a87d4  master -> master   ✅ pushed
```

**Pre-deploy expected SHA on Mini PC (post-`update.sh`):** `c72a87d4` (tip of Phase 246 work, includes 246-01 → 246-05 + plan 246-06 docs).

---

## Operator deploy script (copy-paste from bruce-EQ box)

The operator must run these from a host with reachable SSH to the Mini PC (LAN or VPN). Each block is one batched SSH session per `feedback_ssh_rate_limit.md`.

### Step A — Run update.sh + capture deploy timeline

```bash
SSH='/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'

# 1. Pre-deploy state snapshot + run update.sh + post-deploy verification — ONE batched session
$SSH bruce@10.69.31.68 "
  echo '=== PRE-DEPLOY STATE ===' &&
  hostname && date -u +%FT%TZ &&
  systemctl is-active caddy livos liv-core liv-worker liv-memory &&
  echo '=== PRE-DEPLOY SACRED SHA ===' &&
  sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts 2>/dev/null || sha256sum /opt/nexus/packages/core/src/sdk-agent-runner.ts &&
  echo '=== CADDY BASELINE COUNTS ===' &&
  grep -c '@livos_terminal_ws' /etc/caddy/Caddyfile &&
  echo '=== RUN UPDATE.SH ===' &&
  sudo bash /opt/livos/update.sh 2>&1 | tail -120 &&
  echo '=== POST-DEPLOY ===' &&
  systemctl is-active caddy livos liv-core liv-worker liv-memory &&
  sudo cat /opt/livos/.deployed-sha 2>/dev/null || git -C /tmp/livinity-update-*/livinity-io rev-parse HEAD 2>/dev/null &&
  echo '=== POST-DEPLOY SACRED SHA ===' &&
  sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts 2>/dev/null || sha256sum /opt/nexus/packages/core/src/sdk-agent-runner.ts &&
  echo '=== CADDY POST-DEPLOY COUNTS ===' &&
  grep -c '@livos_terminal_ws' /etc/caddy/Caddyfile &&
  echo '=== JOURNALCTL TTL-GC EVIDENCE ===' &&
  journalctl -u livos.service --since '5 minutes ago' | grep -E 'ttl-gc|pty-terminal' | tail -30 &&
  echo '=== REDIS FLAG ===' &&
  REDIS_PW=\$(sudo grep ^REDIS_URL= /opt/livos/.env | sed 's/.*default://;s/@.*//' | python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))') &&
  redis-cli -a \"\$REDIS_PW\" GET livos:v43:terminal_panel
"
```

**Expected outcomes (paste the actual transcript into "## Deploy timeline" below when done):**

| Probe | Expected | Pass criteria |
|---|---|---|
| Pre-deploy systemctl is-active | 5 × `active` | All five `active` |
| Pre-deploy sacred SHA-256 | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | byte match |
| Pre-deploy `@livos_terminal_ws` count | ≥ 1 (Phase 243 baseline) | Caddyfile preserved |
| update.sh exit | `LivOS updated successfully!` + exit 0 | clean exit |
| Post-deploy systemctl is-active | 5 × `active` | All five `active` |
| Post-deploy deployed SHA | `c72a87d4` | matches dev HEAD |
| Post-deploy sacred SHA-256 | `62f924594e...` (same) | **MUST match — STOP if drift** |
| Post-deploy `@livos_terminal_ws` count | same as pre-deploy | **D-V44-CADDY-REUSE-226-04 — MUST be unchanged** |
| journalctl `ttl-gc:` evidence | at least one `ttl-gc: started` or sweep line | **246-05 wired proof** |
| Redis `livos:v43:terminal_panel` | `true` | Phase 243 flag preserved |

---

## Deploy timeline

**(operator-pending — paste Step A transcript here)**

```
<PASTE OUTPUT OF STEP A HERE>
```

---

## Deployed SHA

**Expected:** `c72a87d4` (dev HEAD pushed to origin/master 2026-05-28)
**Observed on Mini PC:** _(pending)_
**Sacred SHA-256 disk:** _(pending — must match `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`)_

---

## Service status

**Expected post-deploy (5 services `active`):**

| Service | Expected | Observed |
|---|---|---|
| caddy | active | _(pending)_ |
| livos | active | _(pending)_ |
| liv-core | active | _(pending)_ |
| liv-worker | active | _(pending)_ |
| liv-memory | active | _(pending)_ |

---

## Caddyfile delta

**Per D-V44-CADDY-REUSE-226-04 the Caddyfile MUST NOT change for the `/livos/terminal/*` path.**

Phase 226-04 already emits the `/livos/terminal/*` matcher (via `caddy.ts` inline). The new query-string variants `?attach=` and `?create` ride the SAME matcher (Caddy matchers route by path, not query string). No `caddy.ts` edit was made in 246-01 → 246-05.

```bash
# Verification (executor host, post-push):
$ git -C C:/Users/hello/Desktop/Projects/contabo/livinity-io \
      diff 2b07bed7..c72a87d4 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l
0   ✅ EMPTY DIFF (Caddy emitter unchanged across the 26 commits of Phase 246)
```

**Expected on Mini PC:** `@livos_terminal_ws` count identical pre/post `update.sh`.

---

## journalctl evidence

**Expected:** at least one log line tagged `ttl-gc:` from the `livinityd` log scope, written at boot when `server/index.ts` invokes `this.ptyTtlGc.start()` (see Plan 246-05 wiring at `be7d73b5`).

Tail of `journalctl -u livos.service --since '5 minutes ago' | grep -E 'ttl-gc|pty-terminal'` _(pending)_:

```
<PASTE JOURNALCTL TAIL HERE>
```

---

## Redis flag state

```bash
$ redis-cli -a "<pw>" GET livos:v43:terminal_panel
"true"   _(pending — expected `true`; Phase 243 set it)_
```

---

## Smoke probes (5 wire-level)

**Deferred to operator — see "Step B" below.** All 5 probes require live bruce-EQ network access (proxy-token cookie + WS + Redis + tRPC). The executor cannot run them from the current host (SSH timeout, see "## SSH reachability gate").

### Step B — Operator runs 5 smoke probes (after Step A completes successfully)

These need a fresh `LIVINITY_PROXY_TOKEN`:

```bash
# 1. Open https://bruce.livinity.io/ in a browser, log in if necessary.
# 2. DevTools → Application → Cookies → copy LIVINITY_PROXY_TOKEN.
# 3. Export it on the shell that has SSH to Mini PC:
export TOKEN='<paste cookie value>'
```

Then run the 5 probes (each ssh batched separately to keep transcripts cleanly mapped to a probe):

```bash
SSH='/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc'

# Re-derive REDIS password once
REDIS_PW=$($SSH bruce@10.69.31.68 "sudo grep ^REDIS_URL= /opt/livos/.env | sed 's/.*default://;s/@.*//' | python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))'")

# --- Probe 1: CREATE session ---
$SSH bruce@10.69.31.68 "
  echo '{\"type\":\"init\",\"cols\":80,\"rows\":24}' | \
    timeout 5 websocat -t -H='Cookie: LIVINITY_PROXY_TOKEN=$TOKEN' \
    ws://127.0.0.1:8080/livos/terminal/ws | head -2
"
# Expected: {\"type\":\"ready\",\"sessionId\":\"<uuid>\"}
# Save uuid → SID

SID='<paste sessionId from Probe 1>'

# --- Probe 2: Scrollback write check ---
$SSH bruce@10.69.31.68 "
  ( echo '{\"type\":\"init\",\"cols\":80,\"rows\":24}'; \
    sleep 0.3; \
    echo '{\"type\":\"data\",\"data\":\"echo hello\\r\"}'; \
    sleep 1; ) | \
    timeout 3 websocat -t -H='Cookie: LIVINITY_PROXY_TOKEN=$TOKEN' \
    ws://127.0.0.1:8080/livos/terminal/ws?attach=$SID > /dev/null
  redis-cli -a '$REDIS_PW' LRANGE livos:pty:session:$SID:scrollback 0 -1 | head -20
"
# Expected: at least one line of scrollback (prompt redraw OR \"hello\" output)

# --- Probe 3: REATTACH ---
$SSH bruce@10.69.31.68 "
  timeout 3 websocat -t -H='Cookie: LIVINITY_PROXY_TOKEN=$TOKEN' \
    'ws://127.0.0.1:8080/livos/terminal/ws?attach=$SID' | head -3
"
# Expected: first frame contains {\"type\":\"reattached\",\"sessionId\":\"$SID\",\"scrollback\":[...]}

# --- Probe 4: tRPC listSessions ---
$SSH bruce@10.69.31.68 "
  curl -s -H 'Cookie: LIVINITY_PROXY_TOKEN=$TOKEN' \
    'http://127.0.0.1:8080/api/trpc/ptySessions.listSessions?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D' | head -5
"
# Expected: JSON body containing a session record matching $SID

# --- Probe 5: tRPC killSession + metadata check ---
$SSH bruce@10.69.31.68 "
  curl -s -X POST -H 'Cookie: LIVINITY_PROXY_TOKEN=$TOKEN' \
    -H 'Content-Type: application/json' \
    -d '{\"0\":{\"json\":{\"id\":\"$SID\"}}}' \
    'http://127.0.0.1:8080/api/trpc/ptySessions.killSession?batch=1' | head -5
  echo '--- post-kill HGETALL ---'
  redis-cli -a '$REDIS_PW' HGETALL livos:pty:session:$SID
"
# Expected: killSession returns {killed:true}; HGETALL returns empty.
```

### Probe outcomes table (operator fills)

| # | Probe | Command | Raw output (head) | Status |
|---|-------|---------|---------|---|
| 1 | CREATE | _(see Step B)_ | _(pending)_ | ⏳ HUMAN-NEEDED |
| 2 | SCROLLBACK | _(see Step B)_ | _(pending)_ | ⏳ HUMAN-NEEDED |
| 3 | REATTACH | _(see Step B)_ | _(pending)_ | ⏳ HUMAN-NEEDED |
| 4 | tRPC list | _(see Step B)_ | _(pending)_ | ⏳ HUMAN-NEEDED |
| 5 | tRPC kill | _(see Step B)_ | _(pending)_ | ⏳ HUMAN-NEEDED |

**Substitution decision (per Plan 06 action step 7 escape hatch):** All 5 wire-level smoke probes deferred to operator because the executor host could not reach Mini PC SSH (TCP-level handshake completes, ECDH stalls — see "## SSH reachability gate"). Probes are NOT FAILED — they are pending operator execution from a network-reachable host. UAT-CHECKLIST.md covers the higher-level browser/UI side of the same surface.

---

## D-V44 invariant checklist

- ✅ **D-V44-SACRED** — `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at commit `c72a87d4` (executor verified pre-push). Disk SHA-256 verification deferred to operator (Step A).
- ✅ **D-V44-MINI-PC-ONLY** — Plan 06 touches only Mini PC (bruce@10.69.31.68). Server4 not mentioned anywhere in deploy script. Server5 not mentioned.
- ✅ **D-V44-CADDY-REUSE-226-04** — `caddy.ts` diff `2b07bed7..c72a87d4` is empty (verified above).
- ✅ **D-V44-NO-ROOT-PTY** — carried forward from Phase 243; SessionManager spawn path goes through bruce shell per `pty-sessions/session.ts` (Phase 243-01).
- ✅ **D-V44-TERMINAL-SCROLLBACK-RING** — `SCROLLBACK_MAX_LINES = 10000` drift-locked at `pty-sessions/scrollback.ts` (Phase 246-02 `8633add1`).

---

## Status

**Plan 06 artifact layer:** ✅ COMPLETE — deploy log + UAT checklist + SUMMARY + ROADMAP + STATE all produced.
**Plan 06 deploy layer:** ⏳ OPERATOR-PENDING — Step A (update.sh) + Step B (5 smoke probes) must be run from a network-reachable host. Once both steps PASS and Operator pastes transcripts above, this log can be re-committed with status flipped to ✅ SHIPPED.

If operator confirms PASS, the recommended close commit is:
```
docs(246-06): Mini PC deploy verified — SHA c72a87d4, sacred SHA preserved, 5/5 smoke probes GREEN
```

If any sacred-SHA-mismatch or critical-service-down → STOP, escalate, do not flip ROADMAP.
