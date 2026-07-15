import os from 'node:os'
import fs, {stat as fsStat} from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'child_process'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import {$} from 'execa'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import {getResetStatus, performFactoryReset, factoryResetInputSchema} from './factory-reset.js'
import {getUpdateStatus, performUpdate, performRollback, getLatestRelease, readDeployedSha, resolveVersionLabel} from './update.js'
import {
	getCpuTemperature,
	getSystemDiskUsage,
	getDiskUsage,
	getMemoryUsage,
	getCpuUsage,
	reboot,
	shutdown,
	detectDevice,
	getSystemMemoryUsage,
	getIpAddresses,
	getOnboardingSystemInfo,
	syncDns,
} from './system.js'
import {detectGpu, detectNvidiaGpu, isNvidiaToolkitConfigured, isWsl2, resetGpuDetectionCache} from './gpu.js'

import {adminProcedure, privateProcedure, publicProcedure, router} from '../server/trpc/trpc.js'

type SystemStatus = 'running' | 'updating' | 'shutting-down' | 'restarting' | 'migrating' | 'resetting' | 'restoring'
let systemStatus: SystemStatus = 'running'

// Quick hack so we can set system status from migration module until we refactor this
export function setSystemStatus(status: SystemStatus) {
	systemStatus = status
}

// ── Phase 316 (GPU-01) — guided NVIDIA driver + container-toolkit install ────
// livinityd runs as the unprivileged desktop user; the privileged apt/kernel-module
// work runs through the root-owned closed-enum wrapper (scripts/install/livos-gpu-install.sh)
// via the scoped /etc/sudoers.d/livos-gpu NOPASSWD grant. This helper spawns
// `sudo -n <wrapper> <action>` using the SAME spawn+timeout+never-throw contract as
// the provider restart-hook: a failed or partial install is a recoverable, retryable
// state — NOT a crash — so it returns a structured {ok,reason?} discriminated union
// and NEVER throws. Only the enum-constrained action string can reach the wrapper
// (defense-in-depth on top of the wrapper's own action enum). No reboot is triggered
// here — the reboot-confirm UX reuses the existing reboot() primitive (imported above).
const GPU_INSTALL_WRAPPER = '/usr/local/lib/livos/livos-gpu-install.sh'

async function runGpuInstall(
	action: 'install-driver' | 'install-toolkit' | 'install-toolkit-wsl' | 'install-amd-rocm',
): Promise<{ok: true} | {ok: false; reason: string}> {
	return new Promise((resolve) => {
		const timeoutMs = 300_000 // driver install is slow (apt + kernel module) — 5 min headroom
		let settled = false
		let stderr = ''
		const settle = (result: {ok: true} | {ok: false; reason: string}): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}

		const child = spawn('sudo', ['-n', GPU_INSTALL_WRAPPER, action], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const timer = setTimeout(() => {
			try {
				child.kill('SIGTERM')
			} catch {
				/* best-effort */
			}
			settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
		}, timeoutMs)

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8')
		})

		// Fires for ENOENT (sudo not on PATH) / EACCES — degrade, do not throw.
		child.on('error', (err: Error) => {
			settle({ok: false, reason: err.message || 'sudo spawn failed'})
		})

		child.on('close', (code) => {
			if (code === 0) {
				// WR-01: a successful guided install changes what the process-lifetime
				// memoized host probes (system/gpu.ts) would report — `install-toolkit`
				// makes the Docker `nvidia` runtime appear, and `install-driver` can make
				// a previously lspci-invisible card show up. `runGpuInstall` restarts the
				// DOCKER daemon, not livinityd, so livinityd never re-probes on its own.
				// Clear the cache here so the very next `detectGpu()` refetch AND every
				// subsequent `patchComposeFile()` NVIDIA branch see the new state without
				// requiring a manual livinityd restart.
				if (
					action === 'install-toolkit' ||
					action === 'install-driver' ||
					action === 'install-toolkit-wsl' || action === 'install-amd-rocm'
				) {
					resetGpuDetectionCache()
				}
				settle({ok: true})
				return
			}
			settle({
				ok: false,
				reason: stderr.trim().slice(0, 500) || `wrapper exited with code ${code ?? 'unknown'}`,
			})
		})
	})
}

// ── Phase 326 (OS-01, 326-07) — unattended-upgrades (security auto-patching) ──
// Managed through the root-owned closed-enum wrapper
// (scripts/install/livos-os-patch.sh, deployed to
// /usr/local/lib/livos/livos-os-patch.sh) via the scoped
// /etc/sudoers.d/livos-os-patch NOPASSWD grant. This clones runGpuInstall's
// spawn+timeout+never-throw contract, but with two deliberate differences:
//   1. it takes a full argv array — `set-options` passes FOUR already-validated
//      positional values, not a single action word; and
//   2. it CAPTURES STDOUT. The wrapper's status/report/dry-run/run-now output is
//      exactly what the Settings card parses (runGpuInstall only ever needed the
//      stderr failure reason). A held package-lock or a slow download is a
//      recoverable state, not a crash, so a non-zero exit resolves {ok:false,reason}
//      and NEVER throws. livinityd itself never runs the package manager or writes
//      host config directly — only the enum/regex-constrained argv (validated at the
//      route boundary below, defense-in-depth on top of the wrapper's own checks)
//      ever reaches the wrapper.
const OS_PATCH_WRAPPER = '/usr/local/lib/livos/livos-os-patch.sh'

