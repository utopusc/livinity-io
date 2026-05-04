# Phase 63 Resume Instructions

**Status:** BLOCKED on R2 (Mini PC offline). All other autonomous work complete.
**Created:** 2026-05-03 ~01:10 UTC during overnight autonomous run
**For:** User waking up to a v30.0 milestone that's 7/8 phases done + 1 hot-patch deployed

---

## What's done (no action needed)

### Phases 56-62 — fully shipped to repo + verified

| Phase | Status | Tests | Notes |
|-------|--------|-------|-------|
| 56 — Research Spike | ✅ verified 5/5 | research-only | 9 D-30-XX decisions locked |
| 57 — Passthrough + Agent Mode | ✅ verified 6/6 | 96 broker GREEN | Default flipped to passthrough |
| 58 — True Token Streaming | ✅ verified 5/5 | 94 broker GREEN | for-await event iteration |
| 59 — Bearer Token Auth | ✅ verified 5/5 | 39 api-keys GREEN | `liv_sk_*` tokens; manual revoke |
| 60 — Public Endpoint + Caddy | ✅ verified 4/4 perimeter | live HTTP/2 200 | api.livinity.io reachable |
| 61 — Rate-Limit Headers + Aliases + Provider | ✅ verified 7/7 | 147 broker GREEN | BrokerProvider abstraction |
| 62 — Usage Tracking + Settings UI | ✅ verified 9/9 code | 76 new tests GREEN | API Keys tab + filter dropdown |

**Sacred SHA:** `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical across every phase, every wave, every commit.

### Phase 60 production defect — FOUND + FIXED + DEPLOYED to Server5

`platform/relay/src/admin-tunnel.ts:43` queried `WHERE role = $1` against `platform.users` which has NO `role` column — every `api.livinity.io` request returned 500 errorMissingColumn 42703 instead of the intended 503/200. Phase 60 unit tests mocked pg.Pool and never exercised live schema.

- **Hot-patch commit:** `516d622b fix(63-R1): relay admin-tunnel.ts queries username instead of non-existent role column`
- **New query:** `WHERE username = 'utopusc'` (single-tenant v30 design — closed signup, hardcoded sentinel)
- **Deployed to Server5:** YES (`/opt/platform/relay/src/admin-tunnel.ts` updated, `pm2 restart relay` ran cleanly, PID 116369)
- **Live smoke confirms:** `api.livinity.io/v1/messages` now returns proper Anthropic-spec 503 envelope `{"type":"error","error":{"type":"api_error","message":"broker tunnel offline"}}` (503 because admin tunnel is offline since Mini PC is offline — admin resolution itself is working)
- **Tests:** 11/11 GREEN locally (T7 updated to assert new query shape)
- **Phase 64+ followup:** add `role` column to platform.users + UI + migrate query back to `role='admin'`

### Phase 63 Wave 0 (pre-flight) — RED-LIGHT verdict committed

`63-01-SUMMARY.md` documents the pre-flight checklist; verdict was BLOCK on R1+R2+R3. R1 now resolved.

---

## What's blocked (you must do these)

### Step 1 — Power on the Mini PC

`bruce@10.69.31.68` is unreachable (Connection timed out, not fail2ban). Wake-on-LAN, physical power button, whatever it takes.

Verify with:
```bash
/c/Windows/System32/OpenSSH/ssh.exe \
  -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc \
  -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  bruce@10.69.31.68 'echo OK; uptime; sudo systemctl is-active livos liv-core liv-worker liv-memory'
