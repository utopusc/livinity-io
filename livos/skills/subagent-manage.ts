/**
---
name: subagent-manage
description: Manage persistent subagents — create, list, message, schedule, and control subagent lifecycle
type: autonomous
tools:
  - subagent_create
  - subagent_list
  - subagent_message
  - subagent_schedule
  - loop_manage
  - memory_search
  - memory_add
triggers:
  - ^(subagent|sub agent|alt ajan)
  - ajan (olustur|yarat|kur|listele|sil|mesaj|yonet)
  - bot (olustur|yarat|create|manage)
  - ^!ajan
phases:
  - execute
model_tier: sonnet
max_turns: 15
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const task = ctx.message.replace(/^[!\\/]?\s*(subagent|sub agent|alt ajan|ajan|bot)\s*/i, '').trim();

  if (!task) {
    // No specific command — list all subagents
    const listResult = await ctx.executeTool('subagent_list', {});
    return {
      success: listResult.success,
      message: listResult.success
        ? `*Subagent Listesi:*\n\n${listResult.output}`
        : `Hata: ${listResult.error}`,
    };
  }

  // Use AI to interpret the subagent command
  const result = await ctx.runAgent({
    task: `The user wants to manage subagents. Their request: "${task}"

Available actions:
1. **Create subagent**: Use subagent_create with id, name, description. Optionally: schedule (cron), loop config, tier.
2. **List subagents**: Use subagent_list to show all subagents.
3. **Message subagent**: Use subagent_message with id and message to send a task to a specific subagent.
4. **Schedule**: Use subagent_schedule to add/remove/list cron schedules.
5. **Loop control**: Use loop_manage to start/stop/list/status continuous loops.

Interpret the user's intent and execute the appropriate action. Respond in the same language as the user (Turkish or English).`,
    tools: ['subagent_create', 'subagent_list', 'subagent_message', 'subagent_schedule', 'loop_manage', 'memory_search', 'memory_add'],
    tier: 'sonnet',
    maxTurns: 10,
  });

  return {
    success: result.success,
    message: result.answer,
  };
}
