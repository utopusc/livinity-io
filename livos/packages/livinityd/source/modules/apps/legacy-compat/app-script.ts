import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

import {$} from 'execa'

import type Livinityd from '../../../index.js'

export default async function appScript(livinityd: Livinityd, command: string, arg: string, inheritStdio: boolean = true) {
	// Prevent breaking test output
	if (process.env.TEST === 'true') inheritStdio = false

	const currentFilename = fileURLToPath(import.meta.url)
	const currentDirname = dirname(currentFilename)
	const scriptPath = join(currentDirname, 'app-script')
	// Phase 276 (WS1-A): the community git-clone app store was removed, so there
	// is no per-app repo template dir to resolve. This was always allowed to be
	// unset (the legacy comment: "if the repo hasn't been pulled yet … or a 3rd
	// party app had its repo uninstalled") — that empty-string state is now the
	// permanent one. Builtin/platform apps don't use SCRIPT_APP_REPO_DIR.
	const SCRIPT_APP_REPO_DIR = ''
	const torEnabled = await livinityd.store.get('torEnabled')
	return $({
		stdio: inheritStdio ? 'inherit' : 'pipe',
		env: {
			SCRIPT_LIVINITY_ROOT: livinityd.dataDirectory,
			SCRIPT_DOCKER_FRAGMENTS: currentDirname,
			JWT_SECRET: await livinityd.server.getJwtSecret(),
			SCRIPT_APP_REPO_DIR,
			BITCOIN_NETWORK: 'mainnet', // Needed for legacy reasons otherwise the Bitcoin app fails to start
			TOR_PROXY_IP: '10.21.21.11',
			TOR_PROXY_PORT: '9050',
			TOR_PASSWORD: 'mLcLDdt5qqMxlq3wv8Din3UD44bTZHzRFhIktw38kWg=',
			TOR_HASHED_PASSWORD: '16:158FBE422B1A9D996073BE2B9EC38852C70CE12362CA016F8F6859C426',
			REMOTE_TOR_ACCESS: torEnabled ? 'true' : 'false',
		},
	})`${scriptPath} ${command} ${arg}`
}
