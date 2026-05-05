/**
 * Types for the MCP (Model Context Protocol) marketplace and server management system.
 */

/** Configuration for a single installed MCP server */
export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'streamableHttp';
  /** stdio: command to spawn (e.g. 'npx', 'node', 'python') */
  command?: string;
  /** stdio: arguments (e.g. ['-y', '@modelcontextprotocol/server-filesystem', '/path']) */
  args?: string[];
  /** Environment variables for stdio process */
  env?: Record<string, string>;
  /** HTTP: server URL (e.g. 'http://localhost:4000/mcp') */
  url?: string;
  /** HTTP: custom headers */
  headers?: Record<string, string>;
  enabled: boolean;
  description?: string;
  /** Registry identifier this was installed from */
  installedFrom?: string;
  installedAt: number;
}

/** Top-level config stored in Redis — uses mcpServers to match standard MCP config format */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/** Runtime status for a connected MCP server */
export interface McpServerStatus {
  running: boolean;
  tools: string[];
  lastError?: string;
  connectedAt?: number;
}

/** Server entry from the Official MCP Registry API (flattened from nested response) */
export interface RegistryServer {
  name: string;
  description?: string;
  version?: string;
  repository?: {
    url?: string;
    source?: string;
  };
  packages?: Array<{
    registryType: string;
    identifier: string;
    version?: string;
    transport?: { type: string };
    environmentVariables?: Array<{
      name: string;
      description?: string;
      isSecret?: boolean;
    }>;
  }>;
  remotes?: Array<{
    type: string;
    url: string;
  }>;
}

/** Raw registry API response item (nested format) */
export interface RegistryServerRaw {
  server: RegistryServer;
  _meta?: Record<string, unknown>;
}

/** Search response from the Official MCP Registry (after flattening) */
export interface RegistrySearchResult {
  servers: RegistryServer[];
  next_cursor?: string;
}
