# Phase 42 UAT — OpenAI-Compatible Broker (Manual Deploy-Time Verification)

**Status:** Operator-driven. Run on Mini PC AFTER deploying Phase 42 commits. Claude executor did NOT run any of this (out of scope per `<scope_boundaries>` — no Mini PC deploy, no Python in scope).

**Phase under test:** 42 — OpenAI-Compatible Broker
**Anchor requirement:** FR-BROKER-O-04 (output validates against official `openai` Python SDK)

---

## Section A: Prerequisites

Phase 42 builds on Phase 41's broker module. Run **Phase 41's UAT Sections A + C + D + E** first (`41-UAT.md`) and confirm:

- [ ] livinityd is running on Mini PC port 8080
- [ ] Phase 41's `POST /u/<user>/v1/messages` works end-to-end (sync + SSE)
- [ ] At least ONE multi-user OAuth login is in place (Phase 40) — needed for the smoke test to actually call Claude
- [ ] At least ONE container is on the Mini PC's Docker bridge with `--add-host=livinity-broker:host-gateway` (manual flag — Phase 43 will inject this automatically)

If ANY Phase 41 UAT step is incomplete, STOP and complete Phase 41 UAT first. Phase 42 cannot validate without the underlying broker being live.

---

## Section B: Sync `curl` Smoke Test

From inside a marketplace-style container (`docker run --rm --add-host=livinity-broker:host-gateway alpine/curl ...`) OR from the Mini PC host (replace `livinity-broker` with `127.0.0.1`):

### B-1: Sync POST gpt-4 → OpenAI ChatCompletion JSON

Replace `<USER_ID>` with a real user UUID from `psql -d livos -c "SELECT id, username FROM users;"`.

```bash
curl -s -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Reply with exactly: SMOKE OK"}]}' \
  | jq .
```

**Expected output shape (key fields):**
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1730000000,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "...SMOKE OK..."},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ...}
}
```

**Pass criteria:**
- [ ] HTTP 200
- [ ] `id` starts with `chatcmpl-`
- [ ] `object` == `"chat.completion"`
- [ ] `model` field echoes `"gpt-4"` (NOT `"claude-sonnet-4-6"` — caller's model is preserved per D-42-11)
- [ ] `choices[0].message.role` == `"assistant"`
- [ ] `choices[0].message.content` contains `"SMOKE OK"` (model actually responded)
- [ ] `choices[0].finish_reason` == `"stop"`
- [ ] `usage.total_tokens` == `prompt_tokens + completion_tokens`

### B-2: Sync POST claude-sonnet-4-6 (pass-through alias)

```bash
curl -s -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"hi"}]}' \
  | jq -r '.model'
```

**Pass:** Output is `claude-sonnet-4-6`.

### B-3: Sync POST unknown model → 200 + warn in logs

```bash
curl -s -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"foobar-llm","messages":[{"role":"user","content":"hi"}]}' \
  | jq -r '.model'

# Then check journalctl for the warn:
sudo journalctl -u livos --since "2 minutes ago" | grep "unknown model"
```

**Pass:**
- [ ] Response `model` field is `"foobar-llm"` (echoed)
- [ ] Response is 200 (NOT 4xx)
- [ ] Log line `[livinity-broker:openai] WARN unknown model 'foobar-llm' — defaulting to claude-sonnet-4-6` present in journalctl

---

## Section C: Streaming `curl -N` Smoke Test

```bash
curl -N -s -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Count from 1 to 3 separated by spaces"}],"stream":true}'
```

**Expected output (line-by-line):**
```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"..."},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"..."},"finish_reason":null}]}

... (more delta chunks) ...

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":...,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

**Pass criteria:**
- [ ] Every chunk line starts with `data: ` (NO `event:` prefix anywhere)
- [ ] Every chunk has `"object":"chat.completion.chunk"`
- [ ] First chunk has `"delta":{"role":"assistant",...}` (role only on first)
- [ ] Subsequent chunks have `"delta":{"content":"..."}` only (no role)
- [ ] Terminal chunk has `"delta":{}` and `"finish_reason":"stop"`
- [ ] Stream ends with literal `data: [DONE]\n\n` line
- [ ] All chunks share the same `id` and `created` value

---

## Section D: Official `openai` Python SDK Smoke Test (FR-BROKER-O-04 acceptance gate)

This is the verbatim test from `42-CONTEXT.md` D-42-13. It is the official acceptance gate for FR-BROKER-O-04.

