import { logger } from './logger.js';
import type { Tool, ToolResult, ToolParameter } from './types.js';

/**
 * Tool policy configuration for filtering available tools
 */
export interface ToolPolicy {
  /** Profile determines base set of tools */
  profile?: 'minimal' | 'basic' | 'coding' | 'messaging' | 'full';
  /** Explicit allow list - overrides profile */
  allow?: string[];
  /** Explicit deny list - overrides allow and profile */
  deny?: string[];
  /** Additional tools to allow beyond the profile */
  alsoAllow?: string[];
}

/**
 * Tool profiles define which tools are available at each level
 */
const TOOL_PROFILES: Record<string, string[]> = {
  // Minimal: only basic info tools
  minimal: ['help', 'status', 'info', 'list_tools'],

  // Basic: minimal + file reading, web search
  basic: ['help', 'status', 'info', 'list_tools', 'read_file', 'list_files', 'web_search', 'web_fetch'],

  // Coding: basic + code editing, shell
  coding: [
    'help', 'status', 'info', 'list_tools',
    'read_file', 'list_files', 'write_file', 'edit_file',
    'shell', 'docker', 'git',
    'web_search', 'web_fetch',
  ],

  // Messaging: basic + WhatsApp, notifications
  messaging: [
    'help', 'status', 'info', 'list_tools',
    'read_file', 'list_files',
    'send_whatsapp', 'send_notification',
    'web_search', 'web_fetch',
  ],

  // Full: all tools (no filtering except deny list)
  full: [],  // Empty means all tools
};

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a tool. Overwrites if name already exists. */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.info(`ToolRegistry: registered "${tool.name}"`);
  }

  /** Unregister a tool by name. Returns true if the tool existed. */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.info(`ToolRegistry: unregistered "${name}"`);
    }
    return existed;
  }

  /** Get a tool by name */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tool names */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /** List all tools with full metadata */
  listAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Execute a tool by name with given params */
  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: '', error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(params);
    } catch (err: any) {
      logger.error(`ToolRegistry: "${name}" threw`, { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  /** Format all tools for the agent system prompt (name + description + parameters) */
  listForPrompt(): string {
    const tools = this.listAll();
    if (tools.length === 0) return 'No tools available.';

    return tools.map((t) => {
      const params = t.parameters
        .map((p) => {
          let line = `    - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`;
          if (p.enum) line += ` [values: ${p.enum.join(', ')}]`;
          if (p.default !== undefined) line += ` [default: ${p.default}]`;
          return line;
        })
        .join('\n');

      return `- **${t.name}**: ${t.description}\n  Parameters:\n${params || '    (none)'}`;
    }).join('\n\n');
  }

  /** Generate JSON schema representation for all tools (for structured tool calling) */
  toJsonSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.listAll().map((t) => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const p of t.parameters) {
        const prop: Record<string, unknown> = {
          type: p.type,
          description: p.description,
        };
        if (p.enum) prop.enum = p.enum;
        if (p.default !== undefined) prop.default = p.default;
        properties[p.name] = prop;
        if (p.required) required.push(p.name);
      }

      return {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      };
    });
  }

  /** Number of registered tools */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool is allowed by the given policy
   */
  isToolAllowed(toolName: string, policy?: ToolPolicy): boolean {
    if (!policy) return true;

    // Deny list has highest priority
    if (policy.deny?.includes(toolName)) {
      return false;
    }

    // Explicit allow list overrides profile
    if (policy.allow && policy.allow.length > 0) {
      return policy.allow.includes(toolName);
    }

    // Check profile
    const profile = policy.profile || 'full';
    const profileTools = TOOL_PROFILES[profile] || [];

    // 'full' profile means all tools are allowed
    if (profile === 'full' || profileTools.length === 0) {
      return true;
    }

    // Check if tool is in profile or alsoAllow
    if (profileTools.includes(toolName)) {
      return true;
    }
    if (policy.alsoAllow?.includes(toolName)) {
      return true;
    }

    return false;
  }

  /**
   * Get a filtered list of tools based on the policy
   */
  listFiltered(policy?: ToolPolicy): string[] {
    if (!policy) return this.list();
    return this.list().filter((name) => this.isToolAllowed(name, policy));
  }

  /**
   * Get all filtered tools with full metadata
   */
  listAllFiltered(policy?: ToolPolicy): Tool[] {
    if (!policy) return this.listAll();
    return this.listAll().filter((tool) => this.isToolAllowed(tool.name, policy));
  }

  /**
   * Create a scoped registry that only contains tools allowed by the policy.
   * The scoped registry is read-only (no register/unregister).
   */
  createScopedRegistry(policy?: ToolPolicy): ToolRegistry {
    const scoped = new ToolRegistry();
    const allowedTools = this.listAllFiltered(policy);
    for (const tool of allowedTools) {
      scoped.register(tool);
    }
    return scoped;
  }

  /**
   * Format filtered tools for the agent system prompt
   */
  listForPromptFiltered(policy?: ToolPolicy): string {
    const tools = this.listAllFiltered(policy);
    if (tools.length === 0) return 'No tools available.';

    return tools.map((t) => {
      const params = t.parameters
        .map((p) => {
          let line = `    - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`;
          if (p.enum) line += ` [values: ${p.enum.join(', ')}]`;
          if (p.default !== undefined) line += ` [default: ${p.default}]`;
          return line;
        })
        .join('\n');

      return `- **${t.name}**: ${t.description}\n  Parameters:\n${params || '    (none)'}`;
    }).join('\n\n');
  }

  /**
   * Generate filtered JSON schema representation for tools
   */
  toJsonSchemasFiltered(policy?: ToolPolicy): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.listAllFiltered(policy).map((t) => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const p of t.parameters) {
        const prop: Record<string, unknown> = {
          type: p.type,
          description: p.description,
        };
        if (p.enum) prop.enum = p.enum;
        if (p.default !== undefined) prop.default = p.default;
        properties[p.name] = prop;
        if (p.required) required.push(p.name);
      }

      return {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      };
    });
  }
}
