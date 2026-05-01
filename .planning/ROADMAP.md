# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01 with `gaps_found` accepted as v29.4 carry-forward; MiroFish dropped) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- 🟡 **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (defining-plans; this file)
- ⏸ **v30.0 Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes after v29.4 with phase renumber)

---

## v29.4 — Server Management Tooling + Bug Sweep

**Phase numbering:** 45 → 48 (continues from v29.3 Phase 44 — DO NOT reset)
**Granularity:** fine
**Parallelization:** false (strict linear chain — each phase consumes prior phase's artifact)
**Mode:** yolo (workflow.skip_discuss=true, workflow.ui_phase=false, workflow.research=true, workflow.plan_check=true, workflow.verifier=true)
**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` — current SHA `4f868d31...` (Phase 45 re-pins; Phase 47 may add ONE surgical edit per Phase 40 D-40-01 ritual)

**Total:** 4 phases · 18 requirements · ~940 LOC delta · 0 new npm/apt deps

### Goal

Restore Nexus AI's missing built-in tools (shell, Docker, files), add a Server Management surface for Fail2ban / IP-ban administration so SSH access stays operable, defensive marketplace-app health probing, and roll up four v29.3 carry-forwards (broker 429, sacred SHA, httpOnlyPaths, OpenAI SSE usage chunk) — all without new third-party dependencies.

### Locked Decisions (enforced in every phase's success criteria)

- **D-NO-NEW-DEPS** — 0 new npm/apt deps. fail2ban + cloudflared already on Mini PC via `install.sh:502-540`.
- **D-LIVINITYD-IS-ROOT** — livinityd runs as root on Mini PC. NO sudoers, polkit, or D-Bus brokers (net-new attack surface for zero gain).
- **D-DIAGNOSTICS-CARD** — A1 (FR-TOOL) + A2 (FR-MODEL) + A4 (FR-PROBE) share single `diagnostics-section.tsx` scaffold (~25% LOC saving).
- **D-D-40-01-RITUAL** — every sacred-file edit follows Phase 40 ritual: pre-edit SHA verify → behavior-preserving change → post-edit SHA verify → integrity test re-pinned with audit comment.
- **D-FAIL2BAN-CLIENT-ONLY** — text-parse `fail2ban-client status` output. No JSON wrappers, no Python `dbus` bindings, no `fail2ban` npm wrapper.
- **D-NO-SERVER4** — Mini PC `bruce@10.69.31.68` ONLY. Server4 + Server5 off-limits for v29.4 work.
- **D-NO-BYOK** — Subscription-only AI provider path (carry from v29.3).
- **D-TOS-02** — Broker NEVER through raw `@anthropic-ai/sdk`; always Agent SDK `query()` (carry from v29.3).

### Critical Sequencing Constraint

**FR-CF-02 (C2 sacred SHA re-pin) MUST land BEFORE FR-MODEL-02 Branch B (sacred-edit remediation).**

- C2 (Phase 45) is **audit-only** — `git diff --shortstat nexus/packages/core/src/sdk-agent-runner.ts` returns empty. Re-pins integrity test from stale `623a65b9...` to current `4f868d31...`.
- FR-MODEL-02 Branch B (Phase 47) may add a NEW surgical edit on top of the post-C2 SHA. Integrity test re-pinned a second time with separate audit comment.
- The integrity test cannot be allowed to fail in CI between these two events — strict linear ordering enforces this.

## Phases

- [ ] **Phase 45: Carry-Forward Sweep** — Land four v29.3 audit gaps (broker 429, sacred SHA re-pin, httpOnlyPaths, OpenAI SSE usage chunk) before any new feature work
- [ ] **Phase 46: Fail2ban Admin Panel** — Server Management "Security" sidebar entry inside `LIVINITY_docker` with jail list, unban+whitelist, manual ban, audit log, mobile cellular toggle
- [ ] **Phase 47: AI Diagnostics (Registry + Identity + Probe)** — Shared `diagnostics-section.tsx` scaffold hosting capability registry restore, model identity diagnostic+remediation, marketplace app health probe
- [ ] **Phase 48: Live SSH Session Viewer** — `/ws/ssh-sessions` journalctl tail with click-IP-to-ban cross-link to Phase 46's manual ban modal

## Phase Details

### Phase 45: Carry-Forward Sweep
**Goal**: Roll up four v29.3 audit-found integration gaps so the milestone starts on a green CI baseline before any new feature lands.
**Depends on**: Nothing (first phase of v29.4; consumes v29.3 milestone audit findings)
**Requirements**: FR-CF-01, FR-CF-02, FR-CF-03, FR-CF-04
**Success Criteria** (what must be TRUE):
  1. When Anthropic upstream returns HTTP 429 with `Retry-After: 60`, marketplace app receives HTTP 429 (NOT 500) with `Retry-After: 60` header preserved verbatim — verified via integration test mocking nexus 429 response.
  2. When Anthropic upstream returns HTTP 502, marketplace app receives HTTP 502 (NOT remapped to 429) — strict 429-only allowlist verified via parameterized test over status codes `[400, 401, 403, 429, 500, 502, 503, 504, 529]`.
  3. Running `git show <c2-commit> --stat -- nexus/packages/core/src/sdk-agent-runner.ts` returns empty output (audit-only commit; source byte-identical) AND `BASELINE_SHA` constant in `sdk-agent-runner-integrity.test.ts` equals current `4f868d31...` with audit comment listing every v43.x drift commit.
  4. After killing livinityd via `systemctl restart livos` while Settings tab is open, all three routes (`claudePerUserStartLogin`, `usage.getMine`, `usage.getAll`) resolve within 2s of WS reconnect without UI hang — verified via restart-livinityd-mid-session integration test.
  5. Running an OpenAI streaming chat completion via `/u/:userId/v1/chat/completions` produces a `broker_usage` row with non-zero `prompt_tokens` AND `completion_tokens` — verified via verbatim openai Python SDK smoke test from Phase 42 UAT.
  6. `npm run test:phase45` passes including chained Phase 39 sacred-file integrity test re-asserting new `BASELINE_SHA = 4f868d31...`.
**Plans**: 4 plans
- [x] 45-01-PLAN.md — C2 sacred-file BASELINE_SHA audit-only re-pin (Wave 1, FR-CF-02) — **shipped 2026-05-01 in commit `f5ffdd00`**
- [x] 45-02-PLAN.md — C1 broker 429 forwarding + Retry-After preservation (Wave 2, FR-CF-01) — **shipped 2026-05-01 in commit `cdd34445`**
- [ ] 45-03-PLAN.md — C3 httpOnlyPaths additions for ai.claudePerUserStartLogin/usage.getMine/usage.getAll (Wave 2, FR-CF-03)
- [ ] 45-04-PLAN.md — C4 OpenAI SSE usage chunk + token plumbing + test:phase45 npm script (Wave 2, FR-CF-04)

### Phase 46: Fail2ban Admin Panel
**Goal**: Admin can recover from SSH lockout via UI (unban + whitelist) without SSH access, observe banned IPs, manually ban malicious IPs (with self-ban guardrails), and review an immutable audit trail of all ban/unban events.
**Depends on**: Phase 45 (httpOnlyPaths invariant must be current pattern; mutations `fail2ban.unbanIp` and `fail2ban.banIp` will be added to the same `httpOnlyPaths` array Phase 45 just modified)
**Requirements**: FR-F2B-01, FR-F2B-02, FR-F2B-03, FR-F2B-04, FR-F2B-05, FR-F2B-06
**Success Criteria** (what must be TRUE):
  1. Admin opens Server Management → Security and sees a list of all configured fail2ban jails (auto-discovered, NOT hardcoded to sshd) with currently-banned IPs, total ban/fail counts, last-attempted username — refreshing every 3-5s with manual Refresh button.
  2. Admin clicks Unban on a banned IP → modal shows IP + jail + last-attempt timestamp + last-attempted-user + "Add to ignoreip whitelist after unban" checkbox; confirming runs `fail2ban-client set <jail> unbanip <ip>` and (if checked) `set <jail> addignoreip <ip>` — IP disappears from list within next poll cycle.
  3. Admin types an IP matching their current connection source (HTTP X-Forwarded-For OR active SSH session via `who -u`-equivalent) into "Ban an IP" → modal blocks confirm until admin types `LOCK ME OUT` exact string; CIDR `/0` through `/7` rejected by Zod validation before reaching fail2ban-client.
  4. After every unban/ban/whitelist action, `device_audit_log` table contains a new row with `device_id='fail2ban-host'`, `tool_name IN ('unban_ip','ban_ip','whitelist_ip')`, `params_digest=sha256(JSON.stringify({jail,ip}))`, `user_id=ctx.currentUser.id`; row is immutable (BEFORE UPDATE/DELETE trigger blocks tampering).
  5. Admin opens panel from mobile browser on cellular → UI surfaces BOTH HTTP X-Forwarded-For IP AND active SSH session source IPs with explicit labels; "I'm on cellular" toggle suppresses self-ban check (CGNAT mismatch protection).
  6. Three distinct service-state banners render correctly: (a) `fail2ban-client missing` shows "Install Fail2ban" with one-click `systemd-run --scope` install button, (b) `service inactive` shows "Fail2ban service inactive" with start button, (c) `running but no jails` shows "Fail2ban running but no jails configured" with docs link.
  7. `Settings > "Show Security panel"` toggle defaults ON; toggling OFF hides the Security sidebar entry without uninstalling fail2ban (non-destructive backout); preference persists in `user_preferences` table.
  8. All new tRPC mutations (`fail2ban.unbanIp`, `fail2ban.banIp`) are present in `httpOnlyPaths` array at `livos/packages/livinityd/source/modules/server/trpc/common.ts`; restart-livinityd-mid-session integration test confirms no WS-hang.
**Plans**: TBD
**UI hint**: yes

### Phase 47: AI Diagnostics (Registry + Identity + Probe)
**Goal**: Restore Nexus's missing built-in tools (shell, docker_*, files, web_search), surface model-identity verdict + apply correct remediation (deployment OR source path), and give every authenticated user a self-service marketplace-app reachability probe — all under one shared `diagnostics-section.tsx` scaffold.
**Depends on**: Phase 45 (FR-CF-02 sacred SHA re-pin MUST have landed; FR-MODEL-02 Branch B may add ONE surgical edit on top of the now-current `4f868d31...` baseline per Phase 40 D-40-01 ritual)
**Requirements**: FR-TOOL-01, FR-TOOL-02, FR-MODEL-01, FR-MODEL-02, FR-PROBE-01, FR-PROBE-02
**Success Criteria** (what must be TRUE):
  1. Settings > Diagnostics renders three cards in a single shared `diagnostics-section.tsx` scaffold: Capability Registry, Model Identity, Marketplace App Health — each with status badge, detail panel, and action button (one card layout, three data hooks).
  2. Capability Registry card shows Redis manifest count + built-in tool count from source + last sync timestamp + 3-way categorized list (`expected-and-present`, `expected-but-missing`, `unexpected-extras`) where "missing" distinguishes `missing_lost` (Redis lost it — re-sync helps) from `missing_precondition` (e.g. web_search needs API key — re-sync won't help) from `disabled_by_user` (override).
  3. Admin clicks "Re-sync registry" → registry rebuilds via atomic-swap (write to `capability:_pending:*` temp prefix, swap-pointer flush, drop old prefix) so AI chat traffic mid-resync sees either OLD or NEW set, NEVER empty; user-set `enabled: false` overrides from `user_capability_overrides` are re-applied AFTER resync — verified via integration test using isolated Redis DB index 15.
  4. Model Identity card runs 6-step on-Mini-PC diagnostic when admin clicks "Diagnose" — surfaces verdict (`dist-drift` / `source-confabulation` / `both` / `neither`) based on broker `response.model` field + pnpm-store dir count + `readlink -f` resolved path + dist marker grep.
  5. Based on verdict, exactly ONE remediation lands: **Branch A** (dist drift) patches `update.sh` pnpm-store dist-copy from `head -1` to `tail -1` — NO sacred-file edit, ~30 LOC; **Branch B** (source confabulation) makes ONE surgical edit at `sdk-agent-runner.ts` system-prompt construction (raw `systemPrompt: "..."` → `{type: 'preset', preset: 'claude_code', append: ...}`) following Phase 40 D-40-01 ritual; **Branch C** (both) ships both as separate atomic commits with integrity test re-pinned to final SHA after Branch B.
  6. After remediation, re-running FR-MODEL-01 diagnostic returns verdict `clean` — verified by post-fix UAT step.
  7. Authenticated user clicks "Probe reachability" on Bolt.diy marketplace app detail page → `apps.healthProbe(appId)` returns `{reachable, statusCode, ms, lastError, probedAt}`; UI renders inline status card (green check / yellow warning / red error) within 5s undici timeout.
  8. `apps.healthProbe` is `privateProcedure` (NOT admin-only) and PG query is scoped to `user_app_instances WHERE user_id = ctx.currentUser.id AND app_id = $1` (mirror of Phase 44 `usage.getMine` pattern — prevents internal port scanner abuse).
  9. If FR-MODEL-02 Branch B taken: `nexus/packages/core/src/sdk-agent-runner-integrity.test.ts` `BASELINE_SHA` re-pinned a SECOND time with audit comment quoting the surgical edit diff; `git diff --shortstat` between FR-CF-02 commit and FR-MODEL-02-B commit shows exactly the systemPrompt construction line(s) changed (no incidental drift).
**Plans**: TBD
**UI hint**: yes

### Phase 48: Live SSH Session Viewer
**Goal**: Admin can watch live SSH session activity on the Mini PC and one-click-ban a malicious-looking source IP via cross-link into Phase 46's manual ban modal — closing the operator-loop from observation to action.
**Depends on**: Phase 46 (click-IP→ban cross-link routes to FR-F2B-03 manual ban modal pre-populated with the clicked IP)
**Requirements**: FR-SSH-01, FR-SSH-02
**Success Criteria** (what must be TRUE):
  1. Admin opens Server Management → Security → SSH Sessions sub-section; WebSocket `/ws/ssh-sessions` streams live `journalctl -u ssh -o json -f --since "1 hour ago"` events filtered to `_SYSTEMD_UNIT === "ssh.service"` — admin sees timestamps + messages + extracted IPs appearing in real-time.
  2. Each row's IP column has a click-to-copy button AND a click-to-ban button; clicking ban opens the Phase 46 FR-F2B-03 manual ban modal pre-populated with that IP and `LOCK ME OUT` self-ban check active — operator goes from "I see something suspicious" to "I banned it" in two clicks.
  3. Live tail respects 5000-line ring buffer (mirror of Phase 28 cross-container logs aggregator); user-scroll past the 4px tolerance auto-disables live-tail with explicit "Resume tailing" button.
  4. `/ws/ssh-sessions` endpoint enforces `adminProcedure` RBAC (NOT `protectedProcedure`); rejecting non-admin handshake with WS close code 4403 (mirror of v26.0 `authorizeDeviceAccess` pattern).
  5. NO geo-IP/ASN enrichment, NO `maxmind` dependency added — raw IP + click-to-ban gives 80% of value at 0% install cost (geo enrichment deferred to FR-SSH-future-01 / v30+).
**Plans**: TBD
**UI hint**: yes

## Dependency Graph

```
Phase 45 (Carry-Forward Sweep)            ← first; no upstream deps
       │
       ├─► Phase 46 (Fail2ban Admin)      ← depends on httpOnlyPaths pattern from Phase 45
       │           │
       │           └─► Phase 48 (SSH Viewer)  ← click-IP→ban cross-link to Phase 46 FR-F2B-03
       │
       └─► Phase 47 (AI Diagnostics)      ← FR-MODEL-02 Branch B requires FR-CF-02 sacred SHA re-pin to have landed first
```

**Strict linear chain (parallelization=false):** 45 → 46 → 47 → 48.

Phase 47 is sequenced AFTER Phase 46 (not in parallel) per `parallelization: false` config — even though they touch independent files, `gsd-execute-phase` runs them sequentially. This also gives Phase 47 a stable Phase 46 codebase to land its `diagnostics-section.tsx` scaffold next to.

## Coverage Validation

| Requirement | Phase | Category | Status |
|-------------|-------|----------|--------|
| FR-CF-01 | 45 | Carry-Forward | **Complete** (`cdd34445`) |
| FR-CF-02 | 45 | Carry-Forward | **Complete** (`f5ffdd00`) |
| FR-CF-03 | 45 | Carry-Forward | Pending |
| FR-CF-04 | 45 | Carry-Forward | Pending |
| FR-F2B-01 | 46 | Fail2ban | Pending |
| FR-F2B-02 | 46 | Fail2ban | Pending |
| FR-F2B-03 | 46 | Fail2ban | Pending |
| FR-F2B-04 | 46 | Fail2ban | Pending |
| FR-F2B-05 | 46 | Fail2ban | Pending |
| FR-F2B-06 | 46 | Fail2ban | Pending |
| FR-TOOL-01 | 47 | Diagnostics | Pending |
| FR-TOOL-02 | 47 | Diagnostics | Pending |
| FR-MODEL-01 | 47 | Diagnostics | Pending |
| FR-MODEL-02 | 47 | Diagnostics | Pending |
| FR-PROBE-01 | 47 | Diagnostics | Pending |
| FR-PROBE-02 | 47 | Diagnostics | Pending |
| FR-SSH-01 | 48 | SSH Viewer | Pending |
| FR-SSH-02 | 48 | SSH Viewer | Pending |

**Mapped:** 18 / 18
**Orphans:** 0
**Duplicates:** 0
**Coverage:** 100%

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 45. Carry-Forward Sweep | 0/4 (planned 2026-05-01) | Not started | - |
| 46. Fail2ban Admin Panel | 0/0 (TBD via plan-phase) | Not started | - |
| 47. AI Diagnostics (Registry + Identity + Probe) | 0/0 (TBD via plan-phase) | Not started | - |
| 48. Live SSH Session Viewer | 0/0 (TBD via plan-phase) | Not started | - |

## Sacred File SHA History

- v29.3 Phase 40 baseline: `623a65b9...` (Phase 40 D-40-01 surgical edit)
- v43.x model-bump drift (un-audited): → `4f868d31...`
- v29.4 Phase 45 FR-CF-02 audit-only re-pin: `4f868d31...` (current)
- v29.4 Phase 47 FR-MODEL-02 Branch B (if taken): TBD post-edit SHA

---

## Project-Level Milestone Index (carry-over)

- v19.0 Custom Domain Management (shipped 2026-03-27)
- v20.0 Live Agent UI (shipped 2026-03-27)
- v21.0 Autonomous Agent Platform (shipped 2026-03-28)
- v22.0 Livinity AGI Platform (shipped 2026-03-29)
- v23.0 Mobile PWA (shipped 2026-04-01)
- v24.0 Mobile Responsive UI (shipped 2026-04-01)
- v25.0 Memory & WhatsApp Integration (shipped 2026-04-03)
- v26.0 Device Security & User Isolation (shipped 2026-04-24)
- v27.0 Docker Management Upgrade (shipped 2026-04-25)
- v28.0 Docker Management UI (Dockhand-Style) (shipped 2026-04-26)
- v29.0 Deploy & Update Stability (shipped 2026-04-27)
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- **v29.4 Server Management Tooling + Bug Sweep** — DEFINING-PLANS (Phases 45-48)
- v30.0 Backup & Restore — PAUSED (8 phases defined; resumes after v29.4)

---

*Last updated: 2026-05-01 — v29.4 roadmap created (4 phases / 18 reqs / 0 new deps / ~940 LOC). Awaiting `/gsd-plan-phase 45`.*
