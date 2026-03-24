import { readdir, stat, readFile, writeFile, rm, rename, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, relative, join, dirname } from 'node:path';

export interface FileToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

const MAX_READ_SIZE = 1024 * 1024; // 1MB

/**
 * Resolve a user-provided path relative to home directory,
 * rejecting any path that escapes via traversal.
 */
function safePath(inputPath: string): string {
  const home = homedir();
  const resolved = resolve(home, inputPath);
  const rel = relative(home, resolved);
  if (rel.startsWith('..') || resolve(home, rel) !== resolved) {
    throw new Error(`path traversal blocked: '${inputPath}' escapes home directory`);
  }
  return resolved;
}

/**
 * List directory contents with name, type, size, and modified date.
 * Directories are sorted before files; alphabetical within each group.
 */
export async function executeFilesList(
  params: Record<string, unknown>,
): Promise<FileToolResult> {
  try {
    const dirPath = params.path as string | undefined;
    if (!dirPath || typeof dirPath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: path' };
    }

    const resolved = safePath(dirPath);
    const entries = await readdir(resolved, { withFileTypes: true });

    const items: Array<{ name: string; type: string; size: number; modified: string }> = [];

    for (const entry of entries) {
      const fullPath = join(resolved, entry.name);
      try {
        const fileStat = await stat(fullPath);
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
        });
      } catch {
        // Broken symlink or inaccessible entry -- include with zero size
        items.push({
          name: entry.name,
          type: entry.isSymbolicLink() ? 'symlink' : 'file',
          size: 0,
          modified: new Date(0).toISOString(),
        });
      }
    }

    // Sort: directories first, then files, alphabetical within each group
    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    // Formatted table output
    const lines = items.map(
      (i) => `${i.name}  ${i.type}  ${i.size}  ${i.modified}`,
    );
    const output = lines.length > 0
      ? `name  type  size  modified\n${lines.join('\n')}`
      : '(empty directory)';

    return { success: true, output, data: items };
  } catch (err: unknown) {
    return handleError(err, params.path as string);
  }
}

/**
 * Read a file's content as a string. Limited to 1MB by default.
 */
export async function executeFilesRead(
  params: Record<string, unknown>,
): Promise<FileToolResult> {
  try {
    const filePath = params.path as string | undefined;
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: path' };
    }

    const encoding = (params.encoding as BufferEncoding | undefined) || 'utf-8';
    const resolved = safePath(filePath);
    const fileStat = await stat(resolved);

    if (fileStat.size > MAX_READ_SIZE) {
      return {
        success: false,
        output: '',
        error: `File too large (${fileStat.size} bytes). Maximum: 1MB`,
      };
    }

    const content = await readFile(resolved, encoding);

    return {
      success: true,
      output: content,
      data: { content, size: fileStat.size, path: resolved },
    };
  } catch (err: unknown) {
    return handleError(err, params.path as string);
  }
}

/**
 * Write content to a file. Creates parent directories if needed.
 */
export async function executeFilesWrite(
  params: Record<string, unknown>,
): Promise<FileToolResult> {
  try {
    const filePath = params.path as string | undefined;
    const content = params.content as string | undefined;

    if (!filePath || typeof filePath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: path' };
    }
    if (content === undefined || typeof content !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: content' };
    }

    const resolved = safePath(filePath);

    // Create parent directory if it doesn't exist
    await mkdir(dirname(resolved), { recursive: true });

    await writeFile(resolved, content, 'utf-8');
    const bytesWritten = Buffer.byteLength(content, 'utf-8');

    return {
      success: true,
      output: `Written ${bytesWritten} bytes to ${resolved}`,
      data: { bytesWritten, path: resolved },
    };
  } catch (err: unknown) {
    return handleError(err, params.path as string);
  }
}

/**
 * Delete a single file (not recursive -- single file only).
 */
export async function executeFilesDelete(
  params: Record<string, unknown>,
): Promise<FileToolResult> {
  try {
    const filePath = params.path as string | undefined;
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: path' };
    }

    const resolved = safePath(filePath);
    await rm(resolved);

    return {
      success: true,
      output: `Deleted ${resolved}`,
      data: { path: resolved },
    };
  } catch (err: unknown) {
    return handleError(err, params.path as string);
  }
}

/**
 * Rename or move a file. Both paths are validated against traversal.
 */
export async function executeFilesRename(
  params: Record<string, unknown>,
): Promise<FileToolResult> {
  try {
    const oldPath = params.oldPath as string | undefined;
    const newPath = params.newPath as string | undefined;

    if (!oldPath || typeof oldPath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: oldPath' };
    }
    if (!newPath || typeof newPath !== 'string') {
      return { success: false, output: '', error: 'Missing required parameter: newPath' };
    }

    const resolvedOld = safePath(oldPath);
    const resolvedNew = safePath(newPath);

    await rename(resolvedOld, resolvedNew);

    return {
      success: true,
      output: `Renamed ${resolvedOld} to ${resolvedNew}`,
      data: { oldPath: resolvedOld, newPath: resolvedNew },
    };
  } catch (err: unknown) {
    return handleError(err, params.oldPath as string);
  }
}

/**
 * Shared error handler for all file operations.
 * Maps common fs error codes to user-friendly messages.
 */
function handleError(err: unknown, path?: string): FileToolResult {
  if (err instanceof Error) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return { success: false, output: '', error: `File not found: ${path ?? 'unknown'}` };
    }
    if (nodeErr.code === 'EACCES') {
      return { success: false, output: '', error: `Permission denied: ${path ?? 'unknown'}` };
    }
    return { success: false, output: '', error: err.message };
  }
  return { success: false, output: '', error: String(err) };
}
