// TODO: Re-enable strict TS once update.ts rewrite (Task 2) lands.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {EventEmitter} from 'node:events'
import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'

import * as execa from 'execa'
import fs from 'node:fs/promises'

import Livinityd from '../../index.js'
import {getLatestRelease, performUpdate, getUpdateStatus} from './update.js'

vi.mock('execa')
vi.mock('node:fs/promises')

const SAMPLE_REMOTE_SHA = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd'
const SAMPLE_LOCAL_SHA = '0123456789abcdef0123456789abcdef01234567'

function makeFetchResponse(body: any, init?: {ok?: boolean; status?: number}) {
	return {
		ok: init?.ok ?? true,
		status: init?.status ?? 200,
		async json() {
			return body
		},
		async text() {
			return typeof body === 'string' ? body : JSON.stringify(body)
		},
	}
}

function makeFakeProc() {
	const stdout = new EventEmitter() as EventEmitter & {on: any}
	const stderr = new EventEmitter() as EventEmitter & {on: any}
	let resolveProc: () => void = () => {}
	let rejectProc: (err: Error) => void = () => {}
	const p: any = new Promise<void>((resolve, reject) => {
		resolveProc = resolve
		rejectProc = reject
	})
	p.stdout = stdout
	p.stderr = stderr
	p._resolve = resolveProc
	p._reject = rejectProc
	return p
}

