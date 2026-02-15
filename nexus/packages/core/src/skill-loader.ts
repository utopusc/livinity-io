import { readdir, readFile, stat, watch } from 'fs/promises';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { logger } from './logger.js';
import { ToolRegistry } from './tool-registry.js';
import { AgentLoop } from './agent.js';
import { scanSkillDirectory } from './skill-manifest.js';
import type { Brain } from './brain.js';
import type Redis from 'ioredis';
import type { Skill, SkillFrontmatter, SkillContext, SkillResult, SkillRedis, RunAgentOptions } from './skill-types.js';
import type { Tool, ToolResult } from './types.js';

/** Action callback type for live reporting */
export type OnActionCallback = (action: {
  type: 'thinking' | 'tool_call' | 'final_answer';
  tool?: string;
  params?: Record<string, unknown>;
  thought?: string;
  success?: boolean;
  output?: string;
  turn: number;
  answer?: string;
}) => void;

/** Options passed when executing a skill (enhanced for autonomous skills) */
export interface SkillExecuteOptions {
  from?: string;
  redis?: Redis;
  brain?: Brain;
  onAction?: OnActionCallback;
}

export class SkillLoader {
  private skills = new Map<string, Skill>();
  private skillsDir: string;
  private toolRegistry: ToolRegistry;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(skillsDir: string, toolRegistry: ToolRegistry) {
    this.skillsDir = resolve(skillsDir);
    this.toolRegistry = toolRegistry;
  }

  /** Load all skills from the skills directory */
  async loadAll(): Promise<void> {
    let files: string[];
    try {
      const entries = await readdir(this.skillsDir);
      const allFiles = entries.filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('_'));
      // Skip .ts files when a compiled .js version exists (avoid duplicate loading)
      const jsSet = new Set(allFiles.filter((f) => f.endsWith('.js')));
      files = allFiles.filter((f) => !f.endsWith('.ts') || !jsSet.has(f.replace(/\.ts$/, '.js')));
    } catch {
      logger.info(`SkillLoader: no skills directory at ${this.skillsDir}, skipping`);
      return;
    }

    for (const file of files) {
      await this.loadSkill(join(this.skillsDir, file));
    }

