// Phase 337-01 (FTS-01) — full-text file-CONTENT search engine.
//
// Given an ABSOLUTE system-path root + a query, returns raw content hits under hard
// caps. Knows NOTHING about virtual paths, per-user trees, or ACLs — that scoping is
// the Files orchestrator's job (files.searchFileContent / 337-02). This separation is
// what lets 337-02 reuse the 336 path-safety machinery verbatim without any parallel
// path-safety code living in the engine. See 337-CONTEXT D-337-1..6.

import readline from 'node:readline'
import {Buffer} from 'node:buffer'

import {execa, type ExecaChildProcess} from 'execa'
import fse from 'fs-extra'
import nodePath from 'node:path'

import type Livinityd from '../../index.js'

// Exported shared caps — imported by tests to assert exact values (D-337-5).
export const CONTENT_SEARCH_CAPS = {
	minQueryLength: 3,
	maxFileSizeBytes: 2 * 1024 * 1024, // 2M  (rg: --max-filesize 2M)
	maxMatchesPerFile: 5, // rg: --max-count 5
	threads: 2, // rg: --threads 2
	timeoutMs: 15_000, // wall-clock; SIGKILL escalation
	maxResultFiles: 100, // total files returned (result cap)
	snippetMaxLen: 240, // per-line snippet truncation (both paths)
} as const

export interface ContentMatch {
	line: number // 1-based line number
	snippet: string // the matched line, trimmed + truncated to snippetMaxLen
	matchStart?: number // char offset of the match start within `snippet` (for UI highlight)
	matchEnd?: number // char offset of the match end
}

export interface ContentHit {
	systemPath: string
	contentMatches: ContentMatch[]
	matchCount: number // total matched lines seen for this file (may exceed contentMatches.length if capped)
}

// Trim + truncate a raw matched line into a snippet, mapping the match offsets from
// the raw line into the trimmed+truncated snippet. Shared by the rg + Node paths so
// both produce an aligned result shape. (rg submatch offsets are byte offsets — for
// non-ASCII lines the highlight offsets are best-effort; the snippet text is correct.)
function buildSnippet(rawLine: string, rawStart: number, rawEnd: number): {snippet: string; matchStart: number; matchEnd: number} {
	const leadingWs = rawLine.length - rawLine.trimStart().length
	const trimmed = rawLine.trim()
	const snippet = trimmed.length > CONTENT_SEARCH_CAPS.snippetMaxLen ? trimmed.slice(0, CONTENT_SEARCH_CAPS.snippetMaxLen) : trimmed
	let s = rawStart - leadingWs
	let e = rawEnd - leadingWs
	s = Math.max(0, Math.min(s, snippet.length))
	e = Math.max(s, Math.min(e, snippet.length))
	return {snippet, matchStart: s, matchEnd: e}
}

// Query guard (shared). Trims; returns null if shorter than the min length —
// callers treat null as "empty result, no scan".
export function normalizeQuery(raw: string): string | null {
	const q = raw.trim()
	if (q.length < CONTENT_SEARCH_CAPS.minQueryLength) return null
	return q
}

// Smart-case (mirror rg -S): case-sensitive iff the query contains any uppercase char.
function isCaseSensitive(query: string): boolean {
	return query !== query.toLowerCase()
}

// Build the fixed-string rg argv (array — NEVER a shell string; the load-bearing
// injection defense, RESEARCH §4). `query` is always a standalone element after `-e`.
export function buildRgArgs(query: string, root: string): string[] {
	return [
		'--json',
		'-S',
		'-F',
		'--max-filesize',
		'2M',
		'--max-count',
		String(CONTENT_SEARCH_CAPS.maxMatchesPerFile),
		'--threads',
		String(CONTENT_SEARCH_CAPS.threads),
		'--no-follow', // explicit even though it is rg's default (auditable symlink control)
		'-e',
		query,
		'--',
		root,
	]
}

// Resolve the spawn (bin, args) for a given platform. On Linux, wrap rg for scheduling
// politeness (`nice -n 10 ionice -c3 rg ...`); elsewhere (dev/CI) spawn rg directly.
// Pure + exported so the argv assertion can exercise the UNwrapped branch deterministically.
export function rgSpawnArgs(query: string, root: string, platform: NodeJS.Platform, wrapperAvailable: boolean): {bin: string; args: string[]} {
	const rgArgs = buildRgArgs(query, root)
	if (platform === 'linux' && wrapperAvailable) return {bin: 'nice', args: ['-n', '10', 'ionice', '-c3', 'rg', ...rgArgs]}
	return {bin: 'rg', args: rgArgs}
}

// Module-level single in-flight slot (D-337-5). One box-wide content search at a time.
type Slot = {userKey: string; abort: AbortController} | undefined
let inFlight: Slot

export class ContentSearchBusyError extends Error {
	constructor() {
		super('[content-search-busy]')
		this.name = 'ContentSearchBusyError'
	}
}

