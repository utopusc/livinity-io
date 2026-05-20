// Phase 166-01 — CC PTY type surface.
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// surface routing all UNCHANGED. tmux apt install is deferred to Phase 170.
// This file is pure TypeScript types — no runtime imports of node-pty or tmux.

import type {Redis} from 'ioredis'

/**
 * Structural Logger shape mirroring the IdleReaperLogger pattern from
 * livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts.
 * We declare it inline here so cc-pty has zero dependency on the
 * claude-runner module — same shape, same contract.
 */
export interface CcPtyLogger {
	log: (msg: string) => void
	warn?: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

/**
 * One CC PTY session as persisted in `<vaultPath>/.claude/livos-cc-sessions.json`.
 *
 * Per CONTEXT.md §166-01 the canonical interface declares "9 fields exactly".
 * Literal count is 10 (id, userId, tmuxName, ccSessionId, cwd, model, createdAt,
 * lastAttachedAt, lastMessageAt, title) — title is the 10th optional one.
 * The types.test.ts source-text invariant asserts every canonical field is
 * present; see types.test.ts for the spec interpretation.
 */
export interface CcPtySession {
	id: string             // livos session uuid
	userId: string         // 'admin' or future multi-user
	tmuxName: string       // 'livos-cc-admin-abc12345'
	ccSessionId?: string   // CC's internal jsonl session id; set when CC writes it
	cwd: string            // /home/bruce/livinity-vault (default vault path)
	model?: string         // pinned model for this session ('claude-opus-4-7' default; null = uses CC default)
	createdAt: number      // epoch ms
	lastAttachedAt: number // epoch ms (touched on every WS attach)
	lastMessageAt: number  // epoch ms (touched when stdout flush detected)
	title?: string         // user-editable name
}

/**
 * Options passed to CcPtyManager constructor in Plan 166-03.
 */
export interface CcPtyManagerOptions {
	vaultPath: string
	redis: Redis
	logger: CcPtyLogger
	idleHours?: number     // default from liv:config:cc_pty_idle_h ?? 24
	maxSessions?: number   // default from liv:config:cc_pty_max_sessions ?? 10
}
