# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v19.0 — Custom Domain Management

**Shipped:** 2026-03-27
**Phases:** 5 | **Plans:** 10 | **Tasks:** 19

### What Was Built
- End-to-end custom domain management: users add domains on livinity.io, verify DNS, domains auto-sync to LivOS via tunnel relay
- Relay Caddy on-demand TLS with Redis-cached ask endpoint (<5ms authorization, Let's Encrypt auto-SSL)
- Tunnel domain sync pipeline with reconnect resilience and PostgreSQL + Redis dual storage
- Custom domain-to-Docker app mapping with HTTP and WebSocket routing through relay tunnels
- Domains tab in Servers app + "My Domains" section in Settings with status badges and Configure dialog
- Dashboard polish: SSL status indicators, re-verify timing, inline error banners

### What Worked
- Phase 10.1 (decimal sub-phase) was a clean insertion for the Settings UI swap — no disruption to existing phase flow
- Reusing existing `domain.platform.*` tRPC routes for the Settings My Domains UI avoided duplication
- Research agent correctly identified that tunnel mode means no local Caddy changes needed — prevented wasted work
- Gap closure (Phase 09-03) caught a missing PostgreSQL persistence requirement and fixed it in one plan

### What Was Inefficient
- DNS polling (`startDnsPolling`) was built but never wired to server startup — integration gap only caught at milestone audit, not during phase verification
- Relay-side cache invalidation gap for LivOS-initiated domain mapping changes — the relay drops `domain_sync` messages because it has no handler for them
- Phase 09 human_needed items remain deferred (require live tunnel environment for testing)

### Patterns Established
- Dual DNS resolver pattern (system + Cloudflare DoH) for cross-validation
- Redis-cached authorization for latency-sensitive endpoints (ask endpoint pattern)
- domain_sync tunnel message protocol for real-time cross-system sync with batch reconnect
- Conditional Caddy integration based on tunnel mode status

### Key Lessons
1. Cross-phase integration checks should happen earlier — not just at milestone audit. The dns-polling wiring gap would have been caught if Phase 08 or 09 had checked Phase 07's startup integration.
2. Tunnel message handlers need bidirectional coverage — if LivOS sends `domain_sync` to relay, the relay needs a `case 'domain_sync':` handler. Check both directions during planning.
3. Background jobs (polling, cron) need explicit "wire to startup" tasks in plans — code that's exported but never imported is dead code.

### Cost Observations
- Model mix: ~60% opus (research, planning, execution), ~30% sonnet (verification, checking), ~10% haiku
- Notable: Single-plan Phase 10.1 executed efficiently with 3 tasks, all in one wave

---

## Milestone: v27.0 — Docker Management Upgrade

**Shipped:** 2026-04-25
**Phases:** 7 (17-23) | **Plans:** 15 | **Tasks:** ~40

### What Was Built

- Phase 17: Real-time WS log streaming + AES-256-GCM stack secrets + redeploy-with-pull + extended AI docker_manage tool
- Phase 18: Container file browser via dockerode exec + tar streaming (4 tRPC + 2 REST), Files tab with breadcrumb/dropzone/edit-modal
- Phase 19: Compose YAML → React Flow graph + on-demand Trivy scan with SHA256 7-day Redis cache and severity-badge UI
- Phase 20: node-cron scheduler with PG-backed scheduled_jobs + 3 built-in handlers + alpine-tar streaming volume backup with S3/SFTP/local + AES-256-GCM creds vault
- Phase 21: GitOps stack deployment (simple-git blobless clone, AES-256-GCM credentials, HMAC-SHA256 webhook 202+background, hourly git-stack-sync auto-sync)
- Phase 22: Multi-host Docker (environments PG table, getDockerClient factory, env-aware tRPC routes, outbound docker-agent Node binary with WS transport, 5s revoke SLA via Redis pub/sub)
- Phase 23: AI-powered diagnostics (reactive: diagnose/compose-gen/CVE-explain via /api/kimi/chat one-shot bridge; proactive: ai-resource-watch cron handler default-disabled; autonomous: docker_diagnostics MCP tool in nexus registry)

### What Worked

- **AES-256-GCM JWT-derived crypto established in Phase 17 as a reusable pattern** — directly lifted into Phase 20 backup creds and Phase 21 git creds with byte-for-byte identical implementation. Zero re-research overhead.
- **httpOnlyPaths discipline enforced from Phase 17 onward** — every new mutation added to `common.ts` httpOnlyPaths registry; no Phase 18-style mutation-hang regressions in Phases 19-23.
- **`*.unit.test.ts` test convention adopted in Phase 19 onward** — Phase 20/22/23 unit tests all colocated with source; pattern survived through TDD-flagged plans (RED+GREEN commit splits in 23-01 + 23-02).
- **TDD with explicit RED+GREEN commit splits worked cleanly for AI diagnostics** — Plan 23-01 task-2 and 23-02 task-2 used the pattern; failing test commits (`test(...)`) followed by green implementation commits (`feat(...)`) made gate enforcement trivial.
- **Plan 17-01's WebSocket-streaming handler factory** became the reference for Phases 18 (file browser) and 20 (scheduler tail) — the abstraction held up across 3 unrelated use cases.
- **`getDockerClient(envId)` factory pattern in Phase 22** kept module-level Dockerode singletons from creeping back; backwards-compat alias resolution (null/'local'/UUID) made the migration zero-risk for existing routes.

### What Was Inefficient

- **Phase 22 underestimated**: 3 plans / 53 minutes total (vs typical 2 plans / ~12 min for v27.0 phases). The outbound agent transport (Plan 22-03, 20 min) was the largest plan in v27.0; STATE.md flagged this risk during 22-CONTEXT but the planner didn't split further.
- **Pre-existing typecheck noise documented across 4 phases (17, 19, 20, 21) but never addressed** — accumulated as v28+ debt. Each phase's SUMMARY notes "out of scope per scope-boundary rule"; cumulatively this is ~338 livinityd errors + ~38 ActionButton-icon errors waiting for a cleanup pass.
- **`Phase 17-02` carried v28 deferral for AI stack-deploy secret-passthrough**; this contract hole (AI can deploy stacks but can't mark env vars as secret) outlived the milestone — needed a same-milestone fix in retrospect.

### Patterns Established

- **PG row only for state that needs server-side persistence** (git stacks, scheduled jobs, environments, agent tokens, ai_alerts) — YAML-only stacks, in-memory client cache stay filesystem/memory. Pattern preserves zero-migration-risk for upgrades.
- **`BUILT_IN_HANDLERS` registry decouples scheduler runner from handler implementations** — Phase 20-01 ships placeholder, Phase 21-02 fills it (git-stack-sync), Phase 23-02 extends it (ai-resource-watch). New milestones add handlers without touching scheduler/index.ts.
- **AlertsBell + AI tab + EnvironmentSelector + Files tab** all extend existing UI containers (Server Control header, DeployStackForm Tabs, container detail) rather than creating parallel surfaces — composition over multiplication.
- **`workflow.skip_discuss=true` user setting + auto-generated CONTEXT.md from ROADMAP goal** — proven workflow for autonomous milestones with well-anchored patterns. v27.0 used this for Phase 22+ and shipped without quality regressions.

### Key Lessons

1. **Live-LLM and live-infra UAT items are not gaps — they're deferred runtime tests.** Verifier agent's `human_needed` classification correctly separated "code is wrong" from "needs deployment-time observation". 11 items captured across Phases 22+23 HUMAN-UAT.md files; orchestrator audit acknowledged + tracked them in STATE.md Deferred Items rather than blocking close.
2. **Cross-phase wiring discipline pays off at audit time.** 3-source cross-reference (REQUIREMENTS.md + VERIFICATION.md + SUMMARY frontmatter) found 0 orphaned requirements across 33 REQ-IDs.
3. **`type: tdd` plan flag with RED/GREEN commit-pair gates** scaled cleanly to AI diagnostics — same discipline that worked for ordinary backend modules worked for Kimi-bound code paths.

### Cost Observations
- Model mix: ~80% opus (planner + executor + verifier on heavyweight phases), ~15% sonnet (verifier on confirmation runs), ~5% haiku
- Sessions: ~8 (initial context + 7 phase executions)
- Notable: Multi-agent verification (gsd-verifier per phase + gsd-integration-checker for milestone audit) caught zero false-positive passes across 7 phases — investment in separate verifier persona vs reusing executor paid off

---

## Milestone: v28.0 — Docker Management UI (Dockhand-Style)

**Shipped:** 2026-04-26
**Phases:** 6 (24-29) | **Plans:** 12 | **Tasks:** ~33

### What Was Built

- Phase 24: LIVINITY_docker app shell — 12-entry sidebar + 48px StatusBar with 8 stat pills + theme toggle (light/dark/system, scoped class-based dark mode); replaces LIVINITY_server-control everywhere
- Phase 25: Multi-environment Dashboard — EnvCardGrid + TopCpuPanel (top-10 cross-env, bounded fanout) + TagFilterChips with localStorage persist; environments.tags TEXT[] column
- Phase 26: Containers/Images/Volumes/Networks each as own section with search + detail panels; useDockerResource zustand store with 4 slots (programmatic deep-link DOC-20 partial)
- Phase 27: Stacks section (preserves YAML/Git/AI deploy tabs from v27) + Schedules section with volume backup pre-fill seam; FINAL CLEANUP — deleted 4815-line legacy server-control + 792-line legacy scheduler-section + git-mv'd 7 components to permanent homes
- Phase 28: NEW surfaces — cross-container Logs multiplexed WS aggregator (color stripe + name prefix + grep + severity + live-tail + 5000-line ring buffer) + Activity Timeline unifying 3 sources
- Phase 29: NEW surfaces — multi-tab xterm Shell + Registry credentials AES-256-GCM vault + Docker Hub/private search + Docker Settings (Environments + Appearance + Palette tabs) + cmd+k command palette + Copy Deep Link buttons

### What Worked

- **Backend reuse hypothesis held.** v28.0 was 95% UI restructure. Net-new backend = 2 schema additions (environments.tags + registry_credentials) + 2 envId WS extensions (logs-socket + exec-socket — same pattern across phases) + 4 thin tRPC routes (registry CRUD + image search). Zero new modules.
- **Pattern reuse cascade.** Phase 28's envId-extension pattern for docker-logs-socket cleanly reused in Phase 29 for docker-exec-socket. Phase 21's git-credentials AES-256-GCM module lifted+shifted verbatim to registry-credentials. Phase 22's EnvironmentsSection cross-imported into Docker Settings. Phase 24's sidebar pattern reused as Logs sidebar (Phase 28) and Shell sidebar (Phase 29).
- **resource-store extension model.** Phase 26 declared 4 slots up-front (selectedContainer/Image/Volume/Network); Phase 27 added 5th (selectedStack) without restructuring. cmd+k palette (Phase 29) consumes all 5 slots through a single setSelectedX/setSection convention.
- **consume-and-clear cross-section seam** (Phase 26-02 → Phase 27-02). Volumes section sets selectedVolume + flips to Schedules section; AddBackupDialog reads useSelectedVolume() on mount and immediately calls setSelectedVolume(null). Single-shot navigation without persistent coupling.
- **window-app pattern correctly identified at planning time.** Phase 24 planner discovered that Server Control isn't a route (per router.tsx:47-48 explicit comment); pivoted to LIVINITY_docker app id pattern. Saved Phase 26+ from URL-routing rework.
- **Atomic-commit + 4-grep gate cleanup discipline.** Plan 27-02 deleted 5607 lines (server-control + scheduler-section) across 4 sequential commits with build-green between each, plus a 4-grep gate to verify zero stale references survived.

### What Was Inefficient

- **MILESTONES.md "One-liner:" placeholder leak again.** Same issue as v27.0 — milestone-complete CLI's one-liner extraction missed 5+ SUMMARY files. Hand-cleaned post-archive. Future-fix: improve `milestone complete` extractor to fall back to objective field when one_liner is missing.
- **STATE.md repository corruption mid-phase.** During Phase 25 dispatch, .git/refs/heads/master got nullified somehow (all-zero SHA). Required manual ref recovery from reflog. Likely a parallel-write race condition. No data lost (reflog intact) but 5 minutes of debugging.
- **No formal interactive UI testing inside autonomous loop.** All 45 HUMAN-UAT items are deferred to deployment-time eyeball — that's correct for a window-app (can't run xterm/Radix Tooltip headlessly), but means Phase 24-29 visual polish only validated post-deploy.

### Patterns Established

- **`{section}-section.tsx` + `sections/{name}.tsx` 1-line re-export** convention. Section bodies live in subdirectory (`routes/docker/{shell,registry,settings,logs,activity,palette,resources,stacks,schedules,dashboard}/`); placeholder file becomes `export {Section} from '../X-section'`. Keeps sections/ directory as a flat navigation map.
- **`docker.{resource}{action}` tRPC naming** with optional `environmentId` first param. Phase 22 set this; Phase 29's registry routes (createRegistryCredential, listRegistryCredentials, etc.) follow the same naming.
- **Two-effect WS lifecycle** (deps reconcile + empty-deps cleanup) for React StrictMode dev double-invocation. Phase 28-01 useMultiplexedLogs established this; Phase 29-01 useExecTabs reuses it.
- **`livos:docker:*` localStorage key namespace** for user preferences (theme / sidebar-collapsed / sidebar-density / dashboard:selected-tag / palette:recent / resource-store NOT persisted because conversational state).
- **Window-app architecture confirmed**: section navigation = zustand state (NOT URL routing). Programmatic deep-link via setSelectedX. URL-bar deep-linking deferred to v29.0+ (window-app pattern incompatible with browser routes).

### Key Lessons

1. **Backend foundation pays compound dividends.** v27.0 invested in env-aware tRPC + outbound agent + AES vault + node-cron scheduler + AI bridge. v28.0 consumed that backend with zero invasive changes — pure UI restructure delivered 20 requirements in 12 plans across 6 phases.
2. **Architecture discovery during planning saves implementation rework.** Phase 24 planner's window-app discovery reframed all 6 phases. Catching the "no React Router" reality at plan-phase time prevented 5 phases of misdirected URL-routing code.
3. **Cleanup phases (27-02) need atomic commit discipline.** Deleting 5607 lines safely required: relocate first → consumer-import-fix second → delete third → 4-grep gate verifies last. Build-green between each commit prevented stale-import bugs.
4. **HUMAN-UAT capture matters even in window-apps.** 45 items captured per-phase form a deployment checklist. Beats "we'll know it works when we see it."

### Cost Observations
- Model mix: ~85% opus (planner + executor heavy work), ~15% sonnet (verifier confirmation runs)
- Sessions: ~12 (this autonomous run; 1 user mid-session continuation after PG fix)
- Notable: Phase 27 was the largest by surface area (Stacks + Schedules + final cleanup) — completed in ~30 min total work; the cleanup task discipline (atomic commits + 4-grep gate) was load-bearing

---

## Milestone: v29.3 — Marketplace AI Broker (Subscription-Only)

**Shipped:** 2026-05-01 (local; awaiting Mini PC deploy)
**Phases:** 6 (39-44) | **Plans:** 28 | **Tests:** ~150 automated across phase suites
**Audit status:** `gaps_found` (accepted; 4 carry-forwards to v29.4) | **MiroFish anchor:** dropped 2026-05-01 per user

### What Was Built
- Phase 39 — closed `claude.ts` raw-SDK OAuth-fallback path; pinned with grep-based regression test (`no-authtoken-regression.test.ts`)
- Phase 40 — per-user `.claude/` synthetic dirs + 3 tRPC routes (status/startLogin/logout) + Settings UI multi-user branch; sacred `SdkAgentRunner` got ONE surgical line edit at line 266 (`homeOverride || process.env.HOME || '/root'`) with re-pinned BASELINE_SHA
- Phase 41 — Anthropic Messages broker mounted at `livinityd:8080/u/:userId/v1/messages` (sync + Anthropic-spec SSE); HTTP-proxy Strategy B reuses single nexus SdkAgentRunner instance via `X-LivOS-User-Id` header → `homeOverride` per-call. Phase 41-04 closed Phase 40's deferred AI-Chat HOME wiring carry-forward.
- Phase 42 — OpenAI Chat Completions endpoint with pure in-process bidirectional translation (no LiteLLM sidecar). Tools intentionally ignored per D-42-12.
- Phase 43 — manifest schema flag `requiresAiProvider: true` + `injectAiProviderConfig()` pure function + single integration point at `apps.ts:963`. **MiroFish anchor app dropped 2026-05-01** — manifest preserved as planning artifact.
- Phase 44 — `broker_usage` PG table + Express response capture middleware (mounted BEFORE broker) + tRPC `usage.getMine`/`getAll` (admin-gated) + Settings > AI Configuration "Usage" subsection (banner / cards / 30-day recharts BarChart / per-app table / admin filter view).

### What Worked
- **Sacred file discipline held end-to-end across 6 phases.** One surgical edit in Phase 40 (re-pinned via D-40-01 ritual: pre-edit SHA verify → behavior-preserving change → post-edit SHA verify → integrity test re-pinned with documenting comment). Phases 41-44 byte-identical to Phase 40 baseline.
- **Strategy B (HTTP proxy) for broker → SdkAgentRunner.** Avoided cross-package brain/toolRegistry handle problem entirely; reused existing `/api/agent/stream` HTTP boundary; single per-call homeOverride seam covers BOTH AI Chat and broker traffic.
- **Capture middleware as separate module** (zero `import` statements from `livinity-broker/*`). `usage-tracking/` stayed loosely coupled — broker module remained edit-frozen across Phases 43-44.
- **MILESTONE-CONTEXT.md as live carry-forward sink.** v29.4 context was already seeded during v29.3's hot-patch sweep (commit `2050594d`); audit findings landed cleanly into Section C without scrambling for a new artifact.

### What Was Inefficient
- **No /gsd-verify-phase ran for ANY of the 6 phases.** Six SUMMARY.md files document mechanism-PASS + live-UAT-deferred per `<scope_boundaries>` (no Mini PC deploy from executor), but the workflow expected per-phase VERIFICATION.md artifacts. Three-source matrix (VERIFICATION + SUMMARY + REQUIREMENTS) defaulted ALL 17 reqs to `partial` before integration findings overlay.
- **Sacred file SHA drift went unnoticed.** v43.x model-bump commits (43.10 identity prepend, 43.12 tierToModel bump) touched `sdk-agent-runner.ts` after Phase 40's BASELINE_SHA `623a65b9...` was pinned. Audit-time discovery: integrity test will fail on next CI run. The Phase 40 D-40-01 re-pin ritual wasn't repeated for these subsequent surgical edits.
- **Two integration gaps weren't caught by phase verifiers (gsd-verifier ran 0/6 times).** Broker error path collapsing to HTTP 500 (router.ts:159) and dropping `Retry-After` (agent-runner-factory.ts:75-76) made FR-DASH-03 structurally unreachable. Caught by the gsd-integration-checker at milestone-audit time, not during phase execution. If verifier had run per-phase, this would have surfaced as a Phase 41/44 cross-cut earlier.
- **5 tRPC routes added without `httpOnlyPaths` registration** (`claudePerUserStartLogin`, `usage.getMine`, `usage.getAll`). Project pattern (`system.checkUpdate` and others moved to HTTP) wasn't followed for v29.3's interactive + dashboard routes. Caught by integration check, queued as v29.4 C3 carry-forward.

### Patterns Established
- **Surgical sacred-file edit with re-pinned BASELINE_SHA + documenting comment** (Phase 40 D-40-01 ritual). Future surgical edits to `sdk-agent-runner.ts` MUST repeat this ritual; the v43.x drift is the cautionary tale that proves it.
- **Per-phase test:phaseN npm scripts that chain prior phases.** Phase 44's `test:phase44` chains Phase 43 → 42 → 41 → 40 → 39, including the integrity test re-asserting sacred SHA at every level. Catches drift the moment it happens IF the test is run.
- **HTTP-proxy bridge pattern for cross-package agent invocations** (Strategy B Phase 41). Reusable for any future cross-package work that needs to invoke nexus's SdkAgentRunner without the cross-package brain/toolRegistry handle problem.
- **Dropping a feature mid-milestone via explicit user direction** (FR-MARKET-02 MiroFish "siktir et"). Mechanism stayed shipped (FR-MARKET-01 manifest schema is genuinely useful), but the anchor app was closed cleanly without churning carry-forward bookkeeping.

### Key Lessons
1. **Always run `/gsd-verify-phase` per phase, even when SUMMARY.md says mechanism-PASS.** Mechanism PASS without VERIFICATION.md leaves the 3-source matrix degraded — every integration check finding becomes "partial pending UAT" instead of being tied to a verifier-confirmed PASS/GAP. Pay the per-phase verifier cost; it's an audit-time multiplier.
2. **Re-pin BASELINE_SHA after every surgical sacred-file edit, even if the edit lives outside the current milestone scope.** v43.x hot-patches modified `sdk-agent-runner.ts` between v29.3 phases without re-pinning, leaving a latent test failure. The Phase 40 ritual is portable to ALL future edits.
3. **Cross-phase wiring gaps that span 3+ phases need explicit integration test scenarios.** Phase 44 broker-error → 429 path traverses Phase 41 broker error handling + Phase 41 fetch wrapper + Phase 44 capture middleware. Per-phase tests verified each leg in isolation; the combined path was tested only via banner unit tests fed synthetic rows. A negative-path integration test mocking `nexus 429 response → broker → capture` would have surfaced C1 during Phase 44 execution.
4. **`MILESTONE-CONTEXT.md` is the right tool for accepting milestone debt.** Don't proliferate 999.x backlog tickets when audit findings cluster into a clear next-milestone work area. Section C of v29.4's MILESTONE-CONTEXT.md captured all 4 carry-forwards in one pass without losing fidelity.

### Cost Observations
- Model mix: ~70% opus (planner + executor heavy work, all 6 phases), ~25% sonnet (verifier-substitute integration check + plan-checker), ~5% haiku (status queries)
- Sessions: many (autonomous-run-friendly, hot-patch sweeps for v43.x interleaved)
- Notable: Phase 41 was the largest by surface area (broker module 14 source files + 4 test files + AI Chat carry-forward closure) — completed in ~5 plans with Strategy B saving the cross-package handle problem entirely. Phase 44 had the highest test density (39 livinityd tests + 16 chained nexus tests for a single phase).

---

## Milestone: v29.4 — Server Management Tooling + Bug Sweep

**Shipped:** 2026-05-01 (local; awaiting Mini PC deploy)
**Phases:** 4 (45-48) | **Plans:** 17 | **Tests:** ~280 automated across phase suites
**Audit status:** `passed` (cleanest v29.x close — zero gaps, zero scope creep) | **Branch N taken** for FR-MODEL-02 (verdict=neither, sacred file untouched)

### What Was Built
- Phase 45 — closed all 4 v29.3 audit-found integration gaps in one phase: broker 429 + Retry-After (strict 429-only over 9 status codes × 2 routers), sacred SHA audit-only re-pin from `623a65b9...` to `4f868d31...` with audit comment listing v43.x drift commits, 3 namespaced httpOnlyPaths entries, OpenAI SSE adapter usage chunk with real token plumbing through `agent-runner-factory.ts`
- Phase 46 — Fail2ban admin panel as new "Security" sidebar entry inside `LIVINITY_docker` (13th SECTION_ID). Auto-discovered jail list + unban modal with whitelist checkbox (= passive SSH gateway = "Claude SSH from cloud" use case closed). Manual ban with type-`LOCK ME OUT` gate + Zod CIDR /0-/7 reject + dual-IP self-ban detection. Audit log REUSES `device_audit_log` (sentinel `device_id='fail2ban-host'`)
- Phase 47 — shared `diagnostics-section.tsx` scaffold hosting 3 cards (Capability Registry / Model Identity / App Health) per D-DIAGNOSTICS-CARD ~25% LOC saving. Capability registry diagnostic with 3-way categorization (`missing_lost` vs `missing_precondition` vs `disabled_by_user`) + atomic-swap resync via Lua RENAME script + user override re-apply. Model Identity 6-step diagnostic returned verdict `neither` → **Branch N taken** (no remediation needed, sacred file untouched). Per-user `apps.healthProbe` privateProcedure with PG scoping (anti-port-scanner) + 5s undici timeout
- Phase 48 — Live SSH session viewer as 3rd tab inside Phase 46's Security section. WebSocket `/ws/ssh-sessions` streams `journalctl -u ssh -o json --follow`. Click-to-ban cross-link to Phase 46's `ban-ip-modal.tsx` pre-populated via additive `initialIp?: string` prop (lifted state in `security-section.tsx`). 5000-line ring buffer + 4px scroll-tolerance. RBAC at WS handshake closes 4403 for non-admin

### What Worked
- **The 4-bucket verdict-driven branching pattern (Phase 47 FR-MODEL-02)** — Plan 47-01's read-only Mini PC diagnostic ran 6 SSH commands → returned verdict `neither` → Plan 47-03 took Branch N → no sacred-file edit needed → ~30% of Phase 47's potential complexity collapsed cleanly. **Lesson: verdict-driven plans where one branch is "do nothing because the system is already correct" are a power tool.** Phase 47 shipped as if Branch B were taken (full diagnostic surface) without paying the sacred-file ritual cost.
- **Cross-phase code reuse via additive props** — Phase 48's click-to-ban cross-link added 3 lines to Phase 46's `ban-ip-modal.tsx` (`initialIp?: string` optional prop + `useEffect` to pre-populate). Zero churn for Phase 46 callers, instant cross-link for Phase 48. Cheaper than refactoring or duplicating.
- **REUSE existing tables** — `device_audit_log` (Phase 46 fail2ban events) + `user_app_instances` (Phase 47 healthProbe scoping). Zero new migrations across the entire milestone. Postgres + tRPC + Zod existing primitives covered every requirement.
- **Mini PC fixture-based testing for Phase 46-01 + Phase 47-01** — instead of `vi.mock`-ing `child_process`, the diagnostic plans captured live Mini PC output and the unit tests pasted that output verbatim. W-20 pitfall avoided cleanly. Test fidelity stayed high.
- **Atomic-swap registry rebuild via Lua RENAME** — Plan 47-02's `ATOMIC_SWAP_LUA` script ensures mid-resync queries see EITHER old OR new set, never empty. 50-parallel-reads test asserted zero null observations. The pattern is reusable for any future Redis-backed cache that needs zero-empty-window invalidation.

### What Was Inefficient
- **Multiple verifier reports flagged the test:phaseN chain on Windows fails** (cmd.exe PATH propagation quirk for tsx). The chain works on Linux/Mini PC but local-dev runs need per-file invocation. Pre-existing issue, but it affected 4 plans' verification — a Windows-friendly PowerShell-based chain would be a v30+ ergonomic win.
- **Pattern mapper sometimes contradicts the prompt's UI directory hint** — Phase 46 prompt said `modules/docker-app/` but pattern map corrected to `routes/docker/security/`. Worked out fine, but reveals that prompts to pattern mapper should be intentionally vague about file locations and let it discover the convention.
- **`milestone.complete` SDK bug from v29.3 is still unfixed** — `gsd-sdk query milestone.complete v29.4 --name "..."` would still fail with "version required for phases archive" because `milestoneComplete` calls `phasesArchive([], projectDir)` with empty arg array. Worked around manually by calling `phases.archive v29.4` directly. Should be fixed at gsd-sdk source level — file an upstream bug.
- **80+ commits ahead of origin** is excessive — should have pushed at end of each phase. Push deferred since v29.3 close has now accumulated to ~85+ commits across both milestones.

### Patterns Established
- **Verdict-driven branched remediation** (Phase 47 FR-MODEL-02 pattern): Plan N captures diagnostic verdict → Plan N+1 has K branches (one per verdict bucket) → executor picks branch at runtime → "do nothing" branch (Branch N) is a valid first-class option. Future "diagnose-then-fix" phases inherit this shape.
- **Live-fixture unit testing** (Phase 46-01, Phase 47-01): SSH-capture-from-Mini-PC → paste verbatim into test file → `tsx` + `node:assert/strict` (NOT vitest). Prevents `vi.mock('child_process')` anti-pattern. Reusable for any phase touching system binaries.
- **Additive cross-phase props** (Phase 48 → Phase 46 ban modal): optional prop with default + useEffect pre-populate. Zero churn for existing callers. Pattern works for any "Phase N adds new caller of Phase N-K's component" scenario.
- **D-DIAGNOSTICS-CARD shared scaffold** (Phase 47): one section component + N cards (where N can be different requirement IDs). ~25% LOC saving over N separate sections. Pattern reusable for any "multiple admin diagnostics under one Settings card" scenario.

### Key Lessons
1. **Verdict-driven plans are a force multiplier when the verdict can be "system is already correct".** v29.4 Phase 47 saved a sacred-file-ritual + integrity-test re-pin + ~30 LOC remediation by simply running the 6-step diagnostic FIRST. Future "we think X is broken" investigations should ALWAYS land Plan-N-diagnostic before Plan-N+1-fix.
2. **REUSE existing tables aggressively.** v29.4 added 12 new tRPC routes + 4 new modules + 7 new UI components and ZERO new database migrations. The cost of "should I add a new table?" is almost always higher than "can I reuse an existing one with a sentinel value?"
3. **Push at every phase boundary, not at milestone close.** ~85+ commits ahead is too much. The risk of force-needing-to-rebase or losing local work scales linearly with commit lag.
4. **The integrity-test ritual stays cheap when verdicts allow Branch N.** Phase 47 didn't pay any D-40-01 ritual cost because verdict=neither. Phase 45's audit-only re-pin (no source change) is the second-cheapest variant. Variant ordering for cost: Branch-N (zero cost) < audit-only re-pin (test constant only) < behavior-preserving surgical edit (full ritual).

### Cost Observations
- Model mix: ~75% opus (planner + executor), ~20% sonnet (verifier + integration check), ~5% haiku (status queries)
- Sessions: 1 long autonomous session ("herseye otonom devam et" — user went out)
- Notable: Phase 47 was the largest phase by surface area (5 plans, ~21 files, atomic-swap concurrency proof) but Branch N collapsed the FR-MODEL-02 portion into "ship diagnostic surface only" — saved an estimated ~40% of planned effort. Phase 46 was the largest by file count (~21 files including 5 UI components) but the kitchen-sink Fail2ban scope (table-stakes + last-attempted-user + manual-ban + mobile cellular toggle) all shipped in 5 plans without scope cuts.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v19.0 | 5 | 10 | First milestone with decimal sub-phase (10.1), integration checker at audit |
| v27.0 | 7 | 15 | First milestone with `workflow.skip_discuss=true` + auto-generated CONTEXT.md (Phases 22-23); first milestone with `type: tdd` plans shipping AI-bound code paths |
| v28.0 | 6 | 12 | First UI-only milestone (zero new backend modules — only schema additions + WS envId extensions). First milestone with `workflow.ui_phase=false` (skipped UI-SPEC interactive flow). Largest cleanup task (Plan 27-02 deleted 5607 lines via 4-grep gate). First milestone where backend foundation hypothesis (v27 → v28 reuse) was validated end-to-end. |
| v29.3 | 6 | 28 | First milestone shipped with `gaps_found` accepted (debt routed to next-milestone MILESTONE-CONTEXT.md instead of being closed by a gap-closure phase). First milestone with sacred-file surgical-edit ritual (Phase 40 D-40-01) — re-pinned BASELINE_SHA + documenting comment + integrity test invariant. First milestone where 0/6 phases produced VERIFICATION.md artifacts (UAT-deferred per `<scope_boundaries>`); 3-source matrix degraded all 17 reqs to `partial` before audit overlay. First milestone with explicit user-driven feature drop mid-close (FR-MARKET-02 MiroFish). |
| v29.4 | 4 | 17 | First milestone closed `passed` (zero gaps, zero scope creep, zero unsatisfied reqs). First milestone with verdict-driven Branch N (FR-MODEL-02 verdict=neither → no remediation needed → ~40% effort saved). First milestone with shared UI scaffold pattern (D-DIAGNOSTICS-CARD — 3 cards under 1 section). First milestone with sacred file BYTE-IDENTICAL across ALL phases (1 audit-only re-pin in Plan 45-01, no surgical edits). First milestone with zero new dependencies AND zero new database migrations across all 4 phases. Cleanest v29.x close to date. |

### Cumulative Quality

| Milestone | Verification Score | Integration Gaps | Tech Debt Items |
|-----------|-------------------|------------------|-----------------|
| v19.0 | 43/43 must-haves (100%) | 2 cross-phase gaps | 7 items |
| v27.0 | 90/90 must-haves (100%, 14 deferred to live-LLM/cron UAT) | 0 cross-phase gaps | 14 deferred-feature (v28) + 5 pre-existing-noise + 4 runtime-validation |
| v28.0 | 20/20 DOC requirements (100%, 45 deployment-time UAT items) | 0 cross-phase gaps; 9/9 integrations + 4/4 E2E flows verified | 10 info-severity (URL-bar form, per-env CPU pill, registry audit-log entries — all v29.0+) |
| v29.3 | 15/17 mechanism-satisfied + 1 partial-debt + 1 dropped (FR-MARKET-02 MiroFish) | 4 cross-phase gaps (broker 429 path / OpenAI SSE usage chunk / 5 tRPC routes off httpOnlyPaths / sacred file SHA drift) — all routed to v29.4 carry-forward sweep | 17 items across 6 phases + milestone level (6 manual UATs un-executed, 329 + 534 pre-existing TS errors not fixed, sacred-file SHA stale, ~44 commits ahead of origin/master) |
| v29.4 | 18/18 mechanism-satisfied (cleanest close) | 0 cross-phase gaps; 5/5 seams + 5/5 E2E flows verified | ~6 items across 4 phases + milestone level (4 v29.4 UATs un-executed, 6 v29.3 UATs still pending, atomic-swap syncAll documented stub for v29.5+, ~85 commits ahead of origin/master) |

### Top Lessons (Verified Across Milestones)

1. Always verify background jobs are wired to startup — exported but unimported is dead code
2. Cross-phase message handlers need bidirectional validation during planning
