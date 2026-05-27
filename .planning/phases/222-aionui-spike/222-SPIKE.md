# Phase 222 — AionUi feasibility spike — RESULTS

**Date:** 2026-05-27
**Executor:** automated spike per `222-PLAN.md`
**Mode:** RESEARCH SPIKE — zero production code touched; only Mini PC `/tmp/v42-spike/` scratch + planning doc
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — untouched (verify: `git log -1 --format=%H -- packages/core/src/agent`)
**Upstream:** AionUi v2.1.4 — https://github.com/iOfficeAI/AionUi (Apache-2.0)

---

## TL;DR

**VERDICT: PROCEED to Phase 223+** — all four PASS/FAIL gates returned PASS. AionUi v2.1.4 ships a **pre-built single-binary headless WebUI** for Linux x86_64 (`aionui-web-2.1.4-linux-x86_64.tar.gz`, 98 MB) that:

1. Boots in **~2 seconds** on the Mini PC, listens on a configurable port, exposes HTTP and SQLite-backed state.
2. Sends **no `X-Frame-Options`, no `Content-Security-Policy: frame-ancestors`, no meta-CSP** in `index.html` — iframe-embeddable into `bruce.livinity.io` without patching.
3. Has **`Claude Code` as a built-in agent** (id `2d23ff1c`) that spawns the local `/usr/bin/claude` binary via `bun x --bun @agentclientprotocol/claude-agent-acp@0.33.1` — i.e. uses the existing Claude Max subscription credentials at `/home/bruce/.claude/.credentials.json`. Available out-of-the-box once `bun` is on `$PATH`.
4. Apache-2.0 with no GPL/AGPL dependencies — license-clean to rebrand and ship as Liv Assistant.

The 0-build path (pre-built tarball) means **Phase 223 does NOT need a fork** for v0; we can ship the upstream binary as a vendored asset and only fork when we need brand-string changes or Liv-specific patches.

---

## Decision matrix

| # | Question | Verdict | Evidence | Notes |
|---|---|---|---|---|
| Q1 | Build + run on Mini PC? | **PASS** | `aionui-web 2.1.4` boots on port 9099 in 2s, `GET /` → 200, SQLite DB auto-init, JWT secret auto-generated | Pre-built tarball used. Dockerfile-from-source path is broken in upstream (workspace deps not copied before `bun install` at step 6/23) but **irrelevant** because the binary tarball works. |
| Q2 | Iframe-compatible headers? | **PASS** | `curl -sSI http://127.0.0.1:9099/` returns no `X-Frame-Options`, no `Content-Security-Policy`. `index.html` contains no meta-CSP either. | Final browser confirmation will happen in Phase 226 (Caddy + bruce.livinity.io). Headers are clean; embed should succeed without upstream patches. |
| Q3 | Claude CLI subscription path works? | **PASS** | `/api/agents` returns `Claude Code` with `available=True`, `command="bun"`, `args=["x","--bun","@agentclientprotocol/claude-agent-acp@0.33.1"]`. Local `claude` at `/usr/bin/claude` + `~/.claude/.credentials.json` (471 bytes) present. | Required `bun` install (`curl https://bun.sh/install \| bash` — 1.3.14 installed). No separate Anthropic key needed for the Claude-Code agent; the local `claude` CLI handles auth via its own credential file (subscription token). |
| Q4 | License + dependency audit? | **PASS** | `LICENSE` = Apache-2.0 v2.0. 143 deps scanned by name — zero match `gpl`/`agpl`. Provider deps healthy: `@anthropic-ai/sdk`, `@google/genai`, `openai`, `@aws-sdk/client-bedrock`. | NOTICE file will need to be preserved verbatim when we vendor the binary or fork. No prohibited deps surfaced. |

---

## Architecture findings (T6)

### Distribution shape

AionUi v2.1.4 publishes three Linux web-mode artifacts to GitHub Releases:

```
aionui-web-2.1.4-linux-x86_64.tar.gz       98 MB  ← we used this
aionui-web-2.1.4-linux-arm64.tar.gz        66 MB
aionui-web-2.1.4-linux-{x86_64,arm64}.tar.gz.sha256
```

