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

import {Router, type RequestHandler} from 'express'
import {readFile, stat} from 'node:fs/promises'
import path from 'node:path'

import {walkVault} from './walker.js'
import {buildGraph} from './builder.js'

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

	router.get('/api/vault/file', opts.authMiddleware, async (req, res) => {
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
