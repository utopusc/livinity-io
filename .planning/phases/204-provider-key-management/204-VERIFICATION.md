---
phase: 204-provider-key-management
status: human_needed
created: 2026-05-24
deployed_sha: 13f2eb0ff9baf9161a8b8d88509472bc80fd9c09
deploy_date: 2026-05-24
services_active: 7
smoke_tests_passed: 5
smoke_tests_total: 6
sacred_sha_canonical: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_minipc: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_match: true
operator_action_items: 1
uat_steps: 6
ship_threshold: "5 of 6 PASS (already met by executor)"
plans_verified: [204-01, 204-02]
---

# Phase 204 — Provider Key Management UI — VERIFICATION

> **Status:** `human_needed` (visual UAT only). Phase 204 is **CODE-COMPLETE + DEPLOYED** on Mini PC; 5/6 smoke checks executor-PASS; the remaining 1 check requires an operator browser walk to flip 🟡 → 🟢.

## § A — Deploy state summary

| Field | Value |
|---|---|
| Deployed SHA on Mini PC | `13f2eb0ff9baf9161a8b8d88509472bc80fd9c09` (`/opt/livos/.deployed-sha`) |
| Pre-deploy SHA | `bcef01038812cf3d96d98437ff0026d85d8a59fc` (Phase 203-13 close) |
| Deploy date | 2026-05-24 |
| Sacred SHA canonical | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Sacred SHA Mini PC blob (verified live in Phase 203 § J) | matches — preserved across all Phase 204 commits |
| Sacred files touched across all 204-* commits | **0** (INV-204-01 PASS across 7 commits in Phase 204) |
| update.sh passes during deploy | 2 (first deploy + envelope-fix re-deploy) |
| Final smoke battery | 5/6 PASS, 1/6 deferred to operator browser walk |

## § B — Mini PC service inventory (live as of 19:08 PDT 2026-05-24)

| systemd unit | Status | Notes |
|---|---|---|
| `livos.service` | active | livinityd tsx process, port 8080; provider.config.* router wired |
| `liv-core.service` | active | liv core compiled JS |
| `liv-worker.service` | active | liv worker |
| `liv-memory.service` | active | liv memory |
| `liv-claw-gateway.service` | active | openclaw@2026.5.20 gateway, port 18789; now reads BOTH `/etc/default/liv-claw-gateway` AND `/opt/livos/etc/liv-claw-gateway.env` |
| `livos-app-liv-ai.service` | active | Next.js liv-ai-app at :3010 (Providers tab lives in /settings) |
| `caddy.service` | active | reverse proxy + split routing |

**Result: 7/7 expected services active.**

## § C — Executor smoke battery (5/6 PASS)

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | `sudo bash /opt/livos/update.sh` runs clean + 7 systemd units active | ✅ PASS | All 7 services `active` per live `systemctl is-active` |
| 2 | `/liv-ai-app/settings` Providers tab loads visually | ⏳ OPERATOR-UAT | `curl -H 'Host: bruce.livinity.io' http://127.0.0.1/liv-ai-app/settings` returns 200; visual rendering deferred to operator |
| 3 | Save flow: paste → Save → restarting → healthy within 30s | ✅ PASS | End-to-end JWT-authenticated POST to `/trpc/provider.config.set` returned `{ok:true, envFilePath:"/opt/livos/etc/liv-claw-gateway.env", restartTriggered:true, restartRequired:false}` — restart hook fired live + gateway came back up |
| 4 | Refresh: row shows redacted preview only | ✅ PASS | `provider.config.list` returned `{"providers":[{"provider":"xai","preview":"xai-***cdef","addedAt":"..."}]}` — raw key NEVER in response |
| 5 | SSH check: env file contains key + mode 0600 | ✅ PASS | `sudo cat /opt/livos/etc/liv-claw-gateway.env` showed `XAI_API_KEY=...`; `stat -c '%a'` returned `600` |
| 6 | Negative log: no raw key in livinityd journal | ✅ PASS | `sudo journalctl -u livos --since '5 min ago' \| grep '<raw-key>'` returned 0 lines |

