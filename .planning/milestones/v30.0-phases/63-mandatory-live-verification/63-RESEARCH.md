# Phase 63: Mandatory Live Verification (D-LIVE-VERIFICATION-GATE) - Research

**Researched:** 2026-05-02
**Domain:** Execution-only verification phase (no production code)
**Confidence:** HIGH (codebase + planning archives are authoritative)

## Summary

Phase 63 is the FIRST milestone close where `D-LIVE-VERIFICATION-GATE` (v29.5 Phase 54) must pass cleanly without `--accept-debt`. The phase is execution-only — no source code changes — but is operationally dense: 1 deploy + 2 raw protocol smokes + 3 external client live tests + 14 archived UAT walks + sacred SHA gate + milestone close, gated by `human_needed` status precedence.

**Primary recommendation:** Plan 6 waves. Wave 0 = pre-flight (Phases 56-62 executed + Mini PC reachable + Server5 reachable + DNS propagated). Wave 1 = Mini PC deploy via single-batched SSH. Wave 2 = raw protocol smokes (DNS / TLS / curl / Python SDK). Wave 3 = 3 external client live tests with screenshot evidence. Wave 4 = 14 archived UAT walks → `63-UAT-RESULTS.md`. Wave 5 = sacred SHA gate + `/gsd-complete-milestone v30.0`. Every task is `autonomous: false` (human-in-the-loop).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Phase 63 is execution-only — no source code changes.** PLAN.md tasks: SSH deploy, browser UAT walks, curl/Python smoke, results document writes, milestone-close invocation. `autonomous: false` per task.
- **Pre-flight gate:** Phases 56-62 must be EXECUTED (`*-SUMMARY.md` exists + `*-VERIFICATION.md` status `passed`). Mini PC reachable (no fail2ban ban). Server5 reachable. DNS propagated. Phase 60 Caddyfile + relay extension deployed. Phase 61 alias seed in Redis verified. Wave 0 fails-fast if any check fails.
- **Mini PC deploy sequence:** ONE SSH invocation: `ssh ... bruce@10.69.31.68 "sudo bash /opt/livos/update.sh 2>&1 | tail -100"`. Output piped to `63-deploy-output.log`. Post-deploy verify: ONE combined SSH for `systemctl is-active livos liv-core liv-worker liv-memory` + latest `update-history/*.json`.
- **Server5 Caddy verify:** ONE combined SSH: `caddy validate` + `systemctl is-active caddy` + `caddy list-modules | grep -E 'rate_limit|cloudflare'` + `curl -sI https://api.livinity.io/v1/messages` + `openssl s_client -connect api.livinity.io:443`.
- **Bolt.diy "Who are you?"** is the canonical identity test. Response must self-identify as Bolt, NOT Nexus. ≥3 visible delta updates required.
- **External client tests** (Bolt.diy / Open WebUI / Continue.dev) all require `liv_sk_*` Bearer key minted via Settings > AI Configuration > API Keys (Phase 62 UI).
- **14 carry-forward UATs walked** with results in `63-UAT-RESULTS.md`. ZERO BLOCKED rows for milestone close. FAIL triggers blocker handler + hot-patch loop.
- **Failure handling:** if any UAT FAILs → PAUSE → identify root-cause phase → open hot-patch plan in offending phase → execute → re-deploy → re-run failed step. Hot-patch commit message MUST reference failing UAT (`fix(57): ... — closes UAT-FR-VERIFY-V30-02-step3`).
- **Sacred file final gate:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` MUST equal `4f868d318abff71f8c8bfbcf443b2393a553018b`. Drift → BLOCKED → revert before milestone close.
- **Milestone close:** `/gsd-complete-milestone v30.0` returns audit `passed` on FIRST invocation. NO `--accept-debt`. NO new row in MILESTONES.md "Live-Verification Gate Overrides" section for v30.0.
- **Single-batched SSH discipline** — Mini PC fail2ban auto-bans rapid SSH probes. Every multi-command Mini PC interaction is ONE invocation.

### Claude's Discretion
- Ordering of 8 success criteria walks (recommend: 1-deploy → 5-curl/SDK → 2-Bolt.diy → 3-OpenWebUI → 4-Continue.dev → 6-UATs → 7-close).
- Retry count for flaky UAT step before declaring FAIL (recommend: 2 retries).
- Screenshot vs video evidence (screenshot for static state; short screen recording for streaming behavior).
- Hot-patch commit message convention (recommend: `fix(<phase>): <issue> — closes UAT-<req>-step<N>`).

### Deferred Ideas (OUT OF SCOPE)
- Performance benchmarking (latency / throughput / cost-per-token) — defer to v30+.
- Multi-region testing (single relay only).
- Concurrent user load test.
- Cost calculation in dashboard — defer to monetization.
- Continue.dev IntelliSense / autocomplete deeper validation — basic timeout test enough.
- Bolt.diy multi-agent / preview features — basic chat enough.
- Open WebUI plugin / advanced features — basic chat + system-prompt-honor enough.
- Sacred file edits — if Phase 63 surfaces sacred-attributable issues, they become v30.1 hot-patch (NOT v30.0 close).
- CSV/JSON UAT export — markdown-only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-VERIFY-V30-01 | Mini PC deployed via `update.sh`; Past Deploys panel shows success row; 4 services active | `update.sh` confirmed hardened (line 446-457, `rm -rf dist` + verify_build); Past Deploys panel = `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (uses `trpcReact.system.listUpdateHistory`); update-history JSON dir = `/opt/livos/data/update-history/` (line 51 of update.sh) |
| FR-VERIFY-V30-02 | Bolt.diy live test: install + chat + ≥3 deltas + identifies as Bolt + `broker_usage` row | Bolt.diy registered in `livos/packages/livinityd/source/modules/apps/builtin-apps.ts:1242` with `id:'bolt-diy'`, image `ghcr.io/stackblitz-labs/bolt.diy:latest`, subdomain `bolt`. Marketplace install: LivOS UI → Marketplace → Bolt.diy → Install → docker-compose up per-user. |
| FR-VERIFY-V30-03 | Open WebUI live test via `api.livinity.io` + `liv_sk_*` | Phase 60 deploys api.livinity.io (Server5 Caddy block). Phase 62 UI mints `liv_sk_*`. Open WebUI configured: Settings > Connections > OpenAI → base URL + key. |
| FR-VERIFY-V30-04 | Continue.dev live test via `api.livinity.io` + `liv_sk_*` | VS Code extension `continue.continue`; config at `~/.continue/config.json`; uses Anthropic API shape — `liv_sk_*` over `api.livinity.io/v1/messages`. |
| FR-VERIFY-V30-05 | Raw curl smoke from outside Mini PC LAN | Recommend Server5 as external client — already SSH-accessible, already external to Mini PC. |
| FR-VERIFY-V30-06 | Anthropic Python SDK smoke (`Anthropic(base_url=..., api_key=...)`) | `pip install anthropic` from clean venv on orchestrator local machine. Mirrors v29.3 Phase 42 UAT pattern. |
| FR-VERIFY-V30-07 | 14 carry-forward UATs walked → `63-UAT-RESULTS.md` | Inventory below. ZERO BLOCKED rows allowed. |
| FR-VERIFY-V30-08 | `/gsd-complete-milestone v30.0` audit `passed` first invocation | Phase 54 mechanism scans `*-VERIFICATION.md`. All Phase 56-62 must have status `passed` (not `human_needed`). |
</phase_requirements>