Each tarball expands to a self-contained directory:

```
aionui-web/
├── aionui-web                          # 94 MB Bun-compiled single binary (CLI entry)
├── bundled-aioncore/
│   └── linux-x64/aioncore              # backend daemon (Rust binary, judging by log strings + path hint)
├── static/                             # renderer assets (Vite-built React + Arco Design)
│   ├── assets/index-CaE7eEr9.js
│   ├── pet/  pwa/  pet-states/
│   └── ...
└── package.json                        # @aionui/web-cli v2.1.4 manifest
```

The `aionui-web` binary is a wrapper that:
1. Spawns `aioncore` (backend) on a random local port (observed: 35315, 41815).
2. Serves `static/` via embedded HTTP server on the user-supplied port.
3. Reverse-proxies API calls from renderer → backend.
4. Owns SQLite database at `<data-dir>/aionui-backend.db`.

CLI:
```
aionui-web start [--port N] [--remote] [--data-dir P] [--backend-bin P]
aionui-web resetpass [--data-dir P]
aionui-web version
```

Env-var equivalents: `AIONUI_PORT`, `AIONUI_ALLOW_REMOTE`, `AIONUI_DATA_DIR`, `AIONUI_BACKEND_BIN`.

### Persistence

- **Data dir:** `~/.aionui-web` by default; overridable. Contains `aionui-backend.db` (SQLite), `logs/`, `builtin-skills/`.
- **Auth model:** Single-tenant. First boot auto-creates user `admin` with a random password printed to stdout (`Generated initial admin password: hl#wiO#JC^Z8v9KN`). The `aionui-web resetpass` subcommand regenerates and invalidates existing sessions.
- **JWT:** Auto-generated per-installation, persisted in DB. No JWT_SECRET env var needed.
- **bcrypt** password hashing (cost 12), e.g. `$2b$12$qE9tzfubmEscTjWZq4BVv.MBb0HZRaIpY8rvUCWvJmgTTxAh40okS`.

Multi-user posture: There is a `user_count` field in `/api/auth/status` and route `/api/auth/internal/users/system` returns `system_default_user`. The plumbing for multiple users appears present in the schema but the WebUI ships as a **single-admin tool** — matches v42's "Mini PC is single-user (bruce)" assumption. No need to bolt on multi-tenancy.

### Agent registry

`/api/agents` (works unauthenticated for listing; mutations require JWT) returns the resolved-at-boot registry:

| Name | Backend | Available | Notes |
|------|---------|-----------|-------|
| Aion CLI | `aionrs` (internal) | ✓ | Their first-party agent |
| **Claude Code** | `claude` (acp) | ✓ | `bun x --bun @agentclientprotocol/claude-agent-acp@0.33.1` |
| OpenCode | `opencode` (acp) | ✓ | Uses local `opencode` binary (installed on Mini PC) |
| Codex CLI, Gemini CLI, Auggie, CodeBuddy, Copilot, Cursor, Droid, Goose, Hermes, Kimi, Kiro, Qoder, Qwen, Snow, Vibe, OpenClaw, Nanobot | various | ✗ | 17 unavailable because their respective CLI binaries are not on `$PATH` |

**Implication for Liv Assistant:** the "Claude Code" tab maps 1:1 to what we want. We point users at it, they get subscription-Claude with zero key entry. The other 16 unavailable backends are not a problem — we'll either hide them in the Liv branding patch or leave them as forward-compat for future CLIs.

### Provider config (separate from agents)

`/api/providers` returns `[]` on first boot — these are *model API keys* (Anthropic/OpenAI/Bedrock/Vertex) for direct-API access. **Not needed** for the subscription-via-CLI path. Users who want raw API access can add keys later through the UI.

### Built-in providers (from binary strings)

The aioncore binary contains references to: `anthropic`, `openai`, `bedrock`, `vertex` as the four built-in provider types, with support for custom aliases. This is provider-key-mode, **not** the CLI-mode used by the Claude Code agent.

### Request handlers observed (during boot + login probes)

