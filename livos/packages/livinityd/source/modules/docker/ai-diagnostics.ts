// Phase 23 (AID-01/03/04) — AI-powered Docker diagnostics engine.
//
// This module is the bridge between the livinityd tRPC routes and the
// nexus-core /api/kimi/chat one-shot endpoint. It owns:
//
//  - callKimi():      a thin HTTP client around POST /api/kimi/chat
//  - redactSecrets(): a pre-flight scrubber for KEY=value / "key":"value"
//  - 3 task drivers:  diagnoseContainer, generateComposeFromPrompt,
//                     explainVulnerabilities
//
// The drivers build task-specific prompts, redact secrets in inbound
// payloads (logs / env), parse the Kimi response, and (for diagnose +
// CVE explain) cache results in Redis under `liv:ai:diag:*` for 5
// minutes. Compose generation is intentionally NOT cached — every
// natural-language prompt is unique by intent.
//
// Errors are bracketed so routes.ts can map them to TRPCError codes:
//   [ai-unavailable] [ai-bad-response] [ai-error] [ai-timeout]
//   [no-scan-result] [not-found] [env-not-found] [agent-not-implemented]

import {createHash} from 'node:crypto'

import yaml from 'js-yaml'
import {Redis} from 'ioredis'

import {getCachedScan} from './vuln-scan.js'
import {getContainerLogs, getContainerStats, inspectContainer} from './docker.js'
import type {VulnScanResult, CveEntry} from './types.js'

// ---------------------------------------------------------------------------
// Cache + transport constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'liv:ai:diag:'
const CACHE_TTL_SECONDS = 300 // 5 minutes — matches Phase 19 vuln-scan precedent
const KIMI_TIMEOUT_MS = 90_000 // 90s client-side; nexus enforces its own 60s
const LOG_TAIL_LINES = 200

// Lazy Redis singleton — mirrors `vuln-scan.ts:getRedis()` so tests can
// avoid spinning up a real connection when only the pure helpers are
// exercised (the test file imports redactSecrets / parsers / payload
// builder; cache code is never invoked).
let _redis: Redis | null = null
function getRedis(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
	}
	return _redis
}

function getNexusApiUrl(): string {
	return process.env.LIV_API_URL || 'http://localhost:3200'
}

function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex')
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiDiagnosticResult {
	likelyCause: string
	suggestedAction: string
	confidence: 'low' | 'medium' | 'high' | 'unknown'
	summary: string
	model: string
	generatedAt: string
	cached: boolean
}

export interface AiComposeResult {
	yaml: string
	warnings: string[]
	model: string
	generatedAt: string
}

export interface AiCveExplanationResult {
	explanation: string
	upgradeSuggestion: string
	model: string
	generatedAt: string
	cached: boolean
}

// ---------------------------------------------------------------------------
// System prompts (module-level constants — kept verbatim per spec)
// ---------------------------------------------------------------------------

const DIAGNOSE_SYSTEM_PROMPT =
	'You are a Docker diagnostic assistant. The user will give you JSON containing recent logs (last 200 lines, secrets redacted), container resource stats (CPU%, memory%, memory MB), and container metadata (state, restart count, health status, exit code, image). Diagnose the container\'s health in three labelled sections — keep each under 80 words. Use this exact format:\n\nLikely cause: <one paragraph>\nSuggested action: <one or two concrete commands or config changes>\nConfidence: <low|medium|high>\n\nBe specific and reference exact log lines when possible. If logs show no errors and stats look healthy, say so plainly with confidence high.'

const COMPOSE_SYSTEM_PROMPT =
	'You are a Docker Compose generator. Given a natural-language description of a service stack, return a single valid `docker-compose.yml` (compose-spec v3.8 or later). Wrap the YAML in a ```yaml fenced code block. Constraints: use named volumes (not bind mounts), pin images to specific minor versions (not `latest`), include `restart: unless-stopped`, expose only ports the user explicitly mentioned, prefer alpine-based images for size, never include placeholder secrets — emit `${VAR_NAME}` references the user is expected to fill in. Add a brief 1-2 line comment at the top of the YAML explaining what the stack does.'

