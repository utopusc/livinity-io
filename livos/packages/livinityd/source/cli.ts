#!/usr/bin/env tsx
import process from 'node:process'

import arg from 'arg'
import camelcaseKeys from 'camelcase-keys'

import {cliClient} from './modules/cli-client.js'
import blacklistUas from './modules/blacklist-uas/blacklist-uas.js'
import {shutdown} from './modules/system/system.js'

import Livinityd, {type LivinitydOptions} from './index.js'

// Blacklists uas drivers early in the boot process
if (process.argv.includes('blacklist-uas')) {
	await blacklistUas()
	process.exit(0)
}

// Quick trpc client for testing
if (process.argv.includes('client')) {
	const clientIndex = process.argv.indexOf('client')
	const query = process.argv[clientIndex + 1]
	const args = process.argv.slice(clientIndex + 2)

	await cliClient({query, args})
	process.exit(0)
}

// Phase 164-02 — Manual autonomous-agent trigger. Operator-only escape
// hatch used by Phase 164-05 smoke test + the future Settings UI (Phase
// 165). Runs BEFORE `new Livinityd(...)` so we don't spin up the full
// daemon for a one-shot agent run. Connects to Redis directly via the
// REDIS_URL env or the localhost default; daily + concurrent budget caps
// inside scheduler.runAgent() still apply. Bypasses the
// `liv:config:autonomous_enabled` flag — see cli-trigger.ts docblock for
// autonomous-trigger subcommand removed — AI Chat feature torn out.

const showHelp = () =>
	console.log(`
    Usage
        $ livinityd

    Options
        --help                     Shows this help message
        --data-directory           Your Livinity data directory
        --port                     The port to listen on
        --log-level                The logging intensity: silent|normal|verbose
        --default-app-store-repo   The default app store repository

    Subcommands
        client <query> [...args]   Quick tRPC client (debug)

    Examples
        $ livinityd --data-directory ~/livinity
`)

const args = camelcaseKeys(
	arg({
		'--help': Boolean,
		'--data-directory': String,
		'--port': Number,
		'--log-level': String,
		'--default-app-store-repo': String,
	}),
)

if (args.help) {
	showHelp()
	process.exit(0)
}

// TODO: Validate these args are valid
const livinityd = new Livinityd(args as LivinitydOptions)

// Shutdown on SIGINT and SIGTERM — exit immediately to release port.
// PM2 manages process lifecycle, so graceful cleanup is best-effort.
let isShuttingDown = false
function cleanShutdown(signal: string) {
	if (isShuttingDown) return
	isShuttingDown = true
	livinityd.logger.log(`Received ${signal}, exiting immediately to release port`)
	// Phase 59 — flush pending api_keys.last_used_at writes before exit so
	// audit-visible "last seen" timestamps don't get lost on SIGTERM/SIGINT
	// (RESEARCH.md Pitfall 2). Best-effort: if dispose throws or the process
	// is killed by PM2 before it resolves, we still exit — never block here.
	livinityd.apiKeyCache?.dispose().catch(() => {})
	process.exit(0)
}
process.on('SIGINT', cleanShutdown.bind(null, 'SIGINT'))
process.on('SIGTERM', cleanShutdown.bind(null, 'SIGTERM'))

// HW-01 (326-03, D-15/D-17): UPS clean-shutdown signal. Distinct from SIGTERM (which
// exits immediately to release the port — the contract update.sh/systemd-restart rely
// on, left UNCHANGED). SIGUSR2 is sent ONLY by the root upsmon SHUTDOWNCMD wrapper
// (livos-ups-shutdown.sh). It replicates the system.shutdown route: dispatch the
// critical UPS ALERT, stop all apps cleanly (livinityd.stop()), then poweroff.
let isUpsShutdown = false
process.on('SIGUSR2', () => {
	if (isUpsShutdown) return
	isUpsShutdown = true
	void (async () => {
		livinityd.logger.log('Received SIGUSR2 (UPS FSD) — clean shutdown')
		await livinityd.notifications.add('ups-power-loss', {severity: 'critical', external: true}).catch(() => {})
		await livinityd.stop().catch((e) => livinityd.logger.error('UPS clean stop failed', e))
		await shutdown().catch((e) => livinityd.logger.error('UPS poweroff failed', e))
	})()
})

try {
	await livinityd.start()
} catch (error) {
	console.error(process.env.NODE_ENV === 'production' ? (error as Error).message : error)
	process.exit(1)
}
