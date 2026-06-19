import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

import {$} from 'execa'

import type Livinityd from '../../../index.js'

export default async function appEnvironment(livinityd: Livinityd, command: string) {
	let inheritStdio = true
	// Prevent breaking test output
	if (process.env.TEST === 'true') inheritStdio = false

	const currentFilename = fileURLToPath(import.meta.url)
	const currentDirname = dirname(currentFilename)
	const composePath = join(currentDirname, 'docker-compose.yml')
	const options = {
		stdio: inheritStdio ? 'inherit' : 'pipe',
		cwd: livinityd.dataDirectory,
		env: {
			LIVINITY_DATA_DIR: livinityd.dataDirectory,
			// NETWORK_IP feeds the compose `networks:` block (subnet for
			// livinity_main_network). Phase 276: the dead auth/tor service env
			// keys were removed with the auth (276-01) + tor (276-05) services —
			// the networks-only compose only references $NETWORK_IP. The dead
			// JWT_SECRET + LIVINITYD_RPC_HOST injections were stripped too
			// (276 hygiene) — their only consumer was the removed auth-server;
			// no point handing livinityd's real signing key to a compose env
			// nothing reads.
			// TODO: Load this from somewhere more appropriate
			NETWORK_IP: '10.21.0.0',
			LIVINITY_LEGACY_COMPAT_DIR: currentDirname,
		},
	}
	if (command === 'up') {
		// Phase 276 fix (v44.41 regression): the legacy-compat compose is now
		// networks-only (auth/tor services were removed). `docker compose up` does
		// NOT create a top-level network when there are no services — so the shared
		// `livinity_main_network` never got created and EVERY installed app's
		// `external: livinity_main_network` attach (via docker-compose.common.yml)
		// failed ("network ... declared as external, but could not be found"),
		// breaking all apps. Create the network explicitly + idempotently FIRST.
		const subnet = '10.21.0.0/16' // matches the compose `$NETWORK_IP/16`
		try {
			await $(options as any)`docker network create --subnet ${subnet} livinity_main_network`
		} catch {
			// Network already exists (steady state) or a benign create race — fine.
		}
		// Reap any leftover auth/tor containers from before the P276 removal via
		// --remove-orphans. The compose is now networks-only (no services), so
		// `docker compose up --detach` exits NON-ZERO ("no service selected") on
		// current Docker Compose — which threw out of appEnvironment('up') and
		// broke EVERY app install (the install call site, apps.ts:715, is NOT
		// wrapped in the tolerant try/catch + pRetry the startup path uses). Drop
		// --build/--detach (a no-service `up` then exits 0) AND tolerate any
		// non-zero exit defensively — the shared network is already created
		// explicitly above, so this compose-up is now purely orphan cleanup.
		try {
			await $(
				options as any,
			)`docker compose --project-name livinity --file ${composePath} up --remove-orphans`
		} catch {
			// "no service selected" on the networks-only compose — harmless no-op.
		}
	} else {
		await $(options as any)`docker compose --project-name livinity --file ${composePath} ${command}`
	}
}
