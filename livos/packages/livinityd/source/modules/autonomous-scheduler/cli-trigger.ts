// Phase 164-02 Task 3 — CLI escape hatch for manual autonomous trigger.
//
// Invoked via `livinityd autonomous-trigger <agent-name>`. Used by Phase
// 164-05 smoke test + by the future Settings UI (Phase 165). Connects to
// Redis directly, parses every agent definition in the vault, looks up
// the requested name, and runs it via a transient AutonomousScheduler
// instance.
//
// Why bypass the `liv:config:autonomous_enabled` flag here?
//   This CLI is an explicit operator action — running `livinityd
//   autonomous-trigger <name>` is far more deliberate than letting cron
//   fire automatically. The autonomous_enabled flag exists to protect
//   against accidental boot-time activation; an operator typing the
//   command opts in by that act. Concurrent + daily budget caps still
//   apply (the runAgent() path inside AutonomousScheduler unconditionally
//   enforces them), so cost is still bounded.
//
//   This trade-off is logged in 164-02-PLAN.md as T-164-02-06 (accepted).
//
// Process lifecycle: this function is called BEFORE the Livinityd
// constructor runs (see cli.ts early-branch), so it owns its own Redis
// connection + cleanup. Returns a process exit code:
//
//   0 — agent ran (regardless of agent-internal success/error; the
//       inbox entry records that distinction).
//   1 — usage error (agent name missing or not found in vault).
//   2 — scheduler.runNow() returned ok:false (this is rare — only the
//       "unknown agent" path, which step 1 already screened for).

import {Redis} from 'ioredis'
import path from 'node:path'

import {AutonomousScheduler} from './scheduler.js'
import {parseAgentDefinitionsDir} from './agent-definition-parser.js'

const DEFAULT_VAULT_PATH = '/home/bruce/livinity-vault'
const DEFAULT_REDIS_URL = 'redis://localhost:6379'

export interface AutonomousTriggerCliOptions {
	agentName: string
	vaultPath?: string
	redisUrl?: string
	logger?: {
		log: (msg: string) => void
		error: (msg: string, err?: unknown) => void
	}
}

/**
 * Run a single autonomous agent by name, immediately. Returns the process
 * exit code for cli.ts to forward to `process.exit(...)`.
 *
 * Never throws — all error paths flow into a logged + exit-code result.
 */
export async function autonomousTriggerCli(
	opts: AutonomousTriggerCliOptions,
): Promise<number> {
	const vaultPath = opts.vaultPath ?? DEFAULT_VAULT_PATH
	const redisUrl =
		opts.redisUrl ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL
	const logger = opts.logger ?? {
		log: (m: string) => console.log(m),
		error: (m: string, e?: unknown) => console.error(m, e ?? ''),
	}

	const redis = new Redis(redisUrl, {maxRetriesPerRequest: null})
	try {
		// Parse all agents in the vault. NOT gated on autonomous_enabled
		// — see module docblock for the explicit-operator-action
		// rationale. Daily + concurrent budget caps inside runAgent()
		// still apply.
		const agentsDir = path.join(vaultPath, 'livos-agents')
		const parseResult = await parseAgentDefinitionsDir(agentsDir)
		const found = parseResult.ok.find((d) => d.name === opts.agentName)
		if (!found) {
			logger.error(
				`autonomous-trigger: agent '${opts.agentName}' not found in ${agentsDir}`,
			)
			// Surface parse errors so the operator can see why a
			// supposedly-present agent is missing.
			for (const e of parseResult.errors) {
				logger.error(`  parse error in ${e.path}: ${e.err}`)
			}
			return 1
		}

		const scheduler = new AutonomousScheduler({
			redis,
			vaultPath,
			logger,
		})
		// Bypass start() (which respects autonomous_enabled and registers
		// cron tasks we don't want for this one-shot). registerDefinition
		// loads the def into the in-memory map directly.
		scheduler.registerDefinition(found)
		const result = await scheduler.runNow(opts.agentName)
		if (!result.ok) {
			logger.error(
				`autonomous-trigger: runNow failed: ${result.reason ?? 'unknown'}`,
			)
			return 2
		}
		logger.log(`autonomous-trigger: ${opts.agentName} completed`)
		return 0
	} finally {
		// Best-effort cleanup — never let a Redis quit failure mask the
		// exit code.
		await redis.quit().catch(() => {
			/* connection already closed */
		})
	}
}
