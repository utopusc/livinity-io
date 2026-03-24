export const TOOL_NAMES = [
  'shell',
  'files_list',
  'files_read',
  'files_write',
  'files_delete',
  'files_rename',
  'processes',
  'system_info',
  'screenshot',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export function executeToolStub(tool: string, params: Record<string, unknown>): {
  success: boolean;
  output: string;
  error?: string;
} {
  return {
    success: false,
    output: '',
    error: `Tool '${tool}' is not yet implemented (coming in Phase 50-51)`,
  };
}
