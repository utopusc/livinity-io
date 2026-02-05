/**
---
name: research
description: Deep web research — investigates any topic using search, scraping, and memory. Returns comprehensive research reports.
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
  - ^(research|investigate|deep dive)
  - what is\s
  - market analysis
  - ^analyze\s
phases:
  - research
  - plan
  - execute
model_tier: sonnet
max_turns: 15
max_tokens: 150000
timeout_ms: 300000
---
*/

import path from 'node:path';
import type { SkillContext, SkillResult } from '../packages/core/dist/skill-types.js';
import { researchPrompt, planPrompt, executePrompt } from '../packages/core/dist/prompts.js';
import { buildLearnedEntry, buildFailedEntry } from '../packages/core/dist/utils.js';

const NEXUS_OUTPUT_DIR = process.env.NEXUS_OUTPUT_DIR || '/opt/nexus/output';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const topic = ctx.message.replace(/^[!\/]?\s*(research|investigate|deep dive|analyze)\s*/i, '').trim();
  if (!topic) {
    return { success: false, message: 'What should I research? Example: !research what is Next.js' };
  }

  await ctx.sendProgress(`Researching: "${topic}" — starting research phase...`);

  // ── PHASE 1: RESEARCH ──
  const researchResult = await ctx.runAgent({
    task: `Research the following topic thoroughly: "${topic}"

Gather information from multiple sources:
1. First check memory for any existing knowledge about this topic
2. Search the web for current, authoritative information
3. Scrape 2-3 relevant pages for detailed content
4. Synthesize findings into a structured research summary`,
    systemPrompt: researchPrompt([
      'web_search', 'scrape', 'memory_search', 'task_state',
    ]),
    tools: ['web_search', 'scrape', 'memory_search', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  if (!researchResult.success) {
    const failEntry = buildFailedEntry(topic, 'web research', researchResult.answer, 'research');
    await ctx.executeTool('memory_add', { content: failEntry, tags: 'failure:research' });
    return { success: false, message: `Research failed: ${researchResult.answer}` };
  }

  await ctx.sendProgress(`Research phase complete. Now creating structured report...`);

  // ── PHASE 2: PLAN (outline the report) ──
  const planResult = await ctx.runAgent({
    task: `Create a structured outline for a comprehensive research report on: "${topic}"

The outline should organize the research findings into clear sections.`,
    systemPrompt: planPrompt(['task_state']),
    contextPrefix: `## Research Findings\n${researchResult.answer}`,
    tools: ['task_state'],
    tier: 'flash',
    maxTurns: 3,
  });

  // ── PHASE 3: EXECUTE (synthesize final report) ──
  const researchOutputPath = path.join(NEXUS_OUTPUT_DIR, `research-${Date.now()}.md`);
  const executeResult = await ctx.runAgent({
    task: `Write a comprehensive research report on: "${topic}"

Use the research findings and outline to create a well-structured report.
Save the report to a file at ${researchOutputPath}
Also save key findings to memory for future reference.`,
    systemPrompt: executePrompt([
      'files', 'memory_add', 'task_state',
    ]),
    contextPrefix: `## Research Findings\n${researchResult.answer}\n\n## Report Outline\n${planResult.answer}`,
    tools: ['files', 'memory_add', 'task_state'],
    tier: 'sonnet',
    maxTurns: 5,
  });

  // Learning: save successful approach
  const learnEntry = buildLearnedEntry(
    `research: ${topic}`,
    'web_search -> scrape -> synthesize -> save report',
    ['web_search', 'scrape', 'memory_search', 'memory_add', 'files'],
    'research',
  );
  await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:research' });

  return {
    success: executeResult.success,
    message: executeResult.answer,
    data: {
      topic,
      phases: {
        research: { turns: researchResult.turns, success: researchResult.success },
        plan: { turns: planResult.turns, success: planResult.success },
        execute: { turns: executeResult.turns, success: executeResult.success },
      },
    },
  };
}
