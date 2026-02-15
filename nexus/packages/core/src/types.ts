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
  /** Base64-encoded images returned by the tool (e.g. browser screenshots) */
  images?: Array<{ base64: string; mimeType: string }>;
}

/** Tool definition — wraps a handler with metadata for agent discovery */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  /** If true, agent must get user approval before executing this tool */
  requiresApproval?: boolean;
}

/** Pending tool approval request */
export interface ApprovalRequest {
  id: string;                    // UUID
  sessionId: string;             // Agent session that triggered this
  tool: string;                  // Tool name
  params: Record<string, unknown>; // Tool parameters
  thought: string;               // Agent's reasoning for calling this tool
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: number;             // Unix timestamp ms
  expiresAt: number;             // Unix timestamp ms
  resolvedAt?: number;           // When resolved
  resolvedBy?: string;           // Who approved/denied (channel, user ID)
  resolvedFrom?: string;         // Which channel (web, telegram, slack, etc.)
}

/** Response to an approval request */
export interface ApprovalResponse {
  requestId: string;
  decision: 'approve' | 'deny';
  respondedBy?: string;          // User/channel identifier
  respondedFrom?: string;        // Channel type
}
