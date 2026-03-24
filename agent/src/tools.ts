import { executeShell } from './tools/shell.js';
import { executeFilesList, executeFilesRead, executeFilesWrite, executeFilesDelete, executeFilesRename } from './tools/files.js';
import { executeProcesses } from './tools/processes.js';
import { executeSystemInfo } from './tools/system-info.js';
import { executeScreenshot } from './tools/screenshot.js';
import { executeMouseClick, executeMouseDoubleClick, executeMouseRightClick, executeMouseMove, executeMouseDrag, executeMouseScroll } from './tools/mouse.js';
import { executeKeyboardType, executeKeyboardPress } from './tools/keyboard.js';

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
  // Phase 5: Mouse & Keyboard tools
  'mouse_click',
  'mouse_double_click',
  'mouse_right_click',
  'mouse_move',
  'mouse_drag',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
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
    case 'mouse_click':
      return executeMouseClick(params);
    case 'mouse_double_click':
      return executeMouseDoubleClick(params);
    case 'mouse_right_click':
      return executeMouseRightClick(params);
    case 'mouse_move':
      return executeMouseMove(params);
    case 'mouse_drag':
      return executeMouseDrag(params);
    case 'mouse_scroll':
      return executeMouseScroll(params);
    case 'keyboard_type':
      return executeKeyboardType(params);
    case 'keyboard_press':
      return executeKeyboardPress(params);
    default:
      return { success: false, output: '', error: `Unknown tool: ${tool}` };
  }
}