## 14-File UAT Inventory (CRITICAL — planner sizes Wave 4 from this)

| # | Phase | Path (relative to repo root) | Type | Steps / Sections | Header status |
|---|-------|------------------------------|------|------------------|---------------|
| 1 | v29.5 / 49 | `.planning/milestones/v29.5-phases/49-mini-pc-diagnostic/49-VERIFICATION.md` | VERIFICATION | 5 must-haves (3 PASSED / 1 PARTIAL / 1 BLOCKED) + 4 requirement rows + 3 human-verify items | `human_needed` |
| 2 | v29.5 / 50 | `.planning/milestones/v29.5-phases/50-a1-tool-registry-seed/50-VERIFICATION.md` | VERIFICATION | 4 must-haves (mechanism PASSED, FR-A1-03/04 deferred to live) | `passed` (mechanism) — live deferred |
| 3 | v29.5 / 51 | `.planning/milestones/v29.5-phases/51-a2-streaming-fix/51-VERIFICATION.md` | VERIFICATION | 5 must-haves + 5 enumerated human verify steps (lines 47-51): deploy timing / dist mtime / token streaming / streaming-failure escalation / "Hangi modelsin?" | `human_needed` |
| 4 | v29.5 / 52 | `.planning/milestones/v29.5-phases/52-a3-marketplace-state/52-VERIFICATION.md` | VERIFICATION | 6 must-haves (4 PASSED / 1 PARTIAL / 1 DEFERRED — browser visit confirms apps post-deploy) | `passed` (mechanism) |
| 5 | v29.5 / 53 | `.planning/milestones/v29.5-phases/53-a4-security-panel-render/53-VERIFICATION.md` | VERIFICATION | 6 must-haves (5 PASSED via Phase 51 / 1 DEFERRED — sidebar 13-entry visual) | `passed` (mechanism) |
| 6 | v29.5 / 54 | `.planning/milestones/v29.5-phases/54-b1-live-verification-gate/54-VERIFICATION.md` | VERIFICATION | 5 must-haves (all PASSED) + optional retro `/gsd-audit-milestone v29.4` validation | `passed` |
| 7 | v29.4 / 45 | `.planning/milestones/v29.4-phases/45-carry-forward-sweep/45-VERIFICATION.md` | VERIFICATION | 8 sections + **2 explicit human-verify steps**: (1) OpenAI streaming usage non-zero round-trip (FR-CF-04) — run Phase 42 verbatim openai SDK smoke + assert `total_tokens > 0` AND `broker_usage` row; (2) WS reconnect survival — `systemctl restart livos` + within 2s trigger `usage.getMine` poll + `ai.claudePerUserStartLogin` | unknown (live deferred) |
| 8 | v29.4 / 46 | `.planning/milestones/v29.4-phases/46-fail2ban-admin-panel/46-UAT.md` | UAT | **9 sections** (Pre-flight + 8 numbered + closing checklist): Sidebar+jail / 3 service-state banners / Unban+whitelist / Manual ban+self-ban gate / Audit log immutability / Mobile cellular toggle / Settings backout toggle / httpOnlyPaths restart / End-to-end SSH lockout recovery | UAT |
| 9 | v29.4 / 47 | `.planning/milestones/v29.4-phases/47-ai-diagnostics/47-UAT.md` | UAT | **9 success criteria**: SC-1 Diagnostics 3 cards / SC-2 Capability Registry 5-cat / SC-3 Re-sync atomic-swap / SC-4 Model Identity 6-step / SC-5 Verdict-driven remediation / SC-6 Post-fix re-diagnostic / SC-7 apps.healthProbe shape / SC-8 healthProbe scoped to currentUser / SC-9 Branch B audit append-only | UAT |
| 10 | v29.4 / 48 | `.planning/milestones/v29.4-phases/48-live-ssh-session-viewer/48-UAT.md` | UAT | **9 numbered steps** (Prep + Steps 1-9): UI loads / Trigger SSH attempt / Click-to-copy / Click-to-ban / Scroll-tolerance + Resume tail / RBAC gate / Backout / Sacred file integrity / `test:phase48` master gate | UAT |
| 11 | v29.3 / 39 | `.planning/milestones/v29.3-phases/39-risk-fix-close-oauth-fallback/39-03-tests-and-verification.md` | tests-and-verification (no UAT.md) | 693 lines covering 39's tests + verification surface + STRIDE register; for Phase 63 walk: focus on the **integration-test exit-code gates** + Trust Boundaries + STRIDE Threat Register (lines 646, 654). Treat as ~6-8 verification beats. | tests-and-verification |
| 12 | v29.3 / 40 | `.planning/milestones/v29.3-phases/40-per-user-claude-oauth-home-isolation/40-UAT.md` | UAT | **4 ROADMAP success criteria** (User A login independence / Cross-user file read isolation / HOME=`/opt/livos/data/users/A/.claude` / Settings UI per-user accuracy) + Single-User mode regression + Pre-flight | UAT |
| 13 | v29.3 / 41 | `.planning/milestones/v29.3-phases/41-anthropic-messages-broker/41-UAT.md` | UAT | **9 lettered sections** A-I: Sync POST / SSE streaming / Per-user HOME admin / Cross-user isolation / Container-network reach / IP guard rejects external / AI Chat carry-forward / Single-user regression / Sacred file integrity | UAT |
| 14 | v29.3 / 42 | `.planning/milestones/v29.3-phases/42-openai-compatible-broker/42-UAT.md` | UAT | **5 sections + 13 numbered subtests**: A Prereqs / B Sync curl (B-1/2/3) / C Streaming curl / D Python SDK (D-1/2/3) / E Negative-path (E-1/2/3/4) / F Notes | UAT |
| 15 | v29.3 / 43 | `.planning/milestones/v29.3-phases/43-marketplace-integration-anchor-mirofish/43-UAT.md` | UAT | **9 lettered sections** A-I: Prereqs (A.1/A.2/A.3) / Pre-flight MiroFish / POSITIVE install + compose inspect / POSITIVE open UI + prompt / NEGATIVE no-flag env-var absent / DOM-grep zero "API key" inputs / Broker access log evidence / Screenshot checklist / Notes | UAT (NOTE: MiroFish was DELETED in v29.5 Phase 52 migration `0010_drop_mirofish.sql` — this UAT may be partially obsolete; Phase 63 walk records "OBSOLETE — closed via Phase 52 migration" for the MiroFish-specific steps and walks only the broker-access-log + sacred-integrity rows) |
| 16 | v29.3 / 44 | `.planning/milestones/v29.3-phases/44-per-user-usage-dashboard/44-UAT.md` | UAT | **9 lettered sections** A-I: Test-cmd summary / Mini PC deploy prereqs / Schema migration / SC #1 per-user populates / SC #2 admin cross-user / SC #3 80% warning banner / SC #4 429 propagation / Sacred + broker integrity / Honest deferrals | UAT |

