# Phase 63: Mandatory Live Verification (D-LIVE-VERIFICATION-GATE) - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); FINAL phase — gate-required for milestone close

<domain>
## Phase Boundary

Phase 63 is the **mandatory live verification** phase. This is the FIRST milestone close where `D-LIVE-VERIFICATION-GATE` (introduced v29.5 Phase 54) must pass cleanly **without `--accept-debt`** per FR-VERIFY-V30-08.

Phase 63 hard-depends on Phases 57-62 being EXECUTED (not just planned) — the verification work walks live behavior on real Mini PC + Server5 hardware.

**Verification surfaces (8 success criteria):**

1. **Deploy verification (FR-VERIFY-V30-01)** — `bash /opt/livos/update.sh` ships v30 source to Mini PC. Past Deploys panel shows success row. All 4 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) report `active`.
2. **Bolt.diy live test (FR-VERIFY-V30-02)** — Marketplace install + chat session. Token streaming visible (≥3 visible delta updates). Model self-identifies as Bolt (NOT Nexus). `broker_usage` row written with non-zero tokens.
3. **Open WebUI live test (FR-VERIFY-V30-03)** — External client at `api.livinity.io` with `liv_sk_*` Bearer. Streaming visible. Open WebUI's system prompt honored. `broker_usage` row attributable to the key.
4. **Continue.dev live test (FR-VERIFY-V30-04)** — `api.livinity.io` + `liv_sk_*`. Code completion within 5s timeout. Tool-use protocol honored if invoked.
5. **Raw protocol smoke tests (FR-VERIFY-V30-05+06)** — `curl` from outside Mini PC LAN with valid Bearer; Python `Anthropic(base_url=...)` SDK call. Both return spec-compliant streaming Anthropic-shape responses.
6. **14 carry-forward UATs walked (FR-VERIFY-V30-07)** — 4 v29.5 (49/50/51/52/53/54) + 4 v29.4 (45-48) + 6 v29.3 (39-44). Results recorded in `63-UAT-RESULTS.md` with one row per step (PASS/FAIL/BLOCKED + evidence). **Zero BLOCKED rows allowed** for milestone close.
7. **Milestone gate clean-close (FR-VERIFY-V30-08)** — `/gsd-complete-milestone v30.0` returns audit `passed` on FIRST invocation. NO `--accept-debt` invocation. NO new override row in MILESTONES.md "Live-Verification Gate Overrides" section.