## § D — Invariant verification (INV-204-01..08)

| ID | Invariant | Status | Evidence |
|---|---|---|---|
| INV-204-01 | Sacred SHA preserved on every commit | PASS | 7 Phase 204 commits, husky `[sacred-sha] PASS: 20 files verified` on each |
| INV-204-02 | English UI only | PASS | All emitted strings in ProvidersTab.tsx + use-providers.ts + router error messages English |
| INV-204-03 | Mini PC only deploy | PASS | All `bash /opt/livos/update.sh` invocations targeted Mini PC `bruce@10.69.31.68`; Server4 + Server5 untouched |
| INV-204-04 | `list` NEVER returns the raw key | PASS | Live verified: response is `{provider, preview, addedAt}` only |
| INV-204-05 | Env file chmod 0600 | PASS | `stat -c '%a' /opt/livos/etc/liv-claw-gateway.env` = `600` |
| INV-204-06 | No raw key in livinityd journal | PASS | journal grep for raw key value returns 0 lines |
| INV-204-07 | Sudoers drop-in scope narrow | PASS | `visudo -c -f /etc/sudoers.d/livos-claw-gateway` PASS; only 2 commands grantted (restart + status) |
| INV-204-08 | Routing surface mutations bounded | PASS | Exactly 3 httpOnlyPaths additions; no other routing changes |

## § E — Threat mitigation status (T-204-01..07)

| ID | Threat | Mitigation Status |
|---|---|---|
| T-204-01 | Paste-back attack via re-reveal | MITIGATED — UI never offers re-reveal; preview only |
| T-204-02 | Lateral Redis admin reads key | MITIGATED — Mini PC Redis password-gated (same level as `/opt/livos/.env`); D-204-02 trust model |
| T-204-03 | Env file world-readable | MITIGATED — chmod 0600 verified live; bruce:bruce ownership |
| T-204-04 | Restart loop on malformed value | MITIGATED — zod regex pre-validation BEFORE Redis write |
| T-204-05 | Gateway crash on restart | MITIGATED — pre-existing T-203-01 `Restart=on-failure RestartSec=5`; UI shows recovery instructions if 30s health poll fails |
| T-204-06 | Key in error stack trace | MITIGATED — error messages use redacted previews; no key in throw path |
| T-204-07 | Sudoers wrong perms | MITIGATED — install -m 0440 root:root + visudo -c rollback-on-fail |

## § F — Plan summaries cross-reference

| Plan | Status | Summary |
|---|---|---|
| 204-01 | ✅ CODE-COMPLETE | Backend (key-store + env-file writer + restart hook + router + 18 vitest cases). See `204-01-SUMMARY.md`. |
| 204-02 | ✅ CODE-COMPLETE + DEPLOYED | Frontend (ProvidersTab + use-providers hook + settings page register), sudoers drop-in, bootstrap script, Mini PC deploy. See `204-02-SUMMARY.md` + `204-02-DEPLOY-LOG.md`. |

## § G — Operator Action Items

One item — visual confirmation only. No secrets needed.

### G.1 — Browser walk of the Providers tab

```
Open: https://bruce.livinity.io/liv-ai-app/settings
Click: Providers tab
Expected: tab loads with the "No provider keys configured" empty state
Optional smoke: pick xai → paste a real key → Save → toast shows "Saved.
                Restarting Liv AI gateway…" → "Gateway healthy" within 30s
Optional smoke: refresh → row shows xai with preview xai-***<last4 of key>
```

If the tab renders cleanly + the empty state is visible → flip Phase 204
ROADMAP heading from 🟡 to 🟢 SHIPPED.

## § H — Carry-overs to Phase 205+

Documented for the next planner. None block Phase 204 ship-gate.

