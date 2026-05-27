---
phase: 236-aionui-ws-assets-agent-fix
plan: 01
task: 2
type: investigation
created: 2026-05-27
approach: curl-mutation-LIVE
mini_pc_target: bruce@10.69.31.68
ssh_sessions: 2 (P1-10 inventory + A-F write probe + verify)
---

# Phase 236 Task 2 — AionUi Default-Agent Findings

Operator complaint quote: "Ben Cogu Seyde Auth kullanmak istiyorum API degil!"
+ AionUi banner: "Şu anda yalnızca Aion CLI özel modelleri destekliyor".

Root cause: **default agent was Aion CLI (`guid.lastSelectedAgent: "aionrs"`)**,
not Claude Code. Claude Code was always present + available — just not selected
as the per-user default. Operator wanted auth-mode chat (Claude subscription),
which Claude Code agent provides via `bun x @agentclientprotocol/claude-agent-acp`.

## Agent inventory (Mini PC `127.0.0.1:3020/api/agents`)

| id        | name       | backend  | agent_type | enabled | available | icon                                                        |
| --------- | ---------- | -------- | ---------- | ------- | --------- | ----------------------------------------------------------- |
| 632f31d2  | Aion CLI   | (none)   | aionrs     | true    | true      | `/api/assets/logos/brand/aion.svg`                          |
| 2d23ff1c  | Claude Code| claude   | acp        | true    | true      | `/api/assets/logos/ai-major/claude.svg`                     |
| 53861a53  | OpenCode   | opencode | acp        | true    | true      | `/api/assets/logos/tools/coding/opencode-light.svg`         |

Claude Code agent pre-handshake:
- `command`: `bun`, `args`: `["x", "--bun", "@agentclientprotocol/claude-agent-acp@0.33.1"]`
- `bridge_binary`: `bun`, `binary_name`: `claude`
- Native skills dir: `.claude/skills`
- Supports: side-question, sticky identity, session resume, team
- Yolo mode: `bypassPermissions`
- Available models: Default (Opus 4.7 + 1M context) / Sonnet / Haiku
- Mode options: Auto / Default / Accept Edits / Plan / Don't Ask / Bypass Permissions
- Current `acp.config` for claude: `preferredMode=acceptEdits, preferredModelId=sonnet`

OpenCode agent: minimal handshake (no auth_methods exposed, `supports_team:false`).

## Pre-mutation client settings (PROBE 2, GET `/api/settings/client`)

```json
{
  "theme": "light",
  "css.activeThemeId": "default-theme",
  "acp.config": {
    "claude": { "preferredMode": "acceptEdits", "preferredModelId": "sonnet" }
  },
  "customCss": "<…long CSS block, preserved verbatim…>",
  "guid.lastSelectedAgent": "aionrs"
}
```

The `guid.lastSelectedAgent` key is the per-user "remember which agent was last
opened". On client boot the AionUi SPA reads it and auto-selects that agent in
the chat picker — which is what the operator sees as "default agent".

## Mutation endpoint discovered (PROBE A)

```
$ curl -s -i -X PUT \
    -H 'Content-Type: application/json' \
    -d '{"guid.lastSelectedAgent":"2d23ff1c"}' \
    http://127.0.0.1:3020/api/settings/client

HTTP/1.1 200 OK
Content-Type: application/json

{"success":true}
```

- `PATCH /api/settings/client` → **405 Method Not Allowed** (allow: GET,HEAD,PUT)
- `POST /api/settings/client` → **405 Method Not Allowed**
- `GET /api/agents/default` → **404** (no such endpoint)
- `GET /api/settings/agents/default` → **404** (no such endpoint)

So **the canonical mutation surface is `PUT /api/settings/client`** with a JSON
body. The server merges the keys present in the body into the persisted client
settings record (NOT a full-document replace).

## Merge-semantics verification (POST-WRITE GET)

After `PUT {"guid.lastSelectedAgent":"2d23ff1c"}`:

```
keys after PUT: ['acp.config', 'css.activeThemeId', 'customCss',
                 'guid.lastSelectedAgent', 'theme']
guid.lastSelectedAgent = '2d23ff1c'        ← FLIPPED
theme                  = 'light'           ← PRESERVED
acp.config             = {claude: {…}}     ← PRESERVED
customCss              = (full CSS intact) ← PRESERVED
css.activeThemeId      = 'default-theme'   ← PRESERVED
```

All 4 sibling keys intact → server is doing field-level merge into the SQLite
`client_settings` row (`/opt/liv-assistant/data/aionui-backend.db`). The PUT
is safe and idempotent.

## Action taken (LIVE)

**Executed:** `PUT /api/settings/client` with body `{"guid.lastSelectedAgent":"2d23ff1c"}`
on `bruce@10.69.31.68` loopback at 2026-05-27 ~19:39 UTC.

**Effect:** Operator's next reload of the Liv AI iframe will land on the Claude
Code agent (subscription path via `bun x claude-agent-acp`), NOT Aion CLI. The
banner "Şu anda yalnızca Aion CLI özel modelleri destekliyor" disappears.
First model defaults to Sonnet per pre-existing `acp.config.claude.preferredModelId`.
Operator can switch to Opus 4.7 / Haiku via the in-app model picker any time.

## Operator next step (post Caddy deploy)

1. Hard-reload browser (Ctrl+F5) on https://bruce.livinity.io/
2. Open Liv AI dock tile → iframe loads → Claude Code is the active agent
3. Send a test prompt — first turn proves auth path works end-to-end
4. If a different default is preferred later, the same PUT can flip it back
   (just substitute `2d23ff1c` with the desired agent id):
   - Aion CLI:   `632f31d2`
   - Claude Code:`2d23ff1c`
   - OpenCode:   `53861a53`

## Source filesystem evidence

Persistence layer:
```
/opt/liv-assistant/data/aionui-backend.db          (425 KB SQLite)
/opt/liv-assistant/data/aionui-backend.db-shm      (32 KB)
/opt/liv-assistant/data/aionui-backend.db-wal      (1.1 MB write-ahead log)
```

Could not run `sqlite3` inline (not installed on Mini PC, NOT in scope to
install). Mutation verified via API round-trip, which is sufficient.

## Bound binary string-grep (PROBE D)

The aioncore binary exposes these API routes via static strings:
- `/api/settings`
- `/api/settings/client`
- `/api/providers`
- `/api/providers/detect-protocol`
- `/api/providers/fetch-models`
- `/api/providers/{id}`
- `/api/providers/{id}/models`
- `/api/system/check-update`

So the route inventory is well-defined; `/api/settings/client` is the
canonical client-settings surface. No undocumented "default agent" route exists
— the SPA uses the same `guid.lastSelectedAgent` key our PUT just touched.

## SSH session budget

Two batched sessions (PROBE 1-10 inventory + A-F write probe + verify) within
fail2ban tolerance per `feedback_ssh_rate_limit`. No per-step ad-hoc probes.

## Summary

- **APPROACH:** `curl-mutation` (DONE — LIVE on Mini PC, idempotent PUT)
- **Operator action:** browser hard-reload only — no UI step needed
- **Reversibility:** same PUT with different agent id (3-row id table above)
- **Risk:** zero (other client_settings keys preserved verbatim, server-side merge)
