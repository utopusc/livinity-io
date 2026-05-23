/**
 * Phase 202-04 — local mirror of the LivosAgent type so the subapp does NOT
 * need to import from the livinityd workspace (subapp ships independently as
 * a Next.js standalone app under `livos/packages/liv-ai-app/`).
 *
 * Source of truth: `livos/packages/livinityd/source/db/schema.ts` —
 * `livosAgents` pgTable definition (Phase 202-01 / D-202-02). The columns
 * mirrored below match `$inferSelect` for that table. Keep in sync when the
 * backend table evolves.
 */

export interface LivosAgent {
	id: string
	name: string
	instructions: string
	modelName: string
	toolIds: string[]
	scheduleCron: string | null
	parentAgentId: string | null
	enabled: boolean
	system: boolean
	createdAt: string
	updatedAt: string
}

/**
 * Live status payload pushed over the `/agents/status/stream` SSE channel
 * (D-202-08). Mirrors `AgentStatusEvent` in
 * `livos/packages/livinityd/source/modules/mastra/scheduler.ts`. Kept here so
 * the subapp's `useAgentStatusSSE` hook + AgentCard component can share the
 * shape without crossing a workspace import boundary.
 */
export interface AgentStatusEvent {
	agentId: string
	state: 'idle' | 'running' | 'scheduled'
	threadId?: string
	triggeredBy?: 'cron' | 'manual' | 'parent_agent'
	at: string
	lastRunAt?: string
	nextScheduledAt?: string
	error?: string
}

/**
 * Per-agent live status accumulated on the client side. The
 * `useAgentStatusSSE` hook merges incoming `AgentStatusEvent` payloads into
 * `Record<agentId, AgentStatus>` so the AgentCard component reads a single
 * stable object per agent.
 */
export interface AgentStatus {
	state: 'idle' | 'running' | 'scheduled'
	threadId?: string
	lastRunAt?: string
	nextScheduledAt?: string
	error?: string
}
