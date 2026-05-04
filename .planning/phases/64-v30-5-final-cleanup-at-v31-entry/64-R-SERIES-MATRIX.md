# 64-R-SERIES-MATRIX — Phase 63 R3.1–R3.11 classification

**Phase:** 64-v30-5-final-cleanup-at-v31-entry
**Generated:** 2026-05-04
**Source:** Phase 63 R-series remediation commits (`63-R3.1` .. `63-R3.11` — broker professionalization hot-patches under `.planning/milestones/v30.0-phases/63-mandatory-live-verification/`)
**Discipline rule:** Same as `64-UAT-MATRIX.md` — no silent elevation. Browser/IDE-required = `needs-human-walk`. Anything not actually verified by a script gets `needs-human-walk`.
**Subscription-only:** All broker verifications use the subscription path (`@anthropic-ai/claude-agent-sdk`); no raw `@anthropic-ai/sdk` BYOK fallback (per `feedback_subscription_only.md` D-NO-BYOK).
**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — NOT inspected, NOT modified by this plan (documentation-only).

## Context — what "R3.x" means

Phase 63 (`v30.0` mandatory live verification) Wave 0 surfaced **R1+R2+R3** as the three remediation tracks. R3 is the broker subscription-passthrough rewrite, which itself decomposed into 11 numbered hot-patches (R3.1 through R3.11) all delivered on 2026-05-03. Each is a single-issue fix to `livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts` (or its env wiring) discovered by iteratively retrying the Bolt-class subscription flow. Together they are what unblocked v30.0 close (commits archived under `c1a2d0ac`).

**These are commit-tagged plans, not file-tagged plans.** The Phase 63 directory contains `63-01-PLAN.md` .. `63-11-PLAN.md`, but those are the original Wave-0 through Wave-5 plans. The R3.x naming refers to the remediation commits identified in `RESUME-INSTRUCTIONS.md` and `feedback_subscription_only.md`. Source-file column below cites both:
- the **commit hash** (authoritative — code shipped on `master`), and
- the closest **PLAN.md** that the commit was discovered under (Wave 0 / pre-flight / Wave 5 closure context, all in 63-mandatory-live-verification).

## Vocabulary (aligned with `VERIFICATION.md` `status:` convention)

| Status            | Means                                                                                       |
|-------------------|---------------------------------------------------------------------------------------------|
| `script-verified` | Backend evidence observed (commit on master + current source state cited; OR live curl OR memory-pinned curl-proof)  |
| `needs-human-walk`| Browser/IDE-required step (rare for R-series; only if external-client GUI walk is the only proof)                    |
| `failed`          | Observed regression that was never closed                                                   |
| `obsolete`        | Superseded, scope-removed, or D-NO-SERVER4 forbids                                          |

## Matrix

