/**
 * Phase 205-04 — OpenclawConfigStore.
 *
 * Atomic read/patch/write of `/opt/livos/data/openclaw/openclaw.json` for the
 * new `openclawos.gateway.*` tRPC router (Wave 3). The gateway plugin
 * live-reloads this file on every mtime change (verified by Probe A6 in
 * `.planning/phases/205-liv-ai-ui-carryovers/205-01-SPIKE-NOTES.md`), so the
 * router can mutate `gateway.controlUi.allowedOrigins[]` /
 * `gateway.auth.{token,mode}` without any `kill -HUP` or `systemctl restart
 * liv-claw-gateway` step.
 *
 * Atomicity contract (D-205-12):
 *
 *   - `read()` returns the parsed object verbatim, or throws
 *     `OPENCLAW_CONFIG_MISSING` if the file is absent (callers can map this
 *     to a TRPCError `PRECONDITION_FAILED`).
 *   - `patch(mut)` reads, applies the synchronous mutator, writes to a
 *     side-loaded tmp file with `mode: 0o600`, runs `chmodSync(tmp, 0o600)`
 *     for defense-in-depth (Windows ignores; POSIX honors writeFileSync's
 *     `mode` option already, but the explicit chmod survives umask quirks),
 *     and finally `renameSync(tmp, path)` for the atomic swap.
 *   - Unknown top-level keys are preserved across patch — the index signature
 *     `[k: string]: unknown` on `OpenclawConfig` documents the intent at the
 *     type level, and the runtime simply serializes whatever the mutator
 *     leaves on the object.
 *   - If the mutator throws, the rename never runs and the on-disk file is
 *     unchanged. The tmp file may linger briefly — acceptable per the
 *     `env-file-writer.ts:defaultFs.writeAtomic` precedent.
 *
 * The class is intentionally thin — no caching, no debouncing, no in-memory
 * fan-out. Concurrency is handled by last-writer-wins via the atomic rename.
 * Production callers serialise on the tRPC mutation path (every mutation is
 * its own request/response cycle and OpenclawConfigStore.patch is short).
 */

import {
	chmodSync,
	existsSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs'

/**
 * Phase 207 R1 — Subset of openclaw's `McpServerConfig` shape (see
 * `node_modules/openclaw/dist/types.openclaw-*.d.ts`). Only the fields LivOS
 * actually mirrors from `liv:mcp:config` are typed here; openclaw tolerates
 * extra keys (`[k: string]: unknown` on the upstream type) so we don't have
 * to enumerate every Codex/HTTP variant.
 */
export interface OpenclawMcpServerConfig {
	command?: string
	args?: string[]
	env?: Record<string, string | number | boolean>
	url?: string
	headers?: Record<string, string | number | boolean>
	[k: string]: unknown
}

export interface OpenclawConfig {
	gateway?: {
		controlUi?: {allowedOrigins?: string[]}
		auth?: {
			token?: string
			mode?: 'none' | 'token' | 'password' | 'trusted-proxy'
		}
	}
	/**
	 * Phase 207 R1 — `mcp.servers` field that the openclaw gateway live-reloads
	 * to spawn MCP runtimes and expose their tools to agent chats. Mirrored
	 * from Redis hash `liv:mcp:config` on every `mcp.config.*` mutation so the
	 * `/settings → MCP` tab persists changes that actually reach chat.
	 */
	mcp?: {
		servers?: Record<string, OpenclawMcpServerConfig>
		sessionIdleTtlMs?: number
		[k: string]: unknown
	}
	plugins?: {entries?: unknown[]}
	[k: string]: unknown
}

export class OpenclawConfigStore {
	constructor(private readonly path: string) {}

	read(): OpenclawConfig {
		if (!existsSync(this.path)) {
			throw new Error('OPENCLAW_CONFIG_MISSING')
		}
		const raw = readFileSync(this.path, 'utf8')
		return JSON.parse(raw) as OpenclawConfig
	}

	patch(mut: (cfg: OpenclawConfig) => void): OpenclawConfig {
		const cfg = this.read()
		mut(cfg)
		const tmp = `${this.path}.tmp.${process.pid}.${Date.now()}`
		writeFileSync(tmp, JSON.stringify(cfg, null, 2), {mode: 0o600})
		try {
			chmodSync(tmp, 0o600)
		} catch {
			// chmod on tmp is non-fatal — POSIX inherits the writeFileSync mode,
			// Windows ignores file mode entirely. The atomic rename is the
			// critical step.
		}
		renameSync(tmp, this.path)
		return cfg
	}
}
