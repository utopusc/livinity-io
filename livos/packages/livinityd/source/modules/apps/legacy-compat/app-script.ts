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
	return $({
		stdio: inheritStdio ? 'inherit' : 'pipe',
		env: {
			SCRIPT_LIVINITY_ROOT: livinityd.dataDirectory,
			SCRIPT_DOCKER_FRAGMENTS: currentDirname,
			// Phase 276 hygiene: JWT_SECRET injection removed — the only consumer
			// was the deleted Umbrel auth-server; no app-script hook or app compose
			// reads it, so livinityd's signing key is no longer exposed to the app env.
			SCRIPT_APP_REPO_DIR,
			BITCOIN_NETWORK: 'mainnet', // Needed for legacy reasons otherwise the Bitcoin app fails to start
			// Phase 276 (276-05): the tor-access env was removed with the Remote
			// Tor Access feature — app-script no longer merges the tor compose
			// fragment (that branch is gone), so the tor env is dead.
		},
	})`${scriptPath} ${command} ${arg}`
}
