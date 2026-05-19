# Phase 164: Autonomous Scheduler + Sample Agents

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, depends on Phase 163 SHIPPED)
**Source:** v34-LIVOS-CC-INTEGRATION-MASTER.md decisions D-V34-G

<domain>
## Phase Boundary

Multi-instance vision'ın "background autonomous agent" parçası. User uyurken / başka iş yaparken arka planda CC agent'ları cron/event tetikleyici ile çalışır, sonuçlarını vault/inbox/'a yazar.

User Obsidian'da inbox'ı okur → ne yapıldı görür → istenmeyen şeyse agent'ı disable eder, istenen şeyse kabul eder.

**Single-user (bruce), tek vault, paralel max 3 autonomous + interactive concurrent.**

</domain>

<decisions>
## Implementation Decisions

### Plan 164-01: Agent Definition Format + Parser

**Format:** vault/livos-agents/<agent-name>.md with YAML frontmatter:

```markdown
---
name: nightly-backup-audit
schedule: "0 3 * * *"           # cron expression
model: claude-sonnet-4-6        # default tier
max_turns: 15
max_budget_usd: 3
allowed_tools: ["Read", "Bash", "Glob", "Grep"]
mcp_servers: ["luse", "filesystem"]
enabled: true                   # toggle without deleting
---

# Nightly Backup Audit

Read /opt/livos/data/backups/ and report:
- Latest backup timestamp
- Total size + delta from yesterday
- Any failed/incomplete backups in journal
- Disk pressure (>80% on /opt mount)

Write findings to `vault/inbox/{{timestamp}}_backup-audit.md` with status (PASS/WARN/FAIL) in frontmatter.
```

**Parser module:** `livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.ts`

**Validation:**
- Required: `name`, `schedule`, `model`
- Optional: max_turns (default 20), max_budget_usd (default 5), allowed_tools (default Read+Bash+Glob+Grep), mcp_servers (default []), enabled (default true)
- Schedule must be valid cron (use `cron-parser` package — already in deps? Verify Phase 164-01 plan, fallback to manual regex)
- Body = the prompt sent to the agent

### Plan 164-02: Scheduler Module

**Module:** `livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts`

**Boot flow:**
1. At livinityd start, after vault scaffolder + auth verifier:
2. Check Redis flag `liv:config:autonomous_enabled` (default `false` — explicit opt-in)
3. If enabled: read `vault/livos-agents/*.md`, parse each, register cron jobs
4. Each job at trigger:
   - Check Redis daily budget cap: `redis.get('liv:autonomous:daily_spend_cents:<YYYY-MM-DD>')` vs cap
   - Check concurrent autonomous: `redis.get('liv:autonomous:active_count')` vs `liv:config:autonomous_max_concurrent`
   - If both green: spawn agent via SDK query() in headless mode
   - Increment active_count atomically; decrement on completion

**Spawn pattern (per D-V34-A SDK-direct):**
```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

async function runAutonomousAgent(def: AgentDefinition, vaultRoot: string) {
    const startedAt = new Date();
    const sessionKey = `autonomous:${def.name}:${startedAt.toISOString()}`;
    let totalCostUsd = 0;
    let resultText = '';
    let status: 'success' | 'error' | 'budget_exceeded' = 'success';
    
    try {
        const messages = query({
            prompt: def.body,
            options: {
                cwd: vaultRoot,                    // vault root (not surface) — autonomous = global
                settingSources: ['project'],
                mcpServers: buildMcpServers(def.mcp_servers),
                allowedTools: def.allowed_tools,
                maxTurns: def.max_turns,
                maxBudgetUsd: def.max_budget_usd,
                model: def.model,
                permissionMode: 'acceptEdits',     // autonomous can write files (to vault/inbox specifically)
                persistSession: false,
                env: { HOME: '/root', PATH: process.env.PATH },
            },
        });
        
        for await (const msg of messages) {
            if (msg.type === 'result') {
                totalCostUsd = (msg as any).total_cost_usd ?? 0;
                resultText = (msg as any).result ?? '';
                break;
            }
        }
    } catch (err: any) {
        status = 'error';
        resultText = `Agent execution failed: ${err.message}`;
    }
    
    // Writeback to inbox
    await writeInboxEntry(vaultRoot, def, startedAt, status, totalCostUsd, resultText);
    
    // Update daily spend
    const dateKey = startedAt.toISOString().slice(0, 10);
    await redis.incrby(`liv:autonomous:daily_spend_cents:${dateKey}`, Math.round(totalCostUsd * 100));
    await redis.expire(`liv:autonomous:daily_spend_cents:${dateKey}`, 86400 * 2);
}
```