async function runOsPatch(args: string[]): Promise<{ok: true; stdout: string} | {ok: false; reason: string}> {
	return new Promise((resolve) => {
		// run-now downloads + installs real packages; the wrapper caps its own work at
		// 900s (timeout 900 unattended-upgrade), so give the spawn equal headroom.
		const timeoutMs = 900_000
		let settled = false
		let stdout = ''
		let stderr = ''
		const settle = (result: {ok: true; stdout: string} | {ok: false; reason: string}): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}

		const child = spawn('sudo', ['-n', OS_PATCH_WRAPPER, ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const timer = setTimeout(() => {
			try {
				child.kill('SIGTERM')
			} catch {
				/* best-effort */
			}
			settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
		}, timeoutMs)

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8')
		})

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8')
		})

		// Fires for ENOENT (sudo not on PATH) / EACCES — degrade, do not throw.
		child.on('error', (err: Error) => {
			settle({ok: false, reason: err.message || 'sudo spawn failed'})
		})

		child.on('close', (code) => {
			if (code === 0) {
				settle({ok: true, stdout})
				return
			}
			settle({
				ok: false,
				reason: stderr.trim().slice(0, 500) || `wrapper exited with code ${code ?? 'unknown'}`,
			})
		})
	})
}

// ── Phase 326 (HW-01, 326-08) — NUT UPS management from the UI ────────────────
// Managed through the root-owned closed-enum wrapper
// (scripts/install/livos-ups.sh, deployed to /usr/local/lib/livos/livos-ups.sh)
// via the scoped /etc/sudoers.d/livos-ups NOPASSWD grant. A direct clone of the
// 326-07 runOsPatch shape (stdout-capturing, never-throw discriminated union),
// with a single-word action instead of an argv array: the wrapper enum is
// {detect|install|configure|status|remove}. STDOUT is captured because the
// `status` action returns upsc's `ups.status`/`battery.charge`/`battery.runtime`
// key:value lines (or `ups.status: UNAVAILABLE`) that the Settings card parses.
// The slow case is `install` (apt-get install nut) — a held package-lock or a
// slow download is a recoverable state, not a crash, so a non-zero exit resolves
// {ok:false,reason} and NEVER throws. livinityd itself never runs apt/systemctl
// or writes /etc/nut directly — only the enum-constrained action string (validated
// at the route boundary below, defense-in-depth on top of the wrapper's own enum)
// ever reaches the wrapper.
const UPS_WRAPPER = '/usr/local/lib/livos/livos-ups.sh'

async function runUps(
	action: 'detect' | 'install' | 'configure' | 'status' | 'remove',
): Promise<{ok: true; stdout: string} | {ok: false; reason: string}> {
	return new Promise((resolve) => {
		// `install` runs apt-get update + install nut; give it 5-min headroom.
		const timeoutMs = 300_000
		let settled = false
		let stdout = ''
		let stderr = ''
		const settle = (result: {ok: true; stdout: string} | {ok: false; reason: string}): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}

		const child = spawn('sudo', ['-n', UPS_WRAPPER, action], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const timer = setTimeout(() => {
			try {
				child.kill('SIGTERM')
			} catch {
				/* best-effort */
			}
			settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
		}, timeoutMs)

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8')
		})

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8')
		})

		// Fires for ENOENT (sudo not on PATH) / EACCES — degrade, do not throw.
		child.on('error', (err: Error) => {
			settle({ok: false, reason: err.message || 'sudo spawn failed'})
		})

		child.on('close', (code) => {
			if (code === 0) {
				settle({ok: true, stdout})
				return
			}
			settle({
				ok: false,
				reason: stderr.trim().slice(0, 500) || `wrapper exited with code ${code ?? 'unknown'}`,
			})
		})
	})
}

// ── Phase 325 (STOR-01, 325-05) — gocryptfs encrypted-folder management ──────
// Managed through the root-owned closed-enum wrapper
// (scripts/install/livos-crypto.sh → /usr/local/lib/livos/livos-crypto.sh, built
// in 325-02) via the scoped /etc/sudoers.d/livos-crypto NOPASSWD grant. Same
// stdout-capturing, never-throw discriminated-union contract as runOsPatch/runUps.
//
// ⚠ DELIBERATE DEVIATION FROM THE runOsPatch/runUps DONOR (security-critical):
// those helpers use stdio:['ignore','pipe','pipe'] because their actions take no
// secret. The crypto `create`/`unlock` actions need a PASSPHRASE, and a passphrase
// MUST NOT be an argv element — it would be visible in `ps aux` /
// /proc/<pid>/cmdline to any local process (T-325-13). So this helper opens stdin
// as a pipe (stdio:['pipe','pipe','pipe']) and WRITES the passphrase to the child's
// stdin; the wrapper's `-extpass printenv _CRYPTO_PASS` reads it from fd 0 into a
// private env var (the 325-02 contract) so only the var NAME — never its value —
// ever appears in any argv. The passphrase is never logged and never persisted.
// Path args ARE argv (regex-validated at the route boundary below, then
// re-validated by the wrapper — defense-in-depth). runCrypto never throws, so an
// undeployed wrapper degrades to {ok:false} instead of 500-ing the Settings card.
const CRYPTO_WRAPPER = '/usr/local/lib/livos/livos-crypto.sh'

// z-schema for cipher/plain dir args: absolute path, restricted charset, and NO
// `..` segment (reject path traversal BEFORE the wrapper — T-325-14). Mirrors the
// wrapper's own `_validate_path` (325-02) for defense-in-depth.
const cryptoPathSchema = z
	.string()
	.regex(/^\/[A-Za-z0-9._/-]+$/, 'must be an absolute path (restricted charset)')
	.refine((p) => !p.split('/').includes('..'), 'path traversal (..) is not allowed')

