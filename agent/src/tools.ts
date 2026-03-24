import { executeShell } from './tools/shell.js';
import { executeFilesList, executeFilesRead, executeFilesWrite, executeFilesDelete, executeFilesRename } from './tools/files.js';
import { executeProcesses } from './tools/processes.js';
import { executeSystemInfo } from './tools/system-info.js';
import { executeScreenshot } from './tools/screenshot.js';

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
): Promise<{ success: boolean; output: string; error?: string; data?: unknown; images?: Array<{ base64: string; mimeType: string }> }> {
  switch (tool) {
    case 'shell':
      return executeShell(params);
    case 'files_list':
      return executeFilesList(params);
    case 'files_read':
      return executeFilesRead(params);
    case 'files_write':
      return executeFilesWrite(params);
    case 'files_delete':
      return executeFilesDelete(params);
    case 'files_rename':
      return executeFilesRename(params);
    case 'processes':
      return executeProcesses(params);
    case 'system_info':
      return executeSystemInfo(params);
    case 'screenshot':
      return executeScreenshot(params);
    default:
      return { success: false, output: '', error: `Unknown tool: ${tool}` };
  }
}
