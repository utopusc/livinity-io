/**
---
name: server-monitor
description: Smart server investigation — diagnoses problems, finds anomalies, and applies fixes autonomously.
type: autonomous
tools:
  - sysinfo
  - docker_list
  - docker_manage
  - docker_exec
  - pm2
  - shell
  - logs
  - memory_search
  - memory_add
  - files
  - task_state
  - progress_report
triggers:
  - ^(monitor|diagnose|investigate)
  - find.*problem
  - why.*(slow|down|crash|fail)
  - server.*problem
  - fix.*(server|issue|problem)
phases:
  - execute
  - verify
model_tier: sonnet
max_turns: 20
max_tokens: 150000
timeout_ms: 300000
---
*/

import type { SkillContext, SkillResult } from '../packages/core/dist/skill-types.js';
import { executePrompt, verifyPrompt } from '../packages/core/dist/prompts.js';
import { buildLearnedEntry } from '../packages/core/dist/utils.js';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const issue = ctx.message
    .replace(/^[!\/]?\s*(monitor|diagnose|investigate)\s*/i, '')
    .trim() || 'general server health check and anomaly detection';

  await ctx.sendProgress(`Server investigation started: "${issue}"`);

  // ── PHASE 1: EXECUTE (gather metrics + investigate) ──
  const executeResult = await ctx.runAgent({
    task: `Investigate server issue: "${issue}"

Perform a systematic investigation:

1. **System Overview**: Check CPU, RAM, disk, uptime (sysinfo)
2. **Process Check**: List running processes, find CPU/memory hogs (shell: ps aux --sort=-%cpu | head -20)
3. **Docker Health**: List all containers, check for crashed/restarting ones (docker_list)
4. **PM2 Status**: Check Node.js processes (pm2 list)
5. **Disk Space**: Check for full partitions (shell: df -h)
6. **Memory Pressure**: Check swap usage and OOM killer (shell: free -h && dmesg | grep -i oom | tail -5)
7. **Network**: Check listening ports and connections (shell: ss -tuln | head -20)
8. **Recent Logs**: Check system logs for errors (shell: journalctl --since "1 hour ago" -p err --no-pager | tail -30)
9. **Docker Logs**: For any unhealthy containers, check their logs

If you find issues:
- Try to fix simple problems (restart crashed services, clear temp files, etc.)
- For serious issues, document but don't make risky changes
- Send progress updates as you discover things`,
    systemPrompt: executePrompt([
      'sysinfo', 'docker_list', 'docker_manage', 'docker_exec', 'pm2',
      'shell', 'logs', 'files', 'memory_search', 'task_state', 'progress_report',
    ]),
    tools: [
      'sysinfo', 'docker_list', 'docker_manage', 'docker_exec', 'pm2',
      'shell', 'logs', 'files', 'memory_search', 'task_state', 'progress_report',
    ],
    tier: 'sonnet',
    maxTurns: 18,
  });

  await ctx.sendProgress(`Investigation complete. Verifying findings...`);

  // ── PHASE 2: VERIFY (confirm fixes and report) ──
  const verifyResult = await ctx.runAgent({
    task: `Verify the server investigation results for: "${issue}"

1. If any fixes were applied, verify they worked:
   - Check service is running (systemctl, docker ps, pm2 list)
   - Check resource usage improved
   - Check logs are clean after fix
2. Compile a diagnostic report:
   - Server Status: Healthy / Warning / Critical
   - Issues Found: [list]
   - Fixes Applied: [list]
   - Remaining Issues: [list]
   - Recommendations: [list]
3. Save any new findings to memory for future reference`,
    systemPrompt: verifyPrompt([
      'sysinfo', 'docker_list', 'pm2', 'shell', 'logs', 'files', 'memory_add', 'task_state',
    ]),
    contextPrefix: `## Investigation Results\n${executeResult.answer}`,
    tools: ['sysinfo', 'docker_list', 'pm2', 'shell', 'logs', 'files', 'memory_add', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  // Learning
  const learnEntry = buildLearnedEntry(
    `server-monitor: ${issue}`,
    'sysinfo -> processes -> docker -> pm2 -> disk -> memory -> network -> logs -> diagnose -> fix -> verify',
    ['sysinfo', 'docker_list', 'docker_manage', 'pm2', 'shell', 'logs'],
    'server-monitor',
  );
  await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:server-monitor' });

  return {
    success: true,
    message: verifyResult.answer,
    data: {
      issue,
      phases: {
        execute: { turns: executeResult.turns, success: executeResult.success },
        verify: { turns: verifyResult.turns, success: verifyResult.success },
      },
    },
  };
}
