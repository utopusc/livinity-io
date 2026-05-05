/**
---
name: site-audit
description: Autonomous website audit — checks SEO, performance, security headers, SSL, meta tags, and accessibility.
type: autonomous
tools:
  - web_search
  - scrape
  - shell
  - memory_search
  - memory_add
  - files
  - task_state
  - progress_report
triggers:
  - site.*audit
  - seo (audit|analysis|check)
  - ^(audit|check)\s.*site
  - website.*(check|audit|scan)
phases:
  - research
  - execute
  - verify
model_tier: sonnet
max_turns: 15
max_tokens: 150000
timeout_ms: 300000
---
*/

import path from 'node:path';
import type { SkillContext, SkillResult } from '../packages/core/dist/skill-types.js';
import { researchPrompt, executePrompt, verifyPrompt } from '../packages/core/dist/prompts.js';
import { buildLearnedEntry } from '../packages/core/dist/utils.js';

const NEXUS_OUTPUT_DIR = process.env.NEXUS_OUTPUT_DIR || '/opt/nexus/output';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  // Extract URL from message
  const urlMatch = ctx.message.match(/https?:\/\/[^\s]+/i) || ctx.message.match(/[\w.-]+\.[a-z]{2,}/i);
  const targetUrl = urlMatch ? (urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`) : '';

  if (!targetUrl) {
    return { success: false, message: 'Which site should I audit? Example: !audit site example.com' };
  }

  await ctx.sendProgress(`Starting site audit for: ${targetUrl}`);

  // ── PHASE 1: RESEARCH (check available audit approaches) ──
  const researchResult = await ctx.runAgent({
    task: `Prepare to audit the website: ${targetUrl}

1. Check memory for any previous audit approaches or known issues with this site
2. Search for current best practices in website auditing (SEO, security headers, performance)
3. Identify the key checks we should perform:
   - HTTP headers (security headers, HSTS, CSP, X-Frame-Options)
   - SSL certificate validity
   - Meta tags (title, description, OG tags, viewport)
   - Page load basics (response time)
   - Robots.txt and sitemap.xml presence
   - Mobile responsiveness indicators`,
    systemPrompt: researchPrompt([
      'web_search', 'memory_search', 'task_state',
    ]),
    tools: ['web_search', 'memory_search', 'task_state'],
    tier: 'flash',
    maxTurns: 6,
  });

  await ctx.sendProgress(`Research complete. Running audit checks on ${targetUrl}...`);

  // ── PHASE 2: EXECUTE (run all audit checks) ──
  const executeResult = await ctx.runAgent({
    task: `Perform a comprehensive website audit on: ${targetUrl}

Run these checks using available tools:
1. **Scrape the homepage** — extract meta tags, title, headings, links
2. **Check HTTP headers** — use shell with curl to check security headers:
   curl -sI ${targetUrl} | head -30
3. **Check SSL** — use shell: echo | openssl s_client -connect ${new URL(targetUrl).hostname}:443 -servername ${new URL(targetUrl).hostname} 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null
4. **Check robots.txt** — scrape ${targetUrl}/robots.txt
5. **Check sitemap** — scrape ${targetUrl}/sitemap.xml
6. **Page response time** — use shell: curl -o /dev/null -s -w "HTTP %{http_code} in %{time_total}s" ${targetUrl}

Compile findings into a structured audit report with severity ratings (Critical/Warning/Info/Pass).
Save the report to ${path.join(NEXUS_OUTPUT_DIR, `audit-${Date.now()}.md`)}`,
    systemPrompt: executePrompt([
      'scrape', 'shell', 'files', 'task_state', 'progress_report',
    ]),
    contextPrefix: `## Audit Research\n${researchResult.answer}`,
    tools: ['scrape', 'shell', 'files', 'task_state', 'progress_report'],
    tier: 'sonnet',
    maxTurns: 12,
  });

  if (!executeResult.success) {
    return { success: false, message: `Audit execution failed: ${executeResult.answer}` };
  }

  await ctx.sendProgress(`Audit checks complete. Compiling verification report...`);

  // ── PHASE 3: VERIFY (compile final report) ──
  const verifyResult = await ctx.runAgent({
    task: `Verify and compile the final audit report for: ${targetUrl}

Review the execution results and create a summary with:
- Overall score (A-F grade)
- Critical issues (must fix)
- Warnings (should fix)
- Passed checks
- Recommendations prioritized by impact`,
    systemPrompt: verifyPrompt([
      'files', 'task_state',
    ]),
    contextPrefix: `## Audit Execution Results\n${executeResult.answer}`,
    tools: ['files', 'task_state'],
    tier: 'flash',
    maxTurns: 4,
  });

  // Learning
  const learnEntry = buildLearnedEntry(
    `site-audit: ${targetUrl}`,
    'scrape homepage + curl headers + openssl SSL + check robots/sitemap + compile report',
    ['scrape', 'shell', 'files'],
    'site-audit',
  );
  await ctx.executeTool('memory_add', { content: learnEntry, tags: 'approach:site-audit' });

  return {
    success: true,
    message: verifyResult.answer,
    data: {
      url: targetUrl,
      phases: {
        research: { turns: researchResult.turns, success: researchResult.success },
        execute: { turns: executeResult.turns, success: executeResult.success },
        verify: { turns: verifyResult.turns, success: verifyResult.success },
      },
    },
  };
}