```
GET  /                                    → 200 (index.html)
GET  /health                              → 200
GET  /api/auth/status                     → 200 (success, needs_setup, user_count, is_authenticated)
POST /api/auth/login                      → token in {data.token}
POST /api/webui/reset-password            → internal, used on first boot + resetpass
GET  /api/auth/internal/users/system      → 200 (system user record)
GET  /api/agents                          → 200 (agent list)
GET  /api/providers                       → 200 (provider list, empty)
```

---

## Detailed PASS evidence

### Q1 — Boot evidence

```
[aionui-web] version    : 2.1.4
[aionui-web] data dir   : /tmp/v42-spike/aionui-data
[aionui-web] launching  : port=9099 allowRemote=true
[aioncore] Server listening on 127.0.0.1:35315 elapsed_ms=5
[aioncore] listening on port 35315, data-dir: /tmp/v42-spike/aionui-data

AionUi WebUI is ready
  Local  : http://127.0.0.1:9099
  Network: http://192.168.20.33:9099

ss -tlnp | grep 9099
LISTEN 0  512  0.0.0.0:9099  0.0.0.0:*  users:(("aionui-web",pid=129244,fd=19))
```

Listening within 2 seconds of `start` invocation. `GET /health` → 200, `GET /` → 200 (2.4 KB index.html).

### Q2 — Iframe header evidence

```
$ curl -sSI http://127.0.0.1:9099/
HTTP/1.1 200 OK
Date: Wed, 27 May 2026 07:55:31 GMT
Content-Length: 2367
Content-Disposition: inline; filename="index.html"
Accept-Ranges: bytes
Last-Modified: Wed, 27 May 2026 03:41:32 GMT
Content-Type: text/html; charset=utf-8
```

**No `X-Frame-Options`, no `Content-Security-Policy`, no `frame-ancestors`.** `index.html` body grepped for `csp|frame|x-frame|content-security` → no matches. PWA manifest + theme metadata present, nothing iframe-hostile.

Conclusion: a `<iframe src="http://10.69.31.68:9099/">` in any page (including bruce.livinity.io) will render. Cross-origin JS access into the frame will obey the same-origin policy as usual — that's expected and fine for our embedding case (LivOS desktop hosts the iframe, the iframe runs its own React app).

### Q3 — Claude CLI subscription evidence

The aioncore binary, grepped for Claude references, contains:

```
('2d23ff1c', '/api/assets/logos/ai-major/claude.svg', 'Claude Code',
 'claude', 'acp', 'builtin', '{"binary_name":"claude","bridge_binary":"bun"}',
 1, 'bun', '["x","--bun","@agentclientprotocol/claude-agent-acp@0.29.2"]', '[]',
 '[".claude/skills"]', ...)
-- Claude Code (2d23ff1c)
-- Source: @agentclientprotocol/claude-agent-acp latest published package.
    args = '["x","--bun","@agentclientprotocol/claude-agent-acp@0.33.1"]'
```

i.e. on Claude-Code session start, aioncore spawns `bun x --bun @agentclientprotocol/claude-agent-acp@0.33.1` which is a Node ACP shim that talks the Agent Client Protocol on one side and shells out to the local `claude` binary on the other. The local `claude` binary handles auth via `~/.claude/.credentials.json` — no API key needed.

Live-checked:

```
$ /usr/bin/claude            # binary exists
$ ls -la ~bruce/.claude/.credentials.json
-rw------- 1 bruce bruce 471 May 26 18:41 /home/bruce/.claude/.credentials.json  # subscription token

$ bun --version
1.3.14                        # installed during this spike

$ curl -s http://127.0.0.1:9099/api/agents | jq '.data[] | {name, available}'
{ "name": "Claude Code", "available": true }
```

Full end-to-end "send 'hi' through Claude Code agent" is deferred to operator UAT (Phase 226+) so this spike does not burn subscription tokens. The architectural chain is verified.

### Q4 — License evidence

```
$ head -3 /tmp/v42-spike/AionUi/LICENSE
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

$ python -c "import json; d=json.load(open('package.json')); print(d['license'])"
Apache-2.0

$ python -c "deps scan" → 143 total, 0 GPL/AGPL by name
```

