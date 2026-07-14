// Phase 328 SEC-02 — read-only weak-config probes for the Security Advisor.
//
// Complements the scheduled Trivy image scan (scheduler-job.ts): Trivy covers
// CONTAINER IMAGE CVEs only, these probes cover HOST/APP misconfiguration. Each
// probe is a small, provable, READ-ONLY check that returns a boolean `detected`
// plus a fixed remediation i18n key — it NEVER surfaces raw host secrets (sshd
// contents, key material, api-key plaintext) into the report (T-328-06).
//
// NB: Phase 19 (docker/vuln-scan.ts) documented a CGV-04 non-goal of "no
// scheduler / no auto-scan / no background polling". Phase 328 SEC-02 knowingly
// overturns that non-goal — the scheduled advisor scan + these probes are the
// intended, complementary host-config control.
//
// HONESTY (D-328-2 / RESEARCH Anti-Pattern): bcrypt password hashes are one-way
// by design, so existing password strength CANNOT be audited retroactively.
// There is deliberately NO fake retroactive weak-password check here — only a
// standing advisory note (WEAK_PASSWORD_NOTE_KEY) rendered by the UI.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import type Livinityd from '../../index.js'
import {getPool} from '../database/index.js'
import {listJails} from '../fail2ban-admin/index.js'
import {listAllApiKeys} from '../api-keys/database.js'

export interface WeakConfigFinding {
	id: string
	severity: 'critical' | 'warning' | 'info'
	detected: boolean // true = the weakness is present
	remediation: string // i18n key, e.g. 'settings.security-advisor.remediation.enable-2fa'
	settingsLink?: string // e.g. '/settings/security-sessions'
}

// SEC-02 honesty note: bcrypt is one-way, so existing passwords cannot be audited
// retroactively. This is a standing advisory note the UI renders — NOT a check.
export const WEAK_PASSWORD_NOTE_KEY = 'settings.security-advisor.note.weak-password-not-retroactive'

const STALE_KEY_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

/**
 * Best-effort read of the effective `PasswordAuthentication` directive from
 * `/etc/ssh/sshd_config` plus any `/etc/ssh/sshd_config.d/*.conf` drop-ins.
 *
 * Returns:
 *   'yes' | 'no' — the LAST uncommented directive found (or sshd's compiled-in
 *                  default of 'yes' when nothing explicit is present but a config
 *                  file WAS readable).
 *   null         — NOTHING was readable (permission denied / ENOENT). The caller
 *                  OMITS the check in this case rather than reporting a false
 *                  negative (RESEARCH A4 flags read-permission as unverified; the
 *                  omit-on-null path is the mitigation — no new sudoers grant).
 */
async function readSshPasswordAuth(): Promise<'yes' | 'no' | null> {
	const files: string[] = ['/etc/ssh/sshd_config']
	try {
		const dropInDir = '/etc/ssh/sshd_config.d'
		const entries = await fs.readdir(dropInDir)
		for (const entry of entries) {
			if (entry.endsWith('.conf')) files.push(path.join(dropInDir, entry))
		}
	} catch {
		// No drop-in dir / unreadable — fall back to the main config only.
	}

	let readAny = false
	let lastValue: 'yes' | 'no' | null = null
	for (const file of files) {
		let content: string
		try {
			content = await fs.readFile(file, 'utf8')
		} catch {
			continue // this file unreadable — skip, try the rest
		}
		readAny = true
		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim()
			if (!line || line.startsWith('#')) continue
			const match = /^PasswordAuthentication\s+(yes|no)\b/i.exec(line)
			if (match) lastValue = match[1].toLowerCase() as 'yes' | 'no'
		}
	}

	if (!readAny) return null
	// Readable but no explicit directive → sshd's compiled-in default is 'yes'.
	return lastValue ?? 'yes'
}

/**
 * Run the 5 read-only weak-config probes. EACH probe is independently
 * try/catch'd: if a probe throws (or cannot prove its condition), it is OMITTED
 * from the result rather than aborting the whole report. None of the probes
 * returns raw secrets — only a boolean `detected` + a fixed remediation key.
 */
export async function runWeakConfigChecks(livinityd: Livinityd): Promise<WeakConfigFinding[]> {
	const findings: WeakConfigFinding[] = []

	// 1. admin-2fa-disabled (critical) — any admin account without TOTP enabled.
	//    Wrapped in try/catch so the mid-deploy window where `totp_enabled` (the
	//    column added by Plan 03 / IDENT-05) is briefly absent just drops this one
	//    check instead of aborting the report.
	try {
		const pool = getPool()
		if (pool) {
			const {rows} = await pool.query<{n: number}>(
				"SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND (totp_enabled IS NOT TRUE)",
			)
			findings.push({
				id: 'admin-2fa-disabled',
				severity: 'critical',
				detected: (rows[0]?.n ?? 0) > 0,
				remediation: 'settings.security-advisor.remediation.enable-2fa',
				settingsLink: '/settings/security-sessions',
			})
		}
	} catch {
		// omit on error (e.g. totp_enabled column not yet migrated)
	}

	// 2. org-2fa-policy-disabled (warning) — org-wide 2FA enforcement not turned
	//    on. Reads the SAME FileStore key Plan 03 writes (inline literal, no
	//    Plan-03 import — the two plans share the key contract, not code).
	try {
		const detected = !Boolean(await livinityd.store.get('security.require2fa'))
		findings.push({
			id: 'org-2fa-policy-disabled',
			severity: 'warning',
			detected,
			remediation: 'settings.security-advisor.remediation.enforce-2fa',
			settingsLink: '/settings/security-sessions',
		})
	} catch {
		// omit on error
	}

	// 3. fail2ban-inactive (warning) — no jails running. A thrown
	//    Fail2banClientError (binary-missing / service-inactive) is itself the
	//    "inactive" signal, so it maps to detected=true rather than an omit.
	try {
		let detected: boolean
		try {
			const jails = await listJails()
			detected = jails.length === 0
		} catch {
			detected = true // binary-missing / service-inactive → fail2ban is not protecting the box
		}
		findings.push({
			id: 'fail2ban-inactive',
			severity: 'warning',
			detected,
			remediation: 'settings.security-advisor.remediation.fail2ban',
		})
	} catch {
		// omit on error
	}

	// 4. stale-api-keys (info) — a long-lived key that was created >90 days ago,
	//    never used, and never revoked (unused-key hygiene). Reads only
	//    createdAt/lastUsedAt/revokedAt — never a key hash or plaintext.
	try {
		const keys = await listAllApiKeys()
		const cutoff = Date.now() - STALE_KEY_MS
		const detected = keys.some(
			(k) => k.lastUsedAt == null && k.revokedAt == null && new Date(k.createdAt).getTime() < cutoff,
		)
		findings.push({
			id: 'stale-api-keys',
			severity: 'info',
			detected,
			remediation: 'settings.security-advisor.remediation.stale-keys',
			settingsLink: '/settings/api-keys',
		})
	} catch {
		// omit on error
	}

	// 5. ssh-password-auth (warning) — sshd still accepts password logins. If the
	//    config is UNREADABLE the check is OMITTED (readSshPasswordAuth → null)
	//    rather than reported as a false negative.
	try {
		const value = await readSshPasswordAuth()
		if (value !== null) {
			findings.push({
				id: 'ssh-password-auth',
				severity: 'warning',
				detected: value === 'yes',
				remediation: 'settings.security-advisor.remediation.ssh-key-only',
			})
		}
	} catch {
		// omit on error
	}

	return findings
}
