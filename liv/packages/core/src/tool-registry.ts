import { logger } from './logger.js';
import type { Tool, ToolResult, ToolParameter, ApprovalRequest, ApprovalResponse } from './types.js';
import type { ToolDefinition } from './providers/types.js';
import { classifyToolCall } from './irreversible-classifier.js';

/**
 * Structural interface for the approval gate the registry consults on
 * irreversible ops. ApprovalManager (approval-manager.ts) satisfies it; kept
 * structural so the registry has no hard dependency on Redis and is trivially
 * stubbable in tests. (Phase 256-06, LIVOS-002 layer 5.)
 */
export interface ApprovalGate {
  createRequest(opts: {
    sessionId: string;
    tool: string;
    params: Record<string, unknown>;
    thought: string;
    timeoutMs?: number;
  }): Promise<ApprovalRequest>;
  waitForResponse(requestId: string, timeoutMs?: number): Promise<ApprovalResponse | null>;
}

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
  // Minimal: only status and system info
  minimal: ['status', 'logs', 'sysinfo'],

  // Basic: minimal + file operations, web search, scraping
  basic: ['status', 'logs', 'sysinfo', 'files', 'web_search', 'scrape'],

  // Coding: basic + shell, Docker, PM2
  coding: [
    'status', 'logs', 'sysinfo',
    'shell', 'files',
    'docker_list', 'docker_manage', 'docker_exec', 'pm2',
    'web_search', 'scrape',
    'conversation_search',
  ],

  // Messaging: WhatsApp, channels, memory
  messaging: [
    'whatsapp_send', 'channel_send',
    'memory_search', 'memory_add',
    'conversation_search',
  ],

  // Full: all tools (no filtering except deny list)
  full: [],  // Empty means all tools
};

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * Phase 256-06 (LIVOS-002 layer 5) — the injection-proof approval gate. When
   * an ApprovalManager is wired, execute() routes ONLY irreversible/off-box ops
   * (per classifyToolCall) through operator approval; everything else
   * fast-allows. When NO gate is wired, irreversible ops FAIL-SAFE DENY (never
   * silent-allow) while ordinary ops still run autonomously.
   */
  private approvalGate?: ApprovalGate;
  private approvalSessionId?: string;

  /**
   * Wire the approval gate (Phase 256-06). Called by SdkAgentRunner.run() and
   * AgentLoop.run() with the agent's Redis-backed ApprovalManager + sessionId.
   * Idempotent; passing undefined clears the gate.
   */
  setApprovalGate(approvalGate: ApprovalGate | undefined, sessionId: string): void {
    this.approvalGate = approvalGate;
    this.approvalSessionId = sessionId;
  }

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
      // -------------------------------------------------------------------
      // Phase 256-06 (LIVOS-002 layer 5) — injection-proof irreversible gate.
      // The classifier reads ONLY (name, params) — the agent-emitted call — and
      // NEVER any tool output / prior result. It runs HERE, before tool.execute
      // produces any output, so injected file/web content can't reach it.
      // Default is ALLOW: only an affirmative irreversible match blocks.
      // -------------------------------------------------------------------
      const verdict = classifyToolCall(name, params);
      if (verdict.irreversible) {
        const category = verdict.category ?? 'irreversible';
        const reason = verdict.reason ?? category;
        if (this.approvalGate) {
          const req = await this.approvalGate.createRequest({
            sessionId: this.approvalSessionId ?? 'unknown',
            tool: name,
            params,
            thought: `Irreversible/off-box op (${category}): ${reason}`,
          });
          const resp = await this.approvalGate.waitForResponse(req.id);
          if (resp?.decision !== 'approve') {
            const how = resp ? 'denied' : 'approval timed out';
            logger.warn(`ToolRegistry: BLOCKED irreversible "${name}" (${category}) — ${how}`);
            return {
              success: false,
              output: '',
              error: `Blocked: ${category} requires operator approval (${how}).`,
            };
          }
          logger.info(`ToolRegistry: irreversible "${name}" (${category}) APPROVED by operator`);
        } else {
          // FAIL-SAFE: no gate wired → never silently allow an irreversible op.
          logger.warn(
            `ToolRegistry: BLOCKED irreversible "${name}" (${category}) — no ApprovalManager wired (fail-safe deny)`,
          );
          return {
            success: false,
            output: '',
            error: `Blocked: ${category} requires operator approval (no approval gate configured).`,
          };
        }
      }
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

  /** Check if a specific tool requires approval */
  requiresApproval(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    return tool?.requiresApproval === true;
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
    // Propagate the irreversible-op approval gate to the scoped registry so the
    // subagent path stays gated identically (Phase 256-06).
    if (this.approvalGate) {
      scoped.setApprovalGate(this.approvalGate, this.approvalSessionId ?? 'unknown');
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

  /** Convert all tools to native tool definition format (input_schema) */
  toToolDefinitions(): ToolDefinition[] {
    return this.listAll().map((t) => this.toolToDefinition(t));
  }

  /** Convert filtered tools to native tool definition format */
  toToolDefinitionsFiltered(policy?: ToolPolicy): ToolDefinition[] {
    return this.listAllFiltered(policy).map((t) => this.toolToDefinition(t));
  }

  private toolToDefinition(t: Tool): ToolDefinition {
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
      input_schema: {
        type: 'object' as const,
        properties,
        required,
      },
    };
  }
}
