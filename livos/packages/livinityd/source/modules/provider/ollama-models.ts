/**
 * Phase 316-04 (LLM-01) — first-party local-Ollama model management client.
 *
 * A thin loopback REST client against the already-running Ollama builtin app
 * (`builtin-apps.ts` id `ollama`, port bound to `127.0.0.1:11434`). livinityd
 * runs directly on the host via `tsx` (not containerized), so it reaches the
 * loopback address with zero Docker-network plumbing.
 *
 * Design constraints (locked by 316-RESEARCH + the plan's threat model):
 *
 *   - T-316-10 (SSRF) — the base URL is HARDCODED to `127.0.0.1:11434`. No
 *     caller-supplied host/base-URL ever feeds `fetch` (ASVS V9). The only
 *     injectable is a `fetchImpl` test seam, which cannot change the target.
 *   - T-316-11 (injection) — every model-name string is validated against
 *     `MODEL_NAME_RE` (an allowlist) BEFORE it reaches `/api/pull` or
 *     `/api/delete` (ASVS V5).
 *   - T-316-12 (DoS / OOM) — `checkPullGuardrails` reads real RAM headroom
 *     (`getSystemMemoryUsage`) + disk headroom (`getDiskUsageByPath` on the
 *     Ollama models directory) and returns an `ok:false` gate the router uses
 *     to block-by-default (ASVS V12).
 *
 * RULE 1 (316-01 DECISION, binding) — this module and its router touch ZERO
 * `provider.config` / `OLLAMA_API_KEY` surface. Listing / pulling / deleting a
 * model must never write a provider key. Only 316-05's explicit "Use as Liv
 * model" action may. This file's imports are limited to `system/system.js`
 * plus node built-ins — nothing from the agent runtime tree or liv-core.
 *
 * The fetch wrapper mirrors `claude-auth-router.ts` `callLivCore()`: hardcoded
 * URL, try/catch → a typed error object (never a raw throw of `undefined`),
 * defensive JSON handling.
 */

import {getDiskUsageByPath, getSystemMemoryUsage} from '../system/system.js'

// ── Hardcoded loopback target (SSRF guard — T-316-10) ─────────────────────
//
// NEVER parameterise this. The Ollama daemon is loopback-bound; a
// caller-supplied host would turn this client into an arbitrary-URL fetch.
const OLLAMA_URL = 'http://127.0.0.1:11434'

// ── Model-name allowlist (T-316-11) ───────────────────────────────────────
//
// Mirrors the KEY_SHAPE_REGEX precedent in env-file-writer.ts: a strict
// character allowlist rather than a denylist. Accepts a repo path
// (`library/qwen2.5`, alphanumerics + `._/-`) with an optional `:tag`
// suffix. Rejects whitespace, `..` traversal, and every shell/path
// metacharacter (`;`, `|`, `&`, backticks, `$`, quotes, ...).
export const MODEL_NAME_RE = /^[a-z0-9]([a-z0-9._/-]{0,120})(:[a-z0-9._-]{1,64})?$/i

/**
 * Return true iff `name` is a syntactically-valid Ollama model reference.
 * Applied before EVERY /api/pull and /api/delete call.
 */
export function validateModelName(name: unknown): name is string {
	if (typeof name !== 'string') return false
	if (name.length === 0 || name.length > 200) return false
	// Belt-and-braces: reject any `..` even though the regex already forbids
	// it (a `.` run is only allowed inside the allowlisted charset, never as a
	// leading segment, but the explicit check documents the traversal intent).
	if (name.includes('..')) return false
	return MODEL_NAME_RE.test(name)
}

// ── Footprint estimate (static lookup) ─────────────────────────────────────

export interface FootprintEstimate {
	/** Conservative resident-RAM estimate in GB. */
	gb: number
	/** false = the tag matched no known parameter-count pattern (proceed with caution). */
	known: boolean
	/** Human-readable note surfaced to the UI. */
	note: string
}

