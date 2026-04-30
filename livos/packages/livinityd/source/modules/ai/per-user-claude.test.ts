/**
 * Per-user Claude OAuth helper tests — D-40-14.
 *
 * Unit tests for path resolution + dir creation + idempotency + path-traversal guard.
 *
 * Honest framing (D-40-05): these tests verify livinityd-application-layer
 * isolation (every helper takes user_id, never concatenates raw paths). They
 * do NOT prove POSIX-level isolation — all per-user dirs share the same UID.
 *
 * Run with: npx tsx source/modules/ai/per-user-claude.test.ts
 */

import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
	getUserClaudeDir,
	ensureUserClaudeDir,
	perUserClaudeLogout,
} from './per-user-claude.js'

// Build a minimal Livinityd shape that the helpers use.
function makeFakeLivinityd(dataDir: string): any {
	return {
		dataDirectory: dataDir,
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
			createChildLogger: () => ({log: () => {}, verbose: () => {}, error: () => {}}),
		},
		ai: {redis: {get: async () => null}},
	}
}

async function withTmpDataDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'liv-phase40-'))
	try {
		await fn(tmp)
	} finally {
		await fs.promises.rm(tmp, {recursive: true, force: true})
	}
}

async function testGetUserClaudeDirReturnsExpectedPath() {
	await withTmpDataDir(async (dataDir) => {
		const livinityd = makeFakeLivinityd(dataDir)
		const dir = getUserClaudeDir(livinityd, 'abc-123')
		assert.equal(dir, path.join(dataDir, 'users', 'abc-123', '.claude'))
		console.log('  PASS: Test 1 — getUserClaudeDir returns <data>/users/<id>/.claude')
	})
}

async function testGetUserClaudeDirRejectsPathTraversal() {
	await withTmpDataDir(async (dataDir) => {
		const livinityd = makeFakeLivinityd(dataDir)
		assert.throws(
			() => getUserClaudeDir(livinityd, '../../../etc'),
			/Invalid userId/,
			'getUserClaudeDir should reject path-traversal input',
		)
		console.log('  PASS: Test 2 — getUserClaudeDir rejects ../../../etc')
	})
}

async function testGetUserClaudeDirRejectsEmptyString() {
	await withTmpDataDir(async (dataDir) => {
		const livinityd = makeFakeLivinityd(dataDir)
		assert.throws(
			() => getUserClaudeDir(livinityd, ''),
			/Invalid userId/,
			'getUserClaudeDir should reject empty string',
		)
		console.log('  PASS: Test 3 — getUserClaudeDir rejects empty string')
	})
}

async function testEnsureUserClaudeDirIsIdempotent() {
	await withTmpDataDir(async (dataDir) => {
		const livinityd = makeFakeLivinityd(dataDir)
		const userId = 'user-xyz'
		const dir1 = await ensureUserClaudeDir(livinityd, userId)
		const stat1 = await fs.promises.stat(dir1)
		assert.equal(stat1.isDirectory(), true)
		// Mode bits — on POSIX, expect 0o700. On Windows, mode bits are not enforced;
		// we still call the function to verify it doesn't throw.
		if (process.platform !== 'win32') {
			assert.equal(stat1.mode & 0o777, 0o700, 'dir mode should be 0o700')
		}

		// Second call must be idempotent.
		const dir2 = await ensureUserClaudeDir(livinityd, userId)
		assert.equal(dir2, dir1)
		const stat2 = await fs.promises.stat(dir2)
		if (process.platform !== 'win32') {
			assert.equal(stat2.mode & 0o777, 0o700, 'dir mode should still be 0o700 after second call')
		}
		console.log('  PASS: Test 4 — ensureUserClaudeDir is idempotent + mode 0o700 (POSIX)')
	})
}

async function testPerUserClaudeLogoutIsIdempotent() {
	await withTmpDataDir(async (dataDir) => {
		const livinityd = makeFakeLivinityd(dataDir)
		const userId = 'user-logout'

		// (a) logout on non-existent dir/file → no throw.
		await perUserClaudeLogout(livinityd, userId)

		// (b) create dir + fake creds file, then logout → file removed.
		const dir = await ensureUserClaudeDir(livinityd, userId)
		const credsPath = path.join(dir, '.credentials.json')
		await fs.promises.writeFile(credsPath, JSON.stringify({fake: true}), {mode: 0o600})
		assert.equal(fs.existsSync(credsPath), true)
		await perUserClaudeLogout(livinityd, userId)
		assert.equal(fs.existsSync(credsPath), false)

		// (c) logout again on now-empty dir → no throw.
		await perUserClaudeLogout(livinityd, userId)
		console.log('  PASS: Test 5 — perUserClaudeLogout is idempotent + removes creds file')
	})
}

async function main() {
	await testGetUserClaudeDirReturnsExpectedPath()
	await testGetUserClaudeDirRejectsPathTraversal()
	await testGetUserClaudeDirRejectsEmptyString()
	await testEnsureUserClaudeDirIsIdempotent()
	await testPerUserClaudeLogoutIsIdempotent()
	console.log('\nAll per-user-claude.test.ts tests passed (5/5)')
}

main().catch((err) => {
	console.error('\nper-user-claude.test.ts FAILED:', err)
	process.exit(1)
})