async function runCrypto(
	args: string[],
	passphrase?: string,
): Promise<{ok: true; stdout: string} | {ok: false; reason: string}> {
	return new Promise((resolve) => {
		// `install` runs apt-get install gocryptfs; give it 5-min headroom
		// (init/mount/unmount/status are all sub-second).
		const timeoutMs = 300_000
		let settled = false
		let stdout = ''
		let stderr = ''
		const settle = (result: {ok: true; stdout: string} | {ok: false; reason: string}): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}

		// stdio[0]='pipe' (THE DEVIATION) so the passphrase reaches the wrapper via
		// fd 0, NEVER as an argv element (ps-invisible — T-325-13).
		const child = spawn('sudo', ['-n', CRYPTO_WRAPPER, ...args], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const timer = setTimeout(() => {
			try {
				child.kill('SIGTERM')
			} catch {
				/* best-effort */
			}
			settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
		}, timeoutMs)

		// EPIPE if the wrapper exits before reading stdin — the close handler settles,
		// so swallow the stream error rather than let it crash the process.
		child.stdin?.on('error', () => {})

		// Write the passphrase to the child's stdin (one line), then close it so the
		// wrapper's `-extpass` reader sees EOF. The value is never logged. When no
		// passphrase is needed (install/lock/status) just close stdin so a stray read
		// never blocks.
		try {
			if (passphrase != null) {
				child.stdin?.write(passphrase.endsWith('\n') ? passphrase : `${passphrase}\n`)
			}
			child.stdin?.end()
		} catch {
			/* stdin already gone (spawn error) — the 'error' handler settles */
		}

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8')
		})

		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8')
		})

		// Fires for ENOENT (sudo not on PATH) / EACCES — degrade, do not throw.
		child.on('error', (err: Error) => {
			settle({ok: false, reason: err.message || 'sudo spawn failed'})
		})

		child.on('close', (code) => {
			if (code === 0) {
				settle({ok: true, stdout})
				return
			}
			settle({
				ok: false,
				reason: stderr.trim().slice(0, 500) || `wrapper exited with code ${code ?? 'unknown'}`,
			})
		})
	})
}

// ── Phase 306 — desktop-user OS password credentials ─────────────────────────
// The desktop user's OS login / sudo password is generated by the privileged
// wrapper /usr/local/lib/livos/set-desktop-password.sh (at install/update, or on
// demand via the Regenerate button) and snapshotted to a 0600 file owned by the
// desktop user. livinityd runs AS the desktop user (Phase 192) so it can read it.
//
// Phase 306 R2 — SECURITY: revealing or regenerating the OS/sudo password is a
// step-up action gated behind the operator's 2FA (TOTP). The Settings card only
// ever loads {username, hasPassword}; the plaintext is returned ONLY by
// reveal/regenerate after a valid TOTP. The one-time onboarding handoff reads a
// SEPARATE first-boot file that is consumed (deleted) on read.
const DESKTOP_CREDS_FILE = '/etc/livos/desktop-user-credentials'
const DESKTOP_FIRSTBOOT_FILE = '/etc/livos/desktop-user-credentials.firstboot'
const SET_DESKTOP_PASSWORD_WRAPPER = '/usr/local/lib/livos/set-desktop-password.sh'

function parseCreds(content: string): {username?: string; password?: string} {
	const creds: Record<string, string> = {}
	for (const line of content.split('\n')) {
		const eq = line.indexOf('=')
		if (eq <= 0) continue
		creds[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim()
	}
	return creds
}

async function readDesktopCredentials(): Promise<{username: string; password: string}> {
	let content: string
	try {
		content = await fs.readFile(DESKTOP_CREDS_FILE, 'utf8')
	} catch (err) {
		if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Desktop user password not initialized yet. Click Regenerate to create one.',
			})
		}
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `Failed to read desktop credentials: ${String((err as Error)?.message ?? err)}`,
		})
	}
	const creds = parseCreds(content)
	if (!creds.username || !creds.password) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Desktop credentials file is malformed (missing username/password)',
		})
	}
	return {username: creds.username, password: creds.password}
}

// Step-up auth: revealing/regenerating the OS password requires the operator's
// 2FA. If 2FA isn't enabled, the action is refused (the operator must enable it
// first) — never silently allowed. `user` is the authenticated User (adminProcedure).
async function require2faVerified(
	user: {is2faEnabled(): Promise<boolean>; validate2faToken(token: string): Promise<boolean>},
	totp: string,
): Promise<void> {
	if (!(await user.is2faEnabled())) {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'Enable two-factor authentication (Settings → 2FA) before revealing or changing the desktop password.',
		})
	}
	if (!(await user.validate2faToken(totp))) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: 'Invalid two-factor code.'})
	}
}

const desktopTotpInput = z.object({totp: z.string().trim().min(6).max(12)})

// Lightweight per-process rate-limit: regenerating rotates the OS password, so
// double-clicks / spray are capped to one call per 10s.
let lastDesktopPasswordRegenAt = 0
const DESKTOP_PASSWORD_REGEN_MIN_INTERVAL_MS = 10_000