### Prerequisites

```bash
# On Mini PC, in any directory with Python 3.10+:
python3 -m pip install --user openai
# Or use a venv if preferred:
# python3 -m venv /tmp/openai-smoke && source /tmp/openai-smoke/bin/activate && pip install openai
```

### D-1: Sync smoke

Save as `/tmp/openai-smoke-sync.py`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8080/u/<USER_ID>/v1",
    api_key="ignored"  # broker doesn't read this; auth is via URL path
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Say hello"}]
)
print(response.choices[0].message.content)
```

Run:
```bash
python3 /tmp/openai-smoke-sync.py
```

**Pass:** Prints Claude's response (any text). NO exception.
**Fail:** `openai.BadRequestError`, `openai.APIStatusError`, JSON-parse error, or AttributeError on response shape.

### D-2: Streaming smoke

Save as `/tmp/openai-smoke-stream.py`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8080/u/<USER_ID>/v1",
    api_key="ignored"
)

stream = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Count to 5"}],
    stream=True
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)
print()  # final newline
```

Run:
```bash
python3 /tmp/openai-smoke-stream.py
```

**Pass:** Output streams character by character; ends cleanly with newline. NO exception.
**Fail:** SDK raises `openai.APIError`, `IndexError`, JSON parse error, or hangs (missing `[DONE]` terminator).

### D-3: Both passes → FR-BROKER-O-04 ACCEPTED

Mark on this checklist:
- [ ] D-1 sync passes
- [ ] D-2 streaming passes
- [ ] FR-BROKER-O-04 ACCEPTED — broker output validates against official `openai` Python SDK end-to-end

---

## Section E: Negative-Path Sanity

### E-1: Unknown user_id → 404

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://livinity-broker:8080/u/00000000-0000-0000-0000-000000000000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'
```
**Pass:** prints `404`.

### E-2: Empty messages → 400 OpenAI error shape

```bash
curl -s -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[]}' | jq .error
```
**Pass:** prints `{"message":"messages must be a non-empty array","type":"invalid_request_error","code":"invalid_messages"}` (OpenAI error shape, NOT Anthropic shape).

### E-3: Client tools provided → broker ignores + warn log + still 200

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://livinity-broker:8080/u/<USER_ID>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"x"}}],"tool_choice":"auto"}'

sudo journalctl -u livos --since "30 seconds ago" | grep "WARN client provided"
```
**Pass:**
- [ ] curl prints `200`
- [ ] journalctl shows warn line about ignored tools
- [ ] Response (re-run with `-s` only to inspect body) has NO `tool_calls` in choices (we didn't actually run any tools)

### E-4: Single-user mode + non-admin user_id → 403

(Only run if Mini PC is in single-user mode, otherwise skip.) Should return `403`.

---

## Section F: Notes & Deferred Items

- **Marketplace manifest auto-injection** (`requires_ai_provider: true` flag → env var injection) is **Phase 43 scope**. In Phase 42, marketplace containers must be started manually with `--add-host=livinity-broker:host-gateway` and `LLM_BASE_URL=http://livinity-broker:8080/u/<USER_ID>/v1` env var.
- **Per-user usage dashboard** is **Phase 44 scope**. Phase 42 logs requests via journalctl only; no UI surface yet.
- **Tool / function calling** is OUT of v29.3 scope. Client `tools`/`tool_choice`/`function_call` fields are IGNORED with warn log per D-42-12 (carry-forward of Phase 41 D-41-14). LivOS MCP tools available to SdkAgentRunner remain the only available tools.
- **Vision / multimodal** (gpt-4o image_url content blocks) is deferred per CONTEXT.md "Vision / multimodal pass-through deferred" — only text content is supported in v29.3.
- **Embeddings endpoint** (`/v1/embeddings`) is OUT of scope per CONTEXT.md.
- **LiteLLM sidecar** was rejected in favor of in-process TS translation per D-42-01.
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` remains byte-identical to Phase 40 baseline `623a65b9a50a89887d36f770dcd015b691793a7f` after Phase 42 (verified by all 4 implementation plans).
- **No nexus changes** in Phase 42 — all work is in `livos/packages/livinityd/source/modules/livinity-broker/`. The X-LivOS-User-Id header → `homeOverride` wiring established by Plan 41-04 carries forward unchanged.

---

*UAT created 2026-04-30 by Plan 42-05. Operator runs on Mini PC after `git push origin master` + `bash /opt/livos/update.sh`.*
