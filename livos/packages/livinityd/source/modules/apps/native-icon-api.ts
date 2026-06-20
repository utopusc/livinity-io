// Phase 290 R3 (REQ3b / H2 / H3) — gated proxy that serves real freedesktop
// icon files for the Add Shortcut → Native tab.
//
// Mounted via server/index.ts's `createApi(...)` so it inherits the EXISTING
// `privateApi` LIVINITY_PROXY_TOKEN gate (verifyProxyToken) — there is NO
// bespoke session check here. Two routes:
//
//   GET /api/native/icon/:name      — bare freedesktop Icon= name (`gimp`).
//       name allowlist ^[a-zA-Z0-9_+.-]{1,128}$ (rejects `/` and `..`), then
//       resolveFreedesktopIcon → 404 if none.
//   GET /api/native/icon-file?path= — absolute Icon= path (`/opt/foo/x.png`).
//       The path must be absolute AND realpath under an allow-listed root.
//
// In BOTH cases the resolved file is realpath-asserted to live under an
// allow-listed root BEFORE sendFile — a symlink that escapes the allow-list is
// rejected (404). content-type is set by extension; responses are cacheable
// (public, max-age=86400). No basename-guess fallback — a miss is an honest 404.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import type express from 'express'

import type {ApiOptions} from '../server/index.js'
import {getDesktopHome} from '../system/desktop-user.js'
import {resolveFreedesktopIcon} from './freedesktop-icon-resolver.js'

// Bare-name allowlist — mirrors the freedesktop Icon= grammar but excludes `/`
// and (by construction) `..` so it can never traverse. 1-128 chars.
const ICON_NAME_RE = /^[a-zA-Z0-9_+.-]{1,128}$/

// Roots an icon file is allowed to live under (after realpath). The desktop
// home's .local/share is appended at request time (home is resolved per call).
const STATIC_ALLOWED_ROOTS = [
	'/usr/share',
	'/usr/local/share',
	'/usr/share/pixmaps',
	'/opt',
	// Flatpak (system installs) + Snap tile icons live under these roots.
	'/var/lib/flatpak',
	'/var/lib/snapd',
	'/snap',
] as const

function defaultAllowedRoots(home: string): string[] {
	return [...STATIC_ALLOWED_ROOTS, path.posix.join(home, '.local', 'share')]
}

// content-type by extension (the only extensions the resolver/route accept).
const EXT_CONTENT_TYPE: Record<string, string> = {
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.xpm': 'image/x-xpixmap',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.ico': 'image/x-icon',
}

function contentTypeForExt(filePath: string): string | undefined {
	return EXT_CONTENT_TYPE[path.extname(filePath).toLowerCase()]
}

/**
 * Test-injectable seams. Production passes nothing → the module resolves the
 * desktop home, uses fs.realpath/stat, the real resolver, and the static
 * allow-list. The mount in server/index.ts is unchanged (`createApi(nativeIconApi)`
 * supplies only ApiOptions; `deps` stays default).
 */
export interface NativeIconApiDeps {
	home?: string
	allowedRoots?: (home: string) => string[]
	resolveIcon?: (name: string, home: string) => Promise<string | null>
	realpath?: (p: string) => Promise<string>
	stat?: (p: string) => Promise<{isFile(): boolean}>
}

function sendIcon(response: express.Response, realPath: string): void {
	const ct = contentTypeForExt(realPath)
	if (ct) response.setHeader('Content-Type', ct)
	response.setHeader('Cache-Control', 'public, max-age=86400')
	response.sendFile(realPath)
}

export default function nativeIconApi({privateApi}: ApiOptions, deps: NativeIconApiDeps = {}) {
	const resolveHome = () => deps.home ?? getDesktopHome()
	const rootsFor = deps.allowedRoots ?? defaultAllowedRoots
	const resolveIcon = deps.resolveIcon ?? resolveFreedesktopIcon
	const realpathFn = deps.realpath ?? ((p: string) => fs.realpath(p))
	const statFn = deps.stat ?? ((p: string) => fs.stat(p))

	// realpath the candidate file and assert it sits under an allow-listed root.
	async function assertUnderAllowedRoot(filePath: string, home: string): Promise<string | null> {
		let real: string
		try {
			real = await realpathFn(filePath)
		} catch {
			return null
		}
		const roots = rootsFor(home)
		const ok = roots.some((root) => real === root || real.startsWith(`${root}${path.sep}`) || real.startsWith(`${root}/`))
		return ok ? real : null
	}

	// GET /api/native/icon/:name — bare freedesktop name → theme file.
	privateApi.get('/icon/:name', async (request, response) => {
		const name = request.params.name
		if (typeof name !== 'string' || !ICON_NAME_RE.test(name)) {
			return response.status(400).json({error: 'invalid icon name'})
		}
		const home = resolveHome()
		let resolved: string | null
		try {
			resolved = await resolveIcon(name, home)
		} catch {
			resolved = null
		}
		if (!resolved) return response.status(404).json({error: 'not found'})
		const real = await assertUnderAllowedRoot(resolved, home)
		if (!real) return response.status(404).json({error: 'not found'})
		return sendIcon(response, real)
	})

	// GET /api/native/icon-file?path=/opt/foo/x.png — absolute Icon= path.
	privateApi.get('/icon-file', async (request, response) => {
		const raw = typeof request.query.path === 'string' ? request.query.path : ''
		// Must be an absolute path with no traversal segments. The realpath gate
		// below is the real boundary, but reject obviously-bad input up front.
		if (!raw.startsWith('/') || raw.includes('\0') || raw.split('/').includes('..')) {
			return response.status(400).json({error: 'invalid path'})
		}
		const home = resolveHome()
		const real = await assertUnderAllowedRoot(raw, home)
		if (!real) return response.status(404).json({error: 'not found'})
		// Only serve regular files (not directories / sockets).
		try {
			const st = await statFn(real)
			if (!st.isFile()) return response.status(404).json({error: 'not found'})
		} catch {
			return response.status(404).json({error: 'not found'})
		}
		return sendIcon(response, real)
	})
}
