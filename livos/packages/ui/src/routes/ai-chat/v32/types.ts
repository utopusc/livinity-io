// Shared types for v32 chat surface.
// Consumed by: P81 (chat UI), P82 (tool panel), P83 (per-tool views), P88 (SSE migration).
// Additive-only: downstream phases must not modify existing fields — only extend.

export interface Attachment {
  id: string
  name: string
  size: number
  mimeType: string
  // localUrl is a blob: URL created at pick-time for preview; undefined after upload resolves.
  localUrl?: string
}

// Snapshot of a single tool call as emitted by LivAgentRunner (P67).
// Mirrors RunStore.ToolCallSnapshot — kept local to avoid coupling to core dist.
export interface ToolCallSnapshot {
  toolId: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'running' | 'complete' | 'error'
  startedAt: number
  endedAt?: number
  // Additive (P87): groups parallel calls from the same assistant turn.
  batchId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
  // Tool calls associated with this assistant message (P82/P83 consume).
  toolCalls?: ToolCallSnapshot[]
  // Streaming state: 'streaming' while tokens are arriving, 'complete' when done.
  status?: 'streaming' | 'complete' | 'error'
  timestamp: number
}