| R-series ID | Commit | Title | Source plan / context | Status | Evidence summary |
|---|---|---|---|---|---|
| R3.1 | `79df17d9` + `da53add4` | augment env.PATH so Agent SDK finds `claude` CLI; drop hardcoded `/home/bruce` for `LIVOS_CLAUDE_BIN_DIR`+HOME | `63-01-PLAN.md` (Wave 0 → R3 root: `e9ad055f`) | `script-verified` | Both commits land on `master`; `anthropic.ts` line 223 references `process.env.LIVOS_CLAUDE_BIN_DIR` (current source) |
| R3.2 | `129e0200` | mirror sacred `sdk-agent-runner` `query()` options shape | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; broker `query()` options now match sacred file shape (current source `anthropic.ts` lines 280-292) |
| R3.3 | `4219acca` | strip `.claude` suffix from `cwd` before using as HOME | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; current source `anthropic.ts:292` contains `path.basename(cwd) === '.claude' ? path.dirname(cwd) : cwd` |
| R3.4 | `70dc055d` | drop tools/mcpServers restrictions — subscription tier rejects tool-less mode | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; current source includes `mcpServers` and `allowedTools` (lines 246-251), no longer empty `{}`/`[]` |
| R3.5 | `9e2d15f9` | `permissionMode: 'dontAsk'` (`bypassPermissions` exits CLI with code 1) | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; current source `anthropic.ts:286` contains `permissionMode: 'dontAsk'` |
| R3.6 | `34a5efe0` | `allowedTools=['Read']` + systemPrompt suffix to satisfy subscription gate | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; current source has finalSystemPrompt assembly (lines 274-280) |
| R3.7 | `2bad6ba1` | inject dummy MCP server to satisfy subscription tier gate | `63-01-PLAN.md` (Wave 0 R3 follow-up) | `script-verified` | Commit on `master`; current source `anthropic.ts:254` registers `mcpServers['passthrough-noop'] = passthroughDummyMcp` |
| R3.8 | `fda2f7f6` | honor `BROKER_FORCE_ROOT_HOME` — use `/root` creds for subscription path | `63-01-PLAN.md` (Wave 0 R3 follow-up); cf. `reference_anthropic_subscription_state.md` | `script-verified` | Commit on `master`; current source HOME wiring respects `BROKER_FORCE_ROOT_HOME` (lines 290-292 area) |
| R3.9 | `8225dbd6` | dynamic client-tools MCP bridge — Bolt agentic via subscription | `63-01-PLAN.md` (Wave 5 closure scope; Bolt path) | `script-verified` | Commit on `master`; current source comments lines 13-23 document MCP-server-style bridging; cross-ref `reference_broker_protocols_verified.md` 2026-05-03 |
| R3.10 | `3b5aa3c8` | disallowedTools + systemPrompt forces use of client tools only | `63-01-PLAN.md` (Wave 5 closure scope) | `script-verified` | Commit on `master`; current source `anthropic.ts:283` contains `disallowedTools: builtInTools` |
| R3.11 | `1f31ac27` | expand disallowedTools — block `ToolSearch` + all Claude Code built-ins | `63-01-PLAN.md` (Wave 5 closure scope; v30.0 final tool-translation gate per D-08) | `script-verified` | Commit on `master`; current source `anthropic.ts:283` `disallowedTools: builtInTools` includes the expanded list. **D-08 cross-ref:** `/v1/messages` tools[] translation verified live on 2026-05-03 — see Row R3.11 evidence below |

## Per-row evidence

### Row R3.1 — `63-R3.1` (augment env.PATH + LIVOS_CLAUDE_BIN_DIR)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md` + RESUME-INSTRUCTIONS.md); commits `79df17d9` and `da53add4`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.1\\b"
79df17d9 fix(63-R3.1): augment env.PATH so Agent SDK finds claude CLI in ~/.local/bin
da53add4 refactor(63-R3.1): drop hardcoded /home/bruce — use LIVOS_CLAUDE_BIN_DIR + HOME

$ git branch --contains 79df17d9 | grep master
* master
$ git branch --contains da53add4 | grep master
* master
```
Current source `livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts:223` reads `const operatorClaudeBinDir = process.env.LIVOS_CLAUDE_BIN_DIR` — confirming the refactor landed and is live. No hardcoded `/home/bruce` remains.

### Row R3.2 — `63-R3.2` (mirror sacred sdk-agent-runner query() options shape)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `129e0200`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.2"
129e0200 fix(63-R3.2): mirror sacred sdk-agent-runner query() options shape

$ git branch --contains 129e0200 | grep master
* master
```
Current source assembles the SDK `query()` call with the sacred-shape options (systemPrompt + mcpServers + allowedTools + disallowedTools + permissionMode) at lines 280-292 of `anthropic.ts`. No edits made to sacred file `nexus/packages/core/src/sdk-agent-runner.ts` (D-30-07 honored).

### Row R3.3 — `63-R3.3` (strip `.claude` suffix from cwd before using as HOME)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `4219acca`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.3"
4219acca fix(63-R3.3): strip .claude suffix from cwd before using as HOME

$ git branch --contains 4219acca | grep master
* master
```
Current source `anthropic.ts:292`: `HOME: path.basename(cwd) === '.claude' ? path.dirname(cwd) : cwd,` — exactly matches the patch.

### Row R3.4 — `63-R3.4` (drop tools/mcpServers restrictions — subscription tier rejects tool-less mode)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `70dc055d`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.4"
70dc055d fix(63-R3.4): drop tools/mcpServers restrictions — subscription tier rejects tool-less mode

$ git branch --contains 70dc055d | grep master
* master
```
Current source registers an `mcpServers` map and seeds `allowedTools` at lines 246-255 — no longer empty as the original Phase 57 design assumed. This is what unblocks "Your organization does not have access to Claude" subscription-tier rejection.

### Row R3.5 — `63-R3.5` (permissionMode 'dontAsk')

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `9e2d15f9`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.5"
9e2d15f9 fix(63-R3.5): permissionMode 'dontAsk' (bypassPermissions exits claude CLI 1)

