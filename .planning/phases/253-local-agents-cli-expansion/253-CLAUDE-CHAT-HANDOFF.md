---
status: RESOLVED
type: debug-handoff
phase: 253-local-agents-cli-expansion
created: 2026-05-31
resolved: 2026-05-31
resolution_commit: 915f7f25
goal: Make the TEST BOX Liv AI Claude chat work exactly like the working Mini PC, via a single clean setup (replicate Mini PC's install/runtime logic).
---

# ✅ RESOLVED 2026-05-31 — read this first

**The Claude chat round-trip now works on the test box (154.53.56.75), exactly like Mini PC:**
`warmup=200/~1.5s`, `send=202`, `event_type="Finish" text_len>0` — stable across restart + bunx-cache clear.

**Root cause (named, not guessed): it was NOT a version/auth/MCP/config defect.**
The handoff's central premise ("both boxes 2.1.156, version ruled out") was right on version
but missed the real mechanism. Proven by driving the ACP adapter directly over stdio: with NO
MCP / guide-only / all-5-LivOS-MCP, `session/new` returns in 1–3s every time. claude-core +
adapter + every MCP server are fine. Ruled out: claude version, npm-global claude (removed it,
still worked), MCP servers, guide_mcp, process count (Mini PC runs fine with 17 stuck claude
procs), claude.ai MCP (identical Gmail/Drive ✓ + Calendar needs-auth on BOTH boxes),
settings/skills, bunx cache, in-memory state.

**What actually broke it:** orphaned/hung claude processes from the prior debugging session.
Found a claude **2.1.126** orphan (the old version that 401s), launched from `bash`, stuck in
`ep_poll` for ~2h, plus a stale `2.1.126.lock` and the deadlock-prone **2.1.158** build (which
the handoff itself flagged). ACP-spawned claude/adapter/guide children **escape the unit cgroup**
(re-parented to init), so `systemctl restart liv-assistant` does NOT reap them despite
`KillMode=control-group` (verified: 1 claude/adapter/guide each survived a `stop`). A wedged
claude then blocks new `session/new`. `pkill` of the orphans restored chat; the hang was then
**unreproducible** (survives restart + cache clear). So there was no persistent install defect —
it was degraded runtime state from manual debug churn. A clean `curl|bash` install wouldn't hit it.

**Fix baked into install (commit `915f7f25`, pushed to master):** `systemd/liv-assistant.service`
now has `ExecStartPre` + `ExecStopPost` reapers scoped to ONLY non-interactive ACP children
(`--input-format stream-json` + `claude-agent-acp`/`mcp-guide-stdio` binary names; `[x]` bracket
trick avoids self-match; runs as bruce so only signals bruce procs). Interactive terminal
claude/gemini sessions (the Phase 253 CLI feature) are spared — verified a masquerading
interactive claude survived a restart while the ACP procs went 2→0. `systemctl restart
liv-assistant` is now a reliable reset for a wedged chat. update.sh GC-E syncs the unit to all
boxes on next run (Mini PC untouched per hard rule; it never had the orphan problem anyway).

**Test box residue cleaned to match Mini PC:** removed 2.1.158, stale 2.1.126.lock, the 2.1.126
orphan. versions=[2.1.126, 2.1.156], locks=[], symlink→2.1.156.

---

# Plan B — Liv AI Claude chat: replicate Mini PC on the test box (single setup)  [ORIGINAL HANDOFF BELOW — superseded]

> **READ THIS FIRST after /clear.** This is a continuation handoff. A very long
> session debugged "Liv AI Claude chat broken on the test box." Most of the
> Phase 253 work + 7 gap-closure fixes are DONE and pushed. The ONE remaining
> blocker is: **on the test box, the Claude ACP `session/new` hangs** (initialize
> completes, then nothing). The user's directive: *"Mini PC nasıl çalışıyorsa öyle
> çalışsın — Mini PC'nin çalışma + kurulum mantığını al, araştır, tek setup ile
> düzgün kurulabilir hale getir."* i.e. find the remaining test-box-vs-Mini-PC
> difference, replicate Mini PC, and bake it into the install so one setup works.

## Boxes & access (project memory)
- **Mini PC = WORKING reference** (operator's real box, Claude chat fine). bruce-EQ.
  - SSH: `/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68`
  - READ-ONLY. Do NOT modify Mini PC (hard rule). sudo available for reads.
- **Test box = BROKEN (Claude chat hangs)** = hello.livinity.io / 154.53.56.75. Disposable test env.
  - SSH: `/c/Windows/System32/OpenSSH/ssh.exe -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@154.53.56.75`
  - NOT Mini PC, NOT Server4/5.
- liv-assistant = vendored AionUi 2.1.4, systemd `liv-assistant`, port 3020, runs as **bruce**, spawns Claude via `@agentclientprotocol/claude-agent-acp@0.33.1` under bun.

## THE REMAINING BUG (precise)
Claude chat: ACP `initialize` SUCCEEDS (`authMethods:[]` = authenticated), then
`session/new` is sent and **never gets an `agent_response`** → warmup hangs →
chat shows nothing. The `claude-agent-acp` node process sits in `ep_poll` (waiting
on a pipe, NOT a network call — no api.anthropic.com connection open), no claude
subprocess child, indefinitely. On Mini PC the SAME flow completes `session/new`
in <1s and emits `StreamRelay ... event_type="Finish" ... text_len=NNN` (real reply).

### DEFINITIVELY RULED OUT (do NOT re-investigate)
1. **Auth** — oauth `sk-ant-oat01-` token is VALID; `claude -p "say OK"` works as bruce;
   `initialize` returns `authMethods:[]`. (Earlier 401 was caused by the wrong claude
   pin 2.1.126 — see below — now gone.)
2. **claude version** — test box is now **2.1.156** = exact Mini PC version.
   (2.1.126 = too old → 401 in ACP; 2.1.158 = oauth ok but session/new deadlock+kill;
   **2.1.156 = the sweet spot, both work**. Pin is `~/.local/bin/claude` → versions/2.1.156, autoUpdates false.)
3. **The 5 LivOS MCP servers** — disabled them (`UPDATE mcp_servers SET enabled=0`)
   in `/opt/liv-assistant/data/aionui-backend.db`, restarted → **STILL hangs**. So NOT the
   LivOS MCP servers. (They were re-enabled afterward; luse is "required for the WebApp surface".)
4. **tsx missing** — was a REAL secondary bug (MCP wrappers exec `/usr/bin/node /usr/lib/
   node_modules/tsx/dist/cli.mjs`, tsx was absent → MCP servers failed). FIXED: installed
   `tsx@4.21.0 --prefix /usr` (Mini PC's version) + durable in update.sh. But fixing tsx did
   NOT fix the chat hang (because the hang persists even with MCP disabled).
5. **bun / node / liv-assistant version** — both boxes: bun `bun-1.3.13-b29d78892abd`,
   liv-assistant `aionui-web` 2.1.4, node v22.22.x (trivial .1 diff). NOT the difference.
6. **claude.json double-injection** — GC-F had seeded 5 servers into `~/.claude.json mcpServers`;
   that was redundant+harmful (Mini PC's claude.json mcpServers is EMPTY). REVERTED to empty.

### STILL UNKNOWN — where session/new hangs (NEXT INVESTIGATION)
The hang is inside `session/new` AFTER a clean `initialize`, even with only the
`aionui-team-guide` guide_mcp injected (the 5 LivOS disabled). Candidates NOT yet
compared Mini-PC-vs-test-box:
- **guide_mcp** (`aioncore mcp-guide-stdio` on a random port) — does it start/respond on the test box? Compare.
- **claude-agent-acp internal session setup** — what is the hung node proc's open FDs / pipes waiting on? (`ls -l /proc/<pid>/fd`, which pipe peer is dead/silent). Earlier it was `ep_poll` with NO claude subprocess child — the adapter may be waiting on a pipe whose writer never spawned.
- **claude settings / skills** — conversation create shows `extra.skills:["cron","liv-ai-skills","office..."]`. Compare `~/.claude/settings.json`, `~/.claude.json`, and the skills dirs between boxes. A skill or settings entry that hangs claude's session bootstrap on the test box.
- **bun cache / claude-agent-acp node_modules** — diff `/tmp/bunx-1000-@agentclientprotocol/claude-agent-acp@0.33.1/node_modules` trees; a corrupt/partial bunx extraction on the test box.
- **The conversation temp dir / cwd** — session/new cwd is `/opt/liv-assistant/data/conversations/acp-temp-<id>` (or claude-temp-). Permissions/contents vs Mini PC.
- **DISPLAY / X / luse** at session/new (guide_mcp or claude may probe something needing X).

### Recommended NEXT step (strongest signal)
Run the EXACT spawn manually on BOTH boxes and drive ACP over stdio to see where the
test box diverges, OR inspect the hung adapter's pipe peers:
```
# on test box, while a chat is hung:
NODE=$(pgrep -f 'bunx.*claude-agent-acp' | head -1)
ls -l /proc/$NODE/fd            # find the pipe/socket it's blocked reading
cat /proc/$NODE/task/*/children # any child it spawned (claude CLI?)
# then compare the same during a (fast) Mini PC warmup.
```
If the adapter spawns the `claude` CLI subprocess for session/new and that subprocess
hangs (project/skill/MCP load), strace THAT claude process on the test box.

## Useful: how to test Claude chat end-to-end WITHOUT the browser (API on the box)
```
B=http://127.0.0.1:3020
# 1. create (agent_id goes INSIDE extra):
CID=$(curl -s -X POST $B/api/conversations -H 'Content-Type: application/json' \
   -d '{"type":"acp","extra":{"agent_id":"2d23ff1c"}}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["id"])')
# 2. warmup (hangs today; ~<2s on Mini PC):
curl -s -o /dev/null -w '%{http_code}\n' --max-time 60 -X POST $B/api/conversations/$CID/warmup
# 3. send (message body needs "content"):
curl -s -X POST $B/api/conversations/$CID/messages -H 'Content-Type: application/json' -d '{"content":"Reply with exactly: OK"}'
# 4. success signal in journal: aionui_..stream_relay: StreamRelay ... event_type="Finish" ... text_len=NN
journalctl -u liv-assistant --since '-2min' --no-pager | grep -E "$CID|Finish.*text_len|agent_response.*session/new|authentication_failed"
```
Claude Code agent id = `2d23ff1c`. Models: haiku-4-5 returns 200 via oauth+`anthropic-beta: oauth-2025-04-20`; sonnet-4-5 returned 429 (rate) in a raw curl test (chat default model_id was "sonnet").

## State of the test box right now (changes already applied this session)
- claude pinned 2.1.156 (`~/.local/bin/claude`), `~/.claude/settings.json` autoUpdates:false.
- `~/.claude.json` mcpServers = **empty** (matches Mini PC). KEEP empty.
- tsx@4.21.0 installed at `/usr/lib/node_modules/tsx` (+ chmod a+rX).
- 5 LivOS MCP servers in aioncore DB = **enabled=1** (re-enabled after the disable test).
- NO ANTHROPIC env, NO systemd drop-in (the experimental `anthropic-oauth.conf` was removed).
- `/home/bruce/.gemini/trustedFolders.json` has broad trust (`/`, etc.) added during debugging — harmless, can stay or be reverted to just `/opt/livos`.
- GEMINI_CLI_TRUST_WORKSPACE=true is in the unit (GC-E, real fix — **Gemini chat WORKS**).

## What is DONE & pushed to master (do not redo)
Phase 253 (15 CLIs + drift-lock + deploy) + gap closure, all on master:
- G21: update.sh copies scripts/install/cli/ ; GC-A/B/G terminal new-tab+install+paste-focus;
  GC-C hide built-in aionrs (632f31d2); GC-D panel card UI; GC-E gemini folder-trust (unit env);
  W1 rebrand exemption for liv-240-*; W5 self-healing panel mount; W4 importer patch
  (CapabilitiesSettings includes aionui-source MCP for any agent) + CapabilitiesSettings rebrand
  exemption; removed the harmful claude.json MCP seed; **tsx install added to update.sh**.
- Latest master commit ~ `6f6046ef`. Memory file `project_liv_assistant_claude_version_pin.md`
  updated with the 2.1.156 pin + tsx + gemini/claude-asymmetry lessons.

## Verification gaps still OPEN for the operator (browser walk, once chat works)
Panel: 20-CLI card UI, no "Liv CLI Failed" row (W1), panel doesn't vanish (W5), Install/Auth open
a fresh terminal (GC-A/B). MCP import shows Liv tools under any agent (W4). **W3 (paste in
terminal-claude + the webapp-stream/"google yayını" VNC) is still unfixed — needs live debug.**

## Definition of done for Plan B
1. Test box `warmup`+`send` round-trip returns a real Claude reply (`Finish text_len>0`), like Mini PC.
2. The fix is understood as "the difference from Mini PC" (named, not guessed).
3. Baked into the install (install-liv-assistant.sh / update.sh) so a single fresh setup yields a
   working Claude chat — no manual post-steps. Then redeploy clean and re-verify.
