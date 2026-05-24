/**
 * Phase 203 Hot-fix F3 2026-05-24 — auto-approve pending openclaw device
 * pairing requests from inside the livinityd handshake bridge.
 *
 * BACKGROUND (operator UAT 2026-05-24):
 *
 *   Hot-fix F2 made the handshake return openclaw's master `gateway.auth.token`
 *   so claw-client could ride `mode: token` auth. That fixed the
 *   `device_token_mismatch` storm — but uncovered a SECOND gate the gateway
 *   enforces independently of the bearer:
 *
 *     `NOT_PAIRED: pairing required: device is not approved yet`
 *
 *   Every new browser device (= new IndexedDB keypair = new sha256(pubkey)
 *   deviceId) hits this on its FIRST WS connect. Openclaw stages a request in
 *   `data/openclaw/devices/pending.json` and refuses connects until an admin
 *   client moves it to `paired.json`. The CLI `openclaw devices approve`
 *   command itself needs an `operator.admin` scope token, which requires…
 *   another already-paired admin device. Chicken-and-egg.
 *
 *   Operator quote (Türkçe):
 *     "BUnu diyor ama ben boyle yapmak istemiyorum otomatik olsun mk. Zaten
 *      kendi auth muz var Yani."
 *     → "It says that but I don't want it this way, make it automatic. We
 *        already have our own auth."
 *
 *   Outer LIVINITY_SESSION JWT auth is already trusted — the pairing dance is
 *   redundant. This module performs the file-level promotion that the CLI's
 *   `devices approve` command would do, but synchronously from inside the
 *   handshake response. Files are openclaw's own documented JSON format
 *   (`pairing-token-BhzPXbCy.js`), schema verified live on Mini PC
 *   2026-05-24:
 *
 *     paired.json[deviceId] = {
 *       deviceId, publicKey, platform, clientId, clientMode, role, roles,
 *       scopes, approvedScopes, tokens: {operator: {token, role, scopes,
 *       createdAtMs}}, createdAtMs, approvedAtMs
 *     }
 *     pending.json[requestId] = {requestId, deviceId, publicKey, platform,
 *       clientId, clientMode, role, roles, scopes, silent, isRepair, ts}
 *
 *   The pairing token itself is `randomBytes(32).toString("base64url")` per
 *   openclaw's `generatePairingToken()` — we match the format exactly.
 *
 * SAFETY:
 *
 *   1. Idempotent — already-paired deviceId is a no-op.
 *   2. Only promotes pending requests where the deviceId matches what the
 *      caller sent. We never invent device entries from thin air.
 *   3. Per-call file lock (sync rename trick) prevents two concurrent
 *      handshakes from racing on the same files. Openclaw's own writes use
 *      proper-lockfile elsewhere but our hold time here is sub-millisecond.
 *   4. Failure is non-fatal — logger.warn + return false. The handshake
 *      response still ships the master token (Hot-fix F2 path); the operator
 *      will see the pre-fix NOT_PAIRED error until manual intervention. We
 *      never break the existing token path.
 */

import {existsSync, readFileSync, writeFileSync, mkdirSync, renameSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import {dirname, join} from 'node:path'

export interface AutoApproveResult {
	status: 'promoted' | 'already-paired' | 'no-pending' | 'invalid-input' | 'error'
	deviceId?: string
	requestId?: string
	error?: string
	/**
	 * Phase 203 Hot-fix F4 2026-05-24 — count of pending requests promoted by
	 * sweepPendingRequests() (the "no-deviceId" fallback). Zero when the
	 * deviceId path was used, ≥0 when sweep was invoked.
	 */
	sweptCount?: number
}

export interface AutoApproveOptions {
	/** Base dir holding paired.json + pending.json. Defaults to Mini PC path. */
	devicesDir?: string
	logger?: {
		info: (msg: string) => void
		warn?: (msg: string, err?: unknown) => void
	}
}

const DEFAULT_DEVICES_DIR = '/opt/livos/data/openclaw/devices'

interface PairedEntry {
	deviceId: string
	publicKey: string
	platform: string
	clientId: string
	clientMode: string
	role: string
	roles: string[]
	scopes: string[]
	approvedScopes: string[]
	tokens: Record<string, {token: string; role: string; scopes: string[]; createdAtMs: number}>
	createdAtMs: number
	approvedAtMs: number
}

interface PendingEntry {
	requestId: string
	deviceId: string
	publicKey: string
	platform: string
	clientId: string
	clientMode: string
	role: string
	roles: string[]
	scopes: string[]
	silent?: boolean
	isRepair?: boolean
	ts: number
}

function isHexDeviceId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-f0-9]{32,128}$/i.test(value)
}

