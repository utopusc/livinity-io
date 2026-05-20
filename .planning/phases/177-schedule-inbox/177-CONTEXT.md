# Phase 177: Schedule Engine + Inbox System

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 177 + D-V38-P/S
**Wave:** 6 (sequential — depends 171, 176; all Wave 5 phases must complete first)

<domain>
## Phase Boundary

Extend Phase 164 autonomous-scheduler with per-Agent cron registry (node-cron). Build inbox writer + UI. Liv's `run_agent` tool wired to the scheduler.

**Phase 177 sonu:**
- Per-Agent cron schedule from `item.json.schedule` (cron string)
- `node-cron` integrated into Phase 164 scheduler (additive — Phase 164 core file STAYS byte-identical, new scheduler-extension file added)
- Agent run produces `~/liv/items/<uuid>/inbox/<runId>.md` with frontmatter (`runAt`, `triggeredBy: cron|manual`, `status: success|failed`, `tokens`, `cost`)
- Cross-Item global inbox view = filesystem walker (no separate storage)
- Run-lock prevents double-fires (`liv:agent:running:<id>` Redis key, TTL = max run duration)
- UI: inbox badge on SidebarTree row (unread count), inbox list in AgentDetail, global inbox view as new top-bar item
</domain>

<decisions>

### Plan 177-01: node-cron extension + per-Agent schedule registry
- NEW `vault-items/agent-schedule.ts` — reads `item.json.schedule`, registers with node-cron
- MOD Phase 164 scheduler ADDITIVE: new `scheduleAgent(agentId, cron)` + `unscheduleAgent(agentId)` exports
- Boot sweep: on livinityd start, walk all AgentItems → schedule the ones with cron
- Acceptance: 10 vitest assertions — boot sweep registers all, cron string validation, unschedule cleans node-cron tasks

### Plan 177-02: Agent runner + inbox writer
- NEW `vault-items/agent-runner.ts` — spawns CC PTY session for the agent (reuse Phase 166 manager.ts), captures output, writes to `inbox/<runId>.md`
- Run-lock via Redis (`liv:agent:running:<id>`, TTL 15min)
- Frontmatter on inbox entry: runAt, triggeredBy, durationMs, status, tokenUsage (when available)
- Acceptance: 12 vitest assertions — run isolation, lock prevents double-fire, inbox entry shape

### Plan 177-03: Inbox tRPC + filesystem walker
- NEW `vault-items/inbox-reader.ts` — walks `items/*/inbox/*.md` for global view
- NEW tRPC `vault.inbox.{listByAgent, listGlobal, markRead, get}`
- Acceptance: 8 vitest assertions — pagination, sort by recency, unread filter

### Plan 177-04: Inbox UI (badge + AgentDetail list + global view)
- MOD `<ItemTreeRow>` (Phase 174) — adds unread-count badge for AgentItem rows
- MOD `<AgentDetail>` (Phase 175) — wire inbox preview list (last 3 + view-all)
- NEW `<GlobalInboxWindow>` — top-bar-launchable view of all agent inboxes, sortable, filterable
- Acceptance: 10 vitest assertions
</decisions>

<canonical_refs>
- Master plan § D-V38-P (node-cron choice), D-V38-S (inbox filesystem-as-index)
- `livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts` (Phase 164 — DO NOT MODIFY core)
- `vault-items/tools/liv-tools.ts` (Phase 176 — `run_agent` tool wraps the agent-runner)
- `livos/packages/livinityd/source/modules/cc-pty/manager.ts` (substrate for agent's tmux session)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 177-01 | NEW vault-items/agent-schedule.ts + test; MOD scheduler/index.ts (additive export only) |
| 177-02 | NEW vault-items/agent-runner.ts + test |
| 177-03 | NEW vault-items/inbox-reader.ts + test; NEW server/trpc/inbox-router.ts + test |
| 177-04 | MOD ItemTreeRow (badge); MOD AgentDetail (list); NEW features/inbox/GlobalInboxWindow.tsx + test |

**Sacred guards:** Phase 164 scheduler.ts core STAYS byte-identical — only additive new methods exported.

</specifics>

<deferred>
- Agent run cost tracking dashboard → v38.1
- Inbox auto-archive after N days → v38.1
- Webhook/Email forwarding from inbox → v39
</deferred>

---

*Phase: 177-schedule-inbox*
*Wave: 6 (sequential — depends 171, 176)*
*Depends on: Phase 171, 176*
*Estimated: ~2 days agent work*