What's IN scope for Phase 63:
- Mini PC deploy execution (via `update.sh`).
- Server5 Caddy reload (post-Phase 60 Caddyfile change deployed).
- DNS verification (`api.livinity.io` resolves + responds).
- TLS verification (Let's Encrypt cert valid).
- 3 external client live tests (Bolt.diy, Open WebUI, Continue.dev) with screenshots/recordings.
- 2 raw protocol smoke tests (curl + Python SDK).
- 14 UAT walks with results document.
- Bug-find loop — if FAIL surfaces, blocker handler kicks in; fix path identified; phase pauses pending hot-patch.
- Final `/gsd-complete-milestone v30.0` gate clean-close.

What's OUT of scope:
- Sacred file edits — D-51-03 still deferred. If Phase 63 surfaces issues attributable to sacred file aggregation, they become v30.1 hot-patch (NOT in v30.0 close).
- Multi-region testing (single Mini PC + Server5 only).
- Performance benchmarking (correctness only — perf is v30+).
- New feature additions (closure phase).
- CSV/JSON UAT export (UAT results in markdown only).

</domain>

<decisions>
## Implementation Decisions

### Phase 63 Is Execution-Only (No Code Changes)

Phase 63 doesn't write production code. It deploys + tests. PLAN.md tasks are:
- Mini PC SSH deploy commands (single-batched per fail2ban discipline).
- Server5 SSH commands (Caddy validate + reload).
- Browser-based UAT walks (with screenshot capture).
- Curl + Python smoke tests.
- Results document writes.
- Final milestone close invocation.

Tasks are NOT autonomous. Every task requires human-in-the-loop interaction (human watches Bolt.diy chat, human runs curl from external host, human records evidence). PLAN.md `autonomous: false` per task.

### Pre-Flight Gate

Phase 63 cannot start until:
- Phases 56-62 are EXECUTED (all `*-SUMMARY.md` files exist + verification status `passed`).
- Mini PC reachable (no fail2ban ban).
- Server5 reachable.
- DNS for `api.livinity.io` propagated.
- Phase 60 Caddyfile + relay extension deployed.
- Phase 61 alias seed complete in Redis.

Plan Wave 0 = pre-flight checks. If ANY check fails, Phase 63 BLOCKS immediately with explicit "fix X first" message. Do NOT attempt UAT walks against incomplete deployment.

### Mini PC Deploy Sequence

```bash
ssh -i $MINIPC_KEY bruce@10.69.31.68 "sudo bash /opt/livos/update.sh 2>&1 | tail -100"
```

Single SSH invocation. Output piped to local file for evidence (`63-deploy-output.log`).

Verify post-deploy:
```bash
ssh -i $MINIPC_KEY bruce@10.69.31.68 "
  systemctl is-active livos liv-core liv-worker liv-memory
  ls -la /opt/livos/data/update-history/ | tail -5
  cat /opt/livos/data/update-history/<latest>.json
"
```

Single combined SSH call (fail2ban discipline). 4 services × `active` expected. Latest update-history JSON has `status: success` + v30 SHA.

### Server5 Caddy Verification

```bash
ssh -i $CONTABO_KEY root@45.137.194.102 "
  caddy validate /etc/caddy/Caddyfile && echo VALIDATED
  systemctl is-active caddy
  caddy list-modules | grep -E 'rate_limit|cloudflare'
  curl -sI https://api.livinity.io/v1/messages | head -1
  openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 | grep -E 'Verify return code|subject='
"
```

Single combined SSH. Caddy active + module list + endpoint reachable + TLS valid.

### Bolt.diy Live Test Protocol

Human steps (NOT automated):
1. Open LivOS UI → Marketplace → install Bolt.diy → wait for "Open" button.
2. Open Bolt.diy → chat input → send: "Hi, who are you?"
3. Observe: response self-identifies as Bolt (NOT Nexus). Visible token streaming (≥3 delta updates).
4. Send another prompt: "Build me a simple Hello World in Python." → response completes within reasonable time.
5. Capture screenshot of chat session for evidence.
6. SSH Mini PC: `psql ... "SELECT * FROM broker_usage ORDER BY created_at DESC LIMIT 5"` → fresh rows visible with non-zero tokens + `api_key_id` populated (Phase 62).

Result row in `63-UAT-RESULTS.md`:
| step | description | result | evidence | timestamp |
|------|-------------|--------|----------|-----------|
| FR-VERIFY-V30-02 | Bolt.diy live test | PASS | bolt-screenshot.png + psql-output.txt | 2026-05-02T... |

### Open WebUI Live Test Protocol

Human steps:
1. Local Open WebUI install (Docker) on test machine NOT on Mini PC LAN.
2. Configure provider: base URL `https://api.livinity.io`, API key = freshly-minted `liv_sk_*` from Settings > AI Configuration > API Keys (Phase 62 UI).
3. Send chat: "What's the capital of France?"
4. Observe: streaming visible. Open WebUI shows token counts (Phase 58 emits final usage chunk).
5. Verify Open WebUI's system prompt is honored — set system prompt to "Always reply in French" → ask English question → response in French.
6. SSH Mini PC: `psql ... "SELECT * FROM broker_usage WHERE api_key_id = '<key-id>' ORDER BY created_at DESC LIMIT 1"` → row exists.

### Continue.dev Live Test Protocol

Human steps:
1. Configure Continue.dev with `base_url: https://api.livinity.io`, `api_key: liv_sk_*`.
2. In editor, request code completion → response within Continue's 5s timeout.
3. If Continue invokes a tool (e.g., file_read), upstream model honors the protocol — no Nexus tool injection visible.

### Raw curl + Python SDK Protocol

```bash
# From a host NOT on Mini PC LAN (e.g., orchestrator's local machine + cellular hotspot, or Server5 itself, or external VPS)
curl -N -H "Authorization: Bearer liv_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"model":"opus","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}' \
  https://api.livinity.io/v1/messages
```

Expected: streaming Anthropic SSE events visible (`event: message_start`, `event: content_block_delta`, ...).

```python
from anthropic import Anthropic
client = Anthropic(api_key="liv_sk_...", base_url="https://api.livinity.io")
response = client.messages.create(
  model="opus",
  max_tokens=100,
  messages=[{"role": "user", "content": "Hi"}]
)
print(response.content)
```

Expected: complete response object with `content`, `usage`, `stop_reason`.

### 14 Carry-Forward UAT Walks

UAT files exist in milestone archives (need to find them):
- v29.5: `.planning/milestones/v29.5-phases/{49-54}-*/` look for `*-UAT.md` (or `49-VERIFICATION.md`-derived steps)
- v29.4: `.planning/milestones/v29.4-phases/{45-48}-*/` look for `*-UAT.md`
- v29.3: `.planning/milestones/v29.3-phases/{39-44}-*/` look for `*-UAT.md`

Each UAT file has a numbered step list. Phase 63 walks each step + records PASS/FAIL/BLOCKED + evidence.

Output: `.planning/phases/63-mandatory-live-verification/63-UAT-RESULTS.md` with table:
| phase | uat_id | step_id | description | result | evidence | timestamp |

Zero BLOCKED rows allowed. FAIL rows trigger blocker handler with hot-patch loop.

### Failure Handling

If ANY UAT step FAILs:
1. PAUSE Phase 63.
2. Identify root cause (likely Phase 57-62 implementation gap).
3. Open hot-patch plan in offending phase (e.g., `57-06-PLAN.md` if Phase 57 issue).
4. Execute hot-patch.
5. Re-deploy via `update.sh`.
6. RE-RUN failed UAT step.
7. Continue Phase 63 once green.

Worst case: hot-patch surfaces deeper architectural issue → milestone CLOSE blocked → file v30.1 carry-forward decision.

If a hot-patch lands in this loop, the resulting commit must reference the FAILing UAT (e.g., `fix(57): identity injection still leaking — closes UAT-FR-VERIFY-V30-02-step3`).

### Sacred File Final Gate

End of Phase 63:
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` outputs `4f868d318abff71f8c8bfbcf443b2393a553018b`.
- `npx vitest run sdk-agent-runner-integrity.test.ts` passes with `BASELINE_SHA = "4f868d31..."`.
- `git diff 4f868d31...HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` is empty.

If sacred file SHA drifted somewhere in Phases 57-62 execution: BLOCKED — investigate before milestone close (likely an executor agent violated the contract; revert and re-execute).

### Milestone Close Gate

Final task:
```bash
/gsd-complete-milestone v30.0
```

Expected: returns audit `passed` (NOT `human_needed`). NO `--accept-debt` invocation. The forensic-trail table in `MILESTONES.md` "Live-Verification Gate Overrides" gains NO new row for v30.0.

If gate returns `human_needed`: Phase 63 didn't actually complete the verification work — find the offending phase's `*-VERIFICATION.md` with `status: human_needed` and walk those UATs.

### Claude's Discretion

- Exact ordering of the 8 success criteria walks (recommend: 1-deploy → 5-curl/SDK → 2-Bolt.diy → 3-OpenWebUI → 4-Continue.dev → 6-UATs → 7-close).
- Number of times to retry a flaky UAT before declaring FAIL (recommend: 2 retries).
- Screenshot vs video evidence (screenshot for static states, video for streaming behavior).
- Hot-patch commit message convention (recommend: `fix(<phase>): <issue> — closes UAT-<req>-step<N>`).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `update.sh` (v29.5 Phase 51 hardened) — Mini PC deploy script. Run via SSH single-batched.
- `Past Deploys` panel (v29.0 Phase 33) — UI surface for deploy history. Phase 63 verifies a row appears.
- `psql` access on Mini PC — `broker_usage` table (Phase 44 + Phase 62 enhanced).
- `apiKeys.list` tRPC + Settings UI (Phase 59 + 62) — used to mint `liv_sk_*` for Open WebUI / Continue.dev tests.
- v29.5 Phase 54 `--accept-debt` forensic trail in `MILESTONES.md` — Phase 63's gate clean-close means NO new row added.

### Established Patterns
- Single-batched SSH per fail2ban discipline (project memory).
- UAT walk format from v29.4-REGRESSIONS.md (verdict block per regression).
- Past Deploys + update-history JSON format (v29.0 Phase 33).
- D-LIVE-VERIFICATION-GATE invocation pattern (v29.5 Phase 54).

### Integration Points
- Mini PC `/opt/livos/data/update-history/` — verifies deploy success.
- Mini PC `psql livos` — verifies usage rows.
- Server5 `/etc/caddy/Caddyfile` — verifies validate + reload.
- DNS `api.livinity.io` — verifies A record.
- TLS — verifies Let's Encrypt issuance.
- LivOS Settings > AI Configuration > API Keys — Bearer key creation.

</code_context>

<specifics>
## Specific Ideas

- **Bolt.diy "Who are you?" identity test (canonical):** Bolt.diy chat reveals broker identity contamination. If response says "Nexus" → passthrough mode failed (Phase 57 incomplete). If says "Bolt" → passthrough working.
- **Open WebUI usage-display test:** OWUI shows token counts. If counts are 0 → Phase 58 OpenAI streaming usage chunk emission broken. If non-zero → Phase 58 + 62 working.
- **Continue.dev tool-use test:** Continue invokes `read_file` or similar. If response shows Nexus `shell` tool injection → Phase 57 tool-forwarding broken. If only Continue's tools used → working.
- **Raw curl from coffee-shop wifi:** Tests public endpoint reachability + TLS validity + Bearer auth + streaming. The most representative external-client smoke test.
- **Python SDK call from clean venv:** Tests Anthropic SDK compatibility with `base_url` override + Bearer + Anthropic-spec response shape.
- **UAT walk evidence:** Every UAT step gets screenshot OR shell output snippet pasted into `63-UAT-RESULTS.md`.

</specifics>

<deferred>
## Deferred Ideas

- **Performance benchmarking** (latency, throughput, cost-per-token) — defer to v30+.
- **Multi-region testing** — single relay only in v30.
- **Concurrent user load test** — defer.
- **Cost calculation in dashboard** — defer to monetization.
- **Continue.dev IntelliSense / autocomplete deeper validation** — basic timeout test is enough for v30.
- **Bolt.diy multi-agent / preview features** — basic chat is enough for v30 verification.
- **Open WebUI plugin / advanced features** — basic chat + system-prompt-honor is enough.

</deferred>