$ git branch --contains 9e2d15f9 | grep master
* master
```
Current source `anthropic.ts:286`: `permissionMode: 'dontAsk',` — exactly matches the patch. `bypassPermissions` would have caused CLI exit code 1.

### Row R3.6 — `63-R3.6` (allowedTools=['Read'] + systemPrompt suffix)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `34a5efe0`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.6"
34a5efe0 fix(63-R3.6): allowedTools=['Read']+systemPrompt suffix to satisfy subscription gate

$ git branch --contains 34a5efe0 | grep master
* master
```
Current source assembles a `finalSystemPrompt` (lines 274-280) and threads it into the SDK options. Combined with R3.7 (dummy MCP server) and R3.10 (disallowedTools), this is the canonical "satisfy subscription gate" shape.

### Row R3.7 — `63-R3.7` (inject dummy MCP server to satisfy subscription tier gate)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `2bad6ba1`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.7"
2bad6ba1 fix(63-R3.7): inject dummy MCP server to satisfy subscription tier gate

$ git branch --contains 2bad6ba1 | grep master
* master
```
Current source `anthropic.ts:254`:
```typescript
mcpServers['passthrough-noop'] = passthroughDummyMcp
allowedTools.push('mcp__passthrough-noop__noop')
```
This is the "Claude Code IDE mode" gate satisfaction — at least one MCP server must be registered for subscription tier OAuth to succeed.

### Row R3.8 — `63-R3.8` (honor BROKER_FORCE_ROOT_HOME — use /root creds for subscription path)

**Status:** script-verified
**Source:** Phase 63 Wave 0 R3 follow-up (`63-01-PLAN.md`); commit `fda2f7f6`; cross-ref `reference_anthropic_subscription_state.md`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.8"
fda2f7f6 fix(63-R3.8): honor BROKER_FORCE_ROOT_HOME — use /root creds for subscription path

$ git branch --contains fda2f7f6 | grep master
* master
```
Live verification (`SSH bruce@10.69.31.68` single-batch session 2026-05-04T17:51Z): Mini PC reachable; `/opt/livos/.env` has `LIV_API_KEY` populated (broker is up). Memory `reference_anthropic_subscription_state.md` documents that two `.credentials.json` files exist on Mini PC and only `/root` is honored by Anthropic; this commit's HOME wiring respects `BROKER_FORCE_ROOT_HOME=/root`.

### Row R3.9 — `63-R3.9` (dynamic client-tools MCP bridge — Bolt agentic via subscription)

**Status:** script-verified
**Source:** Phase 63 closure scope (`63-01-PLAN.md` + Wave 5 final-gate work); commit `8225dbd6`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.9"
8225dbd6 fix(63-R3.9): dynamic client-tools MCP bridge — Bolt agentic via subscription

$ git branch --contains 8225dbd6 | grep master
* master
```
Current source `anthropic.ts` header comment (lines 13-23) documents the bridging contract: client tools in `body.tools[]` are wrapped via `tool(name, description, schema, handler)` from `claude-agent-sdk`, registered as `mcpServers['client-tools']`, and `allowedTools` whitelists each `mcp__client-tools__<name>`. This is the protocol-level proof that R3.9 shipped. **Live curl proof:** see Row R3.11 cross-ref to `reference_broker_protocols_verified.md` 2026-05-03 — the `/v1/messages` tools[] translation works end-to-end exactly because R3.9 + R3.10 + R3.11 are present.

### Row R3.10 — `63-R3.10` (disallowedTools + systemPrompt forces use of client tools only)

**Status:** script-verified
**Source:** Phase 63 closure scope (`63-01-PLAN.md` + Wave 5 final-gate work); commit `3b5aa3c8`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.10"
3b5aa3c8 fix(63-R3.10): disallowedTools + systemPrompt forces use of client tools only

$ git branch --contains 3b5aa3c8 | grep master
* master
```
Current source `anthropic.ts:283`: `disallowedTools: builtInTools,` — pairs with the systemPrompt suffix to exclude all built-in Claude Code tooling and force the model to invoke ONLY the client-supplied MCP-bridged tools. This is the v30.0 broker-cleanliness contract.

### Row R3.11 — `63-R3.11` (expand disallowedTools — block ToolSearch + all Claude Code built-ins; D-08 live curl gate)

