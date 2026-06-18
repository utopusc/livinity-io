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
			// the networks-only compose only references $NETWORK_IP.
			// TODO: Load this from somewhere more appropriate
			NETWORK_IP: '10.21.0.0',
			JWT_SECRET: await livinityd.server.getJwtSecret(),
			LIVINITYD_RPC_HOST: `host.docker.internal:${livinityd.server.port}`, // TODO: Check host.docker.internal works on linux
			LIVINITY_LEGACY_COMPAT_DIR: currentDirname,
		},
	}
	if (command === 'up') {
		await $(
			options as any,
		)`docker compose --project-name livinity --file ${composePath} ${command} --build --detach --remove-orphans`
	} else {
		await $(options as any)`docker compose --project-name livinity --file ${composePath} ${command}`
	}
}