describe('getLatestRelease (UPD-01)', () => {
	let livinityd: any

	beforeEach(() => {
		livinityd = new Livinityd({dataDirectory: '/tmp'})
		// @ts-expect-error fetch global mock
		globalThis.fetch = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('A1: happy path — different SHAs returns available:true with full shape', async () => {
		vi.mocked(fs.readFile).mockResolvedValue(`${SAMPLE_LOCAL_SHA}\n` as any)
		;(globalThis.fetch as any).mockResolvedValue(
			makeFetchResponse({
				sha: SAMPLE_REMOTE_SHA,
				commit: {
					message: 'feat: foo',
					author: {name: 'Alice', email: 'alice@example.com', date: '2026-04-26T10:00:00Z'},
				},
			}),
		)

		const result = await getLatestRelease(livinityd)

		expect(result).toMatchObject({
			available: true,
			sha: SAMPLE_REMOTE_SHA,
			shortSha: SAMPLE_REMOTE_SHA.slice(0, 7),
			message: 'feat: foo',
			author: 'Alice',
			committedAt: '2026-04-26T10:00:00Z',
		})

		// User-Agent + Accept headers verified
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'https://api.github.com/repos/utopusc/livinity-io/commits/master',
			expect.objectContaining({
				headers: expect.objectContaining({
					'User-Agent': expect.stringContaining('LivOS-'),
					Accept: 'application/vnd.github+json',
				}),
			}),
		)
	})

	test('A2: same SHA — returns available:false', async () => {
		vi.mocked(fs.readFile).mockResolvedValue(`${SAMPLE_REMOTE_SHA}\n` as any)
		;(globalThis.fetch as any).mockResolvedValue(
			makeFetchResponse({
				sha: SAMPLE_REMOTE_SHA,
				commit: {
					message: 'same commit',
					author: {name: 'Bob', email: 'b@x', date: '2026-04-26T10:00:00Z'},
				},
			}),
		)

		const result = await getLatestRelease(livinityd)
		expect(result.available).toBe(false)
		expect(result.sha).toBe(SAMPLE_REMOTE_SHA)
	})

	test('B: ENOENT first-run case — empty localSha treated as not-deployed; available:true', async () => {
		const enoent: any = new Error('ENOENT: no such file')
		enoent.code = 'ENOENT'
		vi.mocked(fs.readFile).mockRejectedValue(enoent)
		;(globalThis.fetch as any).mockResolvedValue(
			makeFetchResponse({
				sha: SAMPLE_REMOTE_SHA,
				commit: {
					message: 'first deploy',
					author: {name: 'Carol', email: 'c@x', date: '2026-04-26T10:00:00Z'},
				},
			}),
		)

		const result = await getLatestRelease(livinityd)
		expect(result.available).toBe(true)
		expect(result.sha).toBe(SAMPLE_REMOTE_SHA)
	})

	test('C: non-2xx GitHub response — throws Error matching /403/', async () => {
		vi.mocked(fs.readFile).mockResolvedValue(`${SAMPLE_LOCAL_SHA}\n` as any)
		;(globalThis.fetch as any).mockResolvedValue(
			makeFetchResponse('rate limit exceeded', {ok: false, status: 403}),
		)

		await expect(getLatestRelease(livinityd)).rejects.toThrow(/403/)
	})
})

describe('performUpdate (UPD-02)', () => {
	let livinityd: any

	beforeEach(() => {
		livinityd = new Livinityd({dataDirectory: '/tmp'})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('D: spawns bash /opt/livos/update.sh via execa $ with cwd /opt/livos', async () => {
		const proc = makeFakeProc()
		// $({cwd}) returns a tagged-template invoker; the invoker returns proc.
		const taggedInvoker: any = vi.fn(() => proc)
		const factory = vi.fn(() => taggedInvoker)
		vi.mocked(execa.$ as any).mockImplementation(factory as any)

		// resolve immediately so performUpdate doesn't hang
		queueMicrotask(() => proc._resolve())
		const ok = await performUpdate(livinityd)

		expect(ok).toBe(true)
		expect(factory).toHaveBeenCalledWith({cwd: '/opt/livos'})
		// invoker should be called as a tagged template — first arg is the strings array
		expect(taggedInvoker).toHaveBeenCalled()
		const callArgs = taggedInvoker.mock.calls[0]
		const stringsArr = callArgs[0]
		// joined template should contain the literal 'bash /opt/livos/update.sh'
		const joined = Array.isArray(stringsArr) ? stringsArr.join('') : String(stringsArr)
		expect(joined).toContain('bash /opt/livos/update.sh')
	})

	test('E: parses ━━━ Section ━━━ markers and updates progress', async () => {
		const proc = makeFakeProc()
		const taggedInvoker: any = vi.fn(() => proc)
		vi.mocked(execa.$ as any).mockImplementation(((_opts: any) => taggedInvoker) as any)

		const promise = performUpdate(livinityd)

		// Emit a section marker from stdout BEFORE the proc resolves
		await Promise.resolve()
		proc.stdout.emit('data', Buffer.from('━━━ Pulling latest code ━━━\n'))

		// Now resolve the proc and let performUpdate finish
		proc._resolve()
		await promise

		const status = getUpdateStatus()
		// progress should have hit at least 10 (from "Pulling latest code") at some point.
		// After successful completion progress is 100; description is 'Updated'.
		// To check the section marker was honored mid-stream we re-emit + read before resolve in a separate test
		// Here we assert final state: progress 100, description 'Updated'.
		expect(status.progress).toBe(100)
		expect(status.description).toBe('Updated')
	})

	test('E2: section marker mid-stream sets progress 10 + description', async () => {
		const proc = makeFakeProc()
		const taggedInvoker: any = vi.fn(() => proc)
		vi.mocked(execa.$ as any).mockImplementation(((_opts: any) => taggedInvoker) as any)

		const promise = performUpdate(livinityd)
		await Promise.resolve()
		proc.stdout.emit('data', Buffer.from('━━━ Pulling latest code ━━━\n'))

		// Read status BEFORE resolving — should reflect section marker
		const midStatus = getUpdateStatus()
		expect(midStatus.progress).toBe(10)
		expect(midStatus.description).toBe('Pulling latest code')

		proc._resolve()
		await promise
	})

	test('F: non-zero exit — returns false AND error is truthy', async () => {
		const proc = makeFakeProc()
		const taggedInvoker: any = vi.fn(() => proc)
		vi.mocked(execa.$ as any).mockImplementation(((_opts: any) => taggedInvoker) as any)

		const promise = performUpdate(livinityd)
		await Promise.resolve()
		proc._reject(new Error('Command failed: bash exited 1'))
		const ok = await promise

		expect(ok).toBe(false)
		const status = getUpdateStatus()
		expect(status.error).toBeTruthy()
	})

	test('G: PRECHECK-FAIL stderr round-trips to updateStatus.error verbatim', async () => {
		const proc = makeFakeProc()
		const taggedInvoker: any = vi.fn(() => proc)
		vi.mocked(execa.$ as any).mockImplementation(((_opts: any) => taggedInvoker) as any)

		const promise = performUpdate(livinityd)
		await Promise.resolve()
		// Simulate update.sh exiting non-zero with PRECHECK-FAIL on stderr.
		// execa surfaces stderr text in the rejection error's .message.
		proc._reject(
			new Error(
				'Command failed with exit code 1: bash /opt/livos/update.sh\nPRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have 1GB)',
			),
		)
		const ok = await promise

		expect(ok).toBe(false)
		const status = getUpdateStatus()
		expect(status.error).toBeTruthy()
		expect(String(status.error)).toContain('PRECHECK-FAIL: insufficient disk space')
	})
})
