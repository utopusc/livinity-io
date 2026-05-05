/**
---
name: leadgen-auto
description: Autonomous lead generation pipeline — finds companies, extracts contacts, validates and deduplicates results.
type: autonomous
tools:
  - web_search
  - scrape
  - memory_search
  - memory_add
  - files
  - shell
  - task_state
  - progress_report
triggers:
  - ^(lead|leadgen|prospect)
  - find (companies|leads|prospects|clients)
  - generate leads
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

import path from 'node:path';
import type { SkillContext, SkillResult } from '../packages/core/dist/skill-types.js';
import { researchPrompt, planPrompt, executePrompt, verifyPrompt } from '../packages/core/dist/prompts.js';
import { buildLearnedEntry, buildFailedEntry } from '../packages/core/dist/utils.js';

const NEXUS_OUTPUT_DIR = process.env.NEXUS_OUTPUT_DIR || '/opt/nexus/output';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const query = ctx.message.replace(/^[!\/]?\s*(lead|leadgen|prospect|generate leads|find (companies|leads|prospects|clients))\s*/i, '').trim();
  if (!query) {
    return { success: false, message: 'What leads should I find? Example: !lead SaaS companies in Germany' };
  }

  await ctx.sendProgress(`Lead generation started: "${query}"`);

  // ── PHASE 1: RESEARCH (find directories and sources) ──
  const researchResult = await ctx.runAgent({
    task: `Research the best sources to find leads matching: "${query}"

1. Check memory for any previous lead generation approaches
2. Search for business directories, industry databases, and listing sites relevant to this query
3. Identify 3-5 good sources (directories, LinkedIn company pages, industry lists, etc.)
4. Note the structure of each source (how to extract company info)`,
    systemPrompt: researchPrompt([
      'web_search', 'scrape', 'memory_search', 'task_state',
    ]),
    tools: ['web_search', 'scrape', 'memory_search', 'task_state'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  if (!researchResult.success) {
    return { success: false, message: `Lead research failed: ${researchResult.answer}` };
  }

  await ctx.sendProgress(`Found lead sources. Planning extraction strategy...`);

  // ── PHASE 2: PLAN (multi-query strategy) ──
  const planResult = await ctx.runAgent({
    task: `Create a lead extraction plan for: "${query}"

Based on the research findings, create a step-by-step plan to:
1. Search and scrape each identified source
2. Extract company names, URLs, emails, descriptions
3. Deduplicate and validate the results
4. Save to a structured format`,
    systemPrompt: planPrompt(['task_state']),
    contextPrefix: `## Lead Source Research\n${researchResult.answer}`,
    tools: ['task_state'],
    tier: 'flash',
    maxTurns: 3,
  });

  await ctx.sendProgress(`Plan ready. Executing lead extraction...`);

  // ── PHASE 3: EXECUTE (scrape + extract) ──
  const leadsOutputPath = path.join(NEXUS_OUTPUT_DIR, `leads-${Date.now()}.json`);
  const executeResult = await ctx.runAgent({
    task: `Execute the lead generation plan for: "${query}"

Follow the plan to scrape sources and extract lead data.
For each lead, try to capture: Company Name, Website, Email(s), Description, Location.
Save results as JSON to ${leadsOutputPath}
Also save a human-readable summary.`,
    systemPrompt: executePrompt([
      'web_search', 'scrape', 'files', 'shell', 'task_state', 'progress_report',
    ]),
    contextPrefix: `## Research\n${researchResult.answer}\n\n## Plan\n${planResult.answer}`,
    tools: ['web_search', 'scrape', 'files', 'shell', 'task_state', 'progress_report'],
    tier: 'sonnet',
    maxTurns: 15,
  });

  if (!executeResult.success) {
    const failEntry = buildFailedEntry(query, 'leadgen pipeline', executeResult.answer, 'leadgen-auto');
    await ctx.executeTool('memory_add', { content: failEntry, tags: 'failure:leadgen' });
    return { success: false, message: `Lead extraction failed: ${executeResult.answer}` };
  }

  await ctx.sendProgress(`Leads extracted. Verifying and cleaning data...`);

  // ── PHASE 4: VERIFY (dedup, validate formats) ──
  const verifyResult = await ctx.runAgent({
    task: `Verify the lead generation results for: "${query}"

1. Read the generated lead file(s)
2. Check for duplicates and remove them
3. Validate email formats (basic regex check)
4. Validate URLs are well-formed
5. Count total leads and report quality metrics
6. Save cleaned results back`,
    systemPrompt: verifyPrompt([
      'files', 'shell', 'task_state',
    ]),
    contextPrefix: `## Execution Results\n${executeResult.answer}`,
    tools: ['files', 'shell', 'task_state'],
    tier: 'flash',
    maxTurns: 8,
  });

  // Learning
  const learnEntry = buildLearnedEntry(
    `leadgen: ${query}`,
    'find sources -> plan extraction -> scrape & extract -> verify & dedup',
    ['web_search', 'scrape', 'files', 'shell'],
    'leadgen-auto',
  );
  await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:leadgen' });

  return {
    success: true,
    message: verifyResult.answer,
    data: {
      query,
      phases: {
        research: { turns: researchResult.turns, success: researchResult.success },
        plan: { turns: planResult.turns, success: planResult.success },
        execute: { turns: executeResult.turns, success: executeResult.success },
        verify: { turns: verifyResult.turns, success: verifyResult.success },
      },
    },
  };
}
