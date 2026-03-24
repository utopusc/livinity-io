# Phase 50: Agent Core Tools -- Shell + Files - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements the two most critical agent tools: shell command execution and file operations. These replace the stubs from Phase 48 with real implementations. After this phase, the AI can run commands and manage files on the user's remote PC.

</domain>

<decisions>
## Implementation Decisions

### Shell Tool
- Tool name: `shell` (registered as `device_{deviceId}_shell` via proxy)
- Parameters: { command: string, cwd?: string, timeout?: number }
- Use child_process.spawn with shell option (NOT exec) for better output handling
- Cross-platform shell detection: PowerShell on Windows (process.platform === 'win32'), bash on others (fallback to sh)
- Spawn in a shell context so pipes, redirects, and env vars work
- Return structured JSON: { stdout: string, stderr: string, exitCode: number, duration: number }
- Default timeout: 30 seconds (configurable in params)
- Truncate output if > 100KB to avoid overwhelming the WebSocket

### Files Tool — Split into Multiple Tools
- `files_list`: { path: string } → returns array of { name, type, size, modified, permissions }
- `files_read`: { path: string, encoding?: string } → returns { content: string, size: number }
- `files_write`: { path: string, content: string } → returns { success: boolean, bytesWritten: number }
- `files_delete`: { path: string } → returns { success: boolean }
- `files_rename`: { oldPath: string, newPath: string } → returns { success: boolean }
- All paths resolved relative to user's home directory by default
- Path traversal protection: reject paths with .. that escape home directory (for safety)
- Use Node.js fs/promises for all operations
- File read: limit to 1MB by default (prevent reading huge files)
- files_list: include file type (file/directory/symlink), size in bytes, ISO modified date

### Tool Registration in agent/src/tools.ts
- Replace stub implementations with real functions
- Each tool is a separate file: `agent/src/tools/shell.ts`, `agent/src/tools/files.ts`
- ToolExecutor in tools.ts dispatches to the correct tool function based on toolName
- Return ToolResult: { success: boolean, result: any, error?: string }

### Error Handling
- Shell command failures (non-zero exit) are NOT errors — return stdout/stderr/exitCode normally
- File operation failures (ENOENT, EACCES, etc.) return error result with clear message
- Never throw from tool functions — always return structured result

### Claude's Discretion
- Output formatting details
- Encoding handling for binary files
- Exact path resolution logic

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/tools.ts` — ToolExecutor with tool dispatch and stub implementations (Phase 48)
- `agent/src/types.ts` — DeviceToolCall, DeviceToolResult, ToolResult types
- `agent/src/connection-manager.ts` — Receives tool_call messages, calls ToolExecutor

### Established Patterns
- Tool dispatch: switch on toolName, call handler, return ToolResult
- Structured JSON responses with success/error pattern
- Cross-platform detection via process.platform

### Integration Points
- Replace stubs in `agent/src/tools.ts` with real implementations
- Tool parameter schemas must match what DeviceBridge registers as proxy tool params in Nexus

</code_context>

<specifics>
## Specific Ideas

- Shell tool should feel like SSH — the AI gets structured output it can parse and reason about
- File operations should mirror what the AI already has for local LivOS files, but on the remote PC
- Keep tool implementations self-contained — each tool file exports a single async function

</specifics>

<deferred>
## Deferred Ideas

- Interactive shell sessions (PTY) — too complex for v14.0, use single-command execution
- Large file transfer (chunked upload/download) — v14.1
- File search (find by name/content) — v14.1
- Shell history / session persistence — v14.1

</deferred>
