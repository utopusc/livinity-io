// livos/packages/livinityd/source/modules/local-dns/pki.ts
// Source: 104-PATTERNS.md "pki.ts (service)" — Caddy root CA cert read.
//
// Phase 104 plan 104-03 — reads the liv-local named-CA root cert PEM that
// Caddy auto-generates after `caddy reload` against the local-lan Caddyfile.
// The pki block lives in /etc/caddy/pki-global.conf (provisioned by
// install.sh's mode-local-lan.sh — D-104-CADDY-PKI-IMPORT).

import {readFile} from 'node:fs/promises'
import {exec} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'

const execAsync = promisify(exec)

export const CADDY_PKI_AUTHORITY_DIR =
	'/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local'
export const CADDY_PKI_ROOT_CRT = path.join(CADDY_PKI_AUTHORITY_DIR, 'root.crt')

/**
 * Read the named-CA root cert PEM. Throws if the file is missing or unreadable.
 * Per RESEARCH §Tertiary Sources, the exact path may drift between Caddy versions —
 * try the constant first, then fall back to find(1).
 */
export async function readRootCert(): Promise<string> {
	try {
		return await readFile(CADDY_PKI_ROOT_CRT, 'utf-8')
	} catch {
		const fallback = await findRootCertPath()
		if (!fallback) {
			throw new Error(
				`liv-local root.crt not found at ${CADDY_PKI_ROOT_CRT} or via find(1)`,
			)
		}
		return await readFile(fallback, 'utf-8')
	}
}

/** Find the actual root.crt path under /var/lib/caddy in case Caddy moved it. */
export async function findRootCertPath(): Promise<string | null> {
	try {
		const {stdout} = await execAsync(
			"find /var/lib/caddy -name root.crt -type f -path '*liv-local*' -print -quit",
		)
		const trimmed = stdout.trim()
		return trimmed.length > 0 ? trimmed : null
	} catch {
		return null
	}
}
