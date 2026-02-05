/**
---
name: skill-create
description: Generate new AI skills on demand — describe what you need and the AI creates a complete skill file
type: autonomous
tools:
  - skill_generate
  - memory_search
  - memory_add
triggers:
  - ^(skill|yetenek|beceri).*(olustur|yarat|create|generate|ekle|add)
  - yeni (skill|yetenek|beceri)
  - ^!skill
phases:
  - execute
model_tier: sonnet
max_turns: 10
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const task = ctx.message.replace(/^[!\\/]?\s*(skill|yetenek|beceri)\s*/i, '').trim();

  if (!task) {
    return {
      success: false,
      message: 'Ne turu bir skill olusturmami istiyorsun? Ornek: "!skill olustur email takip eden bir skill"',
    };
  }

  await ctx.sendProgress(`Skill olusturuluyor: "${task.slice(0, 80)}"`);

  // Check memory for similar past skills
  const memResult = await ctx.executeTool('memory_search', { query: `skill generate ${task}`, limit: 3 });
  const memContext = memResult.success && !memResult.output.includes('No memories')
    ? `\n\nPrevious related skills in memory:\n${memResult.output}`
    : '';

  // Use AI to interpret the skill description and generate it
  const result = await ctx.runAgent({
    task: `The user wants to create a new AI skill. Their description: "${task}"
${memContext}

Use the skill_generate tool to create the skill. You need to provide:
1. **description**: Clear description of what the skill should do
2. **name**: A kebab-case name (e.g. "email-monitor", "price-tracker")
3. **triggers**: Comma-separated trigger patterns that would activate this skill
4. **tools**: Comma-separated tool names the skill needs (choose from: shell, files, web_search, scrape, memory_search, memory_add, docker_list, docker_manage, docker_exec, pm2, sysinfo, logs, cron, task_state, progress_report, subagent_create, subagent_list, subagent_message)

After generating, save a memory entry about the new skill for future reference.
Respond in the same language as the user.`,
    tools: ['skill_generate', 'memory_search', 'memory_add'],
    tier: 'sonnet',
    maxTurns: 8,
  });

  return {
    success: result.success,
    message: result.answer,
  };
}
