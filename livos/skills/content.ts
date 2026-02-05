/**
---
name: content
description: Autonomous content creation — researches topics, creates outlines, writes full articles or blog posts.
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
  - ^write.*(article|blog|post|content|piece)
  - ^create.*(article|blog|post|content)
  - content.*create
  - blog.*write
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
import type { SkillContext, SkillResult } from '@nexus/core/lib';
import { researchPrompt, planPrompt, executePrompt, buildLearnedEntry } from '@nexus/core/lib';
import { paths } from '@livos/config';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const topic = ctx.message
    .replace(/^[!\/]?\s*(write|create|blog|content)\s*/i, '')
    .replace(/\s*(article|blog|post|content|piece|create|write)\s*/gi, ' ')
    .trim();

  if (!topic) {
    return { success: false, message: 'What should I write about? Example: !write blog post about AI automation' };
  }

  await ctx.sendProgress(`Content creation started: "${topic}"`);

  // ── PHASE 1: RESEARCH (existing content, angles, keywords) ──
  const researchResult = await ctx.runAgent({
    task: `Research for content creation about: "${topic}"

1. Check memory for any user preferences on writing style or tone
2. Search for existing popular content on this topic (to avoid repetition and find gaps)
3. Identify key angles, talking points, and trending aspects
4. Find relevant data, statistics, or examples to include
5. Note SEO keywords and search intent for this topic`,
    systemPrompt: researchPrompt([
      'web_search', 'scrape', 'memory_search', 'task_state',
    ]),
    tools: ['web_search', 'scrape', 'memory_search', 'task_state'],
    tier: 'sonnet',
    maxTurns: 8,
  });

  if (!researchResult.success) {
    return { success: false, message: `Content research failed: ${researchResult.answer}` };
  }

  await ctx.sendProgress(`Research done. Creating content outline...`);

  // ── PHASE 2: PLAN (outline) ──
  const planResult = await ctx.runAgent({
    task: `Create a detailed content outline for: "${topic}"

Based on the research, create:
1. A compelling title (and 2 alternatives)
2. Target audience and tone
3. Section-by-section outline with:
   - Section heading
   - Key points to cover
   - Data/examples to include
4. Call-to-action or conclusion angle
5. Estimated word count per section`,
    systemPrompt: planPrompt(['task_state']),
    contextPrefix: `## Content Research\n${researchResult.answer}`,
    tools: ['task_state'],
    tier: 'sonnet',
    maxTurns: 4,
  });

  await ctx.sendProgress(`Outline complete. Writing full content...`);

  // ── PHASE 3: EXECUTE (write full content) ──
  const outputPath = path.join(paths.output, `content-${Date.now()}.md`);
  const executeResult = await ctx.runAgent({
    task: `Write the full content piece about: "${topic}"

Requirements:
1. Follow the outline exactly
2. Write in a professional but engaging tone
3. Include relevant examples, data, and insights from research
4. Use proper formatting (headings, bullet points, bold for key terms)
5. Write a compelling introduction and strong conclusion
6. Target 1000-2000 words
7. Save the final content to ${outputPath}
8. Save the topic and approach to memory for future reference`,
    systemPrompt: executePrompt([
      'files', 'memory_add', 'task_state',
    ]),
    contextPrefix: `## Research\n${researchResult.answer}\n\n## Content Outline\n${planResult.answer}`,
    tools: ['files', 'memory_add', 'task_state'],
    tier: 'sonnet',
    maxTurns: 8,
  });

  // Learning
  const learnEntry = buildLearnedEntry(
    `content: ${topic}`,
    'research existing content -> outline -> write full piece -> save',
    ['web_search', 'scrape', 'files', 'memory_add'],
    'content',
  );
  await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:content' });

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