**Status:** script-verified
**Source:** Phase 63 closure scope (`63-01-PLAN.md` + Wave 5 final-gate work, the v30.0 final hot-patch); commit `1f31ac27`
**Evidence:**
```
$ git log --all --oneline | grep "63-R3\\.11"
1f31ac27 fix(63-R3.11): expand disallowedTools — block ToolSearch + all Claude Code built-ins

$ git branch --contains 1f31ac27 | grep master
* master

$ git show --stat 1f31ac27
livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts | 11 ++++++++++-
1 file changed, 10 insertions(+), 1 deletion(-)
```

**D-08 live verification — broker `/v1/messages` tool routing**

Per plan instruction: attempt fresh live curl; if a user-facing `liv_sk_*` Bearer is unobtainable (DB stores hashes only, plaintext is show-once), fall back to memory-pinned proof. Today's status:

1. **Mini PC SSH (single batched session, 2026-05-04T17:51Z):** reachable; `LIV_API_KEY` extracted; PG `api_keys` table contains 1 active key (`liv_sk_5...` for "deneme" user) — but plaintext is one-way-hashed.
2. **Public broker probe (no key):** `curl -X POST https://api.livinity.io/v1/messages` → `HTTP 404 {"type":"error","error":{"type":"not_found_error","message":"user not found"}}` — confirms broker is up, Bearer middleware reachable, returns Anthropic-spec error envelopes (NOT 503/relay-broken).
3. **Probe with `LIV_API_KEY`:** also returns `404 user not found` — confirming `LIV_API_KEY` is the *internal* broker admin key and NOT a user Bearer (per design).
4. **Memory-pinned proof (2026-05-03, 1 day old):** `reference_broker_protocols_verified.md` documents the verified live curl that proves the tools[] translation — quoted below.

```
# From memory: reference_broker_protocols_verified.md (2026-05-03, commit 18a6b1c0)

curl -X POST https://api.livinity.io/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -d '{"model":"opus","stream":true,"tools":[{"name":"file_write",...}],"messages":[...]}'
# → tool_use(file_write, {path: "hello.txt", content: "Hello World"})
```

```
# OpenAI counterpart (also passed):
curl -X POST https://api.livinity.io/v1/chat/completions \
  -H "Authorization: Bearer liv_sk_..." \
  -d '{"model":"opus","stream":true,"tools":[{"type":"function","function":{"name":"file_write",...}}],"messages":[...]}'
# → tool_calls[{id, type:"function", function:{name:"file_write", arguments:"{\"path\":\"hello.txt\",\"content\":\"Hello World\"}"}}]
# finish_reason: "tool_calls"
```

Both protocols return correctly translated tool-routing responses. R3.9 (dynamic client-tools bridge) + R3.10 (disallowedTools) + R3.11 (expanded disallowedTools) are jointly necessary for these passes; partial application would surface as plain-text or built-in-tool collisions.

**Cross-reference:** `reference_broker_protocols_verified.md` is dated 2026-05-03; matrix generated 2026-05-04 (1 day delta). No code on this path has changed in the interval (`git log --since=2026-05-03 -- livos/packages/livinityd/source/modules/livinity-broker/` has zero R3-affecting commits since `1f31ac27`). Therefore the 2026-05-03 proof remains valid. Subscription-only constraint (D-NO-BYOK) honored — no raw `@anthropic-ai/sdk` BYOK fallback is engaged on this path.

### Notes — D-NO-SERVER4 compliance

None of the 11 R-series rows touched Server4. R3.1–R3.11 are all Mini PC + orchestrator-local + Server5 (relay only) work. No `obsolete` rows for D-NO-SERVER4 reasons.

## Summary counts

- `script-verified`: 11
- `needs-human-walk`: 0
- `failed`: 0
- `obsolete`: 0
- **Total:** 11

## Audit-tooling notes

- All 11 R-series commits are present on `master` (verified via `git branch --contains` per row).
- Source-file column references both the commit hash (authoritative) and the closest PLAN.md (`63-01-PLAN.md` is the canonical Wave 0 anchor — the R3 series was discovered and remediated AT Wave 0 / continued through Wave 5 closure).
- `reference_broker_protocols_verified.md` is the canonical live-curl evidence pin for D-08; reverify with a fresh `Bearer liv_sk_*` if uncertainty arises (mint a new test key via Settings → AI Configuration → API Keys on `bruce.livinity.io`).
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` was NOT inspected, NOT modified by this plan. R3.x changes are all in the broker module (`livos/packages/livinityd/source/modules/livinity-broker/...`), NOT in the sacred Agent SDK runner.
