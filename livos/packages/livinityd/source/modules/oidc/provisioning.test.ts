// Phase 322 (IDENT-02, D-322-4, RESEARCH Pitfall 1) — oidc/provisioning unit tests.
//
// Locks the SECOND provisioning mechanism (docker-exec CLI + loopback REST) and,
// critically, its security invariants:
//   (a) Nextcloud/Gitea build a DISCRETE-argv docker-exec (execa `$` tagged template)
//       — the derived secret is a single arg, NEVER concatenated into a shell string
//       (T-322-13 argv-injection).
//   (b) Immich with no admin API key DEFERS ({deferred:true}) and makes NO fetch —
//       Pitfall 7 (never a silent no-op / confusing 401).
//   (c) Immich with a key PUTs to the LITERAL 127.0.0.1 host only (T-322-14 SSRF) with
//       the oauth system-config body.
//   (d) A thrown exec is CAUGHT → {ok:false}; no throw escapes (T-322-20 failure isolation).

import {describe, expect, test, vi} from 'vitest'

import {provisionOidcForApp, type ProvisionOidcOpts} from './provisioning.js'

// A fake execa `$` tag that records the discrete (strings, ...args) split so a test can
// prove the secret lands as its own argv element, never inside a static shell string.
function makeRun() {
	const calls: {strings: string[]; args: unknown[]}[] = []
	const run: NonNullable<NonNullable<ProvisionOidcOpts['deps']>['run']> = (strings, ...args) => {
		calls.push({strings: [...strings], args})
		return Promise.resolve({stdout: '', stderr: ''})
	}
	return {run, calls}
}

const SECRET = 'DEADBEEFcafef00d' // sentinel — must never appear in a static template string

