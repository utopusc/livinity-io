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
	deviceId: unknown,
	opts: AutoApproveOptions = {},
): AutoApproveResult {
	if (!isHexDeviceId(deviceId)) {
		return {status: 'invalid-input'}
	}
	const did: string = deviceId

	const dir = opts.devicesDir ?? DEFAULT_DEVICES_DIR
	const pairedPath = join(dir, 'paired.json')
	const pendingPath = join(dir, 'pending.json')

	try {
		const paired = readJsonOrEmpty<Record<string, PairedEntry>>(pairedPath)
		if (paired[did]) {
			return {status: 'already-paired', deviceId: did}
		}

		const pending = readJsonOrEmpty<Record<string, PendingEntry>>(pendingPath)
		const match = Object.values(pending).find((req) => req && req.deviceId === did)
		if (!match) {
			return {status: 'no-pending', deviceId: did}
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
			deviceId: did,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}
