import {expect, beforeAll, afterAll, describe, test} from 'vitest'
import fse from 'fs-extra'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>

// Spin up a single Livinityd instance for the entire test suite to save time.
// Each test creates its own unique files so state leakage across tests does
// not affect expectations.
beforeAll(async () => {
	livinityd = await createTestLivinityd()
	await livinityd.registerAndLogin()
})

afterAll(async () => {
	await livinityd.cleanup()
})

describe('files.search()', () => {
	test('throws "Invalid token" error without auth token', async () => {
		await expect(livinityd.unauthenticatedClient.files.search.query({query: 'anything'})).rejects.toThrow('Invalid token')
	})

	test('finds files that match the query', async () => {
		// Create a unique directory with some files to search for
		const testDir = `${livinityd.instance.dataDirectory}/home/search-find-test`
		await fse.mkdir(testDir)

		// Create test files
		await Promise.all([
			fse.writeFile(`${testDir}/hello-world.txt`, 'hello world'),
			fse.writeFile(`${testDir}/hello-mars.txt`, 'hello mars'),
			fse.writeFile(`${testDir}/unrelated.txt`, 'nothing to see here'),
		])

		// Perform the search
		const results = await livinityd.client.files.search.query({query: 'hello-world'})

		// Expect the specific file to be returned
		expect(results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'hello-world.txt',
					path: '/Home/search-find-test/hello-world.txt',
				}),
			]),
		)

		// Ensure unrelated file is not returned
		expect(results.some((file) => file.name === 'unrelated.txt')).toBe(false)
	})

	test('fuzzy matches against filename', async () => {
		// Create a unique directory with some files to search for
		const testDir = `${livinityd.instance.dataDirectory}/home/search-fuzzy-test`
		await fse.mkdir(testDir)

		// Create test files
		await fse.writeFile(`${testDir}/bitcoin.pdf`, '')

		// Perform the search
		const results = await livinityd.client.files.search.query({query: 'bit corn'})

		// Expect the specific file to be returned
		expect(results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'bitcoin.pdf',
					path: '/Home/search-fuzzy-test/bitcoin.pdf',
				}),
			]),
		)
	})

	test('respects maxResults', async () => {
		const limitDir = `${livinityd.instance.dataDirectory}/home/search-limit-test`
		await fse.mkdir(limitDir)

		// Create more than 10 files that will all match the query
		const fileCreationPromises = []
		for (let i = 0; i < 20; i++) {
			fileCreationPromises.push(fse.writeFile(`${limitDir}/alpha-${i}.txt`, String(i)))
		}
		await Promise.all(fileCreationPromises)

		const results = await livinityd.client.files.search.query({query: 'alpha', maxResults: 5})

		expect(results.length).toBe(5)
	})

	test('returns an empty array when there are no matches', async () => {
		const results = await livinityd.client.files.search.query({query: 'completely-nonexistent-query'})
		expect(results).toStrictEqual([])
	})

	test('throws when maxResults is unsafely large', async () => {
		const maxAllowedValue = 1000

		// Works for max value
		await expect(
			livinityd.client.files.search.query({
				query: 'completely-nonexistent-query',
				maxResults: maxAllowedValue,
			}),
		).resolves.toStrictEqual([])

		// Throws for one over max value
		await expect(
			livinityd.client.files.search.query({query: 'completely-nonexistent-query', maxResults: maxAllowedValue + 1}),
		).rejects.toThrow('too_big')
	})
})

// Phase 337-01 (FTS-01) — content-search mode. These run the pure-Node fallback
// deterministically on CI (rg absent) — the same path the box uses if apt fails.
describe('files.search() — mode:content', () => {
	test("mode:'filename' (explicit) matches omitting mode (byte-identical default guard)", async () => {
		const testDir = `${livinityd.instance.dataDirectory}/home/content-default-guard`
		await fse.mkdir(testDir, {recursive: true})
		await fse.writeFile(`${testDir}/guard-token-file.txt`, 'irrelevant body')

		const withMode = await livinityd.client.files.search.query({query: 'guard-token-file', mode: 'filename'})
		const withoutMode = await livinityd.client.files.search.query({query: 'guard-token-file'})
		expect(withMode).toStrictEqual(withoutMode)
		expect(withMode.some((f) => f.name === 'guard-token-file.txt')).toBe(true)
	})

	test('content search finds a token inside a file with the right line + snippet', async () => {
		const testDir = `${livinityd.instance.dataDirectory}/home/content-test`
		await fse.mkdir(testDir, {recursive: true})
		// Unique token on line 3.
		await fse.writeFile(`${testDir}/doc.txt`, 'line one\nline two\nzzuniquecontenttokenzz lives here\nline four\n')

		const results = await livinityd.client.files.search.query({query: 'zzuniquecontenttokenzz', mode: 'content'})

		const hit = results.find((f) => f.path === '/Home/content-test/doc.txt')
		expect(hit).toBeDefined()
		expect(hit!.matchCount).toBeGreaterThanOrEqual(1)
		expect(hit!.contentMatches?.[0].line).toBe(3)
		expect(hit!.contentMatches?.[0].snippet).toContain('zzuniquecontenttokenzz')
	})

	test('a < 3-char query returns [] (min-length guard, no scan)', async () => {
		const results = await livinityd.client.files.search.query({query: 'zz', mode: 'content'})
		expect(results).toStrictEqual([])
	})

	test('content mode matches CONTENT only, not filename', async () => {
		const testDir = `${livinityd.instance.dataDirectory}/home/content-name-vs-body`
		await fse.mkdir(testDir, {recursive: true})
		// The token is in the NAME but never in the BODY → must be excluded.
		await fse.writeFile(`${testDir}/qqnameonlytokenqq.txt`, 'body without the token')

		const results = await livinityd.client.files.search.query({query: 'qqnameonlytokenqq', mode: 'content'})
		expect(results.some((f) => f.name === 'qqnameonlytokenqq.txt')).toBe(false)
	})
})
