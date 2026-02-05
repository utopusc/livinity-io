import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Brain } from './brain.js';
import { SkillLoader } from './skill-loader.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

const SKILL_GEN_PROMPT = `You generate Nexus skill files in TypeScript. A skill is a handler function with YAML frontmatter.

## Skill Structure

\`\`\`typescript
/**
---
name: skill-name
description: What it does
type: autonomous
tools:
  - tool1
  - tool2
triggers:
  - ^(trigger1|trigger2)
  - keyword pattern
phases:
  - research
  - execute
model_tier: sonnet
max_turns: 15
max_tokens: 150000
timeout_ms: 300000
---
*/

import type { SkillContext, SkillResult } from '../packages/core/dist/skill-types.js';
import { researchPrompt, executePrompt, verifyPrompt } from '../packages/core/dist/prompts.js';
import { buildLearnedEntry, buildFailedEntry } from '../packages/core/dist/utils.js';

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  // Extract task from message
  const task = ctx.message.replace(/^[!\\/]?\\s*(trigger1|trigger2)\\s*/i, '').trim();
  if (!task) {
    return { success: false, message: 'What should I do? Example: !trigger1 something' };
  }

  await ctx.sendProgress(\`Starting: "\${task}"\`);

  // Run agent phases using ctx.runAgent()
  const result = await ctx.runAgent({
    task: \`Do: \${task}\`,
    systemPrompt: executePrompt(['tool1', 'tool2']),
    tools: ['tool1', 'tool2'],
    tier: 'sonnet',
    maxTurns: 12,
  });

  return {
    success: result.success,
    message: result.answer,
  };
}
\`\`\`

## Available Tools
status, logs, shell, docker_list, docker_manage, docker_exec, pm2, sysinfo, files, cron, scrape, whatsapp_send, memory_search, memory_add, web_search, task_state, progress_report, subagent_create, subagent_list, subagent_message, subagent_schedule, skill_generate, loop_manage

## Available Phase Prompts
researchPrompt(toolNames[]), planPrompt(toolNames[]), executePrompt(toolNames[]), verifyPrompt(toolNames[])

## Available Helpers
buildLearnedEntry(task, approach, tools[], skillName) — creates LEARNED memory entry
buildFailedEntry(task, approach, reason, skillName) — creates FAILED memory entry
ctx.sendProgress(message) — WhatsApp progress update
ctx.think(prompt, {tier, maxTokens}) — one-shot LLM call
ctx.redis.get/set/del/keys — persistent state

## Rules
1. Output ONLY the complete TypeScript file content, nothing else
2. Include proper YAML frontmatter in /** --- ... --- */ comment block
3. Use appropriate triggers for the skill's purpose
4. Choose tools relevant to the task
5. Use autonomous type with phases for complex skills, simple for basic ones
6. Follow the exact import paths shown above
7. Always handle empty task input gracefully
8. Send progress updates for long operations
9. Save learnings to memory on success`;

export interface GenerateSkillOptions {
  /** Human description of what the skill should do */
  description: string;
  /** Suggested skill name (auto-generated if not provided) */
  name?: string;
  /** Trigger patterns */
  triggers?: string[];
  /** Tools the skill should use */
  tools?: string[];
}

export class SkillGenerator {
  private brain: Brain;
  private skillsDir: string;
  private skillLoader: SkillLoader;

  constructor(brain: Brain, skillsDir: string, skillLoader: SkillLoader) {
    this.brain = brain;
    this.skillsDir = skillsDir;
    this.skillLoader = skillLoader;
  }

  /** Generate a new skill from a description */
  async generate(options: GenerateSkillOptions): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const { description, name, triggers, tools } = options;

    try {
      const prompt = `Generate a Nexus skill file for:

Description: ${description}
${name ? `Skill name: ${name}` : 'Choose an appropriate skill name (kebab-case)'}
${triggers?.length ? `Triggers: ${triggers.join(', ')}` : 'Choose appropriate trigger patterns'}
${tools?.length ? `Required tools: ${tools.join(', ')}` : 'Choose relevant tools'}

Output ONLY the complete TypeScript file.`;

      const code = await this.brain.think({
        prompt,
        systemPrompt: SKILL_GEN_PROMPT,
        tier: 'sonnet',
        maxTokens: 4096,
      });

      // Clean the output
      const cleaned = code
        .replace(/^```(?:typescript|ts)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();

      // Extract skill name from frontmatter
      const nameMatch = cleaned.match(/name:\s*(.+)/);
      const skillName = name || nameMatch?.[1]?.trim() || `generated-${Date.now()}`;
      const fileName = `${skillName}.ts`;
      const filePath = join(this.skillsDir, fileName);

      // Validate basic structure
      if (!cleaned.includes('export async function handler')) {
        return { success: false, error: 'Generated code missing handler export' };
      }
      if (!cleaned.includes('---')) {
        return { success: false, error: 'Generated code missing YAML frontmatter' };
      }

      // Write the skill file
      await writeFile(filePath, cleaned, 'utf-8');
      logger.info('SkillGenerator: wrote skill file', { filePath, skillName });

      // Compile the TypeScript file to JavaScript
      try {
        const tsconfigPath = join(this.skillsDir, 'tsconfig.json');
        await execAsync(`npx tsc -p ${tsconfigPath}`, { cwd: dirname(this.skillsDir), timeout: 30_000 });
        logger.info('SkillGenerator: compiled skill', { skillName });
      } catch (compileErr: any) {
        logger.warn('SkillGenerator: compilation warning (skill may still work)', { error: compileErr.message?.slice(0, 200) });
      }

      // Hot-reload: SkillLoader watches the directory, but force a reload for immediate use
      await this.skillLoader.loadAll();
      logger.info('SkillGenerator: reloaded skills');

      return { success: true, filePath };
    } catch (err: any) {
      logger.error('SkillGenerator: generation failed', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /** List all generated skills (vs manually created ones) */
  async listGenerated(): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    try {
      const files = await readdir(this.skillsDir);
      return files.filter((f) => f.startsWith('generated-') || f.startsWith('gen-'));
    } catch {
      return [];
    }
  }
}
