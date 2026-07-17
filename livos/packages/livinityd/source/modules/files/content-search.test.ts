// Phase 337-01 (FTS-01) — content-search.ts OFFLINE unit tests.
// No Postgres, no real daemon: ContentSearch is constructed with a minimal fake
// livinityd stub (logger.createChildLogger + files.isHidden). The Node scanner runs
// on real temp-dir fixtures (deterministic on CI where rg is absent); the rg path is
// exercised with a mocked execa.

import os from 'node:os'
import nodePath from 'node:path'
import {Readable} from 'node:stream'

import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest'
import fse from 'fs-extra'

import ContentSearch, {
	normalizeQuery,
	buildRgArgs,
	rgSpawnArgs,
	CONTENT_SEARCH_CAPS,
	ContentSearchBusyError,
} from './content-search.js'

// Mockable execa — the rg-path tests drive this; the Node-path tests never touch it.
vi.mock('execa', () => ({execa: vi.fn()}))
import {execa} from 'execa'
const execaMock = vi.mocked(execa)

// Minimal fake livinityd — just enough for the ContentSearch constructor + isHidden.
function makeFakeLivinityd() {
	return {
		logger: {createChildLogger: () => ({log() {}, error() {}, warn() {}})},
		files: {
			isHidden: (name: string) =>
				name === '.DS_Store' ||
				name === '.directory' ||
				name === '.Recycle.Bin' ||
				name.endsWith('.livinity-upload'),
		},
	} as any
}

function makeEngine() {
	return new ContentSearch(makeFakeLivinityd())
}

let tmpRoot: string
beforeEach(async () => {
	// Reset the cached feature-detects so each test controls the rg/wrapper branch.
	ContentSearch.rgAvailable = undefined
	ContentSearch.wrapperAvailable = undefined
	execaMock.mockReset()
	tmpRoot = (await fse.mkdtemp(nodePath.join(os.tmpdir(), 'fts-'))) as string
})
afterEach(async () => {
	await fse.remove(tmpRoot).catch(() => {})
})

const liveSignal = () => new AbortController().signal

describe('normalizeQuery', () => {
	it('rejects sub-minimum queries', () => {
		expect(normalizeQuery('ab')).toBeNull()
		expect(normalizeQuery('  ab ')).toBeNull()
		expect(normalizeQuery('')).toBeNull()
	})
	it('trims and accepts >= min length', () => {
		expect(normalizeQuery('abc')).toBe('abc')
		expect(normalizeQuery('  hello ')).toBe('hello')
	})
})

describe('CONTENT_SEARCH_CAPS — frozen values (silent-regression guard)', () => {
	it('holds the exact designed caps', () => {
		expect(CONTENT_SEARCH_CAPS).toEqual({
			minQueryLength: 3,
			maxFileSizeBytes: 2 * 1024 * 1024,
			maxMatchesPerFile: 5,
			threads: 2,
			timeoutMs: 15_000,
			maxResultFiles: 100,
			snippetMaxLen: 240,
		})
	})
})

describe('Node scanner — real fixtures', () => {
	it('finds the query inside a .txt with correct 1-based line + offsets', async () => {
		await fse.writeFile(nodePath.join(tmpRoot, 'doc.txt'), 'first line\nsecond has needle here\nthird\n')
		await fse.writeFile(nodePath.join(tmpRoot, 'other.txt'), 'nothing relevant\n')
		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})

		expect(hits.map((h) => nodePath.basename(h.systemPath)).sort()).toEqual(['doc.txt'])
		const hit = hits[0]
		expect(hit.matchCount).toBe(1)
		expect(hit.contentMatches[0].line).toBe(2)
		expect(hit.contentMatches[0].snippet).toContain('needle')
		const {snippet, matchStart, matchEnd} = hit.contentMatches[0]
		expect(snippet.slice(matchStart, matchEnd)).toBe('needle')
	})

	it('is case-insensitive by default; case-SENSITIVE when the query has an uppercase', async () => {
		await fse.writeFile(nodePath.join(tmpRoot, 'mix.txt'), 'Alpha alpha ALPHA\n')
		const engine = makeEngine()

		const insensitive = await engine.scanRoot(tmpRoot, 'alpha', {signal: liveSignal(), remaining: 100})
		expect(insensitive[0].matchCount).toBe(1) // one line, matched (line-level count)

		const sensitive = await engine.scanRoot(tmpRoot, 'Alpha', {signal: liveSignal(), remaining: 100})
		// 'Alpha' is case-sensitive → still matches the line (which contains 'Alpha')
		expect(sensitive[0].contentMatches[0].snippet.slice(sensitive[0].contentMatches[0].matchStart!, sensitive[0].contentMatches[0].matchEnd!)).toBe('Alpha')

		await fse.writeFile(nodePath.join(tmpRoot, 'lower.txt'), 'only lowercase alpha\n')
		const sensitiveMiss = await engine.scanRoot(tmpRoot, 'ALPHA', {signal: liveSignal(), remaining: 100})
		// case-sensitive 'ALPHA' must NOT match 'alpha' in lower.txt
		expect(sensitiveMiss.some((h) => nodePath.basename(h.systemPath) === 'lower.txt')).toBe(false)
	})
})