/** Fixed overhead (KV cache + runtime) added on top of the weight estimate. */
const FOOTPRINT_OVERHEAD_GB = 1.0
/** Conservative default when a tag exposes no parameter count. */
const UNKNOWN_FOOTPRINT_GB = 8

/**
 * GB of resident memory per BILLION parameters, by quantization. Sourced from
 * the 316-RESEARCH RAM/VRAM table (MEDIUM confidence) — deliberately biased
 * high so the guardrail errs on the side of blocking (conservative).
 */
const BYTES_PER_BILLION_BY_QUANT: Record<string, number> = {
	q2: 0.4,
	q3: 0.48,
	q4: 0.62,
	q5: 0.72,
	q6: 0.85,
	q8: 1.15,
	f16: 2.1,
	fp16: 2.1,
	bf16: 2.1,
	f32: 4.2,
}

/**
 * Estimate a model's resident RAM footprint from a tag string like
 * `llama3:8b-q4_0`. Parses a `<N>b` parameter-count marker (billions) and an
 * optional quantization token; falls back to a conservative "unknown" marker
 * when the tag exposes no parameter count.
 */
export function estimateModelFootprintGb(tag: string): FootprintEstimate {
	const lower = typeof tag === 'string' ? tag.toLowerCase() : ''

	// Parameter count: a digit run (optionally decimal) immediately followed by
	// `b` and a non-alphanumeric boundary. Guards against version numbers like
	// the `2.5` in `qwen2.5` (followed by `:`, not `b`) or `3` in `llama3`.
	const paramMatch = lower.match(/(\d+(?:\.\d+)?)\s*b(?![a-z0-9])/)
	if (!paramMatch) {
		return {
			gb: UNKNOWN_FOOTPRINT_GB,
			known: false,
			note: 'unknown model size — proceed with caution',
		}
	}
	const billions = Number(paramMatch[1])
	if (!Number.isFinite(billions) || billions <= 0) {
		return {
			gb: UNKNOWN_FOOTPRINT_GB,
			known: false,
			note: 'unknown model size — proceed with caution',
		}
	}

	// Quantization token (defaults to q4 — Ollama's common default).
	const quantMatch = lower.match(/(q[2-8]|f16|fp16|bf16|f32)(?![a-z0-9])/)
	const quant = quantMatch ? quantMatch[1] : 'q4'
	const perBillion = BYTES_PER_BILLION_BY_QUANT[quant] ?? BYTES_PER_BILLION_BY_QUANT.q4

	const gb = round1(billions * perBillion + FOOTPRINT_OVERHEAD_GB)
	return {
		gb,
		known: true,
		note: `~${gb}GB estimated for ${billions}B ${quant.toUpperCase()}`,
	}
}

// ── Pull guardrails (T-316-12) ─────────────────────────────────────────────

const GB = 1024 ** 3
/** Extra headroom to keep the box responsive after the model loads. */
const RAM_SAFETY_MARGIN_GB = 1.5
/** Extra disk headroom beyond the download itself. */
const DISK_SAFETY_MARGIN_GB = 2

export interface GuardrailCheck {
	availableGb: number
	neededGb: number
	ok: boolean
}

export interface PullGuardrails {
	ram: GuardrailCheck
	disk: GuardrailCheck
	estimate: FootprintEstimate
}

/**
 * Compute the RAM + disk headroom gate for pulling `name`.
 *
 * RAM available = `size - totalUsed` (from getSystemMemoryUsage). Disk
 * available = `available` for `modelsDir` (from getDiskUsageByPath — targeted
 * at the Ollama app-data models directory so the check reflects the actual
 * filesystem the pull lands on, even if `/External` storage is mounted there).
 *
 * NOTE (disk `needed`): Ollama has no clean pre-pull manifest-size endpoint
 * reachable over loopback without initiating the pull, and reaching an
 * external registry would violate the SSRF/loopback-only guard (T-316-10). We
 * therefore use the conservative static footprint estimate as the disk
 * `needed` — the plan's sanctioned fallback ("else fall back to the estimate").
 * A quantized model's on-disk size ≈ its resident size, so the estimate is a
 * reasonable disk pre-flight too.
 */