**Aggregate step budget for Wave 4:** ~85-95 numbered steps across 16 files (one extra row because Phase 39 has `39-03-tests-and-verification.md` instead of UAT.md and v29.5 has 6 VERIFICATION.md not 4). Plan one row per step in `63-UAT-RESULTS.md` table.

**Note on Phase 39:** No `39-UAT.md` exists. The original requirement listed "39-UAT.md" but the actual file is `39-03-tests-and-verification.md` (the third sub-plan's verification document). Walk this file's STRIDE Threat Register + Trust Boundaries sections + integration test results.

**Note on Phase 43 (MiroFish):** v29.5 Phase 52 migration `0010_drop_mirofish.sql` permanently removed MiroFish from the platform `apps` table. UAT sections C/D/E/F that reference MiroFish are OBSOLETE; record as "OBSOLETE — closed via Phase 52 migration 0010" and walk only sections G (broker access log) + H (screenshot evidence for OTHER apps) + I (sign-off).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mini PC deploy execution | Mini PC OS / systemd | Server5 (none) | `bash /opt/livos/update.sh` runs locally as bruce; rsync from /tmp/livinity-update-* / pnpm install / pnpm build / `systemctl restart` 4 services |
| Past Deploys panel | LivOS UI (browser) | livinityd tRPC | `past-deploys-table.tsx` calls `trpcReact.system.listUpdateHistory.useQuery` which reads `/opt/livos/data/update-history/*.json` |
| api.livinity.io reverse proxy | Server5 Caddy | Mini PC tunnel | Cloudflare DNS-only A record → Server5 Caddy `api.livinity.io` block → private LivOS tunnel → Mini PC livinityd:8080 |
| TLS termination | Server5 Caddy | — | Let's Encrypt auto-issued cert; `tls {email <ops-email>}` Caddy directive |
| Bearer auth (`liv_sk_*`) | Mini PC livinityd middleware | PostgreSQL `api_keys` | Phase 59: SHA-256 hash lookup; partial index on `revoked_at IS NULL`; tRPC `apiKeys.create/list/revoke` |
| Bolt.diy install | Mini PC docker-per-user | Marketplace tRPC | `installForUser()` in `apps.ts` generates per-user compose; Bolt.diy registered in `builtin-apps.ts:1242` |
| Settings > API Keys UI | LivOS UI (browser) | livinityd tRPC | Phase 62 components in `livos/packages/ui/src/components/settings/ai-configuration/` (api-keys-tab.tsx + create-modal + revoke-modal); routes `apiKeys.list/create/revoke` |
| `broker_usage` row writes | livinityd capture middleware | PostgreSQL | Phase 44 + Phase 62: `capture-middleware.ts` INSERTs (user_id, app_id, tokens, api_key_id) on broker response close |
| External client tests (browser/CLI) | Orchestrator local + Server5 | api.livinity.io public | Server5 = recommended external host for curl smoke (already SSH'able, already external to Mini PC) |
| Sacred file SHA gate | Local repo | git | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` against baseline `4f868d318abff71f8c8bfbcf443b2393a553018b` |
| Milestone close gate | gsd-toolkit workflow | `.planning/MILESTONES.md` | `/gsd-complete-milestone v30.0` scans `*-VERIFICATION.md` for `human_needed`; appends to "Live-Verification Gate Overrides" section ONLY on `--accept-debt` (Phase 63 must NOT trigger this) |

## Standard Stack (verification toolchain)

### Core (verification-only — no production deps)
| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| `ssh` (OpenSSH) | system | Mini PC + Server5 access | `/c/Windows/System32/OpenSSH/ssh.exe` (project memory) |
| `psql` | bundled w/ Mini PC PG | Query `broker_usage`, `api_keys` | `sudo -u postgres psql livos` OR via DATABASE_URL from `/opt/livos/.env` [VERIFIED: STATE.md line 90] |
| `dig` | OS bundled | DNS verification for `api.livinity.io` | Standard |
| `openssl s_client` | OS bundled | TLS cert verification | Standard |
| `curl` | OS bundled | Raw HTTP smoke + streaming `-N` | Standard |
| `python3` + `pip` | orchestrator local | Anthropic SDK smoke | Clean venv recommended |
| `anthropic` (PyPI) | latest | Anthropic Python SDK | `pip install anthropic` [CITED: pypi.org/project/anthropic] |
| Open WebUI | Docker | External client #2 | `docker run -d -p 3000:8080 ghcr.io/open-webui/open-webui:main` [CITED: openwebui.com docs] |
| Continue.dev | VS Code extension | External client #3 | Marketplace ID `Continue.continue`; config at `~/.continue/config.json` [CITED: docs.continue.dev] |

### Verification commands
```bash
# DNS
dig +short api.livinity.io A
dig +short api.livinity.io AAAA

# TLS
openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 \
  | grep -E 'Verify return code|subject=|issuer='

# HTTP HEAD
curl -sI https://api.livinity.io/v1/messages | head -5

# Streaming smoke (raw)
curl -N -H "Authorization: Bearer liv_sk_<...>" \
     -H "Content-Type: application/json" \
     -H "anthropic-version: 2023-06-01" \
     -d '{"model":"opus","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}' \
     https://api.livinity.io/v1/messages

# Anthropic Python SDK
python3 -c "
from anthropic import Anthropic
c = Anthropic(api_key='liv_sk_<...>', base_url='https://api.livinity.io')
r = c.messages.create(model='opus', max_tokens=100,
                      messages=[{'role':'user','content':'Hi'}])
print(r.content); print(r.usage)
"

# Mini PC broker_usage check (single SSH)
ssh -i $MINIPC_KEY bruce@10.69.31.68 "
  source /opt/livos/.env
  psql \"\$DATABASE_URL\" -c 'SELECT id, user_id, api_key_id, app_id, prompt_tokens, completion_tokens, created_at FROM broker_usage ORDER BY created_at DESC LIMIT 5;'
"
```

## Architecture Patterns

### System Flow (Phase 63 verification surface)

```
[Orchestrator local] ─(ssh single-batch)─> [Mini PC bruce@10.69.31.68]
        │                                          │
        │                                          ├─> /opt/livos/update.sh ─> /opt/livos/data/update-history/<ts>-success.json
        │                                          ├─> systemctl: livos / liv-core / liv-worker / liv-memory
        │                                          └─> psql livos: broker_usage / api_keys
        │
        ├─(ssh)─> [Server5 root@45.137.194.102] ─> Caddy validate / list-modules / curl smoke
        │
        ├─(curl/python)─> https://api.livinity.io ─> [Server5 Caddy] ─> [private LivOS tunnel] ─> [Mini PC livinityd:8080]
        │
        ├─(browser)─> https://<user>.livinity.io ─> Bolt.diy (per-user docker) ─> /v1/messages ─> Mini PC broker
        │
        ├─(local docker)─> Open WebUI :3000 ─> https://api.livinity.io ─> Mini PC broker
        │
        └─(VS Code)─> Continue.dev ─> https://api.livinity.io ─> Mini PC broker

Final: git hash-object sacred file == 4f868d318abff71f8c8bfbcf443b2393a553018b
       /gsd-complete-milestone v30.0  →  audit `passed` (NO --accept-debt)
```

### Pattern 1: Single-batched SSH (fail2ban discipline)
**What:** Concatenate all Mini PC inspection commands into ONE `ssh ... "cmd1; cmd2; cmd3"` invocation.
**Why:** Mini PC's `sshd` fail2ban jail bans rapid probes from a single IP within seconds. A multi-step orchestrator that opens 5 sequential SSH sessions in 30s gets banned mid-walk and Phase 63 BLOCKs.
**Anti-pattern:** Wave 1 task with 6 separate `Bash` calls each running its own `ssh`.

### Pattern 2: Evidence capture per UAT row
**What:** Every step in `63-UAT-RESULTS.md` cites concrete evidence (screenshot path, shell output snippet, psql row, log line).
**Format:** `| phase | uat_id | step_id | description | result | evidence | timestamp |`. Evidence column non-empty for every PASS/FAIL row. BLOCKED rows cite the blocker.
**Why:** Audit-trail requirement; future "did v30 close cleanly?" forensics need machine-readable evidence.

### Pattern 3: Failure-loop hot-patch
**What:** UAT FAIL → PAUSE Phase 63 → identify root-cause phase (likely 57-62) → open hot-patch plan in offending phase (e.g., `57-06-PLAN.md`) → execute → re-deploy → re-run failed step → continue.
**Commit message convention:** `fix(<phase>): <issue> — closes UAT-<req>-step<N>` so the failing UAT is referenced in git history.
**Worst case:** Hot-patch surfaces deeper architectural issue → milestone close BLOCKED → file v30.1 carry-forward decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bolt.diy install | Manual docker run | Marketplace install button (`apps.installForUser()`) | Tests the actual user-facing flow; per-user compose templating + subdomain routing already wired |
| `liv_sk_*` minting | psql INSERT manually | Settings > AI Configuration > API Keys "Create Key" button | Tests Phase 62 UI + Phase 59 tRPC end-to-end (the actual external-API surface UX) |
| Open WebUI install | Build from source | `docker run -d --name open-webui -p 3000:8080 -v open-webui:/app/backend/data --restart always ghcr.io/open-webui/open-webui:main` | Standard install; image already provides all deps |
| Continue.dev config | Hand-craft JSON | VS Code extension UI → "Add Model" → Anthropic provider → fill base URL + key | Continue.dev's own UI generates valid `~/.continue/config.json` |
| Anthropic Python SDK call | requests + manual SSE parse | `from anthropic import Anthropic` | Phase 42 UAT pattern; SDK handles SSE event types; closes FR-VERIFY-V30-06 with one canonical client |
| Mini PC fail2ban handling | Retry with backoff loop | Single batched SSH | Project memory: rapid probes get banned; backoff loop keeps probing |
| Milestone close validation | Manual checklist | `/gsd-complete-milestone v30.0` | Phase 54's gate is the audit; bypassing it defeats the discipline |

**Key insight:** Phase 63's job is to USE the user-facing flows, NOT replicate them server-side. Every shortcut around the UI defeats the verification.

## Runtime State Inventory

> Phase 63 is verification-only — no rename/refactor. State inventory limited to verification artifacts.

| Category | Items | Action |
|----------|-------|--------|
| Stored data | `broker_usage` rows (Phase 44/62) — Phase 63 INSERTs new rows via live tests; `api_keys` rows (Phase 59) — Phase 63 INSERTs ≥1 row when minting `liv_sk_*` for Open WebUI / Continue.dev / curl tests | Verify rows present post-test (read-only assertion) |
| Live service config | None — Phase 63 doesn't change service config | None — verifies Phase 60 already-applied Server5 Caddyfile + already-applied Mini PC Phase 61 Redis seed |
| OS-registered state | None | None |
| Secrets / env vars | `liv_sk_*` plaintext shown ONCE in Settings UI on creation — orchestrator captures into ephemeral local secret store for the test run; revoke at end of Phase 63 (cleanup task) | Mint test keys; revoke via UI at Wave 5 end before milestone close |
| Build artifacts | `/opt/livos/data/update-history/<ts>-success.json` written by `update.sh` | Read-only verify |

## Common Pitfalls

### Pitfall 1: Mini PC fail2ban ban mid-walk
**What goes wrong:** Wave 4 UAT walk opens many SSH sessions within minutes (one per UAT step that needs server-side verification) → `sshd` jail bans orchestrator IP → Phase 63 BLOCKs with `Connection refused` error halfway through.
**Why:** Mini PC fail2ban (Phase 46) auto-bans rapid SSH probes per project memory.
**How to avoid:** Batch ALL SSH-required verifications PER WAVE into ONE SSH invocation per phase. Pre-script the multi-step shell command server-side, run once, parse output locally.
**Warning sign:** Connection refused / Connection reset on second-or-later SSH within a 60s window.

### Pitfall 2: `pnpm-store` quirk silently ships stale dist
**What goes wrong:** `update.sh` rsyncs source + builds, but pnpm has multiple `@nexus+core*` resolution dirs (sharp version drift). `update.sh` copies dist to FIRST `find -maxdepth 1` match (potentially the wrong one). livinityd's `node_modules/@nexus/core` symlink resolves to a DIFFERENT dir → still imports stale dist → Phase 63 deploys "successfully" but live tests fail with v29 behavior.
**Why:** Project memory note on update.sh pnpm-store quirk.
**How to avoid:** Wave 1 post-deploy verify includes `ls /opt/livos/node_modules/.pnpm/@nexus+core*`. If multiple dirs → manually `cp -r /opt/nexus/packages/core/dist` into the one livinityd's symlink resolves to, then `systemctl restart livos`.
**Warning sign:** Deploy logs show success but Bolt.diy / curl tests show pre-Phase-57 behavior (Nexus identity injection visible).

### Pitfall 3: `liv-memory.service` restart loop blocks 4-services-active check
**What goes wrong:** `update.sh` builds core/worker/mcp-server but NOT memory. `liv-memory.service` restart-loops because `/opt/nexus/packages/memory/dist/index.js` doesn't exist. Phase 63 Wave 1 4-services-active check fails → BLOCKS.
**Why:** Pre-existing breakage per project memory (2026-04-25 entry).
**How to avoid:** Wave 0 pre-flight detects this; either (a) include "build memory manually" Wave 1 step (`cd /opt/nexus/packages/memory && npm run build`), or (b) document as known-failed and override the 4-services check to 3-services for Phase 63 (`livos`, `liv-core`, `liv-worker` all active; memory expected-failed).
**Decision:** Recommend (a) — build memory in Wave 1 as part of deploy. Cleanly closes the gate.

### Pitfall 4: DNS propagation lag for `api.livinity.io`
**What goes wrong:** Phase 60 sets the A record minutes before Phase 63 starts; orchestrator's local DNS resolver caches `NXDOMAIN` → curl/Python smoke fails with "could not resolve host".
**Why:** DNS propagation can take up to TTL (Cloudflare default 5 min).
**How to avoid:** Wave 0 pre-flight runs `dig +short api.livinity.io` AND `dig +short api.livinity.io @1.1.1.1` (forcing CF resolver). Both must return Server5 IP. Local resolver cache flush if needed (`sudo systemd-resolve --flush-caches` Linux; `ipconfig /flushdns` Windows; `dscacheutil -flushcache` macOS).
**Warning sign:** `dig` returns NXDOMAIN OR returns wrong IP.

### Pitfall 5: Past Deploys panel polls cached tRPC result
**What goes wrong:** Past Deploys panel was open before deploy → React Query cached the `system.listUpdateHistory` result → after deploy completes, panel shows OLD list.
**Why:** Default tRPC React staleness behavior.
**How to avoid:** Wave 1 verification step includes "refresh page" OR manual refetch (right-click → reload table). Alternative: capture evidence directly from `/opt/livos/data/update-history/` via SSH instead of relying on UI cache.
**Warning sign:** Panel shows N rows; SSH shows N+1 files.

### Pitfall 6: `--accept-debt` muscle memory
**What goes wrong:** Operator runs `/gsd-complete-milestone v30.0`, gate returns `human_needed` for some tiny-edge-case UAT step, operator reflexively types `--accept-debt` to "just close it" → defeats the entire D-LIVE-VERIFICATION-GATE first-clean-pass goal of v30.
**Why:** v29.5 closed via `--accept-debt`; muscle memory from that session.
**How to avoid:** Plan explicitly forbids `--accept-debt`. Wave 5 task documents: "If gate returns `human_needed`, find offending phase and walk that phase's UATs, OR file v30.1 hot-patch — DO NOT pass `--accept-debt`."
**Warning sign:** Operator typing `--accept-debt`. The plan should have a "STOP — re-read the locked decision" guard rail.

### Pitfall 7: External client routing test from Server5 falsely passes
**What goes wrong:** Server5 reaches `api.livinity.io` via private LivOS tunnel back to Mini PC (because Server5 IS the relay) → curl smoke passes from Server5 even when public DNS / TLS would fail for an actual external client.
**Why:** Server5 has a privileged path that real external users don't.
**How to avoid:** Phase 63 ALSO runs the curl smoke from orchestrator's local machine OR a cellular hotspot — somewhere with no special routing. If only Server5 passes and orchestrator-local fails, it's a public-routing bug, not a TLS/auth bug.
**Warning sign:** `curl https://api.livinity.io/v1/messages` works from Server5 but times out from orchestrator's home wifi.

## Code Examples

### Wave 1: Mini PC deploy (single SSH)
```bash
# Source: project memory + 63-CONTEXT.md
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc \
    -o StrictHostKeyChecking=no \
    bruce@10.69.31.68 \
    "sudo bash /opt/livos/update.sh 2>&1 | tail -200" \
    | tee .planning/phases/63-mandatory-live-verification/63-deploy-output.log
```

### Wave 1: Post-deploy verify (single SSH)
```bash
ssh -i $MINIPC_KEY bruce@10.69.31.68 "
  systemctl is-active livos liv-core liv-worker liv-memory
  echo '---'
  ls -la /opt/livos/data/update-history/ | tail -3
  echo '---'
  cat \$(ls -t /opt/livos/data/update-history/*.json | head -1)
  echo '---'
  ls /opt/livos/node_modules/.pnpm/@nexus+core* 2>/dev/null
  echo '---'
  git -C /opt/nexus/packages/memory rev-parse HEAD 2>/dev/null || echo 'no-git-on-memory'
" | tee .planning/phases/63-mandatory-live-verification/63-postdeploy.log
```

### Wave 2: Combined Server5 + DNS + TLS smoke (one local terminal)
```bash
# Source: 63-CONTEXT.md + Phase 60 plans
dig +short api.livinity.io A
dig +short api.livinity.io @1.1.1.1
curl -sI https://api.livinity.io/v1/messages | head -3
openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 \
  | grep -E 'Verify return code|subject=|issuer='

ssh -i $CONTABO_KEY root@45.137.194.102 "
  caddy validate /etc/caddy/Caddyfile && echo CADDY_VALIDATED
  systemctl is-active caddy
  caddy list-modules | grep -E 'rate_limit|cloudflare'
"
```

### Wave 3: Bolt.diy "Who are you?" identity test
```
1. Open https://<user>.livinity.io (LivOS UI for the test user)
2. Marketplace → search "Bolt.diy" → click Install → wait 30-60s → "Open" button appears
3. Click Open → Bolt.diy loads → provider menu → select "OpenAI-Like" (per builtin-apps.ts line 1248 description)
4. Pick model (e.g. claude-sonnet-4-6)
5. Chat: "Hi, who are you?"
6. CAPTURE screen recording for streaming evidence (≥3 visible delta updates)
7. ASSERT response self-identifies as Bolt (NOT Nexus)
8. ssh Mini PC: psql ... "SELECT * FROM broker_usage WHERE user_id = '<test-user>' ORDER BY created_at DESC LIMIT 1"
9. ASSERT row exists with non-zero prompt_tokens AND non-zero completion_tokens
```

### Wave 3: Open WebUI install (orchestrator local machine, NOT Mini PC LAN)
```bash
# Source: openwebui.com docs
docker run -d --name open-webui -p 3000:8080 \
    -v open-webui:/app/backend/data \
    --restart always \
    ghcr.io/open-webui/open-webui:main

# Then in browser http://localhost:3000:
# Settings → Connections → "OpenAI API" section
# - Base URL: https://api.livinity.io/v1   (OpenAI-compat)
# - API Key: liv_sk_<paste from LivOS Settings UI>
# Save → Send chat → verify streaming + token counts visible
```

### Wave 3: Continue.dev install + config
```bash
# In VS Code: Extensions → search "Continue" → install Continue (Continue.continue)
# Open Continue panel → Click "Add Model" → "Anthropic" provider
# It writes ~/.continue/config.json:
{
  "models": [
    {
      "title": "Livinity Broker",
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "apiBase": "https://api.livinity.io",
      "apiKey": "liv_sk_<paste>"
    }
  ]
}

# In editor: trigger code completion (Tab in a comment-based prompt)
# ASSERT response within 5s
```

### Wave 5: Sacred SHA gate
```bash
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# EXPECTED: 4f868d318abff71f8c8bfbcf443b2393a553018b
git diff 4f868d31...HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
# EXPECTED: empty
npx vitest run nexus/packages/core/src/__tests__/sdk-agent-runner-integrity.test.ts
# EXPECTED: PASS
```

### Wave 5: Milestone close
```bash
/gsd-complete-milestone v30.0
# EXPECTED: audit returns `passed` (NOT `human_needed`).
# If `human_needed` returns: identify offending VERIFICATION.md and walk its UATs;
# DO NOT pass --accept-debt.
```

## State of the Art

| Old Approach | Current Approach | When Changed |
|--------------|------------------|--------------|
| `git pull && pm2 restart` | `bash /opt/livos/update.sh` (rsync + pnpm + systemd) | v29.0 Phase 31 |
| update.sh builds without dist cleanup | `rm -rf dist` before vite build | v29.5 Phase 51 |
| Audit reports `passed` without UAT walks | D-LIVE-VERIFICATION-GATE blocks close on `human_needed` | v29.5 Phase 54 |
| URL-path identity + IP guard | Bearer token `liv_sk_*` | v30 Phase 59 |
| Mini PC private only | Public `api.livinity.io` (Server5 Caddy + rate-limit) | v30 Phase 60 |
| Block-level streaming aggregation | True token streaming (passthrough mode) | v30 Phase 57+58 |
| Single shared usage table | `broker_usage` enriched with `api_key_id` | v30 Phase 62 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Open WebUI Settings path is `Connections > OpenAI` with `base_url` + `api_key` fields | Code Examples (Wave 3) | LOW — Open WebUI UI is well-documented; if path moved, easy to update at execution time |
| A2 | Continue.dev `~/.continue/config.json` `apiBase` field forwards Bearer correctly to non-anthropic.com hosts | Code Examples (Wave 3) | MEDIUM — if Continue's anthropic provider hardcodes anthropic.com, fallback to `provider: "openai"` against `/v1/chat/completions` |
| A3 | Phase 39's verification document = `39-03-tests-and-verification.md` (no UAT.md exists) | UAT Inventory row 11 | LOW — verified by directory listing |
| A4 | Phase 43 MiroFish-specific UAT sections are obsolete after Phase 52 migration `0010_drop_mirofish.sql` | UAT Inventory row 15 (note) | MEDIUM — confirmed by 52-VERIFICATION.md line 51 (`MiroFish: 0 rows (was 1 — DELETED)`); Phase 63 plan should record "OBSOLETE — closed via Phase 52" rather than FAIL |
| A5 | Server5 is acceptable as "external" for FR-VERIFY-V30-05 curl smoke | Risk Inventory + Code Examples | MEDIUM — Server5 has privileged tunnel path back to Mini PC; SHOULD ALSO test from orchestrator-local for routing-truth (see Pitfall 7) |
| A6 | `pip install anthropic` in clean venv installs a version that supports `base_url` parameter | Code Examples (Wave 2) | LOW — `Anthropic(base_url=...)` has been in the SDK since v0.7+; current is well past that |
| A7 | Phase 63 step count for Wave 4 is ~85-95 numbered steps across the 16 files | UAT Inventory aggregate | LOW — derived from explicit section counts; planner should treat as upper bound and split Wave 4 into 4 sub-waves of ~20-25 steps each to keep PR-sized commits |
| A8 | `liv-memory.service` is still in restart-loop in v30 (the build pipeline issue from 2026-04-25 may have been fixed in Phase 56-62) | Pitfall 3 | MEDIUM — Wave 0 pre-flight should detect; if memory IS fixed in v30, drop the manual-build step |
| A9 | Open WebUI defaults to `/v1/chat/completions` for OpenAI-compat, NOT `/v1/messages` — so Phase 60 must serve OpenAI-compat path; Phase 63 verifies | Wave 3 routing | LOW — OpenAI-compat is the common default for Open WebUI; Phase 60/61 plans cover both paths |

**If Phase 63 surfaces an A1-A9 mismatch:** treat as "configuration drift, not architectural defect" — adjust the verification step at execution time, do NOT trigger hot-patch loop in Phases 57-62.

## Open Questions

1. **Has `liv-memory.service` been fixed in v30 phase work, or is it still restart-looping?**
   - What we know: 2026-04-25 entry says memory missing from `update.sh` build loop.
   - What's unclear: any of Phases 57-62 may have addressed it (no explicit task in Phase 56-62 plans I read).
   - Recommendation: Wave 0 pre-flight runs `ssh ... systemctl is-active liv-memory` from a CLEAN deploy (current Mini PC state pre-Phase-63-deploy). If failed → either fix in Wave 1 OR document as known-pre-existing and override the 4-services check.

2. **Does `api.livinity.io` Caddy block route both `/v1/messages` (Anthropic) AND `/v1/chat/completions` (OpenAI)?**
   - What we know: Phase 60 plans target the broker; Phase 61 covers spec-compliance.
   - What's unclear: routing details I didn't read (60-01-PLAN.md to 60-05-PLAN.md, 61-01..05).
   - Recommendation: Wave 0 confirms BOTH paths return 200/auth-error before Wave 3; Open WebUI tests OpenAI-path, Continue.dev tests Anthropic-path.

3. **Where exactly does the Phase 62 Settings UI mount `<ApiKeysTab>` in the route tree?**
   - What we know: 62-CONTEXT.md says `livos/packages/ui/src/components/settings/ai-configuration/api-keys-tab.tsx`.
   - What's unclear: the user-facing URL path (Settings → AI Configuration → API Keys) — likely `/settings/ai-configuration` with API Keys as the second tab between "Provider Toggle" and "Usage".
   - Recommendation: Wave 0 confirms tab is rendered + clickable + opens Create Key modal. If missing → Phase 62 incomplete → BLOCK Phase 63.

## Environment Availability

| Dependency | Required By | Available on orchestrator | Available remote | Fallback |
|------------|------------|---------------------------|------------------|----------|
| `ssh` (OpenSSH) | Mini PC + Server5 access | YES | — | none — blocking |
| Mini PC SSH key | Mini PC | YES (`pem/minipc`) | — | none — blocking |
| Server5 SSH key | Server5 | YES (`pem/contabo_master`) | — | none — blocking |
| `dig` / `openssl` / `curl` | DNS+TLS+HTTP smokes | YES (Windows: via OpenSSH bundled or Git Bash) | — | none — bundled |
| Python 3 + pip | Anthropic SDK smoke | likely YES | — | use `anthropic` via `pipx run` if no venv |
| `anthropic` PyPI pkg | FR-VERIFY-V30-06 | NO — fresh install required | — | install in clean venv |
| Docker (orchestrator local) | Open WebUI install | likely YES | — | run on Server5 instead (already has Docker) |
| VS Code + Continue extension | Continue.dev test | likely YES | — | install fresh; ~5 min |
| `psql` client | broker_usage queries | NOT NEEDED locally — query via SSH | YES on Mini PC | always run via SSH |

**Missing dependencies with no fallback:** none — orchestrator + Mini PC + Server5 cover everything.

**Missing dependencies with fallback:** `anthropic` Python pkg (1-line install); Open WebUI image (1-line docker pull); Continue.dev VS Code extension (UI install).

## Validation Architecture (Nyquist)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual UAT walks + automated smokes (curl, openssl, dig, psql, vitest for sacred integrity test only) |
| Config file | n/a — Phase 63 is execution-only |
| Quick run command | `dig +short api.livinity.io && curl -sI https://api.livinity.io/v1/messages` |
| Full suite command | `/gsd-complete-milestone v30.0` (the gate ITSELF is the canonical full check) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-VERIFY-V30-01 | Mini PC deployed, 4 services active | semi-auto | `ssh ... "systemctl is-active livos liv-core liv-worker liv-memory"` | n/a |
| FR-VERIFY-V30-02 | Bolt.diy install + chat + identity + usage | manual | n/a — browser walk | screenshot evidence in `63-evidence/` |
| FR-VERIFY-V30-03 | Open WebUI external client | manual | n/a — browser walk | screenshot evidence |
| FR-VERIFY-V30-04 | Continue.dev VS Code | manual | n/a — IDE walk | screenshot evidence |
| FR-VERIFY-V30-05 | Raw curl streaming smoke | auto | `curl -N ...` | log evidence |
| FR-VERIFY-V30-06 | Anthropic Python SDK smoke | auto | `python3 sdk-smoke.py` | log evidence |
| FR-VERIFY-V30-07 | 14 UATs walked | manual | n/a — UAT walks | `63-UAT-RESULTS.md` |
| FR-VERIFY-V30-08 | Milestone close clean | auto | `/gsd-complete-milestone v30.0` | audit log |

### Sampling Rate
- **Per task commit:** Wave-end smoke (e.g., Wave 1 ends with 4-services-active assertion).
- **Per wave merge:** Cumulative pass requirement — Wave N cannot start unless Wave N-1 fully PASS.
- **Phase gate:** Sacred SHA gate + `/gsd-complete-milestone v30.0` audit `passed`.

### Wave 0 Gaps
- [ ] `63-pre-flight.sh` — wraps the 7 pre-flight checks into one script for re-runnability
- [ ] `63-deploy-output.log` (placeholder) — captures Wave 1 SSH output
- [ ] `63-postdeploy.log` (placeholder) — captures Wave 1 verify output
- [ ] `63-evidence/` directory — screenshots + screen recordings + log captures
- [ ] `63-UAT-RESULTS.md` skeleton with table headers `| phase | uat_id | step_id | description | result | evidence | timestamp |`
- [ ] `63-deploy-cleanup.md` — Wave 5 final task: revoke test `liv_sk_*` keys minted during Phase 63

## Risk Inventory (planner consume + plan-checker verify)

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Mini PC fail2ban bans orchestrator IP mid-walk | MEDIUM | HIGH (Phase 63 BLOCKs) | Single-batched SSH discipline; Wave 0 verifies orchestrator IP not banned |
| R2 | Phase 57+ deployed but `pnpm-store` quirk ships stale dist | MEDIUM | HIGH (live tests show v29 behavior) | Wave 1 post-deploy verify includes `ls @nexus+core*`; manual cp if multiple dirs |
| R3 | Bearer auth fails because `liv_sk_*` from Phase 59 isn't accepted | LOW | HIGH (Wave 3 OWUI/Continue/curl all FAIL) | Wave 0 mints test key + curl smoke FROM orchestrator before Wave 3; if auth fails → Phase 59 hot-patch |
| R4 | DNS for `api.livinity.io` not propagated to orchestrator's resolver | LOW | MEDIUM (Wave 2 FAILs but easily resolvable) | Wave 0 dig with `@1.1.1.1` + local resolver flush |
| R5 | TLS cert not yet issued on Server5 (Caddy still fetching from Let's Encrypt) | LOW | MEDIUM | Wave 0 openssl s_client — if `Verify return code != 0`, wait 60s + retry once |
| R6 | UAT step references file/state that no longer exists in v30 (e.g., MiroFish in Phase 43) | MEDIUM | LOW (record OBSOLETE, walk remaining steps) | Plan acknowledges Phase 43 partial obsolescence upfront (UAT Inventory row 15 note) |
| R7 | Sacred file SHA drifted somewhere in Phases 57-62 | LOW | HIGH (milestone close BLOCKED until revert) | Wave 5 hash-object check; revert if drift found; integrity test in CI |
| R8 | `--accept-debt` muscle memory | MEDIUM | HIGH (defeats v30 raison d'être) | Wave 5 task explicitly forbids; if gate returns `human_needed` → walk that phase's UATs OR file v30.1 |
| R9 | Phase 62 Settings UI tab not deployed → can't mint `liv_sk_*` from UI | LOW | HIGH (FR-VERIFY-V30-03/04/05/06 all BLOCK) | Wave 0 verifies tab visible + Create-Key flow works; if not → Phase 62 hot-patch |
| R10 | `liv-memory.service` restart-loop fails 4-services-active check | MEDIUM | LOW (build memory in Wave 1 OR override check) | Wave 0 detects; Wave 1 fixes |
| R11 | Server5-only curl test gives false-positive (privileged tunnel path) | MEDIUM | MEDIUM (false confidence) | Run curl ALSO from orchestrator-local; both must pass |
| R12 | Open WebUI default OpenAI-compat path mismatch with broker route | LOW | LOW (config tweak) | Configure OWUI base URL with explicit `/v1` suffix if needed |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/63-mandatory-live-verification/63-CONTEXT.md` — locked decisions, all 8 success criteria detail
- `.planning/STATE.md` — Mini PC + Server5 ground truth, sacred file SHA, fail2ban discipline, locked decisions
- `.planning/REQUIREMENTS.md` lines 73-85 — FR-VERIFY-V30-01..08 verbatim
- `.planning/milestones/v29.5-phases/{49,50,51,52,53,54}-VERIFICATION.md` — 6 v29.5 verify docs (read fully)
- `.planning/milestones/v29.4-phases/{45-VERIFICATION,46,47,48-UAT}.md` — 4 v29.4 docs (sections enumerated)
- `.planning/milestones/v29.3-phases/{40,41,42,43,44}-UAT.md` + `39-risk-fix-close-oauth-fallback/39-03-tests-and-verification.md` — 6 v29.3 docs (sections enumerated)
- `update.sh` (lines 5-6, 51, 200-206, 282-288, 446-488) — confirms Phase 51 hardening (`rm -rf dist` line 457, `verify_build` line 287/459/470/484/488), update-history dir (line 51)
- `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx` (line 80: `trpcReact.system.listUpdateHistory.useQuery`)
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` line 1242-1265 — Bolt.diy registration confirmed
- `.planning/phases/59-bearer-token-auth/59-CONTEXT.md` — `liv_sk_*` format + middleware order + `api_keys` schema
- `.planning/phases/60-public-endpoint-rate-limit/60-CONTEXT.md` — Caddy on Server5, Let's Encrypt, rate-limit perimeter
- `.planning/phases/62-usage-tracking-settings-ui/62-CONTEXT.md` — Settings UI structure + components

### Secondary (MEDIUM confidence)
- Project memory `MEMORY.md` — Mini PC topology, fail2ban discipline, pnpm-store quirk, liv-memory restart-loop, Server5 routing, sacred SHA

### Tertiary (LOW confidence — needs validation at execution)
- Open WebUI Settings UI navigation path (`Connections > OpenAI`) — assumption A1
- Continue.dev `apiBase` Bearer forwarding to non-anthropic.com hosts — assumption A2

## Metadata

**Confidence breakdown:**
- UAT inventory completeness: HIGH — directly enumerated from filesystem; all 16 files (14 + 2 extras: VERIFICATION-only for Phase 50/52/53/54 + tests-and-verification for Phase 39) located and section-counted
- Pre-flight gate definition: HIGH — copied verbatim from 63-CONTEXT.md
- Mini PC deploy sequence: HIGH — `update.sh` source confirmed hardened; project memory authoritative on fail2ban
- Risk inventory: MEDIUM — known pitfalls catalogued from project memory + verification archives; new risks may surface at execution
- External client install commands: MEDIUM — orchestrator-side commands assumed; live install at execution may surface UI changes (A1, A2)

**Research date:** 2026-05-02
**Valid until:** 2026-05-09 (Phase 63 should execute within a week — DNS/TLS/services state can drift fast on a live system)