const CVE_SYSTEM_PROMPT =
	'You are a vulnerability remediation assistant. The user will give you JSON listing the top 5 CVEs from a Trivy scan of an image. Explain in plain English what the highest-severity issues mean for someone running this image, then propose a concrete upgrade path. Use this exact format:\n\nExplanation: <2-4 sentences covering the worst CVEs and their impact>\nUpgrade path: <one specific image:tag recommendation, e.g. `nginx:1.21` -> `nginx:1.27-alpine`>\n\nIf no concrete fix tag is available across the CVEs, say so.'

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

// Keys that count as secret-bearing. Matched case-insensitively against
// the LHS of `KEY=value` env-style lines and against JSON object keys.
const SECRET_KEY_PATTERN =
	/(API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|PASSWORD|PASSWD|PWD|SECRET|TOKEN|KEY)/i

// Match KEY=value (env-style). Stops the value at end-of-line or end-of-input.
// We capture the key name so we can re-test it against SECRET_KEY_PATTERN.
const ENV_LINE_REGEX = /(^|\s|^["'])([A-Z][A-Z0-9_]*)=([^\r\n]*)/g

// Match JSON-ish "key":"value" pairs (whitespace tolerant).
const JSON_PAIR_REGEX = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g

/**
 * Redact secret-like values from arbitrary text before sending it to
 * Kimi. Idempotent: the replacement token is `[REDACTED]` which contains
 * no characters that would re-trigger the regexes.
 */
export function redactSecrets(text: string): string {
	if (!text) return text

	let out = text.replace(ENV_LINE_REGEX, (match, lead, key, _value) => {
		if (SECRET_KEY_PATTERN.test(key)) {
			return `${lead}${key}=[REDACTED]`
		}
		return match
	})

	out = out.replace(JSON_PAIR_REGEX, (match, key, _value) => {
		if (SECRET_KEY_PATTERN.test(key)) {
			return `"${key}":"[REDACTED]"`
		}
		return match
	})

	return out
}

// ---------------------------------------------------------------------------
// Container diagnostic payload builder
// ---------------------------------------------------------------------------

interface ContainerDiagnosticPayloadInput {
	logs: string
	stats: {
		cpuPercent: number
		memoryUsage: number
		memoryLimit: number
		memoryPercent: number
		networkRx: number
		networkTx: number
		pids: number
	}
	inspectInfo: {
		id?: string
		state: string
		status?: string
		restartCount: number
		healthStatus: string | null
		image: string
		created?: string
		[k: string]: unknown
	}
}

interface ContainerDiagnosticPayload {
	logsTrimmed: string
	stats: {
		cpuPercent: number
		memoryPercent: number
		memoryUsageMb: number
		memoryLimitMb: number
		networkRxKb: number
		networkTxKb: number
		pids: number
	}
	container: {
		state: string
		restartCount: number
		healthStatus: string | null
		exitCode: number | null
		image: string
		imageDigest: string | null
		startedAt: string | null
	}
}

function bytesToMb(bytes: number): number {
	return Math.round((bytes / 1024 / 1024) * 10) / 10
}
function bytesToKb(bytes: number): number {
	return Math.round((bytes / 1024) * 10) / 10
}

/**
 * Convert raw inspect / stats / logs into the JSON shape Kimi consumes.
 * Logs are run through `redactSecrets` before being attached.
 */
export function buildContainerDiagnosticPayload(
	input: ContainerDiagnosticPayloadInput,
): ContainerDiagnosticPayload {
	const {logs, stats, inspectInfo} = input
	return {
		logsTrimmed: redactSecrets(logs),
		stats: {
			cpuPercent: stats.cpuPercent,
			memoryPercent: stats.memoryPercent,
			memoryUsageMb: bytesToMb(stats.memoryUsage),
			memoryLimitMb: bytesToMb(stats.memoryLimit),
			networkRxKb: bytesToKb(stats.networkRx),
			networkTxKb: bytesToKb(stats.networkTx),
			pids: stats.pids,
		},
		container: {
			state: inspectInfo.state,
			restartCount: inspectInfo.restartCount,
			healthStatus: inspectInfo.healthStatus ?? null,
			exitCode: typeof (inspectInfo as any).exitCode === 'number' ? (inspectInfo as any).exitCode : null,
			image: inspectInfo.image,
			imageDigest:
				typeof (inspectInfo as any).imageDigest === 'string'
					? (inspectInfo as any).imageDigest
					: null,
			startedAt:
				typeof (inspectInfo as any).startedAt === 'string'
					? (inspectInfo as any).startedAt
					: null,
		},
	}
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

/**
 * Extract the three labelled sections from a Kimi diagnose response.
 * Tolerant of `## Likely Cause` markdown headers and case variants.
 * Missing sections return empty strings; unrecognised confidence
 * values clamp to `'unknown'`.
 */
export function parseDiagnosticResponse(raw: string): {
	likelyCause: string
	suggestedAction: string
	confidence: 'low' | 'medium' | 'high' | 'unknown'
} {
	const text = (raw || '').trim()

	const grab = (label: string): string => {
		// Match "Label:" or "## Label" optionally preceded by markdown,
		// capture until the next labelled section or end-of-string.
		const re = new RegExp(
			`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${label}\\s*[:\\-]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?(?:Likely\\s+cause|Suggested\\s+action|Confidence)\\s*[:\\-]|$)`,
			'i',
		)
		const m = text.match(re)
		return m ? m[1].trim() : ''
	}

	const likelyCause = grab('Likely\\s+cause')
	const suggestedAction = grab('Suggested\\s+action')
	const confidenceRaw = grab('Confidence').toLowerCase().trim()

	let confidence: 'low' | 'medium' | 'high' | 'unknown' = 'unknown'
	if (/^(low|medium|high)\b/.test(confidenceRaw)) {
		confidence = confidenceRaw.match(/^(low|medium|high)/)![1] as 'low' | 'medium' | 'high'
	}

	return {likelyCause, suggestedAction, confidence}
}

/**
 * Pull the YAML out of a Kimi compose response. Prefers a fenced
 * ```yaml or ```yml block; falls back to a heuristic when the model
 * forgets the fence (warnings array surfaces the fallback to the UI).
 */
export function parseComposeResponse(raw: string): {yaml: string; warnings: string[]} {
	const warnings: string[] = []
	const text = raw || ''

	// Prefer ```yaml / ```yml fenced blocks
	const fenceMatch = text.match(/```(?:yaml|yml)\s*\n([\s\S]*?)```/i)
	if (fenceMatch) {
		return {yaml: fenceMatch[1].trim(), warnings}
	}

	// Generic ``` block — accept it if the contents look compose-shaped
	const genericFence = text.match(/```\s*\n([\s\S]*?)```/i)
	if (genericFence) {
		const candidate = genericFence[1].trim()
		if (/^(version\s*:|services\s*:)/m.test(candidate)) {
			warnings.push('no fenced code block found')
			return {yaml: candidate, warnings}
		}
	}

	// No fence — heuristically grab from the first `version:` / `services:` onward
	const heuristic = text.match(/^(version\s*:|services\s*:)[\s\S]*$/m)
	if (heuristic) {
		warnings.push('no fenced code block found')
		return {yaml: heuristic[0].trim(), warnings}
	}

	warnings.push('no compose YAML detected in response')
	return {yaml: '', warnings}
}

/**
 * Diagnose's CVE-explanation cousin — same shape as parseDiagnosticResponse
 * but with "Explanation:" / "Upgrade path:" labels.
 */
function parseCveResponse(raw: string): {explanation: string; upgradeSuggestion: string} {
	const text = (raw || '').trim()
	const grab = (label: string): string => {
		const re = new RegExp(
			`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${label}\\s*[:\\-]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?(?:Explanation|Upgrade\\s+path)\\s*[:\\-]|$)`,
			'i',
		)
		const m = text.match(re)
		return m ? m[1].trim() : ''
	}
	return {
		explanation: grab('Explanation'),
		upgradeSuggestion: grab('Upgrade\\s+path'),
	}
}

// ---------------------------------------------------------------------------
// Kimi HTTP client
// ---------------------------------------------------------------------------

/**
 * One-shot Kimi completion via nexus's `/api/kimi/chat`. No tools,
 * no streaming. Throws bracketed errors for routes.ts to map to
 * TRPCError codes.
 */
export async function callKimi(
	systemPrompt: string,
	userPrompt: string,
	opts?: {tier?: 'haiku' | 'sonnet' | 'opus'; maxTokens?: number},
): Promise<{text: string; inputTokens: number; outputTokens: number}> {
	const url = `${getNexusApiUrl()}/api/kimi/chat`
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {}),
			},
			body: JSON.stringify({
				systemPrompt,
				userPrompt,
				tier: opts?.tier ?? 'sonnet',
				maxTokens: opts?.maxTokens ?? 4096,
			}),
			signal: AbortSignal.timeout(KIMI_TIMEOUT_MS),
		})
	} catch (err: any) {
		if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
			throw new Error('[ai-timeout] Kimi request exceeded 90s')
		}
		throw new Error(`[ai-unavailable] Could not reach nexus Kimi endpoint: ${err?.message ?? err}`)
	}

	if (response.status >= 500) {
		const body = await response.text().catch(() => '')
		throw new Error(`[ai-error] nexus returned ${response.status}: ${body.slice(0, 300)}`)
	}
	if (!response.ok) {
		const body = await response.text().catch(() => '')
		throw new Error(`[ai-error] nexus returned ${response.status}: ${body.slice(0, 300)}`)
	}

	let payload: any
	try {
		payload = await response.json()
	} catch {
		throw new Error('[ai-bad-response] nexus returned non-JSON body')
	}

	if (!payload || typeof payload.text !== 'string') {
		throw new Error('[ai-bad-response] nexus payload missing .text')
	}

	return {
		text: payload.text,
		inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : 0,
		outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : 0,
	}
}

