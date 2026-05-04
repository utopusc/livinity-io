# Phase 56 Plan 03 — Cross-Cuts Notes (raw audit data)

**Plan:** 56-03 (cross-cut audits)
**Date:** 2026-05-02
**Inputs consumed:** SPIKE-FINDINGS.md (Q1-Q7 verdicts from plans 56-01 + 56-02), notes-q1-passthrough.md, notes-q7-streaming.md, Phase 51 SUMMARY (D-51-03 deferral source), `nexus/packages/core/package.json`, `livos/packages/livinityd/package.json`.

This file holds raw audit data, raw command output, and the reasoning trace consumed by the corresponding `## Cross-Cuts` section of SPIKE-FINDINGS.md. SPIKE-FINDINGS.md carries the verdicts; this file carries the evidence.

---

## Task 1 — D-NO-NEW-DEPS Audit (raw evidence)

### Step A — Confirm all 7 verdict blocks present in SPIKE-FINDINGS.md

`grep -nE '^## Q[1-7]:' .planning/phases/56-research-spike/SPIKE-FINDINGS.md` would emit 7 hits. Confirmed by visual inspection: Q1 (line 12), Q2 (line 47), Q7 (line 86), Q3 (line 140), Q5 (line 211), Q4 (line 288), Q6 (line 365). Order is non-sequential because plan 56-01 emitted Q1+Q2+Q7 and plan 56-02 emitted Q3+Q5+Q4+Q6 in their authored order. All 7 present, no "TBD" remaining for the 7-question core.

### Step B — Per-verdict implied-package walk

For each verdict, the audit walked: which packages / runtime features does the verdict's integration point use?

#### Q1 (Anthropic Passthrough — Strategy A: HTTP-proxy direct to api.anthropic.com)

Implied packages / runtimes:
- **Node 22 builtin `fetch()`** (Q1 Verdict explicitly cites — "uses Node 22 builtin fetch()"). Runtime, not package. No npm dep.
- **`node:fs`** (read `~/.claude/<userId>/.credentials.json`). Builtin.
- **`node:path`** (path resolution for credentials.json). Builtin.
- **`node:fs/promises`** (async file read). Builtin.

