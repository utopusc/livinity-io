/**
 * AUTONOMOUS SKILL TEMPLATE
 *
 * This is a reference template for creating new autonomous skills.
 * Files in _templates/ are NOT loaded by the SkillLoader (underscore prefix is ignored).
 *
 * Copy this file to skills/<your-skill-name>.ts and customize.
 */

/**
---
name: my-skill
description: Description of what this skill does
type: autonomous
tools:
  - web_search
  - scrape
  - memory_search
  - memory_add
  - files
  - task_state
  - progress_report
triggers:
  - ^(trigger1|trigger2)
  - keyword pattern
phases:
  - research
  - plan
  - execute
  - verify
model_tier: sonnet
max_turns: 15
max_tokens: 150000
timeout_ms: 300000
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';
import { researchPrompt, planPrompt, executePrompt, verifyPrompt, buildLearnedEntry, buildFailedEntry } from '@nexus/core/lib';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  // 1. Extract the task from the message
  const task = ctx.message.replace(/^[!\/]?\s*(trigger1|trigger2)\s*/i, '').trim();
  if (!task) {
    return { success: false, message: 'What should I do? Example: !trigger1 something' };
  }

  await ctx.sendProgress(`Starting: "${task}"`);

  // ── PHASE 1: RESEARCH ──
  // Check memory, search web, gather information
  const researchResult = await ctx.runAgent({
    task: `Research how to: ${task}`,
    systemPrompt: researchPrompt(['web_search', 'scrape', 'memory_search', 'task_state']),
    tools: ['web_search', 'scrape', 'memory_search', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  if (!researchResult.success) {
    const failEntry = buildFailedEntry(task, 'research phase', researchResult.answer, 'my-skill');
    await ctx.executeTool('memory_add', { content: failEntry, tags: 'failure:my-skill' });
    return { success: false, message: `Research failed: ${researchResult.answer}` };
  }

  await ctx.sendProgress(`Research complete. Planning...`);

  // ── PHASE 2: PLAN ──
  // Create a step-by-step execution plan
  const planResult = await ctx.runAgent({
    task: `Create an execution plan for: ${task}`,
    systemPrompt: planPrompt(['task_state']),
    contextPrefix: `## Research\n${researchResult.answer}`,
    tools: ['task_state'],
    tier: 'flash',
    maxTurns: 3,
  });

  await ctx.sendProgress(`Plan ready. Executing...`);

  // ── PHASE 3: EXECUTE ──
  // Follow the plan step by step
  const executeResult = await ctx.runAgent({
    task: `Execute the plan for: ${task}`,
    systemPrompt: executePrompt(['files', 'memory_add', 'task_state', 'progress_report']),
    contextPrefix: `## Research\n${researchResult.answer}\n\n## Plan\n${planResult.answer}`,
    tools: ['files', 'memory_add', 'task_state', 'progress_report'],
    tier: 'sonnet',
    maxTurns: 12,
  });

  if (!executeResult.success) {
    const failEntry = buildFailedEntry(task, planResult.answer.slice(0, 500), executeResult.answer.slice(0, 500), 'my-skill');
    await ctx.executeTool('memory_add', { content: failEntry, tags: 'failure:my-skill' });
  }

  await ctx.sendProgress(`Execution complete. Verifying...`);

  // ── PHASE 4: VERIFY ──
  // Check that everything was done correctly
  const verifyResult = await ctx.runAgent({
    task: `Verify the results of: ${task}`,
    systemPrompt: verifyPrompt(['files', 'task_state']),
    contextPrefix: `## Execution Results\n${executeResult.answer}`,
    tools: ['files', 'task_state'],
    tier: 'flash',
    maxTurns: 5,
  });

  // ── LEARNING ──
  // Save approach for future reference
  if (executeResult.success) {
    const learnEntry = buildLearnedEntry(task, planResult.answer.slice(0, 500), ['web_search', 'scrape', 'files'], 'my-skill');
    await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:my-skill' });
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
