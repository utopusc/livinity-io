/**
 * Phase 169-02 — Express route factory for vault graph + file fetch.
 *
 * `createVaultGraphRouter({vaultRoot, authMiddleware})` returns an Express
 * Router exposing two GET endpoints:
 *
 *   GET /api/vault/graph        — walks vaultRoot (capped at 2000 files),
 *                                 builds the wikilink graph, returns
 *                                 `{nodes, edges, truncated, totalFiles}` JSON.
 *
 *   GET /api/vault/file?path=…  — serves a single .md file's text content
 *                                 (capped at 1 MiB), `{path, content}` JSON.
 *
 * Both endpoints are gated by the caller-provided `authMiddleware` —
 * the route declaration places it BEFORE the handler so the handler never
 * runs for unauthenticated requests. Path traversal is rejected via
 * substring check (`..`) AND absolute-path check (defense in depth — the
 * substring check guards against any user attempt regardless of OS path
 * semantics, and the absolute-path check stops `/etc/passwd`-style absolute
 * arguments from being joined under `vaultRoot`).
 *
 * Threat mitigations:
 *  - T-169-02-01 Tampering (path traversal): substring `..` reject + isAbsolute reject
 *  - T-169-02-02 Info disclosure (vaultRoot escape): config-locked at construction
 *  - T-169-02-03 DoS (unbounded walk): walkVault maxFiles=2000
 *  - T-169-02-04 DoS (huge-file read): stat first, 413 if >1 MiB
 *  - T-169-02-05 Spoofing (unauth fetch): opts.authMiddleware applied per-route
 */

import {Router, type RequestHandler, type Application} from 'express'
import {readFile, stat} from 'node:fs/promises'
import path from 'node:path'

import {walkVault} from './walker.js'
import {buildGraph} from './builder.js'
import {getDesktopHome} from '../system/desktop-user.js'

const MAX_FILE_BYTES = 1_048_576 // 1 MiB cap for /api/vault/file

export interface VaultGraphRouterOpts {
	vaultRoot: string
	authMiddleware: RequestHandler
}

export function createVaultGraphRouter(opts: VaultGraphRouterOpts): Router {
	const router = Router()

	router.get('/api/vault/graph', opts.authMiddleware, async (_req, res) => {
		try {
			const {files, truncated} = await walkVault(opts.vaultRoot, 2000)
			const graph = buildGraph(files)
			res.json({
				nodes: graph.nodes,
				edges: graph.edges,
				truncated,
				totalFiles: files.length,
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'unknown error'
			res.status(500).json({error: msg})
		}
	})

	router.get('/api/vault/file', opts.authMiddleware, async (req, res): Promise<void> => {
		const relPath =
			typeof req.query.path === 'string' ? req.query.path : ''
		// Defense in depth: substring rejection + absolute-path rejection.
		if (!relPath || relPath.includes('..') || path.isAbsolute(relPath)) {
			res.status(400).json({error: 'invalid path'})
			return
		}
		const fullPath = path.join(opts.vaultRoot, relPath)
		try {
			const st = await stat(fullPath)
			if (st.size > MAX_FILE_BYTES) {
				res.status(413).json({
					error: 'file too large',
					size: st.size,
					limit: MAX_FILE_BYTES,
				})
				return
			}
			const content = await readFile(fullPath, 'utf8')
			res.json({path: relPath, content})
		} catch {
			res.status(404).json({error: 'file not found'})
		}
	})

	return router
}

/**
 * Phase 169-05 — Production mount helper.
 *
 * Resolves the vaultRoot from boot-time env (D-V35-I — config-locked, never
 * derived from a request) and constructs an Express auth middleware that
 * reuses `livinityd.server.verifyToken()` (the same JWT verifier used by
 * `mountAgentRunsRoutes` in `agent-runs.ts`), then mounts the router on the
 * given Express app.
 *
 * Source of truth for vaultRoot (in precedence order):
 *  1. `process.env.VAULT_ROOT` — operator override (always wins)
 *  2. `process.cwd() + '/test-vault'` when NODE_ENV === 'test'
 *  3. '/home/bruce/livinity-vault/' — Mini PC default
 *
 * Pattern mirrors `mountAgentRunsRoutes(app, livinityd)` from
 * `livos/packages/livinityd/source/modules/ai/agent-runs.ts`.
 */
export interface MountVaultGraphOpts {
	/** Test-only override of the resolved vaultRoot. Skips env precedence. */
	vaultRootOverride?: string
	/** Test-only override of the auth middleware. Skips JWT verification. */
	authOverride?: RequestHandler
}

interface LivinitydLike {
	server: {
		verifyToken: (token: string) => Promise<unknown>
	}
	logger: {
		log: (msg: string) => void
		error: (msg: string, err?: unknown) => void
		createChildLogger?: (name: string) => {log: (msg: string) => void; error: (msg: string, err?: unknown) => void}
	}
}

export function mountVaultGraphRoutes(
	app: Application,
	livinityd: LivinitydLike,
	opts: MountVaultGraphOpts = {},
): Router {
	// Phase 278: deploy seeds `LIV_VAULT_ROOT` (deploy-livinityd.sh), NOT
	// `VAULT_ROOT` — the old `VAULT_ROOT` read never matched, so the hardcoded
	// `/home/bruce/livinity-vault/` literal was ACTUALLY reached on every box.
	// Read LIV_VAULT_ROOT first (canonical, matches liv-vault/index.ts), keep
	// VAULT_ROOT as back-compat, and derive the final fallback from the desktop
	// user's home so it is never operator-specific.
	const vaultRoot =
		opts.vaultRootOverride ??
		process.env.LIV_VAULT_ROOT ??
		process.env.VAULT_ROOT ??
		(process.env.NODE_ENV === 'test'
			? path.join(process.cwd(), 'test-vault')
			: path.join(getDesktopHome(), 'livinity-vault/'))

	const authMiddleware: RequestHandler =
		opts.authOverride ??
		(async (req, res, next) => {
			try {
				const headerAuth = req.headers.authorization
				const headerToken =
					typeof headerAuth === 'string' && /^Bearer\s+/i.test(headerAuth)
						? headerAuth.replace(/^Bearer\s+/i, '').trim()
						: undefined
				const cookieToken =
					typeof req.headers.cookie === 'string'
						? req.headers.cookie.match(/LIVINITY_SESSION=([^;]+)/)?.[1]
						: undefined
				const queryToken =
					typeof req.query.token === 'string' ? req.query.token : undefined
				const token = headerToken ?? cookieToken ?? queryToken
				if (!token) {
					res.status(401).json({error: 'unauthenticated'})
					return
				}
				await livinityd.server.verifyToken(token)
				next()
			} catch {
				res.status(401).json({error: 'unauthenticated'})
			}
		})

	const router = createVaultGraphRouter({vaultRoot, authMiddleware})
	app.use(router)
	livinityd.logger.log(
		`[vault-graph] mounted /api/vault/graph + /api/vault/file (vaultRoot=${vaultRoot})`,
	)
	return router
}
