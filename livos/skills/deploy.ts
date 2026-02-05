/**
---
name: deploy
description: Autonomous deployment and installation — researches, plans, executes, and verifies server deployments with rollback safety.
type: autonomous
tools:
  - shell
  - files
  - docker_manage
  - docker_exec
  - docker_list
  - pm2
  - web_search
  - scrape
  - memory_search
  - memory_add
  - task_state
  - progress_report
triggers:
  - ^(deploy|install)
  - ^(setup|configure)\s
  - app.*deploy
  - ssl.*(setup|add|install)
  - nginx.*(setup|install|configure)
phases:
  - research
  - plan
  - execute
  - verify
model_tier: sonnet
max_turns: 20
max_tokens: 200000
timeout_ms: 600000
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';
import { researchPrompt, planPrompt, executePrompt, verifyPrompt, buildLearnedEntry, buildFailedEntry } from '@nexus/core/lib';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const task = ctx.message.replace(/^[!\/]?\s*(deploy|install|setup|configure)\s*/i, '').trim();
  if (!task) {
    return { success: false, message: 'What should I deploy/install? Example: !deploy nginx with SSL for example.com' };
  }

  await ctx.sendProgress(`Deployment task: "${task}" — starting research phase...`);

  // ── PHASE 1: RESEARCH ──
  const researchResult = await ctx.runAgent({
    task: `Research how to: ${task}

1. Check memory for any previous deployment approaches for this type of task
2. Search for current best practices, guides, and official documentation
3. Check if the software/service is already installed (use shell: which, dpkg -l, docker ps, etc.)
4. Note any prerequisites, dependencies, or conflicts
5. Identify the specific version to install and any configuration requirements`,
    systemPrompt: researchPrompt([
      'web_search', 'scrape', 'memory_search', 'shell', 'docker_list', 'task_state',
    ]),
    tools: ['web_search', 'scrape', 'memory_search', 'shell', 'docker_list', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  if (!researchResult.success) {
    return { success: false, message: `Deployment research failed: ${researchResult.answer}` };
  }

  await ctx.sendProgress(`Research complete. Planning deployment steps...`);

  // ── PHASE 2: PLAN (with rollback steps) ──
  const planResult = await ctx.runAgent({
    task: `Create a detailed deployment plan for: ${task}

Requirements for the plan:
1. List prerequisites and pre-checks
2. Include backup steps BEFORE any modifications (e.g., backup configs)
3. Number each step with the specific command/tool to use
4. Include verification after each critical step
5. Include rollback steps if something goes wrong
6. Note which steps are destructive and which are safe`,
    systemPrompt: planPrompt(['task_state']),
    contextPrefix: `## Deployment Research\n${researchResult.answer}`,
    tools: ['task_state'],
    tier: 'sonnet',
    maxTurns: 5,
  });

  await ctx.sendProgress(`Plan ready. Executing deployment...`);

  // ── PHASE 3: EXECUTE ──
  const executeResult = await ctx.runAgent({
    task: `Execute the deployment plan for: ${task}

IMPORTANT SAFETY RULES:
- Back up any config files before modifying them
- Check if services are already running before installing
- Verify each step succeeded before moving to the next
- If a step fails, try ONE alternative, then report failure
- Send progress updates for each major step`,
    systemPrompt: executePrompt([
      'shell', 'files', 'docker_manage', 'docker_exec', 'docker_list', 'pm2',
      'task_state', 'progress_report',
    ]),
    contextPrefix: `## Research\n${researchResult.answer}\n\n## Plan\n${planResult.answer}`,
    tools: ['shell', 'files', 'docker_manage', 'docker_exec', 'docker_list', 'pm2', 'task_state', 'progress_report'],
    tier: 'sonnet',
    maxTurns: 18,
  });

  if (!executeResult.success) {
    await ctx.sendProgress(`Deployment encountered issues. Running verification...`);
    const failEntry = buildFailedEntry(task, planResult.answer.slice(0, 500), executeResult.answer.slice(0, 500), 'deploy');
    await ctx.executeTool('memory_add', { content: failEntry, tags: 'failure:deploy' });
  } else {
    await ctx.sendProgress(`Deployment executed. Verifying results...`);
  }

  // ── PHASE 4: VERIFY ──
  const verifyResult = await ctx.runAgent({
    task: `Verify the deployment of: ${task}

Check actual system state:
1. Is the service/app running? (systemctl, docker ps, pm2 list, pgrep)
2. Is it responding? (curl, wget, nc)
3. Are ports open? (ss -tuln, netstat)
4. Are config files correct? (read and check)
5. Are logs clean? (check for errors)
6. Is it accessible from outside? (curl with domain/IP)`,
    systemPrompt: verifyPrompt([
      'shell', 'files', 'docker_list', 'docker_manage', 'pm2', 'task_state',
    ]),
    contextPrefix: `## Execution Results\n${executeResult.answer}`,
    tools: ['shell', 'files', 'docker_list', 'docker_manage', 'pm2', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  // Learning
  if (executeResult.success) {
    const learnEntry = buildLearnedEntry(
      `deploy: ${task}`,
      planResult.answer.slice(0, 500),
      ['shell', 'files', 'docker_manage', 'pm2'],
      'deploy',
    );
    await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:deploy' });
  }

  return {
    success: executeResult.success,
    message: verifyResult.answer,
    data: {
      task,
      phases: {
        research: { turns: researchResult.turns, success: researchResult.success },
        plan: { turns: planResult.turns, success: planResult.success },
        execute: { turns: executeResult.turns, success: executeResult.success },
        verify: { turns: verifyResult.turns, success: verifyResult.success },
      },
    },
  };
}