describe('Node scanner — caps', () => {
	it('skips a file larger than maxFileSizeBytes', async () => {
		const big = Buffer.concat([Buffer.from('needle\n'), Buffer.alloc(CONTENT_SEARCH_CAPS.maxFileSizeBytes + 1024, 0x61)])
		await fse.writeFile(nodePath.join(tmpRoot, 'big.txt'), big)
		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})
		expect(hits).toEqual([])
	})

	it('skips a binary file (NUL byte)', async () => {
		await fse.writeFile(nodePath.join(tmpRoot, 'bin.dat'), Buffer.from([0x6e, 0x00, 0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65])) // contains 'needle' but has a NUL
		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})
		expect(hits).toEqual([])
	})

	it('skips a symlink entry (A3 escape guard — target content never surfaces)', async () => {
		const secretDir = (await fse.mkdtemp(nodePath.join(os.tmpdir(), 'fts-secret-'))) as string
		try {
			const secretFile = nodePath.join(secretDir, 'secret.txt')
			await fse.writeFile(secretFile, 'needle in a secret outside the tree\n')
			try {
				await fse.symlink(secretFile, nodePath.join(tmpRoot, 'link.txt'))
			} catch {
				return // symlink not permitted on this host (Windows without privilege) — skip
			}
			const engine = makeEngine()
			const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})
			expect(hits).toEqual([])
		} finally {
			await fse.remove(secretDir).catch(() => {})
		}
	})

	it('caps contentMatches to maxMatchesPerFile while matchCount reflects the true total', async () => {
		const lines = Array.from({length: 12}, (_, i) => `line ${i} needle`).join('\n') + '\n'
		await fse.writeFile(nodePath.join(tmpRoot, 'many.txt'), lines)
		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})
		expect(hits[0].contentMatches.length).toBe(CONTENT_SEARCH_CAPS.maxMatchesPerFile)
		expect(hits[0].matchCount).toBe(12)
	})

	it('respects the remaining/result cap of N', async () => {
		for (let i = 0; i < 6; i++) await fse.writeFile(nodePath.join(tmpRoot, `f${i}.txt`), 'needle here\n')
		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 3})
		expect(hits.length).toBeLessThanOrEqual(3)
	})

	it('returns [] immediately when the signal is already aborted', async () => {
		await fse.writeFile(nodePath.join(tmpRoot, 'doc.txt'), 'needle\n')
		const ac = new AbortController()
		ac.abort()
		const engine = makeEngine()
		expect(await engine.scanRoot(tmpRoot, 'needle', {signal: ac.signal, remaining: 100})).toEqual([])
	})
})

describe('Node scanner — hidden skip (B1 regression guard)', () => {
	it('never surfaces dotfiles OR content inside dot-directories, but does surface a non-hidden sibling', async () => {
		// Matching content inside a dot-DIRECTORY
		await fse.mkdir(nodePath.join(tmpRoot, '.secrets'))
		await fse.writeFile(nodePath.join(tmpRoot, '.secrets', 'id_rsa'), 'PRIVATE needle KEY\n')
		// Dotfile at the root
		await fse.writeFile(nodePath.join(tmpRoot, '.hidden-file.txt'), 'needle in dotfile\n')
		// Non-hidden sibling with the same content
		await fse.writeFile(nodePath.join(tmpRoot, 'visible.txt'), 'needle in the open\n')

		const engine = makeEngine()
		const hits = await engine.scanRoot(tmpRoot, 'needle', {signal: liveSignal(), remaining: 100})
		const names = hits.map((h) => nodePath.basename(h.systemPath))
		expect(names).toContain('visible.txt')
		expect(names).not.toContain('id_rsa')
		expect(names).not.toContain('.hidden-file.txt')
	})
})

describe('single-flight slot', () => {
	it('rejects a concurrent OTHER user with ContentSearchBusyError', async () => {
		const engine = makeEngine()
		let release: () => void = () => {}
		const gate = new Promise<void>((r) => (release = r))
		const first = engine.withSlot('userA', async () => {
			await gate
			return 'a'
		})
		await expect(engine.withSlot('userB', async () => 'b')).rejects.toBeInstanceOf(ContentSearchBusyError)
		release()
		expect(await first).toBe('a')
	})

	it('aborts the first when the SAME user starts again (supersede)', async () => {
		const engine = makeEngine()
		let capturedSignal: AbortSignal | undefined
		let release: () => void = () => {}
		const gate = new Promise<void>((r) => (release = r))
		const first = engine.withSlot('userA', async (signal) => {
			capturedSignal = signal
			await gate
			return 'first'
		})
		// Same user supersedes → first's signal is aborted.
		const second = engine.withSlot('userA', async () => 'second')
		expect(capturedSignal?.aborted).toBe(true)
		release()
		await first
		expect(await second).toBe('second')
	})

	it('releases the slot after completion (a later call succeeds)', async () => {
		const engine = makeEngine()
		expect(await engine.withSlot('userA', async () => 'one')).toBe('one')
		expect(await engine.withSlot('userB', async () => 'two')).toBe('two')
	})
})

