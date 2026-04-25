// Phase 29 Plan 29-02 — registry-search unit tests (DOC-16).
//
// Locks down the searchImages contract — Docker Hub public search OR
// authenticated private-registry search via decrypted credential.
//
// Test cases A-E:
//   A: searchImages({query:'nginx'}) without registryId → fetches Docker Hub
//      /v2/search/repositories?query=nginx&page_size=25 → normalized rows
//   B: searchImages({query:'foo', registryId}) → decrypts credential, calls
//      `${registryUrl}/v2/_catalog?n=25` with `Authorization: Basic ...`
//   C: query length cap — input >200 chars sliced to 200 before fetch (T-29-15)
//   D: fetch failure → throws '[search-failed] <message>'
//   E: 401 from registry → throws '[auth-failed] check credential username/password'

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Mock the credential decrypt — registry-search calls into registry-credentials.
vi.mock('./registry-credentials.js', () => ({
	decryptCredentialData: vi.fn(async (id: string) => {
		if (id === 'real-uuid') {
			return {
				username: 'admin',
				password: 's3cret',
				registryUrl: 'https://reg.example.com',
			}
		}
		return null
	}),
}))

// Stub global fetch — every test sets its own resolution.
const fetchMock = vi.fn()
;(globalThis as any).fetch = fetchMock

// Import under test AFTER mocks set up.
const {searchImages} = await import('./registry-search.js')

describe('searchImages', () => {
	beforeEach(() => {
		fetchMock.mockReset()
	})

	test('A: no registryId → Docker Hub /v2/search/repositories', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				results: [
					{
						repo_name: 'library/nginx',
						short_description: 'Official build of Nginx.',
						star_count: 17500,
						pull_count: 1e10,
						is_official: true,
						is_automated: false,
					},
				],
			}),
		})
		const out = await searchImages({query: 'nginx'})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const calledUrl = fetchMock.mock.calls[0][0] as string
		expect(calledUrl).toContain('hub.docker.com/v2/search/repositories')
		expect(calledUrl).toContain('query=nginx')
		expect(calledUrl).toContain('page_size=25')
		expect(out).toHaveLength(1)
		expect(out[0]).toMatchObject({
			name: 'library/nginx',
			starCount: 17500,
			official: true,
			source: 'docker-hub',
		})
	})

	test('B: registryId → private /v2/_catalog with Basic auth header', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({repositories: ['app/foo', 'app/bar', 'lib/baz']}),
		})
		const out = await searchImages({query: 'foo', registryId: 'real-uuid'})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
		expect(calledUrl).toContain('reg.example.com/v2/_catalog')
		expect(calledUrl).toContain('n=25')
		const headers = opts.headers as Record<string, string>
		expect(headers.Authorization).toMatch(/^Basic /)
		// b64('admin:s3cret')
		expect(headers.Authorization).toBe(
			`Basic ${Buffer.from('admin:s3cret').toString('base64')}`,
		)
		// Filter by query substring → only app/foo
		expect(out.map((r) => r.name)).toEqual(['app/foo'])
		expect(out[0].source).toBe('private')
	})

	test('C: query length cap — sliced to 200 chars before fetch', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({results: []}),
		})
		const longQuery = 'a'.repeat(500)
		await searchImages({query: longQuery})
		const calledUrl = fetchMock.mock.calls[0][0] as string
		// URL-encoded — count the 'a's after `query=` until next & or end.
		const m = calledUrl.match(/query=([^&]*)/)
		expect(m).toBeTruthy()
		expect(decodeURIComponent(m![1]).length).toBe(200)
	})

	test('D: fetch failure → throws [search-failed]', async () => {
		fetchMock.mockRejectedValue(new Error('network down'))
		await expect(searchImages({query: 'x'})).rejects.toThrow(/\[search-failed\]/)
	})

	test('E: 401 from private registry → [auth-failed]', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => 'Unauthorized',
		})
		await expect(
			searchImages({query: 'x', registryId: 'real-uuid'}),
		).rejects.toThrow(/\[auth-failed\]/)
	})
})
