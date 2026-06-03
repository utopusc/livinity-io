// Phase 257-02 (WS-C, LIVOS-024) — AppRepository must apply the webapps SSRF
// validator before any outbound git fetch.
//
// Previously the constructor only did a bare `new URL()` validity check, so a
// (now admin-only, post-256-03) addRepository could still drive livinityd to
// git-clone / listServerRefs against an attacker-chosen internal target
// (169.254.169.254 metadata, RFC1918 hosts, the local admin daemon) or a
// non-http(s) scheme (file://, gopher://). This wires in the existing
// webapps/url-validator validateUrl (scheme allowlist + isPrivateHost) so those
// targets are rejected up front, while public https repos still construct and
// the admin carve-out (isAdmin:true) preserves operator-initiated private adds.
//
// We unit-test the URL gate in isolation by constructing AppRepository with a
// minimal stub Livinityd (dataDirectory + a logger that can createChildLogger).

import {describe, test, expect} from 'vitest'

import AppRepository from './app-repository.js'

function stubLivinityd(): any {
	const logger: any = {
		createChildLogger: () => logger,
		log: () => {},
		error: () => {},
		warn: () => {},
	}
	return {dataDirectory: '/tmp/livos-test-data', logger}
}

describe('AppRepository URL gate (LIVOS-024)', () => {
	const livinityd = stubLivinityd()

	test('rejects link-local metadata host (169.254.169.254)', () => {
		expect(() => new AppRepository(livinityd, 'http://169.254.169.254/latest/meta-data/')).toThrow(
			/Invalid repository URL/i,
		)
	})

	test('rejects RFC1918 / loopback admin-daemon host', () => {
		expect(() => new AppRepository(livinityd, 'http://10.69.31.68:8080/git/repo.git')).toThrow(
			/Invalid repository URL/i,
		)
	})

	test('rejects non-http(s) scheme (file://)', () => {
		expect(() => new AppRepository(livinityd, 'file:///etc/passwd')).toThrow(/Invalid repository URL/i)
	})

	test('rejects non-http(s) scheme (gopher://)', () => {
		expect(() => new AppRepository(livinityd, 'gopher://127.0.0.1:6379/_FLUSHALL')).toThrow(
			/Invalid repository URL/i,
		)
	})

	test('allows a public https repo', () => {
		const repo = new AppRepository(livinityd, 'https://github.com/utopusc/livinity-apps')
		expect(repo.url).toContain('github.com')
	})

	test('admin carve-out: isAdmin allows a private host', () => {
		const repo = new AppRepository(livinityd, 'http://10.69.31.68:8080/git/repo.git', {isAdmin: true})
		expect(repo.url).toContain('10.69.31.68')
	})
})