// ---------------------------------------------------------------------------
// Driver: diagnoseContainer
// ---------------------------------------------------------------------------

/**
 * Build a payload from logs+stats+inspect, ask Kimi to diagnose,
 * cache the answer for 5 minutes keyed on container id + recent-log hash.
 */
export async function diagnoseContainer(
	name: string,
	environmentId?: string | null,
): Promise<AiDiagnosticResult> {
	const inspectInfo = await inspectContainer(name, environmentId)
	const [logs, stats] = await Promise.all([
		getContainerLogs(name, LOG_TAIL_LINES, true, environmentId),
		getContainerStats(name, environmentId),
	])

	const payload = buildContainerDiagnosticPayload({
		logs,
		stats,
		inspectInfo: {
			id: inspectInfo.id,
			state: inspectInfo.state,
			status: inspectInfo.status,
			restartCount: inspectInfo.restartCount,
			healthStatus: inspectInfo.healthStatus,
			image: inspectInfo.image,
			created: inspectInfo.created,
		},
	})

	// Cache key uses the container id (stable across renames) + a short
	// hash of the last 2KB of redacted logs so cache invalidates as soon
	// as new log lines accumulate.
	const containerId = inspectInfo.id || name
	const logHash = sha256Hex(payload.logsTrimmed.slice(-2000)).slice(0, 16)
	const cacheKey = `${CACHE_PREFIX}${containerId}:${logHash}`

	try {
		const cached = await getRedis().get(cacheKey)
		if (cached) {
			const parsed = JSON.parse(cached) as AiDiagnosticResult
			parsed.cached = true
			return parsed
		}
	} catch {
		// Redis miss / parse error — fall through to live call
	}

	console.log('[ai-diagnostics] diagnose miss', {containerId, logHash})

	const userPrompt = JSON.stringify(payload, null, 2)
	const kimi = await callKimi(DIAGNOSE_SYSTEM_PROMPT, userPrompt, {
		tier: 'sonnet',
		maxTokens: 1024,
	})

	const parsed = parseDiagnosticResponse(kimi.text)
	const summary = parsed.likelyCause.slice(0, 200)

	const result: AiDiagnosticResult = {
		likelyCause: parsed.likelyCause,
		suggestedAction: parsed.suggestedAction,
		confidence: parsed.confidence,
		summary,
		model: 'kimi-for-coding',
		generatedAt: new Date().toISOString(),
		cached: false,
	}

	try {
		await getRedis().set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
	} catch {
		// Cache write failure is non-fatal — the live result still returns.
	}

	return result
}