export default router({
	online: publicProcedure.query(() => true),
	// Phase 137-01 — onboarding WelcomeStep spec card source.
	// publicProcedure because it's pre-login (welcome step is step 0).
	info: publicProcedure.query(async ({ctx}) => getOnboardingSystemInfo(ctx.livinityd)),
	version: publicProcedure.query(async ({ctx}) => {
		// Phase 30 hot-patch round 8: derive the current version label from the
		// locally-deployed SHA via the same git-tag-aware resolver that
		// `checkUpdate` uses. Falls back to the legacy package.json version when
		// `.deployed-sha` is missing (first boot, never run update.sh).
		const deployedSha = await readDeployedSha()
		const versionLabel = deployedSha
			? await resolveVersionLabel(deployedSha, ctx.livinityd)
			: ctx.livinityd.versionName
		return {
			version: versionLabel,
			name: ctx.livinityd.versionName,
			sha: deployedSha,
			shortSha: deployedSha ? deployedSha.slice(0, 7) : undefined,
		}
	}),
	status: publicProcedure.query(() => systemStatus),
	updateStatus: privateProcedure.query(() => getUpdateStatus()),
	uptime: privateProcedure.query(() => os.uptime()),
	checkUpdate: privateProcedure.query(async ({ctx}) => {
		// Phase 30 UPD-01: GitHub commits API + .deployed-sha comparison.
		// New return shape: {available, sha, shortSha, message, author, committedAt}.
		return await getLatestRelease(ctx.livinityd)
	}),
	getReleaseChannel: privateProcedure.query(async ({ctx}) => {
		return (await ctx.livinityd.store.get('settings.releaseChannel')) || 'stable'
	}),
	setReleaseChannel: privateProcedure
		.input(
			z.object({
				channel: z.enum(['stable', 'beta']),
			}),
		)
		.mutation(async ({ctx, input}) => {
			return ctx.livinityd.store.set('settings.releaseChannel', input.channel)
		}),
	isExternalDns: privateProcedure.query(async ({ctx}) => {
		return await ctx.livinityd.store.get('settings.externalDns', true)
	}),
	// Phase 305 R10 — "Restore open windows on reload" desktop preference. ON
	// (default) reopens pinned windows after a page reload / system Update; OFF
	// starts clean each reload (the pin rows are KEPT in Postgres → re-enabling +
	// reloading restores them). Box-level store key, same pattern as externalDns.
	isRestoreWindows: privateProcedure.query(async ({ctx}) => {
		return await ctx.livinityd!.store.get('settings.restoreWindowsOnReload', true)
	}),
	setRestoreWindows: privateProcedure.input(z.boolean()).mutation(async ({ctx, input}) => {
		await ctx.livinityd!.store.set('settings.restoreWindowsOnReload', input)
		return true
	}),
	setExternalDns: privateProcedure.input(z.boolean()).mutation(async ({ctx, input}) => {
		const previousExternalDns = await ctx.livinityd.store.get('settings.externalDns', true)
		if (previousExternalDns === input) return true
		await ctx.livinityd.store.set('settings.externalDns', input)
		try {
			const success = await syncDns()
			if (!success) throw new Error('Failed to synchronize external DNS setting')
			return true
		} catch (error) {
			await ctx.livinityd.store.set('settings.externalDns', previousExternalDns)
			throw error
		}
	}),
	update: privateProcedure.mutation(async ({ctx}) => {
		// Phase 30 UPD-02: concurrent-update guard (Pitfall #8).
		// Two clicks racing two parallel update.sh runs would corrupt the rsync.
		if (systemStatus === 'updating') {
			throw new TRPCError({code: 'CONFLICT', message: 'Update already in progress'})
		}
		systemStatus = 'updating'
		let success = false
		try {
			success = await performUpdate(ctx.livinityd)
			// Phase 30 UPD-02: NO ctx.livinityd.stop() — would sever the response stream.
			// Phase 30 UPD-02: NO reboot() — update.sh restarts services itself via
			// `systemctl restart livos liv-core liv-worker liv-memory` at the tail.
		} finally {
			// Mark running again whether or not the update succeeded; the UI polls
			// system.status to decide when to refresh. Errors (success=false) are
			// surfaced via getUpdateStatus().error.
			systemStatus = 'running'
		}
		return success
	}),
	// ─────────────────────────────────────────────────────────────────────
	// Phase 311 UPDSAFE-04 — operator-triggered manual rollback to last-good.
	//   adminProcedure (NOT privateProcedure): a manual rollback is MORE
	//   destructive than a forward update, so it matches factoryReset's admin
	//   gate — a non-admin member must not be able to roll the box back
	//   (T-311-03-01). The SAME systemStatus==='updating' CONFLICT guard as
	//   `update` prevents a rollback racing a live update from corrupting the
	//   tree (T-311-03-02; the 311-02 script's flock is the second, independent
	//   guard). performRollback shells out to /opt/livos/livos-manual-rollback.sh.
	// ─────────────────────────────────────────────────────────────────────
	rollbackToPrevious: adminProcedure.mutation(async ({ctx}) => {
		if (systemStatus === 'updating') {
			throw new TRPCError({code: 'CONFLICT', message: 'An update or rollback is already in progress'})
		}
		// Reuse the SAME 'updating' status enum value — the UI already polls
		// system.status to know when a long-running deploy is in flight.
		systemStatus = 'updating'
		let success = false
		try {
			success = await performRollback(ctx.livinityd!)
		} finally {
			systemStatus = 'running'
		}
		return success
	}),
	// Phase 311 UPDSAFE-04 — does a last-good snapshot exist to roll back to, and
	// what is its target label? adminProcedure (matches the mutation's gate). NEVER
	// throws (mirrors readDeployedSha's ENOENT discipline): the UI HIDES the button
	// when unavailable, so a box that never completed an update never offers a
	// rollback that would fail (RESEARCH A.2). The 311-02 manifest carries only
	// tag/shortSha/snapshottedAt — no secrets reach the client (T-311-03-04).
	//   • no snapshot dir            → {available: false}
	//   • snapshot + parseable manifest → {available: true, tag?, shortSha?, snapshottedAt?}
	//   • snapshot but absent/corrupt manifest → {available: true} (no label)
	canRollback: adminProcedure.query(
		async (): Promise<{available: boolean; tag?: string; shortSha?: string; snapshottedAt?: string}> => {
			const SNAPSHOT_DIR = '/opt/.livos-last-good'
			try {
				await fs.access(`${SNAPSHOT_DIR}/livinityd-source`)
			} catch {
				return {available: false}
			}
			try {
				const raw = await fs.readFile(`${SNAPSHOT_DIR}/manifest.json`, 'utf8')
				// 311-02 manifest schema: {sha, tag, snapshotted_at, schema_hash} (snake_case).
				const manifest = JSON.parse(raw) as {sha?: string; tag?: string; snapshotted_at?: string}
				return {
					available: true,
					tag: manifest.tag || undefined,
					shortSha: manifest.sha ? manifest.sha.slice(0, 7) : undefined,
					snapshottedAt: manifest.snapshotted_at || undefined,
				}
			} catch {
				// Snapshot exists but the manifest is absent/corrupt — still
				// rollback-able, just without a friendly target label.
				return {available: true}
			}
		},
	),
	// ─────────────────────────────────────────────────────────────────────
	// Phase 33 OBS-02 — list last N deploy history entries
	//   Reads /opt/livos/data/update-history/*.json (Phase 32 schema:
	//   <ts>-rollback.json / <ts>-precheck-fail.json + Phase 33 33-02
	//   adds <ts>-success.json / <ts>-failed.json). Returns the parsed
	//   bodies plus the source filename, sorted newest-first.
	// ─────────────────────────────────────────────────────────────────────
	listUpdateHistory: adminProcedure
		.input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
		.query(async ({input}) => {
			const HISTORY_DIR = '/opt/livos/data/update-history'
			let entries: string[] = []
			try {
				entries = await fs.readdir(HISTORY_DIR)
			} catch (err: any) {
				if (err && err.code === 'ENOENT') return [] // dir absent on dev machines
				throw err
			}
			const jsonFiles = entries.filter((f) => f.endsWith('.json'))
			const records = await Promise.all(
				jsonFiles.map(async (f) => {
					try {
						const raw = await fs.readFile(path.join(HISTORY_DIR, f), 'utf8')
						const parsed = JSON.parse(raw)
						if (typeof parsed?.timestamp !== 'string') return null
						return {filename: f, ...parsed}
					} catch {
						return null // corrupt JSON: skip, don't crash the entire list
					}
				}),
			)
			const valid = records.filter((r): r is NonNullable<typeof r> => r !== null)
			valid.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
			return valid.slice(0, input.limit)
		}),

	// ─────────────────────────────────────────────────────────────────────
	// Phase 33 OBS-03 — read a single deploy log file (tail-500 default,
	//   full content on demand for download). 3-layer filename guard:
	//     1. basename equality (rejects '/' and '\')
	//     2. regex whitelist /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/
	//        (rejects '..foo.log' — leading '.' is forbidden; rejects
	//        '.bash_history' — no .log/.json extension)
	//     3. resolved-path startswith resolved HISTORY_DIR (defense-in-
	//        depth / refactor-safety). Resolving BOTH sides ensures the
	//        comparison works on Windows (path.resolve normalises drive +
	//        separator) — though in production HISTORY_DIR is the literal
	//        POSIX path on the Mini PC.
	// ─────────────────────────────────────────────────────────────────────
	readUpdateLog: adminProcedure
		.input(
			z.object({
				filename: z.string().min(1).max(200),
				full: z.boolean().default(false),
			}),
		)
		.query(async ({input}) => {
			const HISTORY_DIR = '/opt/livos/data/update-history'
			const FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/

			// Layer 1: basename equality — rejects any path separator
			if (path.basename(input.filename) !== input.filename) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}
			// Layer 2: regex whitelist — first char must be alnum (rejects
			// '..hidden.log'), only alphanum + . _ - allowed, must end with
			// .log or .json (rejects '.bash_history').
			if (!FILENAME_RE.test(input.filename)) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}
			// Layer 3: resolved containment — defense-in-depth for refactor
			// safety. Resolve BOTH sides so the comparison works regardless of
			// host OS (Windows path.resolve injects a drive letter that won't
			// match a hard-coded POSIX prefix string).
			const HISTORY_DIR_RESOLVED = path.resolve(HISTORY_DIR)
			const resolved = path.resolve(HISTORY_DIR_RESOLVED, input.filename)
			if (!resolved.startsWith(HISTORY_DIR_RESOLVED + path.sep) && resolved !== HISTORY_DIR_RESOLVED) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}

			// R-04 size cap: read stat before readFile to prevent a rogue/corrupt log
			// file from exhausting the livinityd heap and crashing the management plane.
			const MAX_LOG_BYTES = 50 * 1024 * 1024 // 50 MB
			try {
				const stat = await fsStat(resolved)
				if (stat.size > MAX_LOG_BYTES) {
					throw new TRPCError({
						code: 'PAYLOAD_TOO_LARGE',
						message: `Log file too large (${Math.round(stat.size / 1048576)}MB, max 50MB)`,
					})
				}
			} catch (err: any) {
				if (err instanceof TRPCError) throw err
				if (err && err.code === 'ENOENT') {
					throw new TRPCError({code: 'NOT_FOUND', message: 'Log file not found'})
				}
				throw err
			}

			let content: string
			try {
				content = await fs.readFile(resolved, 'utf8')
			} catch (err: any) {
				if (err && err.code === 'ENOENT') {
					throw new TRPCError({code: 'NOT_FOUND', message: 'Log file not found'})
				}
				throw err
			}

			if (input.full) return {filename: input.filename, content, truncated: false}

			const lines = content.split('\n')
			const TAIL = 500
			if (lines.length <= TAIL) return {filename: input.filename, content, truncated: false}
			const tail = lines.slice(-TAIL).join('\n')
			return {filename: input.filename, content: tail, truncated: true, totalLines: lines.length}
		}),

	device: privateProcedure.query(() => detectDevice()),
	cpuTemperature: privateProcedure.query(() => getCpuTemperature()),
	// Phase 316 (GPU-01) — unprivileged read-only NVIDIA probe. Lets the UI decide
	// whether to render the guided GPU-install section at all: non-NVIDIA boxes see
	// nothing, and a box that already has the toolkit configured is not re-offered
	// the install. Never throws (both probes degrade to false — see system/gpu.ts).
	detectGpu: privateProcedure.query(async () => {
		// Phase 330 (GPU-03) — the composite is WSL2-aware + vendor-aware (316's
		// lspci-only probe returns false on WSL2). Spread the richer shape and keep
		// the two back-compat keys the shipped gpu-access-section.tsx reads (:80-81).
		const info = await detectGpu()
		return {
			...info, // present, vendor, wsl2, toolkitConfigured, driverSource
			hasNvidia: info.vendor === 'nvidia', // back-compat alias — gpu-access-section.tsx:80
			// toolkitConfigured already present on info (back-compat alias for :81)
		}
	}),
	systemDiskUsage: privateProcedure.query(({ctx}) => getSystemDiskUsage(ctx.livinityd)),
	diskUsage: privateProcedure.query(({ctx}) => getDiskUsage(ctx.livinityd)),
	systemMemoryUsage: privateProcedure.query(({ctx}) => getSystemMemoryUsage()),
	memoryUsage: privateProcedure.query(({ctx}) => getMemoryUsage(ctx.livinityd)),
	cpuUsage: privateProcedure.query(({ctx}) => getCpuUsage(ctx.livinityd)),
	getIpAddresses: privateProcedure.query(() => getIpAddresses()),
	// LIVOS-048 (262-04): adminProcedure, NOT privateProcedure — a non-admin
	// member/guest must not be able to power off the host or DoS the management
	// plane (livinityd.stop() runs unconditionally before the power call).
	// Mirrors the factoryReset precedent below; matches the client-side
	// adminOnly flag in settings-content.tsx.
	shutdown: adminProcedure.mutation(async ({ctx}) => {
		systemStatus = 'shutting-down'
		await ctx.livinityd.stop()
		await shutdown()

		return true
	}),
	restart: adminProcedure.mutation(async ({ctx}) => {
		systemStatus = 'restarting'
		await ctx.livinityd.stop()
		await reboot()

		return true
	}),
	// Phase 316 (GPU-01) / Phase 330 (GPU-04) — admin-gated guided GPU install.
	// Host-level apt/usermod/kernel operation, so adminProcedure (mirrors
	// shutdown/restart above), NOT privateProcedure. Input is z.enum-constrained so
	// ONLY the four closed actions can reach the wrapper (defense-in-depth on top of
	// the wrapper's own action enum) — never a free-form string. Returns
	// runGpuInstall's {ok,reason?} union and NEVER throws: a failed install is
	// recoverable/retryable, not a crash. No reboot is triggered here; the
	// reboot-confirm UX reuses the existing system.restart primitive.
	installNvidiaGpu: adminProcedure
		.input(z.object({action: z.enum(['install-driver', 'install-toolkit', 'install-toolkit-wsl', 'install-amd-rocm'])}))
		.mutation(async ({input}) => {
			// D-4: the Linux NVIDIA driver overwrites the /usr/lib/wsl/lib stubs and
			// breaks /dev/dxg passthrough on WSL2. The wrapper has no WSL2 awareness,
			// so refuse install-driver HERE — at the tRPC boundary — regardless of
			// what the UI sent (defense-in-depth; the UI only offers install-toolkit-wsl
			// on WSL2). RESEARCH Pitfall 1.
			if (input.action === 'install-driver' && (await isWsl2())) {
				return {
					ok: false as const,
					reason:
						'Linux NVIDIA driver install is refused on WSL2 — the Windows driver provides GPU passthrough; install the container toolkit instead.',
				}
			}
			// WR-01: mirror the install-driver refusal for install-amd-rocm. The
			// wrapper's own comment states the caller "must never invoke this on WSL2
			// (no /dev/kfd there)" but trusts the closed enum and does NOT itself probe
			// WSL2 — so enforce the invariant HERE as defense-in-depth (the UI already
			// only renders the AMD button for vendor:'amd' && !wsl2), regardless of what
			// the UI sent. WSL2 exposes /dev/dxg, not the ROCm compute node /dev/kfd.
			if (input.action === 'install-amd-rocm' && (await isWsl2())) {
				return {
					ok: false as const,
					reason:
						'AMD ROCm bare-metal setup is refused on WSL2 — WSL2 has no /dev/kfd compute node; use a bare-metal Linux install for AMD acceleration.',
				}
			}
			return runGpuInstall(input.action)
		}),
	// ── Phase 326 (OS-01, 326-07) — unattended-upgrades managed from the UI ──────
	// FLAT route names: the system router is a single flat router({...}) today with
	// no nested sub-routers, so keeping osPatch*/osPatchStatus/osPatchSetOptions as
	// flat keys matches the existing convention rather than introducing the first
	// nested router (open-design-point #2). adminProcedure — a host-level operation
	// that writes the package-updater config + runs the upgrader, mirroring
	// shutdown/restart/installNvidiaGpu above (Phase-328 auto-audited). Every action
	// is z.enum / z.regex constrained BEFORE it reaches the wrapper (defense-in-depth
	// on top of the wrapper's own validation); livinityd never touches the host
	// package config directly.
	osPatchStatus: adminProcedure.query(async () => {
		// Two read-only wrapper calls: status (reboot-required + config + timer
		// stamps) and report (the upgrader log tail). Raw stdout is returned verbatim;
		// the UI parses the labeled lines. runOsPatch never throws, so a box where the
		// wrapper is not yet deployed degrades to {ok:false} instead of 500-ing the
		// whole Settings card.
		const status = await runOsPatch(['status'])
		const report = await runOsPatch(['report'])
		return {status, report}
	}),
	osPatch: adminProcedure
		.input(z.object({action: z.enum(['enable', 'disable', 'dry-run', 'run-now'])}))
		.mutation(async ({input}) => runOsPatch([input.action])),
	osPatchSetOptions: adminProcedure
		.input(
			z.object({
				autoReboot: z.boolean(),
				rebootTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
				removeUnused: z.boolean(),
				onlyOnACPower: z.boolean(),
			}),
		)
		.mutation(async ({input}) =>
			runOsPatch([
				'set-options',
				input.autoReboot ? '1' : '0',
				input.rebootTime,
				input.removeUnused ? '1' : '0',
				input.onlyOnACPower ? '1' : '0',
			]),
		),
	// ── Phase 326 (HW-01, 326-08) — NUT UPS management from the UI ──────────────
	// FLAT route names (open-design-point #2 — matches the osPatch*/flat convention
	// above, not the first nested router). All adminProcedure: installing/configuring
	// NUT is a host-level operation writing /etc/nut + enabling systemd services,
	// mirroring osPatch/shutdown/installNvidiaGpu (Phase-328 auto-audited). The action
	// is z.enum-constrained BEFORE it reaches the wrapper (defense-in-depth on top of
	// the wrapper's own enum); livinityd never runs apt/systemctl or writes /etc/nut.
	//
	// upsStatus is the cheap read (a query — upsc key:value lines OR
	// "ups.status: UNAVAILABLE"); upsDetect is a mutation because nut-scanner probes
	// the USB bus (a side-effecting hardware scan); `ups` gates install/configure/remove
	// behind a z.enum. runUps never throws, so a box where the wrapper is not yet
	// deployed degrades to {ok:false} instead of 500-ing the Settings card.
	upsStatus: adminProcedure.query(async () => runUps('status')),
	upsDetect: adminProcedure.mutation(async () => runUps('detect')),
	ups: adminProcedure
		.input(z.object({action: z.enum(['install', 'configure', 'remove'])}))
		.mutation(async ({input}) => runUps(input.action)),
	// ── Phase 306 R2 — desktop-user OS/sudo password (Settings → Account) ───────
	// getDesktopUserInfo: lightweight, NON-secret. Returns just the username + a
	// hasPassword flag so the card can render without ever shipping the plaintext.
	// The plaintext is returned ONLY by the 2FA-gated reveal/regenerate mutations.
	getDesktopUserInfo: adminProcedure.query(async () => {
		// Defense-in-depth: reaching Settings means onboarding is over, so purge any
		// leftover one-time first-boot copy — that file is the only no-2FA read path
		// and must never linger past the onboarding handoff.
		void fs.unlink(DESKTOP_FIRSTBOOT_FILE).catch(() => {})
		try {
			const content = await fs.readFile(DESKTOP_CREDS_FILE, 'utf8')
			const creds = parseCreds(content)
			return {username: creds.username ?? null, hasPassword: Boolean(creds.password)}
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
				return {username: null, hasPassword: false}
			}
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: `Failed to read desktop user info: ${String((err as Error)?.message ?? err)}`,
			})
		}
	}),
	// revealDesktopPassword: returns the plaintext ONLY after a valid 2FA code. A
	// mutation (not a query) so it's never cached and always requires a fresh
	// step-up verification.
	revealDesktopPassword: adminProcedure.input(desktopTotpInput).mutation(async ({ctx, input}) => {
		await require2faVerified(ctx.user!, input.totp)
		return readDesktopCredentials()
	}),
	// regenerateDesktopPassword: rotate the OS password via the scoped sudo wrapper
	// (the new password is generated INSIDE the wrapper — never an argv, so it
	// can't leak via `ps`). 2FA-gated + rate-limited; returns the fresh creds.
	regenerateDesktopPassword: adminProcedure.input(desktopTotpInput).mutation(async ({ctx, input}) => {
		await require2faVerified(ctx.user!, input.totp)
		const now = Date.now()
		if (now - lastDesktopPasswordRegenAt < DESKTOP_PASSWORD_REGEN_MIN_INTERVAL_MS) {
			throw new TRPCError({
				code: 'TOO_MANY_REQUESTS',
				message: 'Please wait a few seconds before regenerating the password again.',
			})
		}
		try {
			await $({timeout: 15_000})`sudo -n ${SET_DESKTOP_PASSWORD_WRAPPER}`
		} catch (err) {
			const e = err as {stderr?: string; shortMessage?: string; message?: string}
			const detail = String(e.stderr || e.shortMessage || e.message || '').trim()
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message:
					'Failed to regenerate the desktop password. The privileged helper ' +
					'(/usr/local/lib/livos/set-desktop-password.sh) may be missing or not yet ' +
					`authorized via sudoers — run a system Update to install it. ${detail}`,
			})
		}
		// Only consume the rate-limit window on a SUCCESSFUL rotation, so a failure
		// (wrapper/sudoers missing) doesn't block an immediate retry once fixed.
		lastDesktopPasswordRegenAt = now
		return readDesktopCredentials()
	}),
	// consumeFirstBootDesktopPassword: the ONE-TIME onboarding handoff. Reads the
	// first-boot copy written by the install/update bootstrap and DELETES it, so the
	// plaintext is shown exactly once on the done screen and can never be re-read
	// without 2FA afterwards. Returns null once consumed / on a non-first-boot box.
	consumeFirstBootDesktopPassword: adminProcedure.mutation(async () => {
		let content: string
		try {
			content = await fs.readFile(DESKTOP_FIRSTBOOT_FILE, 'utf8')
		} catch {
			return null
		}
		try {
			await fs.unlink(DESKTOP_FIRSTBOOT_FILE)
		} catch {
			// best-effort consume; file is 0600 and never read by the Settings path
		}
		const creds = parseCreds(content)
		if (!creds.username || !creds.password) return null
		return {username: creds.username, password: creds.password}
	}),
	logs: privateProcedure
		.input(
			z.object({
				type: z.enum(['livos', 'system']),
			}),
		)
		.query(async ({input}) => {
			let process
			if (input.type === 'livos') {
				process = await $`journalctl --unit livinity --unit livinityd-production --unit livinityd --unit ui --lines 1500`
			}
			if (input.type === 'system') {
				process = await $`journalctl --lines 1500`
			}
			return stripAnsi(process!.stdout)
		}),
	//
	// v29.2 Phase 37 — system.factoryReset({preserveApiKey}) replaces the legacy
	// password-gated route. adminProcedure-only; pre-flight checks live inside
	// performFactoryReset (see factory-reset.ts D-RT-04/05). Returns 202-style
	// {accepted, eventPath, snapshotPath} immediately; the actual wipe spawns
	// in a transient systemd-run scope (Plan 03 inserts the spawn at
	// SPAWN_INSERTION_POINT). Registered in httpOnlyPaths in common.ts so the
	// long-running mutation cannot ride the WebSocket (mirror system.update).
	factoryReset: adminProcedure
		.input(factoryResetInputSchema)
		.mutation(async ({ctx, input}) => {
			systemStatus = 'resetting'
			try {
				return await performFactoryReset(ctx.livinityd, input)
			} catch (error) {
				systemStatus = 'running'
				throw error
			}
		}),
	// Public because we delete the user too and want to continue to get status updates
	getFactoryResetStatus: publicProcedure.query((): ProgressStatus | undefined => {
		return getResetStatus()
	}),
	// ── Phase 325 (STOR-01, 325-05) — encrypted-folder (gocryptfs) management ────
	// FLAT route names (matches the osPatch*/ups* convention above, not a nested
	// router). All adminProcedure: mounting/unmounting a gocryptfs folder is a
	// host-level FUSE operation (Phase-328 auto-audited). Every path arg is
	// z.regex/refine-constrained BEFORE the wrapper (rejects `..` — T-325-14,
	// defense-in-depth on top of the wrapper's own _validate_path); the passphrase
	// is a z.string passed as the SECOND runCrypto param (child.stdin, NEVER argv —
	// T-325-13) and is never logged. runCrypto never throws, so an undeployed
	// wrapper degrades to {ok:false} instead of 500-ing the Settings card.
	//
	// cryptoStatus reads the dedicated top-level `storage.encryptedFolders` registry
	// (325-05 Task 2) and probes each folder's mount state (Locked/Unlocked). Default
	// state after reboot is LOCKED by design (D-04 — no auto-remount).
	cryptoStatus: adminProcedure.query(async ({ctx}) => {
		const registry = (await ctx.livinityd?.store.get('storage'))?.encryptedFolders ?? []
		const folders = await Promise.all(
			registry.map(async (f) => ({
				name: f.name,
				cipherDir: f.cipherDir,
				plainDir: f.plainDir,
				status: await runCrypto(['status', f.plainDir]),
			})),
		)
		return {folders}
	}),
	// cryptoInstall: apt-installs gocryptfs + enables fuse user_allow_other (325-02).
	cryptoInstall: adminProcedure.mutation(async () => runCrypto(['install'])),
	// cryptoCreate: `gocryptfs -init` a new encrypted folder. The wrapper prints the
	// master RECOVERY KEY once to stdout — surfaced to the caller in `result.stdout`
	// ("save this once"), never stored/logged (D-03). On success the folder is
	// registered in the dedicated top-level `storage` key (dot-prop-safe whole-object
	// write — index.ts:392 convention). Passphrase is the 2nd param (stdin, not argv).
	cryptoCreate: adminProcedure
		.input(
			z.object({
				cipherDir: cryptoPathSchema,
				plainDir: cryptoPathSchema,
				passphrase: z.string().min(8),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const result = await runCrypto(
				['create', input.cipherDir, input.plainDir],
				input.passphrase,
			)
			if (result.ok) {
				const existing = (await ctx.livinityd?.store.get('storage'))?.encryptedFolders ?? []
				const name = input.plainDir.split('/').filter(Boolean).pop() || input.plainDir
				const next = existing.filter((f) => f.plainDir !== input.plainDir)
				next.push({name, cipherDir: input.cipherDir, plainDir: input.plainDir})
				await ctx.livinityd?.store.set('storage', {encryptedFolders: next})
			}
			return result
		}),
	// cryptoUnlock: mount an existing encrypted folder with its passphrase (stdin).
	cryptoUnlock: adminProcedure
		.input(
			z.object({
				cipherDir: cryptoPathSchema,
				plainDir: cryptoPathSchema,
				passphrase: z.string().min(8),
			}),
		)
		.mutation(async ({input}) =>
			runCrypto(
				['unlock', input.cipherDir, input.plainDir],
				input.passphrase,
			),
		),
	// cryptoLock: `fusermount -u` the plain dir (refuses on EBUSY → {ok:false}). No
	// passphrase needed. The registry row is KEPT (a locked folder still exists).
	cryptoLock: adminProcedure
		.input(z.object({plainDir: cryptoPathSchema}))
		.mutation(async ({input}) => runCrypto(['lock', input.plainDir])),
})