```

### Step 2 — Deploy v30 to Mini PC

Once Mini PC is online, run `update.sh` (project memory: this is the canonical deploy mechanism — pulls from `utopusc/livinity-io`, rsyncs source, builds, restarts services).

```bash
ssh -i ... bruce@10.69.31.68 'sudo bash /opt/livos/update.sh 2>&1 | tail -50'
```

After deploy verify:
- `livos.service` active (livinityd, port 8080)
- `liv-core.service` active (nexus core, port 3200)
- Sacred SHA on Mini PC: `git hash-object /opt/livos/nexus/packages/core/src/sdk-agent-runner.ts` MUST equal `4f868d318abff71f8c8bfbcf443b2393a553018b` — drift = catastrophic
- Past Deploys panel shows the new entry in browser

**Watch-out** (project memory): `update.sh` doesn't rebuild `liv-memory` package (separate fix). Also pnpm-store quirk — multiple `@nexus+core*` dirs may cause stale dist; manually verify `node_modules/@nexus/core` symlink resolves to a freshly-rsynced dist.

### Step 3 — Re-run Phase 63 Wave 0 (pre-flight)

Should return GREEN-LIGHT now that R1+R2+R3 are all resolved.

```
/clear
/gsd-execute-phase 63
```

Wave 0 will recheck:
- Mini PC reachable ✓ (Step 1)
- update.sh ran ✓ (Step 2)
- Sacred SHA on Mini PC matches ✓
- api.livinity.io endpoint returns 401 (not 503) when no Bearer ✓ (R1 fix)
- Phase 61 alias seed ≥10 in Redis ✓
- Phase 62 UI tab visible at `bruce.livinity.io/settings/ai-config` ✓

### Step 4 — Execute Phase 63 Waves 1-11

The autonomous orchestrator will continue from Wave 1. Of the 11 plans, **5 require human-in-loop browser/IDE walks** that I cannot drive autonomously:

| Wave | Plan | Action needed |
|------|------|---------------|
| 1 | 63-02 deploy | Already done in Step 2 above; just runs verification |
| 2 | 63-03 raw protocol smoke | Scripted curl + Python SDK — autonomous OK |
| 3a | 63-04 Bolt.diy | **YOU must run** — open Bolt.diy locally, configure broker URL `https://api.livinity.io/v1` + a freshly-minted `liv_sk_*`, ask "Who are you?", confirm response says Bolt (NOT Nexus) |
| 3b | 63-05 Open WebUI | **YOU must run** — same as 3a but Open WebUI on `/v1/chat/completions` (OpenAI-compat path) |
| 3c | 63-06 Continue.dev | **YOU must run** — install VS Code extension, configure broker, test inline completion |
| 4a-d | 63-07..10 carry-forward UATs (16 files total) | Mostly automated checks; some need eyeball-walks of UI features |
| 5 | 63-11 final gate | Sacred SHA assertion + cleanup + milestone close — autonomous |

For waves 3a/3b/3c, I can produce **scripted curl proxies** that simulate exactly what each client sends (proves the protocol layer works); the GUI walk just confirms the actual external client renders the response correctly.

### Step 5 — Mint your first `liv_sk_*` token

After Mini PC deploy:
1. Browse to `https://bruce.livinity.io/settings/ai-config`
2. Find the new "API Keys" section (sibling above Usage)
3. Click "Create new key", give it a name (e.g., "bolt-diy-test")
4. Copy the `liv_sk_*` plaintext immediately — Stripe-style show-once modal
5. Use that token in Wave 3a/3b/3c client configs

---

## Resume command

```
/clear
/gsd-execute-phase 63
```

The autonomous orchestrator will pick up exactly where Wave 0 stopped, including:
- Re-running the pre-flight (now expected to GREEN-LIGHT)
- Then Wave 1 (verify deploy from Step 2)
- Then Wave 2 (raw protocol smoke — autonomous OK)
- Pause at Waves 3a/3b/3c for your browser walks
- Wave 4a-d carry-forward UATs (mostly automated)
- Wave 5 final gate

---

## Status log (during overnight run)

- 23:30 → Started `/gsd-autonomous` from Phase 56
- ~01:00 → Phases 56-62 all verified
- 01:00-01:08 → Phase 63 Wave 0 ran; surfaced R1+R2+R3
- 01:08 → R1 hot-patch applied + tests GREEN + deployed to Server5 + commit `516d622b`
- 01:10 → Mini PC reprobed; still offline — STOP autonomous run
- 01:10 → Wrote this RESUME-INSTRUCTIONS.md

**The autonomous run did NOT use `--accept-debt`** because D-LIVE-VERIFICATION-GATE (Phase 56 Decision D-30-07 / D-LIVE-VERIFICATION-GATE) explicitly forbids it for v30.0 close. Milestone is **6/8 phases verified + 1 phase blocked on physical infrastructure** — not closable autonomously.