### Plan 164-03: Inbox Writeback

**Module:** `livos/packages/livinityd/source/modules/autonomous-scheduler/inbox-writer.ts`

**File pattern:** `vault/inbox/<YYYY-MM-DD>_<HH-MM>_<agent-name>.md`

**Content shape:**
```markdown
---
agent: nightly-backup-audit
status: success
started: 2026-05-20T03:00:00Z
duration_ms: 47312
cost_usd: 0.42
turns: 4
model: claude-sonnet-4-6
---

# Nightly Backup Audit — 2026-05-20

[Agent's result text here, as generated]

Backlinks:
- [[livos-agents/nightly-backup-audit]] — agent definition
- [[references/mini-pc]] — context referenced
```

User opens Obsidian, sees inbox notes appear at scheduled times. Click → full report. Graph view shows agent → output links.

### Plan 164-04: Sample Autonomous Agents

Two sample agents shipped in `vault-templates/livos-agents/` (Phase 162-01 scaffolder copies on first boot):

**1. nightly-backup-audit.md** — as shown above.

**2. pr-watcher.md:**
```markdown
---
name: pr-watcher
schedule: "*/30 * * * *"     # every 30 minutes
model: claude-haiku-4-5
max_turns: 5
max_budget_usd: 0.50
allowed_tools: ["Bash", "Read"]
enabled: false               # user opts in explicitly
---

# PR Watcher

Check `gh pr list --json number,title,labels,reviews,author,createdAt --repo utopusc/livinity-io` for:
- PRs awaiting review (no reviews + author != "Livinity User")
- PRs blocked (status=BLOCKED label)

Write to `vault/inbox/{{timestamp}}_pr-watcher.md` ONLY IF something needs attention. Else write nothing.
```

**Both ship `enabled: false`** by default — user must edit + flip to `true` to activate (safety).

### Plan 164-05: Mini PC Deploy + Manual Trigger Smoke Test

1. Deploy
2. Verify vault/livos-agents/ contains both samples
3. Manually flip `enabled: true` on nightly-backup-audit
4. Set Redis flag `liv:config:autonomous_enabled` = `true`
5. Trigger via Redis test command (Phase 164-02 implements `livos-autonomous-trigger <agent-name>` CLI)
6. Verify inbox entry appears
7. Verify daily spend counter incremented
8. Revert: `enabled: false` + autonomous_enabled = false (safety after smoke)

**Acceptance:**
- Manual trigger produces inbox entry within 60s
- Inbox entry frontmatter complete (cost, duration, status)
- Subsequent run within same day shares spend counter
- Concurrent cap honored (spawn 4, only 3 run, 4th queued)

</decisions>

<canonical_refs>
- Master + Phase 162/163 contexts
- Phase 161 (chat path) — unchanged
- Existing scheduler patterns in livinityd: `livos/packages/livinityd/source/modules/scheduler/` (if exists; otherwise create alongside this module)
</canonical_refs>

<deferred>
- Dock notification on inbox new entries → Phase 165
- Settings UI for editing agents → Phase 165
- Memory linter → Phase 165
</deferred>

---

*Phase: 164-autonomous-scheduler*
*Depends on: Phase 163 SHIPPED*
*Approach: autonomous*
*Estimated: ~5-7 saat*
