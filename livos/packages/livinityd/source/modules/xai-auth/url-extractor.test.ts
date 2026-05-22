/**
 * Phase 195 Plan 01 Task 1 — url-extractor.test.ts (RED → GREEN).
 *
 * Tests the pure xAI OAuth URL extraction helper. Validates:
 *   - Both host variants: https://x.ai/oauth/... and https://auth.x.ai/oauth/...
 *   - Mixed-noise CLI output (ANSI codes, prompts, prefixes)
 *   - Unrelated URLs return null
 *   - First-match wins when multiple URLs are present
 *   - Trailing punctuation (`.,;)]`) is trimmed defensively
 *
 * Threat model: T-195-01 surface — untrusted stdout from child process is
 * parsed; the regex anchors on the xAI hosts and rejects everything else.
 */

import {describe, expect, test} from 'vitest'

import {extractXaiOAuthUrl} from './url-extractor.js'

describe('extractXaiOAuthUrl', () => {
	test('matches https://x.ai/oauth/device?code=ABC123 inside a buffer with mixed CLI noise', () => {
		const buf = [
			'[36m? [0mSelect a method:',
			'Opening browser to https://x.ai/oauth/device?code=ABC123 ...',
			'Waiting for authentication...',
		].join('\n')
		expect(extractXaiOAuthUrl(buf)).toBe('https://x.ai/oauth/device?code=ABC123')
	})

	test('matches https://auth.x.ai/oauth/device?code=XYZ (alt host variant)', () => {
		const buf = 'Please visit: https://auth.x.ai/oauth/device?code=XYZ to complete login.'
		expect(extractXaiOAuthUrl(buf)).toBe('https://auth.x.ai/oauth/device?code=XYZ')
	})

	test('returns null for unrelated URLs like https://example.com/oauth', () => {
		const buf = 'Visit https://example.com/oauth and https://github.com/foo/bar'
		expect(extractXaiOAuthUrl(buf)).toBeNull()
	})

	test('first-match wins when multiple xAI URLs are present', () => {
		const buf = [
			'First: https://x.ai/oauth/device?code=FIRST',
			'Second: https://auth.x.ai/oauth/device?code=SECOND',
		].join('\n')
		expect(extractXaiOAuthUrl(buf)).toBe('https://x.ai/oauth/device?code=FIRST')
	})

	test('returns null on empty buffer', () => {
		expect(extractXaiOAuthUrl('')).toBeNull()
	})

	test('trims trailing punctuation defensively', () => {
		const buf = 'Go here: https://x.ai/oauth/device?code=ABC123.'
		expect(extractXaiOAuthUrl(buf)).toBe('https://x.ai/oauth/device?code=ABC123')
	})

	test('handles query string with multiple params without truncating', () => {
		const url = 'https://x.ai/oauth/device?code=ABC&state=xyz&scope=openid'
		expect(extractXaiOAuthUrl(`Open: ${url} now`)).toBe(url)
	})

	test('matches /oauth/authorize variant (path beyond /device)', () => {
		const url = 'https://auth.x.ai/oauth/authorize?client_id=opencode&response_type=code'
		expect(extractXaiOAuthUrl(`URL: ${url}`)).toBe(url)
	})
})