    logger.info(`SkillLoader: loaded ${this.skills.size} skills`);
  }

  /** Load a single skill file */
  private async loadSkill(filePath: string): Promise<void> {
    try {
      // Read file and extract frontmatter
      const content = await readFile(filePath, 'utf-8');
      const meta = this.parseFrontmatter(content);
      if (!meta) {
        logger.warn(`SkillLoader: no valid frontmatter in ${filePath}, skipping`);
        return;
      }

      // Dynamic import — for .ts files, try the .js equivalent; for .js files, import directly
      const jsPath = filePath.endsWith('.ts') ? filePath.replace(/\.ts$/, '.js') : filePath;
      const moduleUrl = pathToFileURL(jsPath).href + `?t=${Date.now()}`; // cache-bust
      const mod = await import(moduleUrl);

      if (typeof mod.handler !== 'function') {
        logger.warn(`SkillLoader: no handler export in ${filePath}, skipping`);
        return;
      }

      // Compile trigger patterns
      const triggerPatterns = meta.triggers.map((t) => {
        try {
          return new RegExp(t, 'i');
        } catch {
          return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
      });

      const skill: Skill = {
        meta,
        handler: mod.handler,
        tools: mod.tools || [],
        filePath,
        triggerPatterns,
      };

      // Register custom tools from the skill
      if (Array.isArray(mod.tools)) {
        for (const tool of mod.tools as Tool[]) {
          this.toolRegistry.register(tool);
          logger.info(`SkillLoader: registered custom tool "${tool.name}" from skill "${meta.name}"`);
        }
      }

      this.skills.set(meta.name, skill);
      logger.info(`SkillLoader: loaded skill "${meta.name}" (${meta.triggers.length} triggers, ${meta.tools.length} tools, type: ${meta.type || 'simple'})`);
    } catch (err: any) {
      logger.error(`SkillLoader: failed to load ${filePath}`, { error: err.message });
    }
  }

  /** Parse YAML frontmatter from skill file content */
  private parseFrontmatter(content: string): SkillFrontmatter | null {
    // Match content between --- markers (YAML frontmatter in comments)
    // Format: /** --- \n yaml \n --- */
    const fmMatch = content.match(/\/\*\*\s*\n---\n([\s\S]*?)\n---\s*\n?\s*\*\//);
    if (!fmMatch) return null;

    const yaml = fmMatch[1];
    return this.parseSimpleYaml(yaml);
  }

  /** Simple YAML parser for frontmatter (no dependency needed) */
  private parseSimpleYaml(yaml: string): SkillFrontmatter | null {
    try {
      const lines = yaml.split('\n');
      const result: Record<string, any> = {};

      let currentKey = '';
      let currentList: string[] | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // List item
        if (trimmed.startsWith('- ')) {
          if (currentList) {
            currentList.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
          }
          continue;
        }

        // Key-value pair
        const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
        if (kvMatch) {
          // Save previous list
          if (currentList && currentKey) {
            result[currentKey] = currentList;
          }

          currentKey = kvMatch[1];
          const value = kvMatch[2].trim();

          if (value === '' || value === '[]') {
            // Start of a list
            currentList = value === '[]' ? [] : [];
          } else {
            // Scalar value
            currentList = null;
            result[currentKey] = value.replace(/^['"]|['"]$/g, '');
          }
        }
      }

      // Save last list
      if (currentList && currentKey) {
        result[currentKey] = currentList;
      }

      if (!result.name || !result.description) return null;

      return {
        name: result.name,
        description: result.description,
        tools: Array.isArray(result.tools) ? result.tools : [],
        triggers: Array.isArray(result.triggers) ? result.triggers : [],
        model_tier: result.model_tier || 'flash',
        type: result.type === 'autonomous' ? 'autonomous' : 'simple',
        phases: Array.isArray(result.phases) ? result.phases : undefined,
        max_turns: result.max_turns ? parseInt(result.max_turns) : undefined,
        max_tokens: result.max_tokens ? parseInt(result.max_tokens) : undefined,
        timeout_ms: result.timeout_ms ? parseInt(result.timeout_ms) : undefined,
      };
    } catch {
      return null;
    }
  }

  /** Check if a message matches any skill trigger */
  matchTrigger(message: string): Skill | null {
    for (const skill of this.skills.values()) {
      for (const pattern of skill.triggerPatterns) {
        if (pattern.test(message)) {
          return skill;
        }
      }
    }
    return null;
  }

  /** Execute a skill by name */
  async execute(
    skillName: string,
    message: string,
    source: string,
    params: Record<string, unknown> = {},
    options: SkillExecuteOptions = {},
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return { success: false, message: `Unknown skill: ${skillName}` };
    }

    const { from, redis, brain, onAction } = options;

    // Build scoped tool executor
    const executeTool = async (name: string, toolParams: Record<string, unknown>): Promise<ToolResult> => {
      if (!skill.meta.tools.includes(name) && !skill.meta.tools.includes('*')) {
        return { success: false, output: '', error: `Skill "${skill.meta.name}" is not allowed to use tool "${name}"` };
      }
      return this.toolRegistry.execute(name, toolParams);
    };

    // Build Redis helper (scoped to nexus:task_state: prefix)
    const skillRedis: SkillRedis = this.buildSkillRedis(redis);

    // Build runAgent helper
    const runAgent = async (agentOpts: RunAgentOptions) => {
      if (!brain) {
        throw new Error('Brain not available — cannot spawn agent from skill');
      }

      // Build scoped tool registry for the agent
      const scopedRegistry = new ToolRegistry();
      const allowedTools = agentOpts.tools || skill.meta.tools;
      for (const toolName of allowedTools) {
        if (toolName === '*') {
          // Copy all tools
          for (const name of this.toolRegistry.list()) {
            const tool = this.toolRegistry.get(name);
            if (tool) scopedRegistry.register(tool);
          }
          break;
        }
        const tool = this.toolRegistry.get(toolName);
        if (tool) scopedRegistry.register(tool);
      }

      const agent = new AgentLoop({
        brain,
        toolRegistry: scopedRegistry,
        maxTurns: agentOpts.maxTurns || skill.meta.max_turns || 15,
        maxTokens: agentOpts.maxTokens || skill.meta.max_tokens || 100_000,
        timeoutMs: agentOpts.timeoutMs || skill.meta.timeout_ms || 300_000,
        tier: agentOpts.tier || skill.meta.model_tier || 'sonnet',
        systemPromptOverride: agentOpts.systemPrompt,
        contextPrefix: agentOpts.contextPrefix,
        onAction,
      });

      return agent.run(agentOpts.task);
    };

    // Build sendProgress helper
    const sendProgress = async (progressMessage: string): Promise<void> => {
      if (!redis || !from) return;
      try {
        await redis.lpush('nexus:wa_outbox', JSON.stringify({
          jid: from,
          text: progressMessage,
          timestamp: Date.now(),
        }));
      } catch (err: any) {
        logger.error('sendProgress error', { error: err.message });
      }
    };

    // Build think helper
    const think = async (
      prompt: string,
      thinkOpts?: { tier?: 'flash' | 'sonnet' | 'opus'; maxTokens?: number; systemPrompt?: string },
    ): Promise<string> => {
      if (!brain) {
        throw new Error('Brain not available — cannot think from skill');
      }
      return brain.think({
        prompt,
        tier: thinkOpts?.tier || 'flash',
        maxTokens: thinkOpts?.maxTokens || 1024,
        systemPrompt: thinkOpts?.systemPrompt,
      });
    };

    const ctx: SkillContext = {
      message,
      params,
      source,
      toolRegistry: this.toolRegistry,
      executeTool,
      runAgent,
      redis: skillRedis,
      sendProgress,
      think,
      whatsappJid: from,
    };

    try {
      return await skill.handler(ctx);
    } catch (err: any) {
      logger.error(`SkillLoader: skill "${skillName}" threw`, { error: err.message });
      return { success: false, message: `Skill error: ${err.message}` };
    }
  }

  /** Build a scoped Redis helper for skill state persistence */
  private buildSkillRedis(redis?: Redis): SkillRedis {
    const PREFIX = 'nexus:task_state:';

    if (!redis) {
      // Return no-op redis when not available
      return {
        get: async () => null,
        set: async () => {},
        del: async () => {},
        keys: async () => [],
      };
    }

    return {
      get: async (key: string) => redis.get(`${PREFIX}${key}`),
      set: async (key: string, value: string, ttlSeconds = 86400) => {
        await redis.set(`${PREFIX}${key}`, value, 'EX', ttlSeconds);
      },
      del: async (key: string) => {
        await redis.del(`${PREFIX}${key}`);
      },
      keys: async (pattern: string) => {
        const keys = await redis.keys(`${PREFIX}${pattern}`);
        return keys.map((k) => k.replace(PREFIX, ''));
      },
    };
  }

  /** Start watching for new skill files */
  async startWatching(): Promise<void> {
    try {
      const ac = new AbortController();
      const watcher = watch(this.skillsDir, { signal: ac.signal });

      // Run in background — don't await
      (async () => {
        try {
          for await (const event of watcher) {
            if (event.filename && (event.filename.endsWith('.ts') || event.filename.endsWith('.js')) && !event.filename.startsWith('_')) {
              logger.info(`SkillLoader: detected change in ${event.filename}, reloading...`);
              await this.loadSkill(join(this.skillsDir, event.filename));
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            logger.error('SkillLoader: watcher error', { error: err.message });
          }
        }
      })();

      // Store abort controller for cleanup
      this.watcher = watcher as any;
      logger.info('SkillLoader: watching for skill file changes');
    } catch {
      logger.info('SkillLoader: fs.watch not available, hot-reload disabled');
    }
  }

  /** Get all loaded skills */
  listSkills(): Array<{ name: string; description: string; triggers: string[]; type: string; source?: 'builtin' | 'marketplace' }> {
    return Array.from(this.skills.values()).map((s) => ({
      name: s.meta.name,
      description: s.meta.description,
      triggers: s.meta.triggers,
      type: s.meta.type || 'simple',
      source: s.source,
    }));
  }

  /** Number of loaded skills */
  get size(): number {
    return this.skills.size;
  }

  // ── Marketplace skill methods ──────────────────────────────────────────────

  /**
   * Load marketplace skills from subdirectories in marketplaceDir.
   *
   * Each subdirectory should contain SKILL.md + index.ts/index.js.
   * Skills are loaded using scanSkillDirectory for manifest parsing,
   * then dynamically imported. Loaded skills are marked with source: 'marketplace'.
   */
  async loadMarketplaceSkills(marketplaceDir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(marketplaceDir);
    } catch {
      logger.info(`SkillLoader: no marketplace directory at ${marketplaceDir}, skipping`);
      return;
    }

    let loaded = 0;
    for (const entry of entries) {
      const dirPath = join(marketplaceDir, entry);
      try {
        const dirStat = await stat(dirPath);
        if (!dirStat.isDirectory()) continue;

        const success = await this.loadSkillLazy(entry, dirPath);
        if (success) loaded++;
      } catch (err: any) {
        logger.error(`SkillLoader: failed to load marketplace skill "${entry}"`, { error: err.message });
      }
    }

    if (loaded > 0) {
      logger.info(`SkillLoader: loaded ${loaded} marketplace skills from ${marketplaceDir}`);
    }
  }

  /**
   * Lazy-load a single skill from a directory on demand.
   *
   * Called after marketplace install to make the skill immediately available
   * without restarting the server. Uses scanSkillDirectory for manifest +
   * entry point resolution.
   *
   * Returns true if loaded successfully, false otherwise.
   */
  async loadSkillLazy(skillName: string, dirPath: string): Promise<boolean> {
    try {
      const scanResult = await scanSkillDirectory(dirPath);
      if (!scanResult) {
        logger.warn(`SkillLoader: invalid skill directory "${dirPath}", skipping`);
        return false;
      }

      const { manifest, entryPoint } = scanResult;

      // Dynamic import of the skill entry point
      const jsPath = entryPoint.endsWith('.ts') ? entryPoint.replace(/\.ts$/, '.js') : entryPoint;
      const moduleUrl = pathToFileURL(jsPath).href + `?t=${Date.now()}`;
      const mod = await import(moduleUrl);

      if (typeof mod.handler !== 'function') {
        logger.warn(`SkillLoader: no handler export in "${entryPoint}", skipping`);
        return false;
      }

      // Build frontmatter from manifest
      const meta: SkillFrontmatter = {
        name: manifest.name,
        description: manifest.description,
        tools: manifest.tools,
        triggers: manifest.triggers,
        model_tier: manifest.model_tier,
        type: manifest.type,
        phases: manifest.phases,
        max_turns: manifest.max_turns,
        max_tokens: manifest.max_tokens,
        timeout_ms: manifest.timeout_ms,
      };

      // Compile trigger patterns
      const triggerPatterns = meta.triggers.map((t) => {
        try {
          return new RegExp(t, 'i');
        } catch {
          return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
      });

      const skill: Skill = {
        meta,
        handler: mod.handler,
        tools: mod.tools || [],
        filePath: entryPoint,
        triggerPatterns,
        manifest,
        installedAt: Date.now(),
        source: 'marketplace',
      };

      // Register custom tools from the skill
      if (Array.isArray(mod.tools)) {
        for (const tool of mod.tools as Tool[]) {
          this.toolRegistry.register(tool);
          logger.info(`SkillLoader: registered custom tool "${tool.name}" from marketplace skill "${meta.name}"`);
        }
      }

      this.skills.set(meta.name, skill);
      logger.info(`SkillLoader: loaded marketplace skill "${meta.name}" (${meta.triggers.length} triggers, ${meta.tools.length} tools)`);
      return true;
    } catch (err: any) {
      logger.error(`SkillLoader: failed to lazy-load skill "${skillName}"`, { error: err.message });
      return false;
    }
  }

  /**
   * Unload a skill from the internal map and unregister its custom tools.
   *
   * Called during marketplace skill uninstall. Returns true if the skill
   * existed and was removed, false if it was not loaded.
   */
  unloadSkill(skillName: string): boolean {
    const skill = this.skills.get(skillName);
    if (!skill) return false;

    // Unregister custom tools that this skill added
    if (Array.isArray(skill.tools)) {
      for (const tool of skill.tools as Tool[]) {
        this.toolRegistry.unregister(tool.name);
        logger.info(`SkillLoader: unregistered custom tool "${tool.name}" from skill "${skillName}"`);
      }
    }

    this.skills.delete(skillName);
    logger.info(`SkillLoader: unloaded skill "${skillName}"`);
    return true;
  }
}
