import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {isMultiUserMode} from '../ai/per-user-claude.js'
import type Livinityd from '../../index.js'

/**
 * Phase 57: subscription token extraction for passthrough mode.
 *
 * Reads per-user OAuth credentials written by Phase 40 "Connect Claude" flow:
 *   /opt/livos/data/users/<userId>/.claude/.credentials.json  (multi-user)
 *   $HOME/.claude/.credentials.json                            (single-user / BROKER_FORCE_ROOT_HOME=true)
 *
 * Per RESEARCH.md Pitfall 2: NEVER log the path or file contents — only userId
 * and boolean outcome. Per RESEARCH.md Pitfall 5: returns null on any failure;
 * caller must surface a 401 with actionable error message to client.
 *
 * Sacred file boundary: this module does NOT import any nexus runner
 * symbol (Pitfall 1) — broker-local only.
 */

export interface SubscriptionToken {
	accessToken: string
	refreshToken?: string
	expiresAt?: string
}

const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/

export async function readSubscriptionToken(opts: {
	livinityd: Livinityd
	userId: string
}): Promise<SubscriptionToken | null> {
	const {livinityd, userId} = opts

	// Pitfall 2 / path-traversal mitigation — match auth.ts:95 + nexus/api.ts:2423
	if (!USER_ID_REGEX.test(userId)) {
		livinityd.logger.log(
			`[livinity-broker:passthrough] credential lookup skipped — invalid userId shape (multiUser=unknown)`,
		)
		return null
	}

	const dataDir = process.env.LIVOS_DATA_DIR || '/opt/livos/data'
	const forceRootHome = process.env.BROKER_FORCE_ROOT_HOME === 'true'
	let multiUser = false
	try {
		multiUser = (await isMultiUserMode(livinityd)) === true
	} catch {
		multiUser = false
	}

	let credPath: string
	if (multiUser && !forceRootHome) {
		credPath = join(dataDir, 'users', userId, '.claude', '.credentials.json')
	} else {
		credPath = join(process.env.HOME || '/root', '.claude', '.credentials.json')
	}

	try {
		const raw = await readFile(credPath, 'utf8')
		const json = JSON.parse(raw) as {
			claudeAiOauth?: {
				accessToken?: string
				refreshToken?: string
				expiresAt?: string
			}
		}
		const oauth = json?.claudeAiOauth
		if (!oauth?.accessToken || typeof oauth.accessToken !== 'string') {
			livinityd.logger.log(
				`[livinity-broker:passthrough] credentials.json missing claudeAiOauth.accessToken for user=${userId} (multiUser=${multiUser})`,
			)
			return null
		}
		return {
			accessToken: oauth.accessToken,
			refreshToken: oauth.refreshToken,
			expiresAt: oauth.expiresAt,
		}
	} catch {
		// Pitfall 2 — DO NOT include `credPath` or stack in log (path leakage).
		livinityd.logger.log(
			`[livinity-broker:passthrough] credentials.json read failed for user=${userId} (multiUser=${multiUser}, forceRootHome=${forceRootHome})`,
		)
		return null
	}
}