export async function checkPullGuardrails(
	name: string,
	modelsDir: string,
): Promise<PullGuardrails> {
	const estimate = estimateModelFootprintGb(name)

	const mem = await getSystemMemoryUsage()
	const ramAvailableGb = round1(Math.max(0, mem.size - mem.totalUsed) / GB)
	const ramNeededGb = round1(estimate.gb + RAM_SAFETY_MARGIN_GB)

	const disk = await getDiskUsageByPath(modelsDir)
	const diskAvailableGb = round1(Math.max(0, disk.available) / GB)
	const diskNeededGb = round1(estimate.gb + DISK_SAFETY_MARGIN_GB)

	return {
		ram: {
			availableGb: ramAvailableGb,
			neededGb: ramNeededGb,
			ok: ramAvailableGb >= ramNeededGb,
		},
		disk: {
			availableGb: diskAvailableGb,
			neededGb: diskNeededGb,
			ok: diskAvailableGb >= diskNeededGb,
		},
		estimate,
	}
}

// ── REST client shapes ─────────────────────────────────────────────────────

export interface OllamaModel {
	name: string
	size: number
	digest: string
	modified_at: string
}

export interface OllamaPsModel {
	name: string
	size: number
	size_vram?: number
}

export interface PullProgressEvent {
	status?: string
	digest?: string
	total?: number
	completed?: number
	error?: string
}

/** A typed error object — mirrors callLivCore's TRPCError-shaped failure. */
export class OllamaClientError extends Error {
	readonly code: string
	readonly status?: number
	constructor(code: string, message: string, status?: number) {
		super(message)
		this.name = 'OllamaClientError'
		this.code = code
		this.status = status
	}
}

export interface OllamaClientLogger {
	info(msg: string): void
	warn(msg: string, err?: unknown): void
}

export interface OllamaClientOptions {
	logger?: OllamaClientLogger
	/**
	 * Test seam ONLY. Injecting a fetch implementation cannot change the
	 * target host — `OLLAMA_URL` is hardcoded (SSRF guard, T-316-10).
	 */
	fetchImpl?: typeof fetch
	/** Per-request timeout for the non-streaming calls (ms). */
	timeoutMs?: number
}

// ── Client ─────────────────────────────────────────────────────────────────

export class OllamaClient {
	private readonly logger: OllamaClientLogger
	private readonly fetchImpl: typeof fetch
	private readonly timeoutMs: number

	constructor(opts: OllamaClientOptions = {}) {
		this.logger = opts.logger ?? {info: () => undefined, warn: () => undefined}
		this.fetchImpl = opts.fetchImpl ?? fetch
		this.timeoutMs = opts.timeoutMs ?? 15_000
	}

	/** GET /api/tags → installed models. */
	async listModels(): Promise<{models: OllamaModel[]}> {
		const res = await this.request('GET', '/api/tags')
		const data = await this.readJson<{models?: OllamaModel[]}>(res)
		if (!res.ok) {
			throw new OllamaClientError(
				'OLLAMA_LIST_FAILED',
				`Ollama /api/tags returned HTTP ${res.status}`,
				res.status,
			)
		}
		return {models: Array.isArray(data.models) ? data.models : []}
	}

	/** GET /api/ps → currently-resident models (guardrail context). */
	async psModels(): Promise<{models: OllamaPsModel[]}> {
		const res = await this.request('GET', '/api/ps')
		const data = await this.readJson<{models?: OllamaPsModel[]}>(res)
		if (!res.ok) {
			throw new OllamaClientError(
				'OLLAMA_PS_FAILED',
				`Ollama /api/ps returned HTTP ${res.status}`,
				res.status,
			)
		}
		return {models: Array.isArray(data.models) ? data.models : []}
	}