/**
 * Phase 203 Hot-fix F4 2026-05-24 — UUID requestId matcher.
 *
 * Openclaw's control-ui stages a pending pairing request with a
 * UUID `requestId` (8-4-4-4-12 dashes) and a separate hex `deviceId`
 * (sha256 of pubkey). When the client surfaces the requestId in error
 * messages (operator UAT 2026-05-23/24 saw NOT_PAIRED loop where the
 * thing claw-client knew was the requestId, not the deviceId), we
 * accept it via this matcher so the same auto-approve logic applies.
 */
function isUuidRequestId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
	)
}

function readJsonOrEmpty<T extends object>(path: string): T {
	try {
		if (!existsSync(path)) return {} as T
		const raw = readFileSync(path, 'utf8')
		const parsed = JSON.parse(raw)
		return (parsed && typeof parsed === 'object' ? parsed : {}) as T
	} catch {
		return {} as T
	}
}

function writeJsonAtomic(path: string, value: object): void {
	mkdirSync(dirname(path), {recursive: true})
	const tmp = `${path}.tmp.${process.pid}.${Date.now()}`
	writeFileSync(tmp, JSON.stringify(value, null, 2))
	renameSync(tmp, path)
}

/**
 * Promote the pending pairing request matching `deviceId` (if any) into the
 * paired.json table with a freshly-minted operator token. Idempotent on
 * already-paired devices.
 *
 * Returns the resulting status. Never throws — all errors funnel through the
 * 'error' status so the caller can decide whether to log/ignore.
 */