Notably NOT implied:
- `@anthropic-ai/sdk` — Q1's chosen Strategy A explicitly REJECTS the SDK-direct strategy precisely because using it from the broker (livinityd) would require adding the package to livinityd's `package.json`. Strategy A uses raw `fetch()` instead. (Verdict cites this in Rationale #1: "Strategy B (SDK-direct) would force livinityd to add `@anthropic-ai/sdk` to its own `package.json`".)
- `@anthropic-ai/claude-agent-sdk` — Q1 passthrough mode bypasses the agent SDK entirely.

#### Q2 (External-Client tools[] — Forward Verbatim)

Implied packages / runtimes:
- Already-present `openai-router.ts` translator scaffold (existing code, not a new dep). Verdict cites: "reuses the existing `openai-router.ts` translator scaffold (already in place for messages/responses since v29.3 Phase 42)."
- For Anthropic route: zero — Q1 Strategy A's raw byte-forward already carries `tools[]` through.

No new packages.

#### Q3 (Agent-Mode Opt-In — both URL path AND header)

Implied packages / runtimes:
- **`express` `router.post()` + `req.header()` primitives.** Already present (`livos/packages/livinityd/package.json:90` `express: ^4.18.2`; `nexus/packages/core/package.json:43` `express: ^4.21.0`).

No new packages.

#### Q4 (Public Endpoint — Server5 Caddy + caddy-ratelimit plugin)

Implied packages / runtimes:
- **Caddy v2.11.2** (already-deployed at Server5 `/usr/bin/caddy`; not an npm package — system binary).
- **`caddy-ratelimit` Caddy plugin** (NEW — third-party Caddy module from `github.com/mholt/caddy-ratelimit`; NOT in stock Caddy binary; NOT an npm dep). Requires custom build.
- **`xcaddy` Go-toolchain build tool** (NEW one-time tooling — Go binary, not npm). Used to produce the custom Caddy binary with the plugin compiled in.
- **Let's Encrypt on-demand TLS** (already-running primitive at `platform/relay/Caddyfile`; built-in to Caddy; no new dep).

These are NOT npm packages and therefore NOT in the strict letter of "D-NO-NEW-DEPS" (which historically tracks the Node.js / TypeScript dep budget per `package.json`). However, they ARE real infrastructure deltas that Phase 60 must budget. Flag explicitly so they don't get smuggled in as zero-cost.

#### Q5 (API Key Rotation — Manual revoke + recreate; opt-in keys)

Implied packages / runtimes:
- **`pg`** (already present — `livos/packages/livinityd/package.json:114` `pg: ^8.20.0`). Used for `api_keys` table CRUD.
- **`node:crypto`** (builtin). Used for `randomBytes(24)` + `sha256` + `timingSafeEqual`.
- Existing tRPC infrastructure (already present).

No new packages.

#### Q6 (Rate-Limit Policy — edge-only via Q4; broker forwards verbatim; NO broker-side bucket in v30)

Implied packages / runtimes:
- **Node 22 builtin `fetch()`** (already part of Q1's Strategy A — the byte-forward already carries Anthropic's rate-limit headers).
- **Express `res.setHeader()`** (already present per Q3).
- **`ioredis`** — NOT used in v30 per Q6 verdict ("NO broker-side per-key bucket in v30"). Q6 explicitly notes that ioredis is already present (`ioredis@^5.4.0` at `livos/packages/livinityd/package.json:98` and `nexus/packages/core/package.json:46`) so a future v31+ broker-side bucket would also be zero-new-dep. For v30 itself: not relied on by Q6.

No new packages for v30.

#### Q7 (Agent-Mode Streaming — leave as-is; passthrough handles external)

Implied packages / runtimes:
- ZERO. Q7's verdict is "do nothing in agent mode" + "leverage Q1's passthrough for external" — no new code, no new package, no new file. Sacred file UNTOUCHED.

Notably NOT implied:
- The future v30.1+ "D-30-XX surgical edit" (if ever opened to enable agent-mode token streaming) would also be zero-new-dep — uses already-installed `@anthropic-ai/claude-agent-sdk@^0.2.84` option `includePartialMessages: true`. Listed only for completeness; out of v30 scope.

### Step C — Audit table

| Package / Runtime                            | Implied by Verdict   | Status                                                          | Cite (file:line, version)                                                                                       |
| -------------------------------------------- | -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Node 22 builtin `fetch`                      | Q1 (Strategy A), Q6  | already-present — runtime builtin                               | Node 22 LTS — runtime feature, not a package                                                                    |
| `node:fs` / `node:fs/promises` / `node:path` | Q1                   | already-present — Node builtins                                 | n/a (builtins)                                                                                                  |
| `node:crypto`                                | Q5                   | already-present — Node builtin                                  | n/a (builtin)                                                                                                   |
| `express`                                    | Q3, Q6               | already-present                                                 | `livos/packages/livinityd/package.json:90` `express: ^4.18.2`; `nexus/packages/core/package.json:43` `^4.21.0`  |
| `pg`                                         | Q5                   | already-present                                                 | `livos/packages/livinityd/package.json:114` `pg: ^8.20.0`                                                       |
| `ioredis`                                    | Q6 (deferred to v31) | already-present — NOT used in v30                               | `livos/packages/livinityd/package.json:98` `^5.4.0`; `nexus/packages/core/package.json:46` `^5.4.0`             |
| `@anthropic-ai/sdk`                          | Q1 (REJECTED) / Q2   | already-present — NOT relied on by broker passthrough           | `nexus/packages/core/package.json:34` `@anthropic-ai/sdk: ^0.80.0`                                              |
| `@anthropic-ai/claude-agent-sdk`             | Q7                   | already-present — agent mode uses; passthrough bypasses         | `nexus/packages/core/package.json:33` `@anthropic-ai/claude-agent-sdk: ^0.2.84`                                 |
| Caddy v2.11.2 system binary                  | Q4                   | already-present — Server5 `/usr/bin/caddy`                      | system binary; not npm                                                                                          |
| `caddy-ratelimit` Caddy plugin               | Q4                   | **NEW — non-npm Caddy module**; custom build via `xcaddy`       | `github.com/mholt/caddy-ratelimit` (third-party, not in stock Caddy binary); Phase 60 budget                    |
| `xcaddy` Go-toolchain build tool             | Q4                   | **NEW — non-npm Go binary**; one-time build tooling             | `github.com/caddyserver/xcaddy`; Phase 60 budget                                                                |
| OpenAI-router translator scaffold            | Q2, Q6 (OpenAI side) | already-present — code, not dep                                 | `livinity-broker/openai-router.ts` (existing since v29.3 Phase 42)                                              |

### Step D — Verdict color

The strict letter of D-NO-NEW-DEPS targets the Node.js / TypeScript dep budget per `package.json`. By that letter, **zero new npm packages are required by any Q1-Q7 primary path** — every implied package is already present in `livos/packages/livinityd/package.json` or `nexus/packages/core/package.json`. That is GREEN territory.

However, Q4's verdict introduces TWO non-npm dependencies — `caddy-ratelimit` plugin and `xcaddy` build tooling — that cost real Phase 60 budget (build pipeline, `apt-mark hold caddy`, README rebuild docs, validation step). These ARE new infrastructure deltas. Hiding them behind a "no new npm deps" GREEN would mislead Phase 57+ planning.

**Verdict: YELLOW.** Zero new npm deps — the historical D-NO-NEW-DEPS letter is preserved — but two new non-npm dependencies (Caddy plugin + xcaddy tooling) require Phase 60 budget. Phase 57+ planning is unblocked for the Node side; Phase 60 must explicitly budget the Caddy custom-build pipeline.

### Step E — Raw `package.json` grep evidence

```
$ grep -nE "@anthropic-ai/(sdk|claude-agent-sdk)|^  \"ioredis\"|^  \"express\"|^  \"pg\"" nexus/packages/core/package.json
33:    "@anthropic-ai/claude-agent-sdk": "^0.2.84",
34:    "@anthropic-ai/sdk": "^0.80.0",
43:    "express": "^4.21.0",
46:    "ioredis": "^5.4.0",

$ grep -nE "ioredis|\"pg\":|\"express\":" livos/packages/livinityd/package.json
34:		"@types/express": "^4.17.17",
90:		"express": "^4.18.2",
98:		"ioredis": "^5.4.0",
114:		"pg": "^8.20.0",
```

All "already-present" claims in the audit table are backed by these grep lines.

---

## Task 2 — Sacred File SHA Stability (raw command output)

### Pre-task SHA

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

### Modified-file check

```
$ git status -- nexus/packages/core/src/sdk-agent-runner.ts
On branch master
Your branch is ahead of 'origin/master' by 32 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean
```

(`nothing to commit, working tree clean` for the targeted file = NOT in modified, deleted, or staged state.)

### Diff stat

```
$ git diff --stat -- nexus/packages/core/src/sdk-agent-runner.ts
(empty output — zero lines changed in the working tree relative to HEAD)
```

### Comparison

| Field         | Value                                      |
| ------------- | ------------------------------------------ |
| Expected SHA  | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Observed SHA  | `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Match?        | YES — byte-identical                       |

**Verdict: PASS.** Sacred file untouched throughout phase 56-01 + 56-02. No edits, no stage, no diff. Sacred boundary preserved.

---

## Task 3 — D-51-03 Re-Evaluation (reasoning trace)

### D-51-03 origin (quoted from `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-01-SUMMARY.md`)

> "FR-A2-04 Deferral (Branch N reversal) — The user's complaint ('hala kim oldugunu bilmiyor hangi model oldugunu') is the model-identity regression originally tracked as FR-MODEL-02 in v29.4 Phase 47. Phase 47 took Branch N (verdict=neither, sacred file untouched) based on the `response.model` field showing the right ID. The user disagrees: the model COLLOQUIALLY says wrong identity. We DO NOT reverse Branch N in Phase 51. Reasons (D-51-03): … Identity remediation REQUIRES sacred file edit … D-40-01 ritual … without Mini PC SSH access … We choose NOT to reverse → conditional satisfied by deferral with rationale documented."

D-51-03 is therefore: **"Branch N reversal (sacred-file edit to inject identity assertion) is deferred from v29.5 pending future evaluation."** Phase 56 is that future evaluation.

### How Q1 affects D-51-03

Q1 chose Strategy A — raw HTTP-proxy `fetch()` to `api.anthropic.com` with byte-forward of upstream Anthropic SSE. This means: external clients (Bolt.diy / Open WebUI / Continue.dev / Cline — the CONTEXT in which the identity contamination was originally observed during v29.5 live testing) see the upstream Anthropic response VERBATIM. The broker never re-emits assistant content. The Nexus identity-line at `sdk-agent-runner.ts:264-270` is NEVER traversed in passthrough mode (the sacred file is not invoked). Identity contamination for external clients is structurally eliminated by Q1's architecture, NOT by editing the sacred file.

### How Q7 affects D-51-03

Q7 confirms agent mode keeps current behavior (sacred file untouched; identity-line still emitted in agent path; aggregation unchanged). Q7 explicitly states (verbatim from SPIKE-FINDINGS.md): "Q7's effect on D-51-03 is: Branch N reversal is NOT NEEDED in v30 — Phase 57 passthrough mode bypasses the sacred file for external clients (the use case where identity contamination was originally observed via Bolt.diy live testing). External-client identity preservation is delivered structurally by Q1's raw-byte HTTP-proxy forwarding (whatever the upstream model says reaches the client unmodified — no Nexus prepend possible because the broker never re-emits the message). Internal LivOS AI Chat (agent mode) keeps the current identity-line + aggregation behavior, which is acceptable per Phase 51's deploy-layer fix … D-51-03 stays DEFERRED past v30.0; routed to D-30-XX candidate row for v30.1+ if internal-chat user pain ever resurfaces post-v30."

### Combined logic

| Use case                        | Path in v30           | Identity-line applied?           | Identity contamination risk?                           |
| ------------------------------- | --------------------- | -------------------------------- | ------------------------------------------------------ |
| External client (Bolt.diy etc.) | Passthrough (default) | NO — sacred file bypassed        | None — upstream Anthropic response forwarded verbatim  |
| Internal LivOS AI Chat          | Agent (existing path) | YES — sacred file invoked        | Acceptable — internal scope, user is owner             |

The original D-51-03 problem (external client sees Nexus identity prepended via sacred-file path) is RESOLVED STRUCTURALLY by Q1+Q3 (passthrough is default; agent mode is opt-in via path/header per Q3) WITHOUT touching the sacred file. The remaining surface is internal LivOS AI Chat, where:
- The owner-user controls both sides of the chat.
- Phase 51's deploy-layer fix already addressed the visible streaming regression via `update.sh` `rm -rf dist`.
- No internal-chat identity complaints have re-surfaced since Phase 51 closed.

### Verdict criteria evaluation

Three options from RESEARCH.md framework:
- **(a) "Not needed in v30 — passthrough handles external; agent mode internal-only and identity-line acceptable there"** — fits cleanly with Q1+Q3+Q7 outcomes. Aligns with v30 sacred-file-untouched constraint (FR-BROKER-A1-04) AND with Phase 56 boundary (sacred edits out of scope regardless).
- **(b) "Still needed as v30.1 hot-patch"** — would require evidence of internal-chat identity pain that we don't have. No re-surfaced complaints since Phase 51. Premature.
- **(c) "Re-evaluate after Phase 63 live verification"** — partially defensible (Phase 63 IS the first live test with multiple external clients), BUT external-client identity is structurally addressed by Q1; internal-chat identity is the remaining surface and Phase 63 doesn't directly UAT internal AI Chat self-identification. So this option is more of a punt.

**Chosen: (a) Not needed in v30.** Plus a follow-on note: if Phase 63 UAT surfaces an internal-chat identity complaint, that triggers a v30.1+ phase opening D-30-XX — exactly the same routing Q7 already specifies. So (a) and (c) are reconciled: (a) is the active verdict, and the v30.1+ candidate row from Q7 IS the safety net.

### Decisions Log Entry (placeholder D-30-01; final number assigned during Plan 56-04 synthesis)

```
D-30-01: D-51-03 re-evaluation — Not needed in v30. Rationale: Q1 passthrough (default) bypasses sacred file for external clients structurally eliminating identity contamination there; Q7 confirms agent mode (internal LivOS AI Chat) keeps current identity-line, acceptable per Phase 51 deploy-layer fix. Sacred file edit deferred to v30.1+ D-30-XX candidate IF internal-chat identity pain ever re-surfaces post-v30. (Phase 56 spike outcome.)
```

### Post-task sacred SHA confirmation

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Match. Sacred file UNTOUCHED across all three Plan 56-03 tasks.

---

*End of `notes-cross-cuts.md` — feeds the `## Cross-Cuts` section of SPIKE-FINDINGS.md.*