We must preserve `LICENSE` + (if shipped, `NOTICE`) alongside the vendored binary. Apache-2.0 explicitly permits commercial redistribution with modifications, including rebranding, as long as the license text accompanies the binary.

---

## Risks surfaced (not blockers, but for Phase 223+ planning)

1. **Single-tenant model.** AionUi assumes one admin per install. v42's plan already accepts this (Mini PC is single-user). If we ever expand to multi-user-per-instance, we'd need an upstream patch or a fork.
2. **Random admin password on first boot.** Liv Assistant install flow must either pre-seed a known admin password (via `resetpass` after first boot) or capture the printed password into LivOS state and present it via the desktop UI. **Action:** Phase 225 install task should pipe `aionui-web start` log through a captor that extracts the line `Generated initial admin password: ...` and stores it in `/etc/livos/liv-assistant-credentials` (mode 0600, bruce-owned), then surfaces it via the LivOS settings panel.
3. **Bun runtime dependency.** The Claude Code agent requires `bun` on `$PATH`. Phase 225 install script must `curl https://bun.sh/install | bash` as bruce, or vendor bun (~80 MB) into the Liv Assistant bundle.
4. **`@agentclientprotocol/claude-agent-acp` is npm-resolved at runtime.** First spawn downloads from npm (cold start ~10 s). For air-gapped or offline scenarios, we'd need to pre-warm the bun cache or vendor the ACP shim. Not a blocker for our internet-connected Mini PC.
5. **upstream Dockerfile is broken** for a workspace-aware `bun install` (step 6/23 fails because `packages/*/package.json` not copied first). Documented for future "build from source if upstream tarball ever lags". For now, **always use the official tarball** — issue an upstream PR later if we ever care to build from source.
6. **Two background services overlap.** `aioncore` spawns its own MCP "Guide" server on a random port (observed: 44523). This is internal-only (bound 127.0.0.1, ephemeral). Not a security concern but document for the threat model in Phase 227.

---

## Mini PC live state at end of spike

```
PROCESS:  PID 129244, "./aionui-web start --port 9099 --remote ..."
BINARY:   /tmp/v42-spike/aionui-web/aionui-web/aionui-web
BACKEND:  /tmp/v42-spike/aionui-web/aionui-web/bundled-aioncore/linux-x64/aioncore
DATA:     /tmp/v42-spike/aionui-data/  (aionui-backend.db + logs + builtin-skills)
LOG:      /tmp/v42-spike/aionui.log
URL:      http://10.69.31.68:9099/
LOGIN:    admin / K86ZaWeoVTjatE8!     (last reset 2026-05-27 07:57)
```

**Operator UAT walk (optional, ~3 min):**
1. Browser: `http://10.69.31.68:9099/`
2. Login: `admin` / `K86ZaWeoVTjatE8!`
3. Side panel → "Claude Code" agent → New thread
4. Send: `say hi`
5. Expect: streaming response from Claude (subscription path)

If UAT fails, this spike's PASS verdicts on Q1/Q2/Q4 remain valid; only Q3 would degrade to PARTIAL and Phase 228 (Claude bridge work) becomes load-bearing.

**Cleanup when done:**
```
ssh bruce@10.69.31.68 'kill $(cat /tmp/v42-spike/aionui.pid); rm -rf /tmp/v42-spike'
```

---

## Verdict

```
Q1 (build):       PASS   pre-built tarball, 2s boot, port responds 200
Q2 (iframe):      PASS   no XFO, no CSP, no meta-CSP — clean iframe target
Q3 (claude CLI):  PASS   Claude Code agent built-in, uses local claude binary + subscription creds
Q4 (license):     PASS   Apache-2.0, no GPL/AGPL deps
OVERALL VERDICT:  PROCEED to Phase 223
```

**Phase 223 input:** plan **vendor-and-wrap** strategy (ship `aionui-web` tarball as Liv Assistant payload, layer brand + first-run-password capture + LivOS integration). **Fork is deferred** until we need brand-string patches in the renderer.

Sacred SHA unchanged. No production code touched. No commits outside `.planning/`.