describe('oidc/provisioning — provisionOidcForApp', () => {
	test('(a) gitea builds a discrete-argv docker-exec add-oauth (no shell string carries the secret)', async () => {
		const {run, calls} = makeRun()
		const r = await provisionOidcForApp(
			{id: 'gitea'},
			{mainDomain: 'example.com', clientSecret: SECRET, containerName: 'gitea_server_1', deps: {run}},
		)
		expect(r).toEqual({ok: true})
		expect(calls).toHaveLength(1)
		const call = calls[0]
		// Each sensitive/derived value is a DISCRETE argv element (proves no shell interpolation).
		expect(call.args).toContain(SECRET)
		expect(call.args).toContain('livos-gitea')
		expect(call.args).toContain('gitea_server_1')
		expect(call.args).toContain('https://example.com/oidc/.well-known/openid-configuration')
		// The secret NEVER appears inside a static template segment (would mean a built shell string).
		expect(call.strings.join(' ')).not.toContain(SECRET)
		// Fixed command template markers present.
		expect(call.strings.join(' ')).toContain('add-oauth')
		expect(call.strings.join(' ')).toContain('docker exec')
	})

	test('(a) nextcloud builds a discrete-argv occ user_oidc:provider exec as -u www-data', async () => {
		const {run, calls} = makeRun()
		const r = await provisionOidcForApp(
			{id: 'nextcloud'},
			{mainDomain: 'example.com', clientSecret: SECRET, containerName: 'nextcloud_server_1', deps: {run}},
		)
		expect(r).toEqual({ok: true})
		const call = calls[0]
		expect(call.args).toContain(SECRET)
		expect(call.args).toContain('livos-nextcloud')
		expect(call.args).toContain('nextcloud_server_1')
		expect(call.strings.join(' ')).not.toContain(SECRET)
		expect(call.strings.join(' ')).toContain('user_oidc:provider')
		expect(call.strings.join(' ')).toContain('-u www-data')
	})

	test('(b) immich with NO admin api key defers and makes NO fetch (Pitfall 7)', async () => {
		const fetchSpy = vi.fn()
		const r = await provisionOidcForApp(
			{id: 'immich'},
			{
				mainDomain: 'example.com',
				clientSecret: SECRET,
				containerName: 'immich_server_1',
				immichPort: 2283,
				deps: {fetchImpl: fetchSpy as unknown as typeof globalThis.fetch},
			},
		)
		expect(r).toEqual({ok: false, deferred: true, reason: 'immich-api-key-missing'})
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	// 331-02 (FIX-02): shared opts for the immich-with-key cases below.
	const immichOpts = (fetchSpy: unknown): ProvisionOidcOpts => ({
		mainDomain: 'example.com',
		clientSecret: SECRET,
		containerName: 'immich_server_1',
		immichPort: 2283,
		immichAdminApiKey: 'imm_key_123',
		deps: {fetchImpl: fetchSpy as typeof globalThis.fetch},
	})

	test('(c) immich with a key PUTs the oauth body to the LITERAL 127.0.0.1 loopback host, then CONFIRMS via read-back', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ok: true} as Response) // PUT
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({oauth: {enabled: true, clientId: 'livos-immich'}}),
			} as unknown as Response) // 331-02 confirm GET
		const r = await provisionOidcForApp({id: 'immich'}, immichOpts(fetchSpy))
		expect(r).toEqual({ok: true})
		expect(fetchSpy).toHaveBeenCalledTimes(2)
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
		expect(url).toBe('http://127.0.0.1:2283/api/system-config')
		expect(url.startsWith('http://127.0.0.1:')).toBe(true) // SSRF scope: no request-derived host
		expect(init.method).toBe('PUT')
		expect((init.headers as Record<string, string>)['x-api-key']).toBe('imm_key_123')
		const body = JSON.parse(init.body as string)
		expect(body.oauth.enabled).toBe(true)
		expect(body.oauth.clientId).toBe('livos-immich')
		expect(body.oauth.clientSecret).toBe(SECRET)
		expect(body.oauth.issuerUrl).toBe('https://example.com/oidc')
		expect(body.oauth.scope).toBe('openid email profile groups')
		expect(body.oauth.roleClaim).toBe('groups')
		// The confirm read-back stays on the SAME loopback literal (T-322-14 scope).
		const [confirmUrl, confirmInit] = fetchSpy.mock.calls[1] as [string, RequestInit]
		expect(confirmUrl).toBe('http://127.0.0.1:2283/api/system-config')
		expect(confirmInit.method).toBe('GET')
		expect((confirmInit.headers as Record<string, string>)['x-api-key']).toBe('imm_key_123')
	})

	test('(c) 331-02 immich REST non-2xx carries an honest http reason (was a bare {ok:false})', async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ok: false, status: 502} as Response)
		const r = await provisionOidcForApp({id: 'immich'}, immichOpts(fetchSpy))
		expect(r).toEqual({ok: false, reason: 'immich-system-config-http-502'})
		expect(fetchSpy).toHaveBeenCalledTimes(1) // no read-back after a failed PUT
	})

	test('(c) 331-02 immich 2xx PUT + read-back SHAPE MISMATCH → unconfirmed (never silently trusted)', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ok: true} as Response)
			.mockResolvedValueOnce({
				ok: true,
				// oauth.enabled false / wrong clientId — the PUT did not take effect.
				json: async () => ({oauth: {enabled: false, clientId: 'livos-immich'}}),
			} as unknown as Response)
		const r = await provisionOidcForApp({id: 'immich'}, immichOpts(fetchSpy))
		expect(r).toEqual({ok: false, reason: 'immich-sso-unconfirmed'})
	})

	test('(c) 331-02 immich 2xx PUT + read-back GET non-2xx → unconfirmed', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ok: true} as Response)
			.mockResolvedValueOnce({ok: false, status: 401} as Response)
		const r = await provisionOidcForApp({id: 'immich'}, immichOpts(fetchSpy))
		expect(r).toEqual({ok: false, reason: 'immich-sso-unconfirmed'})
	})

	test('(c) 331-02 immich 2xx PUT + read-back json() throw → unconfirmed (no throw escapes)', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce({ok: true} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => {
					throw new Error('bad json')
				},
			} as unknown as Response)
		const r = await provisionOidcForApp({id: 'immich'}, immichOpts(fetchSpy))
		expect(r).toEqual({ok: false, reason: 'immich-sso-unconfirmed'})
	})

	test('(d) a thrown exec is caught → {ok:false} with the message; no throw escapes', async () => {
		const throwingRun: NonNullable<NonNullable<ProvisionOidcOpts['deps']>['run']> = () =>
			Promise.reject(new Error('exec failed'))
		const r = await provisionOidcForApp(
			{id: 'gitea'},
			{mainDomain: 'example.com', clientSecret: SECRET, containerName: 'c', deps: {run: throwingRun}},
		)
		// Reaching this line at all proves no exception escaped the function.
		expect(r.ok).toBe(false)
		expect(r.reason).toBe('exec failed')
	})

	test('(d) an execa-style error echoing the command line is REDACTED (secret never in reason/log)', async () => {
		// execa errors carry the full failed command — incl. --clientsecret=<hex> — in
		// .message. The catch must strip the secret before it reaches reason OR the logger.
		const execaLike = new Error(
			`Command failed with exit code 1: docker exec gitea_server_1 gitea admin auth add-oauth --secret ${SECRET}`,
		)
		const throwingRun: NonNullable<NonNullable<ProvisionOidcOpts['deps']>['run']> = () =>
			Promise.reject(execaLike)
		const logged: unknown[] = []
		const r = await provisionOidcForApp(
			{id: 'gitea'},
			{
				mainDomain: 'example.com',
				clientSecret: SECRET,
				containerName: 'gitea_server_1',
				logger: {error: (...a) => logged.push(...a), log: () => {}},
				deps: {run: throwingRun},
			},
		)
		expect(r.ok).toBe(false)
		expect(r.reason).not.toContain(SECRET) // the returned reason is scrubbed
		expect(r.reason).toContain('***')
		expect(logged.join(' ')).not.toContain(SECRET) // nothing logged carries the secret
	})

	test('vaultwarden is a no-op ({ok:true}) — its SSO env is injected in patchComposeFile (322-05)', async () => {
		const {run, calls} = makeRun()
		const fetchSpy = vi.fn()
		const r = await provisionOidcForApp(
			{id: 'vaultwarden'},
			{
				mainDomain: 'example.com',
				clientSecret: SECRET,
				containerName: 'vaultwarden_server_1',
				deps: {run, fetchImpl: fetchSpy as unknown as typeof globalThis.fetch},
			},
		)
		expect(r).toEqual({ok: true})
		expect(calls).toHaveLength(0)
		expect(fetchSpy).not.toHaveBeenCalled()
	})

	test('a non-OIDC-native app returns {ok:false, reason:not-oidc-native}', async () => {
		const r = await provisionOidcForApp(
			{id: 'some-random-app'},
			{mainDomain: 'example.com', clientSecret: SECRET, containerName: 'x'},
		)
		expect(r).toEqual({ok: false, reason: 'not-oidc-native'})
	})
})