1. **McpTab.tsx pre-existing mutation bug** — The `{"0":{"json":{...}}}?batch=1` envelope used in `mcp.config.toggle/delete` is silently broken on this server (no superjson transformer). Discovered while Phase 204-02 ate the same poison-pill pattern. Phase 205+ should either (a) port McpTab to the bare-envelope helper, or (b) wire superjson server-side to support v11 batch links uniformly across the codebase.
2. **`scripts/install/` not on update.sh rsync path** — `update.sh` only rsyncs `packages/`; `scripts/install/` is left out, so bootstrap scripts (like `204-provider-bootstrap.sh`) need to be invoked from the `/tmp/livinity-update-prefetch/` clone or hand-installed. Long-term fix: extend `update.sh` to also rsync `scripts/install/` → `/opt/livos/scripts/install/`.
3. **Key validation by hitting provider /v1/models** — Plan 204 saves any key matching the shape regex; doesn't verify it works against the provider. Future UX: post-save "Verify key" button that hits `/v1/models` and confirms 200 before reporting success.
4. **Provider key rotation reminders** — `addedAt` is stored but never surfaced as an alert. Future enhancement: badge providers whose keys are >90 days old.

## § I — Operator UAT Walk (6 steps; 5/6 executor-PASS, 1 pending operator)

> Flip `[ ] PENDING` to `[x] PASS` or `[ ] FAIL — <reason>` after walking each step.

- [x] **Step 1:** `sudo systemctl is-active livos liv-core liv-worker liv-memory liv-claw-gateway livos-app-liv-ai caddy` → 7×`active`. **PASS** (executor-verified).
- [ ] **Step 2:** Operator opens `https://bruce.livinity.io/liv-ai-app/settings` → clicks the **Providers** tab → tab loads with the "No provider keys configured. Add one below to enable chat." empty state. **PENDING — operator browser walk required.**
- [x] **Step 3:** Save flow (operator OR executor curl-equivalent): provider.config.set returns `{ok:true, envFilePath, restartTriggered:true}`. **PASS** (executor-verified via curl).
- [x] **Step 4:** `provider.config.list` response shows redacted preview only, raw key absent. **PASS** (INV-204-04 executor-verified).
- [x] **Step 5:** `sudo cat /opt/livos/etc/liv-claw-gateway.env` shows the new line; `stat -c '%a'` returns `600`. **PASS** (INV-204-05 executor-verified).
- [x] **Step 6:** `sudo journalctl -u livos --since '5 min ago' \| grep -E '<raw-key>'` returns 0 lines. **PASS** (INV-204-06 executor-verified).

**5/6 PASS already met (executor-side).** Step 2 is operator-discretion visual UAT only — if the tab renders, Phase 204 flips to 🟢 SHIPPED.

## § J — Sacred SHA verification (INV-204-01)

| Surface | Hash | Result |
|---|---|---|
| Canonical (constraint registry) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | reference |
| Mini PC live (Phase 203 § J carryover; sacred file unchanged in Phase 204) | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | **MATCH** |
| Husky pre-commit on every Phase 204 commit | `[sacred-sha] PASS: 20 files verified` | PASS (7/7 commits) |

**Files protected (20):** see `scripts/sacred-shas-v38.json`. ZERO sacred files touched across all Phase 204 commits.

## § K — Deferred items index

| ID | Surface | Status |
|---|---|---|
| McpTab.tsx mutation envelope bug | livos/packages/liv-ai-app/components/settings/McpTab.tsx | OPEN — Phase 205+ candidate (Rule 4 — pre-existing, out of scope) |
| update.sh missing scripts/install/ rsync | scripts/install/update.sh | OPEN — Phase 205+ DX improvement |
| Key validation against /v1/models | future UI affordance | DEFERRED — not blocking ship |
| Key rotation reminders | future UI affordance | DEFERRED — not blocking ship |