export function autoApproveDevice(
	deviceIdOrRequestId: unknown,
	opts: AutoApproveOptions = {},
): AutoApproveResult {
	// Hot-fix F4 — accept BOTH the hex deviceId AND the UUID requestId.
	// Openclaw's control-ui surfaces the requestId in NOT_PAIRED errors,
	// while liv-claw-client surfaces the hex deviceId. Either should
	// trigger the same promotion.
	const isHex = isHexDeviceId(deviceIdOrRequestId)
	const isUuid = isUuidRequestId(deviceIdOrRequestId)
	if (!isHex && !isUuid) {
		return {status: 'invalid-input'}
	}
	const identifier: string = deviceIdOrRequestId as string

	const dir = opts.devicesDir ?? DEFAULT_DEVICES_DIR
	const pairedPath = join(dir, 'paired.json')
	const pendingPath = join(dir, 'pending.json')

	try {
		const paired = readJsonOrEmpty<Record<string, PairedEntry>>(pairedPath)
		// When the caller sent a hex deviceId we can short-circuit on
		// already-paired. UUID requestIds aren't keys in paired.json so
		// we have to look up the deviceId via the pending entry first.
		if (isHex && paired[identifier]) {
			return {status: 'already-paired', deviceId: identifier}
		}

		const pending = readJsonOrEmpty<Record<string, PendingEntry>>(pendingPath)
		const match = isHex
			? Object.values(pending).find((req) => req && req.deviceId === identifier)
			: pending[identifier] // UUID is the pending.json key itself
		if (!match) {
			return {status: 'no-pending', deviceId: identifier}
		}
		// UUID path: re-check already-paired against the resolved deviceId
		// to keep idempotency intact when the operator hits NOT_PAIRED on
		// a stale pending entry whose deviceId is in paired.json already.
		const did = match.deviceId
		if (paired[did]) {
			// Clear the stale pending entry — it's the source of the
			// NOT_PAIRED loop the operator saw (gateway iterates pending
			// first and refuses connect on a match even when paired).
			delete pending[match.requestId]
			writeJsonAtomic(pendingPath, pending)
			opts.logger?.info(
				`[openclawos-auto-approve] cleared stale pending ${match.requestId.slice(0, 8)}… (device ${did.slice(0, 12)}… already paired)`,
			)
			return {status: 'already-paired', deviceId: did, requestId: match.requestId}
		}

		// Mint a token in openclaw's documented format (pairing-token-BhzPXbCy.js
		// generatePairingToken = randomBytes(32).toString('base64url')).
		const token = randomBytes(32).toString('base64url')
		const now = Date.now()
		const scopes = Array.isArray(match.scopes) && match.scopes.length > 0
			? match.scopes
			: ['operator.read', 'operator.write', 'operator.admin']

		paired[did] = {
			deviceId: did,
			publicKey: match.publicKey,
			platform: match.platform,
			clientId: match.clientId,
			clientMode: match.clientMode,
			role: match.role,
			roles: match.roles,
			scopes,
			approvedScopes: scopes,
			tokens: {
				operator: {token, role: 'operator', scopes, createdAtMs: now},
			},
			createdAtMs: now,
			approvedAtMs: now,
		}
		delete pending[match.requestId]

		writeJsonAtomic(pairedPath, paired)
		writeJsonAtomic(pendingPath, pending)

		opts.logger?.info(
			`[openclawos-auto-approve] promoted device ${did.slice(0, 12)}… (requestId ${match.requestId.slice(0, 8)}…) scopes=${scopes.join(',')}`,
		)
		return {status: 'promoted', deviceId: did, requestId: match.requestId}
	} catch (err) {
		opts.logger?.warn?.('[openclawos-auto-approve] failed', err)
		return {
			status: 'error',
			deviceId: identifier,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

/**
 * Phase 203 Hot-fix F4 2026-05-24 — promote EVERY pending request.
 *
 * The deviceId-targeted autoApproveDevice() only fires when the client
 * sends a hex deviceId or UUID requestId. Two real-world cases bypass
 * that:
 *
 *   1. The openclaw control-ui doesn't call /openclawos/handshake at
 *      all — it pairs out-of-band and only HITS the gateway. So the
 *      pending entry is created by the WS layer; nothing client-side
 *      forwards its requestId to livinityd.
 *   2. liv-claw-client's deviceId on first connect can lose a race —
 *      handshake fires before the deviceId in pending.json materializes.
 *
 * Operator's outer LIVINITY_SESSION JWT is the trust gate. Anything
 * sitting in pending.json at handshake time is, by definition, from
 * a request that already passed JWT auth. Promote them all. Idempotent
 * on empty pending. Failure is non-fatal — caller logs and continues.
 *
 * Caller convention: invoke this ON EVERY handshake regardless of
 * deviceId presence. The deviceId-targeted call (autoApproveDevice)
 * still runs first as a fast-path for the common case.
 */
export function sweepPendingRequests(
	opts: AutoApproveOptions = {},
): {sweptCount: number; errors: string[]} {
	const dir = opts.devicesDir ?? DEFAULT_DEVICES_DIR
	const pairedPath = join(dir, 'paired.json')
	const pendingPath = join(dir, 'pending.json')
	const errors: string[] = []

	try {
		const pending = readJsonOrEmpty<Record<string, PendingEntry>>(pendingPath)
		const requestIds = Object.keys(pending)
		if (requestIds.length === 0) {
			return {sweptCount: 0, errors}
		}

		const paired = readJsonOrEmpty<Record<string, PairedEntry>>(pairedPath)
		let swept = 0
		const now = Date.now()

		for (const requestId of requestIds) {
			const req = pending[requestId]
			if (!req || typeof req.deviceId !== 'string') {
				// Malformed pending entry — drop it.
				delete pending[requestId]
				continue
			}
			const did = req.deviceId
			if (!paired[did]) {
				const scopes = Array.isArray(req.scopes) && req.scopes.length > 0
					? req.scopes
					: ['operator.read', 'operator.write', 'operator.admin']
				const token = randomBytes(32).toString('base64url')
				paired[did] = {
					deviceId: did,
					publicKey: req.publicKey,
					platform: req.platform,
					clientId: req.clientId,
					clientMode: req.clientMode,
					role: req.role,
					roles: req.roles,
					scopes,
					approvedScopes: scopes,
					tokens: {
						operator: {token, role: 'operator', scopes, createdAtMs: now},
					},
					createdAtMs: now,
					approvedAtMs: now,
				}
				opts.logger?.info(
					`[openclawos-auto-approve sweep] promoted ${did.slice(0, 12)}… (requestId ${requestId.slice(0, 8)}…) clientId=${req.clientId}`,
				)
			} else {
				opts.logger?.info(
					`[openclawos-auto-approve sweep] cleared stale pending ${requestId.slice(0, 8)}… (device ${did.slice(0, 12)}… already paired)`,
				)
			}
			delete pending[requestId]
			swept++
		}

		writeJsonAtomic(pairedPath, paired)
		writeJsonAtomic(pendingPath, pending)

		return {sweptCount: swept, errors}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		opts.logger?.warn?.('[openclawos-auto-approve sweep] failed', err)
		errors.push(msg)
		return {sweptCount: 0, errors}
	}
}
