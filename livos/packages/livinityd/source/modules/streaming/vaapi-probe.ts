/**
 * Phase 93-02 — Boot-time VAAPI capability probe.
 *
 * Runs `vainfo` once at livinityd boot and parses the output looking for
 * `VAEntrypointEncSlice` for any of the H264 profiles (Main / High /
 * ConstrainedBaseline). The result is persisted to Redis as the HASH
 * `liv:streaming:caps` and consumed by `encoder-args.ts` to pick between
 * `h264_vaapi` (hardware) and `libx264 -preset ultrafast` (software).
 *
 * Locked decision D-93-03: if VAAPI is present, the encoder branch is
 * `-c:v h264_vaapi` + `-vaapi_device /dev/dri/renderD128`; otherwise we
 * fall back to libx264 with the matching MSE-tuning flags.
 *
 * Failure modes (all return a structured error string, never throw):
 *   - vainfo binary missing → `vaapi-not-found` (apt package not installed)
 *   - vainfo timed out (>3s) → `timeout` (driver hung — often a kernel
 *     module mismatch on Intel iGPUs)
 *   - vainfo exited non-zero → `vainfo-failed` with stderr captured
 *   - parsing succeeded but no H264 enc entry → `{vaapi:false, profiles:[]}`
 *
 * The probe is intentionally side-effect-free except for the Redis HASH
 * write (in `persistVaapiCaps`), so unit tests can mock execFile and
 * round-trip via FakeRedis without ioredis-mock.
 */

import {execFile} from 'node:child_process'

/**
 * Hand-rolled `execFile` → Promise wrapper. We avoid `util.promisify`
 * because Node's execFile has a custom promisify symbol that bypasses the
 * test mock — vi.mock('node:child_process') replaces the named export but
 * not the symbol-keyed override that promisify reaches for.
 */
function execFileAsync(
	cmd: string,
	args: string[],
	opts: {timeout?: number; maxBuffer?: number} = {},
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, opts, (err, stdout, stderr) => {
			if (err) {
				;(err as Error & {stdout?: string; stderr?: string}).stdout = String(stdout || '')
				;(err as Error & {stdout?: string; stderr?: string}).stderr = String(stderr || '')
				reject(err)
				return
			}
			resolve({stdout: String(stdout || ''), stderr: String(stderr || '')})
		})
	})
}

/** H264 profile names recognised in vainfo output. Order = preference. */
const H264_PROFILES = [
	'VAProfileH264High',
	'VAProfileH264Main',
	'VAProfileH264ConstrainedBaseline',
] as const

export type VaapiProbeResult = {
	/** True iff vainfo reported VAEntrypointEncSlice for any H264 profile. */
	vaapi: boolean
	/** All H264 profile names that have an EncSlice entry. */
	profiles: string[]
	/** Set when probing failed. Used to distinguish "absent" from "broken". */
	error?: 'vainfo-not-found' | 'timeout' | 'vainfo-failed' | 'parse-error'
}

/**
 * Subset of ioredis Redis we need for HSET. Intentionally narrow so tests
 * can pass a FakeRedis without depending on ioredis-mock.
 */
export type RedisForCaps = {
	hset(key: string, fields: Record<string, string>): Promise<unknown>
	hgetall?(key: string): Promise<Record<string, string>>
}

const VAINFO_TIMEOUT_MS = 3000
export const STREAMING_CAPS_KEY = 'liv:streaming:caps'

export async function probeVaapi(): Promise<VaapiProbeResult> {
	let stdout: string
	try {
		const result = await execFileAsync('vainfo', [], {
			timeout: VAINFO_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
		})
		stdout = result.stdout || ''
	} catch (err) {
		const e = err as NodeJS.ErrnoException & {killed?: boolean; signal?: string}
		if (e.code === 'ENOENT') {
			return {vaapi: false, profiles: [], error: 'vainfo-not-found'}
		}
		if (e.killed || e.signal === 'SIGTERM') {
			return {vaapi: false, profiles: [], error: 'timeout'}
		}
		return {vaapi: false, profiles: [], error: 'vainfo-failed'}
	}

	return parseVainfoOutput(stdout)
}

/**
 * Parse `vainfo` stdout. Lines we care about look like:
 *
 *   VAProfileH264Main               : VAEntrypointVLD
 *   VAProfileH264Main               : VAEntrypointEncSlice
 *
 * We only want the EncSlice entry — VLD is decode-only.
 */
export function parseVainfoOutput(stdout: string): VaapiProbeResult {
	if (!stdout || typeof stdout !== 'string') {
		return {vaapi: false, profiles: [], error: 'parse-error'}
	}
	const lines = stdout.split(/\r?\n/)
	const found = new Set<string>()
	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line.includes('VAEntrypointEncSlice')) continue
		for (const profile of H264_PROFILES) {
			if (line.includes(profile)) {
				found.add(profile)
			}
		}
	}
	const profiles = H264_PROFILES.filter((p) => found.has(p))
	return {vaapi: profiles.length > 0, profiles}
}

/**
 * Persist the probe result to Redis as the HASH `liv:streaming:caps`.
 *
 * Schema:
 *   vaapi    -> "true" | "false"
 *   profiles -> CSV (e.g. "VAProfileH264High,VAProfileH264Main")
 *   probedAt -> ISO timestamp (UTC)
 *   error    -> error code if probe failed (optional)
 *
 * Uses HSET (not SET) so consumers can read individual fields without
 * parsing JSON.
 */
export async function persistVaapiCaps(
	redis: RedisForCaps,
	caps: VaapiProbeResult,
	now: () => Date = () => new Date(),
): Promise<void> {
	const fields: Record<string, string> = {
		vaapi: caps.vaapi ? 'true' : 'false',
		profiles: caps.profiles.join(','),
		probedAt: now().toISOString(),
	}
	if (caps.error) fields.error = caps.error
	await redis.hset(STREAMING_CAPS_KEY, fields)
}
