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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v19.0 | 5 | 10 | First milestone with decimal sub-phase (10.1), integration checker at audit |
| v27.0 | 7 | 15 | First milestone with `workflow.skip_discuss=true` + auto-generated CONTEXT.md (Phases 22-23); first milestone with `type: tdd` plans shipping AI-bound code paths |

### Cumulative Quality

| Milestone | Verification Score | Integration Gaps | Tech Debt Items |
|-----------|-------------------|------------------|-----------------|
| v19.0 | 43/43 must-haves (100%) | 2 cross-phase gaps | 7 items |
| v27.0 | 90/90 must-haves (100%, 14 deferred to live-LLM/cron UAT) | 0 cross-phase gaps | 14 deferred-feature (v28) + 5 pre-existing-noise + 4 runtime-validation |

### Top Lessons (Verified Across Milestones)

1. Always verify background jobs are wired to startup — exported but unimported is dead code
2. Cross-phase message handlers need bidirectional validation during planning
