# Phase 23: AI-Powered Docker Diagnostics — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Leverage Kimi AI to turn Docker management from manual-reading-of-logs into proactive plain-English guidance — the capability no competing Docker manager can replicate.

**Depends on:** Phase 17 (AI tool breadth, Kimi integration), Phase 19 (vulnerability scanning, scanImage + cached results)

**Requirement IDs in scope:** AID-01, AID-02, AID-03, AID-04, AID-05

**Success criteria from ROADMAP:**

1. Container detail has an "AI Diagnose" button; clicking sends last 200 log lines + resource stats + image info to Kimi and returns a plain-English summary: likely cause, suggested action, confidence.
2. Backend scheduler polls `docker stats` + `getEngineInfo` every 5 minutes; when a container's memory usage exceeds 80% of its limit OR CPU throttling is active, AI surfaces a proactive notification ("your postgres container will OOM in ~10 minutes").
3. Stack create UI has a "Generate from prompt" button; user types "Nextcloud with Redis and MariaDB, expose on 8080"; AI returns a valid compose YAML user can review and deploy.
4. After a vulnerability scan, AI can explain the most critical CVEs in plain language and suggest concrete upgrade paths ("CVE-2024-XXXX in nginx:1.24 → upgrade to nginx:1.27-alpine").
5. AI Chat sidebar recognizes queries like "why is my X container slow/failing" and automatically pulls container diagnostics without the user manually specifying logs.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting (workflow.skip_discuss=true). Use the ROADMAP goal, success criteria, codebase conventions, and existing patterns from Phase 17 (Kimi integration, AI tool breadth) and Phase 19 (vuln scan cache) to guide decisions.

### Likely Patterns (from prior-phase precedent)
- AI calls go through Kimi via the Phase 17 expanded tool surface (existing `nexus/packages/core/src/providers/kimi.ts`); add new tools rather than spinning up a parallel AI runtime.
- Backend tRPC route per AI feature: `docker.diagnoseContainer`, `docker.generateComposeFromPrompt`, `docker.explainVulnerabilities` (or extend existing scanImage result with a follow-on AI analysis route). Mutations on `httpOnlyPaths` per the documented WS-mutation hang gotcha.
- Proactive resource-pressure scheduler: extend the Phase 20 node-cron registry with a new built-in handler `ai-resource-watch` (default `enabled: false`, 5-minute schedule). Re-uses `BUILT_IN_HANDLERS` pattern.
- "Why is my X container slow" intent recognition: register a new MCP/tool definition the existing AI chat agent can invoke; let the LLM router decide when to call it rather than hand-rolling regex intent matching.
- Token budget control: send container logs trimmed to last 200 lines (matches success criterion), redact secret env values before sending to Kimi, cache responses in Redis keyed by `container_id + log_tail_hash` for 5 minutes.

### Open Decisions Deferred to Plan-Phase
- Number of plans (likely 2 per ROADMAP — split foundation+chat from compose-gen+CVE-explain, or split sync features from proactive scheduler)
- Whether to add a new "AI Insights" tab in container detail or a slide-over drawer
- Notification surface for proactive alerts (toast / Settings > Scheduler row / chat sidebar message)

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Anchor points the planner should examine:

- `nexus/packages/core/src/providers/kimi.ts` — Kimi provider, ~800 lines (model: `kimi-for-coding`)
- `nexus/packages/core/src/tools/` — existing AI tool registry (Phase 17 expanded `docker_manage`)
- `livos/packages/livinityd/source/modules/docker/docker.ts` — container/image/log helpers
- `livos/packages/livinityd/source/modules/docker/vuln-scan.ts` — Phase 19 scan + Redis cache
- `livos/packages/livinityd/source/modules/scheduler/index.ts` — Phase 20 node-cron registry, `BUILT_IN_HANDLERS`
- `livos/packages/livinityd/source/modules/docker/stacks.ts` — `deployStack` entry; AI compose-gen feeds into it
- `livos/packages/ui/src/routes/server-control/` — Containers/Images/Stacks tabs, where new AI buttons land

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description, success criteria, and AID-01..05 requirement entries in REQUIREMENTS.md (lines 56-60).

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