// ---------------------------------------------------------------------------
// Driver: generateComposeFromPrompt
// ---------------------------------------------------------------------------

/**
 * Generate a docker-compose.yml from a natural-language description.
 * Not cached — every prompt is unique by intent.
 */
export async function generateComposeFromPrompt(prompt: string): Promise<AiComposeResult> {
	const kimi = await callKimi(COMPOSE_SYSTEM_PROMPT, prompt, {
		tier: 'sonnet',
		maxTokens: 4096,
	})

	const parsed = parseComposeResponse(kimi.text)
	const warnings = [...parsed.warnings]

	if (parsed.yaml) {
		try {
			yaml.load(parsed.yaml)
		} catch (err: any) {
			warnings.push(`yaml parse warning: ${(err?.message || String(err)).slice(0, 200)}`)
		}
	}

	return {
		yaml: parsed.yaml,
		warnings,
		model: 'kimi-for-coding',
		generatedAt: new Date().toISOString(),
	}
}

// ---------------------------------------------------------------------------
// Driver: explainVulnerabilities
// ---------------------------------------------------------------------------

function topFiveCves(scan: VulnScanResult): CveEntry[] {
	const top = scan.cves
		.filter((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH')
		.slice() // copy before sort
		.sort((a, b) => {
			const aCvss = a.cvss ?? -1
			const bCvss = b.cvss ?? -1
			return bCvss - aCvss
		})
	return top.slice(0, 5)
}

/**
 * Explain a Trivy scan's top 5 critical/high CVEs in plain English and
 * propose a concrete upgrade target. Cached for 5 minutes keyed on the
 * sorted CVE-id list.
 */
export async function explainVulnerabilities(
	imageRef: string,
): Promise<AiCveExplanationResult> {
	const scan = await getCachedScan(imageRef)
	if (!scan) {
		throw new Error('[no-scan-result] No cached Trivy scan for this image. Run a scan first.')
	}

	const top = topFiveCves(scan)
	if (top.length === 0) {
		// Nothing critical/high — return a synthetic clean response without
		// hitting Kimi. This also avoids wasting tokens on clean scans.
		return {
			explanation: 'No critical or high severity CVEs were found in this image.',
			upgradeSuggestion: 'No upgrade required.',
			model: 'kimi-for-coding',
			generatedAt: new Date().toISOString(),
			cached: false,
		}
	}

	const idsKey = top
		.map((c) => c.id)
		.sort()
		.join(',')
	const cacheKey = `${CACHE_PREFIX}cve:${sha256Hex(`${imageRef}|${idsKey}`).slice(0, 16)}`

	try {
		const cached = await getRedis().get(cacheKey)
		if (cached) {
			const parsed = JSON.parse(cached) as AiCveExplanationResult
			parsed.cached = true
			return parsed
		}
	} catch {
		// fall through to live call
	}

	console.log('[ai-diagnostics] explain miss', {imageRef, top: top.map((c) => c.id)})

	const userPrompt = JSON.stringify(
		{
			imageRef,
			top5: top.map((c) => ({
				id: c.id,
				severity: c.severity,
				packageName: c.packageName,
				installedVersion: c.installedVersion,
				fixedVersion: c.fixedVersion,
				cvss: c.cvss,
				title: c.title,
			})),
		},
		null,
		2,
	)

	const kimi = await callKimi(CVE_SYSTEM_PROMPT, userPrompt, {
		tier: 'sonnet',
		maxTokens: 1024,
	})
	const parsed = parseCveResponse(kimi.text)

	const result: AiCveExplanationResult = {
		explanation: parsed.explanation,
		upgradeSuggestion: parsed.upgradeSuggestion,
		model: 'kimi-for-coding',
		generatedAt: new Date().toISOString(),
		cached: false,
	}

	try {
		await getRedis().set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
	} catch {
		// non-fatal
	}

	return result
}