describe('rg argv (injection-safety) — pure builders', () => {
	it('buildRgArgs emits the exact fixed-string array with the query as a standalone element', () => {
		expect(buildRgArgs('hello', '/root')).toEqual([
			'--json',
			'-S',
			'-F',
			'--max-filesize',
			'2M',
			'--max-count',
			'5',
			'--threads',
			'2',
			'--no-follow',
			'--no-ignore',
			'-e',
			'hello',
			'--',
			'/root',
		])
	})

	it('a shell-metachar / flag-looking query stays a single verbatim argv element', () => {
		for (const q of ['--help', '; rm -rf /', '$(whoami)', '-e evil']) {
			const args = buildRgArgs(q, '/root')
			// exactly one element equals the query, and it directly follows `-e`
			expect(args.filter((a) => a === q).length).toBe(1)
			expect(args[args.indexOf('-e') + 1]).toBe(q)
		}
	})

	it('rgSpawnArgs wraps with nice/ionice only on linux WITH the wrapper present', () => {
		expect(rgSpawnArgs('q1x', '/root', 'linux', true)).toEqual({
			bin: 'nice',
			args: ['-n', '10', 'ionice', '-c3', 'rg', ...buildRgArgs('q1x', '/root')],
		})
		expect(rgSpawnArgs('q1x', '/root', 'linux', false)).toEqual({bin: 'rg', args: buildRgArgs('q1x', '/root')})
		expect(rgSpawnArgs('q1x', '/root', 'win32', true)).toEqual({bin: 'rg', args: buildRgArgs('q1x', '/root')})
	})
})

describe('rg path — mocked execa', () => {
	// Build a fake execa subprocess: a thenable carrying a .stdout Readable + .kill.
	function fakeSubprocess(lines: string[]) {
		const p: any = Promise.resolve({exitCode: 0})
		p.stdout = Readable.from(lines.map((l) => l + '\n'))
		p.kill = vi.fn()
		return p
	}

	it('#hasRipgrep true → scanRoot parses a canned JSON match stream into ContentHit[]', async () => {
		const engine = makeEngine()
		engine.platform = 'win32' // force the UNwrapped branch deterministically (W3)

		const matchLine = JSON.stringify({
			type: 'match',
			data: {
				path: {text: '/root/found.txt'},
				lines: {text: '   the matched needle line\n'},
				line_number: 7,
				submatches: [{start: 15, end: 21}],
			},
		})

		execaMock.mockImplementation(((bin: string, args: string[]) => {
			// rg --version feature-detect → exitCode 0 (a plain resolved result)
			if (Array.isArray(args) && args[0] === '--version') return Promise.resolve({exitCode: 0}) as any
			return fakeSubprocess([JSON.stringify({type: 'begin', data: {}}), matchLine, JSON.stringify({type: 'end', data: {}})]) as any
		}) as any)

		const hits = await engine.scanRoot('/root', 'needle', {signal: liveSignal(), remaining: 100})
		expect(hits.length).toBe(1)
		expect(hits[0].systemPath).toBe('/root/found.txt')
		expect(hits[0].contentMatches[0].line).toBe(7)
		expect(hits[0].contentMatches[0].snippet).toBe('the matched needle line')
		expect(hits[0].contentMatches[0].snippet.slice(hits[0].contentMatches[0].matchStart!, hits[0].contentMatches[0].matchEnd!)).toBe('needle')
	})

	it('spawns rg with the exact fixed-string argv (query as a standalone element)', async () => {
		const engine = makeEngine()
		engine.platform = 'win32' // unwrapped branch → execa called as ('rg', rgArgs, opts)

		let recordedBin = ''
		let recordedArgs: string[] = []
		execaMock.mockImplementation(((bin: string, args: string[]) => {
			if (Array.isArray(args) && args[0] === '--version') return Promise.resolve({exitCode: 0}) as any
			recordedBin = bin
			recordedArgs = args
			return fakeSubprocess([]) as any
		}) as any)

		await engine.scanRoot('/root', '--help', {signal: liveSignal(), remaining: 100})
		expect(recordedBin).toBe('rg')
		expect(recordedArgs).toEqual(buildRgArgs('--help', '/root'))
		// The dangerous-looking query is a single verbatim element, never split.
		expect(recordedArgs.filter((a) => a === '--help').length).toBe(1)
		expect(recordedArgs[recordedArgs.indexOf('-e') + 1]).toBe('--help')
	})
})