export default class ContentSearch {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	// Injectable so the mocked-execa argv assertion can force the unwrapped branch (W3).
	platform: NodeJS.Platform = process.platform
	static rgAvailable: boolean | undefined // cached feature-detect (undefined = not yet probed)
	static wrapperAvailable: boolean | undefined // cached nice/ionice feature-detect

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(`files:${name.toLowerCase()}`)
	}

	// No background task (parity with Search).
	async start() {}
	async stop() {}

	// Feature-detect rg once and cache. execa reject:false so absence never throws.
	async #hasRipgrep(): Promise<boolean> {
		if (ContentSearch.rgAvailable !== undefined) return ContentSearch.rgAvailable
		try {
			const res = await execa('rg', ['--version'], {reject: false, timeout: 5_000})
			ContentSearch.rgAvailable = res.exitCode === 0
		} catch {
			ContentSearch.rgAvailable = false
		}
		return ContentSearch.rgAvailable
	}

	// Feature-detect the nice/ionice scheduling wrapper once and cache (W3 — wrap only
	// when the wrapper binary actually exists). Both come from util-linux/coreutils and
	// are present together on the box; probing `nice` is sufficient.
	async #hasWrapper(): Promise<boolean> {
		if (ContentSearch.wrapperAvailable !== undefined) return ContentSearch.wrapperAvailable
		try {
			const res = await execa('nice', ['--version'], {reject: false, timeout: 5_000})
			ContentSearch.wrapperAvailable = res.exitCode === 0
		} catch {
			ContentSearch.wrapperAvailable = false
		}
		return ContentSearch.wrapperAvailable
	}

	// The single-flight gate. userKey = requesting user's stable id/username.
	// Same user in-flight  → abort the old search, take the slot.
	// Different user in-flight → throw ContentSearchBusyError (polite reject).
	#acquireSlot(userKey: string): AbortController {
		if (inFlight && inFlight.userKey === userKey)
			inFlight.abort.abort() // supersede same user
		else if (inFlight) throw new ContentSearchBusyError() // reject other user
		const ac = new AbortController()
		inFlight = {userKey, abort: ac}
		return ac
	}

	#releaseSlot(ac: AbortController) {
		if (inFlight?.abort === ac) inFlight = undefined
	}

	// PUBLIC orchestration wrapper used by Files (T2). Acquires the slot, runs `work`
	// with the slot's signal, always releases. This is where busy-reject / supersede lives.
	async withSlot<T>(userKey: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const ac = this.#acquireSlot(userKey)
		try {
			return await work(ac.signal)
		} finally {
			this.#releaseSlot(ac)
		}
	}

	// PUBLIC engine entry. Scans ONE resolved system root. Caps applied. Returns up to
	// remaining hits. `signal` chains the caller's abort into rg/Node.
	async scanRoot(rootSystemPath: string, query: string, opts: {signal: AbortSignal; remaining: number}): Promise<ContentHit[]> {
		if (opts.remaining <= 0) return []
		if (opts.signal.aborted) return []
		if (await this.#hasRipgrep()) return this.#scanRootRipgrep(rootSystemPath, query, opts)
		return this.#scanRootNode(rootSystemPath, query, opts)
	}

	// rg path: stream --json line-delimited output, parse only `match` messages, early-stop.
	async #scanRootRipgrep(root: string, query: string, opts: {signal: AbortSignal; remaining: number}): Promise<ContentHit[]> {
		const wrapper = this.platform === 'linux' ? await this.#hasWrapper() : false
		const {bin, args} = rgSpawnArgs(query, root, this.platform, wrapper)

		const hits = new Map<string, ContentHit>()
		let subprocess: ExecaChildProcess<string> | undefined
		try {
			subprocess = execa(bin, args, {
				reject: false,
				timeout: CONTENT_SEARCH_CAPS.timeoutMs,
				killSignal: 'SIGKILL',
				buffer: false,
				stdin: 'ignore',
				signal: opts.signal,
			})
			const stdout = subprocess.stdout
			if (!stdout) {
				await subprocess.catch(() => {})
				return []
			}

			const rl = readline.createInterface({input: stdout, crlfDelay: Number.POSITIVE_INFINITY})
			for await (const line of rl) {
				if (opts.signal.aborted) break
				if (!line) continue
				let msg: any
				try {
					msg = JSON.parse(line)
				} catch {
					continue // non-JSON / partial line — ignore
				}
				if (msg?.type !== 'match') continue
				const data = msg.data
				const filePath: string | undefined = data?.path?.text
				if (!filePath) continue

				// Early-stop: don't start a new file once we've reached the cap.
				if (!hits.has(filePath) && hits.size >= opts.remaining) {
					subprocess.kill?.('SIGKILL')
					break
				}

				const lineText = this.#extractLineText(data?.lines)
				if (lineText === undefined) continue // undecodable bytes — skip this match
				const lineNumber: number = typeof data?.line_number === 'number' ? data.line_number : 0
				const sub = Array.isArray(data?.submatches) ? data.submatches[0] : undefined
				const rawStart: number = typeof sub?.start === 'number' ? sub.start : 0
				const rawEnd: number = typeof sub?.end === 'number' ? sub.end : rawStart

				let hit = hits.get(filePath)
				if (!hit) {
					hit = {systemPath: filePath, contentMatches: [], matchCount: 0}
					hits.set(filePath, hit)
				}
				hit.matchCount += 1
				if (hit.contentMatches.length < CONTENT_SEARCH_CAPS.maxMatchesPerFile) {
					const {snippet, matchStart, matchEnd} = buildSnippet(lineText, rawStart, rawEnd)
					hit.contentMatches.push({line: lineNumber, snippet, matchStart, matchEnd})
				}
			}
			rl.close()
			await subprocess.catch(() => {}) // reject:false, but SIGKILL can still reject — swallow
		} catch (error) {
			// Timeout/kill/parse error — return whatever we collected (partial ≥ crash).
			// Do NOT log the raw query at info (treated as sensitive — RESEARCH §4).
			this.logger.error('[content-search] ripgrep scan error', error instanceof Error ? error.message : String(error))
			subprocess?.kill?.('SIGKILL')
		}
		return [...hits.values()].slice(0, opts.remaining)
	}

	// Decode rg's `lines` field: normally {text}, occasionally {bytes: base64}. Returns
	// the line text (trailing newline stripped) or undefined if undecodable-as-utf8.
	#extractLineText(lines: any): string | undefined {
		if (typeof lines?.text === 'string') return lines.text.replace(/\r?\n$/, '')
		if (typeof lines?.bytes === 'string') {
			try {
				const decoded = Buffer.from(lines.bytes, 'base64').toString('utf8')
				if (decoded.includes('�')) return undefined // replacement char → not clean utf8
				return decoded.replace(/\r?\n$/, '')
			} catch {
				return undefined
			}
		}
		return undefined
	}

	// Node fallback (deterministic vitest target; D-337-2 / A2). Bounded recursive walk
	// mirroring rg's default hidden/binary/size behaviour so both paths align.
	async #scanRootNode(root: string, query: string, opts: {signal: AbortSignal; remaining: number}): Promise<ContentHit[]> {
		const caseSensitive = isCaseSensitive(query)
		const needle = caseSensitive ? query : query.toLowerCase()
		const hits: ContentHit[] = []
		const deadline = Date.now() + CONTENT_SEARCH_CAPS.timeoutMs

		let dir: fse.Dir
		try {
			dir = await fse.opendir(root, {recursive: true} as any)
		} catch {
			return []
		}

		try {
			for await (const entry of dir) {
				if (opts.signal.aborted) break
				if (Date.now() > deadline) break
				if (hits.length >= opts.remaining) break

				const parent = (entry as any).parentPath ?? (entry as any).path
				const p = nodePath.join(parent, entry.name)

				try {
					const st = await fse.lstat(p)
					// Symlink skip (A3): lstat-skip closes the deeper-tree symlink escape.
					if (st.isSymbolicLink()) continue
					if (!st.isFile()) continue
					if (st.size > CONTENT_SEARCH_CAPS.maxFileSizeBytes) continue

					// Hidden skip (B1): mirror rg's DEFAULT hidden behaviour — skip any entry
					// whose path RELATIVE TO the scan root contains ANY segment starting with
					// '.' (dotfiles AND anything inside a dot-directory). Closes the
					// `.ssh/id_rsa` content-exposure hole on the rg-absent fallback path.
					const rel = nodePath.relative(root, p)
					if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) continue
					// Also apply the basename hidden rule for parity with basename search.
					if (this.#livinityd.files.isHidden(nodePath.basename(p))) continue

					// Binary sniff: NUL byte in the first up-to-8192 bytes (mirrors rg).
					const fd = await fse.open(p, 'r')
					let isBinary = false
					try {
						const sniff = Buffer.alloc(8192)
						const {bytesRead} = await fse.read(fd, sniff, 0, 8192, 0)
						if (sniff.subarray(0, bytesRead).includes(0)) isBinary = true
					} finally {
						await fse.close(fd).catch(() => {})
					}
					if (isBinary) continue

					const text = await fse.readFile(p, 'utf8')
					const lines = text.split('\n')
					const contentMatches: ContentMatch[] = []
					let matchCount = 0
					for (let i = 0; i < lines.length; i++) {
						const rawLine = lines[i].replace(/\r$/, '')
						const haystack = caseSensitive ? rawLine : rawLine.toLowerCase()
						const idx = haystack.indexOf(needle)
						if (idx === -1) continue
						matchCount++
						if (contentMatches.length < CONTENT_SEARCH_CAPS.maxMatchesPerFile) {
							const {snippet, matchStart, matchEnd} = buildSnippet(rawLine, idx, idx + query.length)
							contentMatches.push({line: i + 1, snippet, matchStart, matchEnd})
						}
					}
					if (matchCount > 0) hits.push({systemPath: p, contentMatches, matchCount})
				} catch {
					continue // per-file failure → skip, never throw out of the walk
				}
			}
		} finally {
			await dir.close().catch(() => {})
		}
		return hits.slice(0, opts.remaining)
	}
}
