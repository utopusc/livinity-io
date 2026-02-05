/**
 * Shared types for the Nexus Agent Framework.
 * Used by tool registry, agent loop, and skill system.
 */

/** JSON Schema parameter definition for a tool */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

/** Structured result from tool execution */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

/** Tool definition — wraps a handler with metadata for agent discovery */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}