	/** DELETE /api/delete {name}. Validates the name (T-316-11). */
	async deleteModel(name: string): Promise<{ok: boolean; status: number}> {
		if (!validateModelName(name)) {
			throw new OllamaClientError('INVALID_MODEL_NAME', `Rejected model name: ${String(name)}`)
		}
		const res = await this.request('DELETE', '/api/delete', {name})
		// 200 = deleted; 404 = not present. Both are non-throwing outcomes.
		return {ok: res.ok, status: res.status}
	}

	/** Guardrail check (delegates to the standalone). */
	async checkPullGuardrails(name: string, modelsDir: string): Promise<PullGuardrails> {
		return checkPullGuardrails(name, modelsDir)
	}

	/**
	 * POST /api/pull {name} — streams NDJSON progress lines. Validates the
	 * name (T-316-11), then parses the streamed body line-by-line, invoking
	 * `onProgress` for each JSON event. Resolves when the stream ends; throws
	 * an OllamaClientError on transport failure or a non-2xx response.
	 */
	async pullModel(
		name: string,
		onProgress: (evt: PullProgressEvent) => void,
		signal?: AbortSignal,
	): Promise<void> {
		if (!validateModelName(name)) {
			throw new OllamaClientError('INVALID_MODEL_NAME', `Rejected model name: ${String(name)}`)
		}

		let res: Response
		try {
			res = await this.fetchImpl(`${OLLAMA_URL}/api/pull`, {
				method: 'POST',
				headers: {'content-type': 'application/json'},
				body: JSON.stringify({name, stream: true}),
				signal,
			})
		} catch (err) {
			throw new OllamaClientError(
				'OLLAMA_UNREACHABLE',
				`Ollama unreachable at ${OLLAMA_URL}/api/pull: ${(err as Error).message}`,
			)
		}

		if (!res.ok) {
			const text = await res.text().catch(() => '')
			throw new OllamaClientError(
				'OLLAMA_PULL_FAILED',
				`Ollama /api/pull returned HTTP ${res.status}: ${text.slice(0, 200)}`,
				res.status,
			)
		}

		const body = res.body
		if (!body) {
			// No stream body — treat as an immediate no-op completion.
			return
		}

		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		for (;;) {
			const {done, value} = await reader.read()
			if (done) break
			buffer += decoder.decode(value, {stream: true})
			let newlineIdx: number
			while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, newlineIdx).trim()
				buffer = buffer.slice(newlineIdx + 1)
				if (line.length === 0) continue
				this.emitProgressLine(line, onProgress)
			}
		}
		// Flush any trailing partial line.
		const tail = buffer.trim()
		if (tail.length > 0) this.emitProgressLine(tail, onProgress)
	}

	// ── internals ────────────────────────────────────────────────────────────

	private emitProgressLine(
		line: string,
		onProgress: (evt: PullProgressEvent) => void,
	): void {
		let evt: PullProgressEvent
		try {
			evt = JSON.parse(line) as PullProgressEvent
		} catch {
			// Non-JSON line — skip defensively (mirror callLivCore's tolerant parse).
			return
		}
		if (evt && typeof evt.error === 'string' && evt.error.length > 0) {
			throw new OllamaClientError('OLLAMA_PULL_STREAM_ERROR', evt.error)
		}
		onProgress(evt)
	}

	private async request(
		method: 'GET' | 'POST' | 'DELETE',
		path: string,
		body?: unknown,
	): Promise<Response> {
		try {
			return await this.fetchImpl(`${OLLAMA_URL}${path}`, {
				method,
				headers: {'content-type': 'application/json'},
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(this.timeoutMs),
			})
		} catch (err) {
			throw new OllamaClientError(
				'OLLAMA_UNREACHABLE',
				`Ollama unreachable at ${OLLAMA_URL}${path}: ${(err as Error).message}`,
			)
		}
	}

	private async readJson<T>(res: Response): Promise<T> {
		const text = await res.text().catch(() => '')
		try {
			return (text.length > 0 ? JSON.parse(text) : {}) as T
		} catch {
			return {} as T
		}
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

function round1(n: number): number {
	return Math.round(n * 10) / 10
}
