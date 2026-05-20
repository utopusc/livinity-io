// Phase 171-01 — Item type surface (v38 D-V38-B + D-V38-T).
//
// Canonical discriminated union for the v38 vault Item tree. Downstream
// plans (171-02 item-store, 171-03 tree-resolver, 171-04 tRPC router,
// 171-05 pub/sub) consume `Item`, `BaseItem`, and the per-type variants
// from this barrel verbatim. No runtime code lives here — pure types.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty/{types,session-store,ws-handler,idle-reaper}.ts
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph/{walker,parser,builder,routes}.ts
// all UNCHANGED. This NEW file lives at vault-items/types.ts (distinct
// path from cc-pty/types.ts) and is purely additive.

/**
 * Shared base fields for every Item kind. Per D-V38-B, every Item carries
 * a stable id, a tree edge (parentId), display metadata, lifecycle
 * timestamps, an archive marker, and a schemaVersion for D-V38-C bumping.
 */
export interface BaseItem {
	id: string // UUID v7 (time-sortable; uuidv7 package)
	parentId: string | null // tree edge; null = root child
	name: string // user-visible label
	pinned: boolean // sort hint (pinned-first then updatedAt desc)
	createdAt: number // epoch ms
	updatedAt: number // epoch ms
	archivedAt: number | null // null = active; set on archive
	schemaVersion: 1 // D-V38-C — bumpable, frozen at 1 for Phase 171
}

/**
 * A project Item — points at a working directory (a repo, a vault folder,
 * or a workspace). Phase 171-02 item-store persists projects under the
 * vault root; downstream Phases use `cwd` to seed cc-pty / claude-runner.
 */
export interface ProjectItem extends BaseItem {
	type: 'project'
	cwd?: string // absolute path to a repo or workspace
}

/**
 * An agent Item — a long-lived background agent definition. Optional
 * cron `schedule` is consumed by Phase 177 autonomous-scheduler.
 */
export interface AgentItem extends BaseItem {
	type: 'agent'
	schedule?: string // cron expression (Phase 177 consumes)
}

/**
 * A chat Item — one CC PTY conversation. `ccSessionId` points at the
 * Claude Code internal jsonl session id; Phase 173 migrates on-disk
 * jsonl locations under the new vault layout.
 */
export interface ChatItem extends BaseItem {
	type: 'chat'
	ccSessionId?: string // CC PTY jsonl session id (Phase 173 migrates)
}

/**
 * The v38 vault Item discriminated union. `type` narrows access to
 * per-variant fields at compile time. Plan 171-02 item-store
 * re-validates `type` on every disk load to reject tampered files
 * (threat T-171-01-03).
 */
export type Item = ProjectItem | AgentItem | ChatItem

/**
 * Literal-string union of every supported Item discriminator. Useful
 * for downstream routers that need to switch on `type` exhaustively.
 */
export type ItemType = Item['type'] // 'project' | 'agent' | 'chat'
