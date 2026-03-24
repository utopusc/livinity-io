import { executeShell } from './tools/shell.js';

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

export async function executeTool(
  tool: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  switch (tool) {
    case 'shell':
      return executeShell(params);
    // files_list, files_read, files_write, files_delete, files_rename — Phase 50-02
    // processes, system_info, screenshot — Phase 51
    default:
      return { success: false, output: '', error: `Tool '${tool}' is not yet implemented` };
  }
}
