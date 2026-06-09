import assert from 'node:assert/strict'
import {test} from 'node:test'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import tls from 'node:tls'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

import {mkdtemp} from 'node:fs/promises'

import fse from 'fs-extra'

import {
	CREDPROXY_HOST,
	CREDPROXY_PORT,
	CREDPROXY_HOST_GATEWAY,
	isInjectableHost,
	readBearerFor,
	injectAuthHeader,
	isFromBridge,
	mintLeafCert,
	buildLeafContexts,
	createCredEgressProxy,
	registerAppToken,
	revokeAppToken,
	mintAppToken,
	checkAppToken,
	parseAppToken,
} from './cred-egress-proxy.js'

const execFileAsync = promisify(execFile)

/** Generate a throwaway CA (cert + key) in a temp dir, mirroring the installer. */
async function makeTestCa(): Promise<{dir: string; caCert: string; caKey: string}> {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'credproxy-ca-'))
	const caCert = path.join(dir, 'credproxy-ca.pem')
	const caKey = path.join(dir, 'credproxy-ca.key')
	await execFileAsync('openssl', [
		'req',
		'-x509',
		'-newkey',
		'rsa:2048',
		'-nodes',
		'-keyout',
		caKey,
		'-out',
		caCert,
		'-days',
		'3650',
		'-subj',
		'/CN=livinity-credproxy',
	])
	return {dir, caCert, caKey}
}

/**
 * Drive a real CONNECT + TLS handshake through the proxy to `host`, send one GET,
 * and resolve with the upstream-forwarded headers the proxy injected (captured by
 * a stub `forwardRequest`) plus the response body. The proxy is created with the
 * given opts so each test controls the leaf contexts / bridge subnet / bearer.
 */
async function connectThroughProxy(opts: {
	proxyPort: number
	host: string
	caCert: string
	expectFailClosed?: boolean
	/** Per-app token (LIVOS-046) sent as Proxy-Authorization: Basic base64(app:token). */
	token?: string
}): Promise<{status: number | null; body: string; connectFailed: boolean}> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(opts.proxyPort, '127.0.0.1', () => {
			const proxyAuth = opts.token
				? `Proxy-Authorization: Basic ${Buffer.from(`app:${opts.token}`).toString('base64')}\r\n`
				: ''
			socket.write(`CONNECT ${opts.host}:443 HTTP/1.1\r\nHost: ${opts.host}:443\r\n${proxyAuth}\r\n`)
		})
		let connectBuf = ''
		const onConnectData = (chunk: Buffer) => {
			connectBuf += chunk.toString('utf8')
			if (!connectBuf.includes('\r\n\r\n')) return
			socket.removeListener('data', onConnectData)
			const statusLine = connectBuf.split('\r\n')[0]
			if (!statusLine.includes('200')) {
				// Proxy refused the CONNECT (fail-closed / deny).
				resolve({status: null, body: '', connectFailed: true})
				socket.destroy()
				return
			}
			// CONNECT accepted → start the inner TLS handshake against the proxy's
			// MITM leaf, trusting our test CA.
			const tlsSock = tls.connect(
				{socket, servername: opts.host, ca: fse.readFileSync(opts.caCert)},
				() => {
					tlsSock.write(
						`GET /v1/messages HTTP/1.1\r\nHost: ${opts.host}\r\nAuthorization: Bearer __livinity_credproxy__\r\nConnection: close\r\n\r\n`,
					)
				},
			)
			let respBuf = ''
			tlsSock.on('data', (d) => {
				respBuf += d.toString('utf8')
			})
			tlsSock.on('error', reject)
			tlsSock.on('close', () => {
				const status = respBuf ? Number(respBuf.split(' ')[1]) || null : null
				const body = respBuf.split('\r\n\r\n').slice(1).join('\r\n\r\n')
				resolve({status, body, connectFailed: false})
			})
		}
		socket.on('data', onConnectData)
		socket.on('error', reject)
	})
}

// ── Test 1: host allowlist ─────────────────────────────────────────────────
test('Test 1: isInjectableHost allowlists only the AI provider hosts', () => {
	assert.equal(isInjectableHost('api.anthropic.com'), true)
	assert.equal(isInjectableHost('generativelanguage.googleapis.com'), true)
	assert.equal(isInjectableHost('attacker.example'), false)
	// Host:port forms (CONNECT targets carry the port) must still match.
	assert.equal(isInjectableHost('api.anthropic.com:443'), true)
	assert.equal(isInjectableHost('evil.api.anthropic.com.attacker.example'), false)
})

// ── Test 2: bearer source (read-only token from host cred file) ─────────────
test('Test 2: readBearerFor reads the OAuth token from the host cred file; null on garbage', async () => {
	const tmp = await mkdtemp(path.join(os.tmpdir(), 'credproxy-test-'))
	const claudeDir = path.join(tmp, '.claude')
	const geminiDir = path.join(tmp, '.gemini')
	await fse.mkdirp(claudeDir)
	await fse.mkdirp(geminiDir)

	// Anthropic OAuth credential file shape (claudeAiOauth.accessToken).
	await fse.writeFile(
		path.join(claudeDir, '.credentials.json'),
		JSON.stringify({claudeAiOauth: {accessToken: 'sk-ant-oat-REALTOKEN', refreshToken: 'r'}}),
	)
	const anthropicTok = await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	assert.equal(anthropicTok, 'sk-ant-oat-REALTOKEN')

	// Gemini oauth_creds.json shape (access_token).
	await fse.writeFile(
		path.join(geminiDir, 'oauth_creds.json'),
		JSON.stringify({access_token: 'ya29.GEMINI-TOKEN', token_type: 'Bearer'}),
	)
	const geminiTok = await readBearerFor('gemini', {claudeDir: null, geminiDir})
	assert.equal(geminiTok, 'ya29.GEMINI-TOKEN')

	// Missing file → null (no throw).
	const missing = await readBearerFor('anthropic', {claudeDir: path.join(tmp, 'nope'), geminiDir: null})
	assert.equal(missing, null)

	// Garbage file → null (no throw).
	await fse.writeFile(path.join(claudeDir, '.credentials.json'), 'not json at all {')
	const garbage = await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	assert.equal(garbage, null)

	await fse.remove(tmp)
})

// ── Test 3: header injection only for allowlisted hosts ─────────────────────
test('Test 3: injectAuthHeader sets Authorization for AI hosts, leaves non-allowlisted unmutated', async () => {
	const tokenSource = async () => 'sk-ant-oat-WIRE'

	// Allowlisted host with NO Authorization header → injected.
	const headersAllow: Record<string, string> = {host: 'api.anthropic.com'}
	const allowResult = await injectAuthHeader('api.anthropic.com', headersAllow, {
		readBearer: tokenSource,
	})
	assert.equal(allowResult.injected, true)
	assert.equal(headersAllow['authorization'], 'Bearer sk-ant-oat-WIRE')

	// Non-allowlisted host → never injected, headers untouched, egress denied.
	const headersDeny: Record<string, string> = {host: 'attacker.example'}
	const denyResult = await injectAuthHeader('attacker.example', headersDeny, {
		readBearer: tokenSource,
	})
	assert.equal(denyResult.injected, false)
	assert.equal(denyResult.denied, true)
	assert.equal(headersDeny['authorization'], undefined)
})

// ── Test 4: source-IP gate to the docker bridge subnet ──────────────────────
test('Test 4: isFromBridge accepts docker-bridge IPs, rejects everything else', () => {
	// docker default bridge range 172.16.0.0/12.
	assert.equal(isFromBridge('172.17.0.2', '172.16.0.0/12'), true)
	assert.equal(isFromBridge('172.18.0.5', '172.16.0.0/12'), true)
	// LIVOS-046 (262-04): a per-app compose-network source (br-*, 172.18.x) MUST
	// still pass — the /12 must NOT be narrowed to a single /16 that would 403 the
	// legitimate requiresLocalAiClis container. The TOKEN is the primary auth.
	assert.equal(isFromBridge('172.18.0.2', '172.16.0.0/12'), true)
	assert.equal(isFromBridge('172.31.255.254', '172.16.0.0/12'), true)
	// Outside the subnet → refused.
	assert.equal(isFromBridge('10.0.0.5', '172.16.0.0/12'), false)
	assert.equal(isFromBridge('8.8.8.8', '172.16.0.0/12'), false)
	// IPv4-mapped IPv6 form docker sometimes presents.
	assert.equal(isFromBridge('::ffff:172.17.0.2', '172.16.0.0/12'), true)
})

// ── Test 5: no token leak — proxy never writes back to the cred file ────────
test('Test 5: readBearerFor opens the cred file read-only (no write-back / overwrite path)', async () => {
	const tmp = await mkdtemp(path.join(os.tmpdir(), 'credproxy-ro-'))
	const claudeDir = path.join(tmp, '.claude')
	await fse.mkdirp(claudeDir)
	const credFile = path.join(claudeDir, '.credentials.json')
	const original = JSON.stringify({claudeAiOauth: {accessToken: 'tok-RO'}})
	await fse.writeFile(credFile, original)
	const before = await fse.stat(credFile)

	await readBearerFor('anthropic', {claudeDir, geminiDir: null})
	await readBearerFor('anthropic', {claudeDir, geminiDir: null})

	const after = await fse.stat(credFile)
	const content = await fse.readFile(credFile, 'utf8')
	// mtime unchanged + content byte-identical → the proxy never wrote back.
	assert.equal(after.mtimeMs, before.mtimeMs)
	assert.equal(content, original)

	await fse.remove(tmp)
})

// ── Constants sanity (the inject-local-ai-clis contract) ────────────────────
test('Test 6: exported constants match the container wiring contract', () => {
	assert.equal(CREDPROXY_HOST, 'livinity-credproxy')
	assert.equal(CREDPROXY_PORT, 13129)
	assert.equal(CREDPROXY_HOST_GATEWAY, 'livinity-credproxy:host-gateway')
})

// ── Test 7: leaf-cert minting + SNI context build (signed by the CA) ─────────
test('Test 7: mintLeafCert signs a per-host leaf with the CA; buildLeafContexts maps the allowlist', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	try {
		const leaf = await mintLeafCert('api.anthropic.com', caCert, caKey)
		assert.ok(leaf, 'leaf should mint for an allowlisted host')
		assert.ok(leaf!.cert.includes('BEGIN CERTIFICATE'))
		assert.ok(leaf!.key.includes('PRIVATE KEY'))
		// The leaf must actually be usable to build a TLS context.
		assert.doesNotThrow(() => tls.createSecureContext({cert: leaf!.cert, key: leaf!.key}))

		// Hostile / non-DNS names are rejected before openssl (defence-in-depth).
		assert.equal(await mintLeafCert('api.anthropic.com; rm -rf /', caCert, caKey), null)
		assert.equal(await mintLeafCert('$(touch pwned)', caCert, caKey), null)

		// Missing CA material → null (caller fails closed).
		assert.equal(await mintLeafCert('api.anthropic.com', path.join(dir, 'nope.pem'), caKey), null)

		// buildLeafContexts returns a context per host that minted.
		const ctxs = await buildLeafContexts(['api.anthropic.com', 'generativelanguage.googleapis.com'], caCert, caKey)
		assert.equal(ctxs.size, 2)
		assert.ok(ctxs.get('api.anthropic.com'))
		assert.ok(ctxs.get('generativelanguage.googleapis.com'))
	} finally {
		await fse.remove(dir)
	}
})

// ── Test 8: allowlisted CONNECT from allowed IP is TLS-terminated + bearer injected ─
test('Test 8: MITM terminates TLS for an allowlisted host and injects the real bearer (placeholder replaced)', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	const leafContexts = await buildLeafContexts(['api.anthropic.com'], caCert, caKey)

	// A real local HTTP upstream stands in for the genuine AI host; forwardRequest
	// re-originates here (proving the upstream leg carries the injected header).
	let forwardedAuth: string | undefined
	let forwardedXApiKey: string | undefined
	const upstream = http.createServer((ureq, ures) => {
		forwardedAuth = ureq.headers['authorization'] as string | undefined
		forwardedXApiKey = ureq.headers['x-api-key'] as string | undefined
		ures.writeHead(200, {'content-type': 'text/plain'})
		ures.end('ok-from-upstream')
	})
	await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()))
	const upstreamPort = (upstream.address() as net.AddressInfo).port

	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		bridgeSubnet: '127.0.0.0/8', // allow the loopback test client
		leafContexts,
		readBearer: async () => 'sk-ant-oat-REAL-WIRE',
		// Redirect the re-originated leg to the local upstream (test-only hook); the
		// header set is the one the MITM produced after injectAuthHeader.
		forwardRequest: (_hostname, fopts, onResponse) =>
			http.request(
				{host: '127.0.0.1', port: upstreamPort, method: fopts.method, path: fopts.path, headers: fopts.headers},
				onResponse,
			),
	})

	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	// LIVOS-046 (262-04): the CONNECT now also requires a known per-app token.
	const token = mintAppToken()
	registerAppToken(token) // unbound → bind-on-first-use to the loopback test client
	try {
		const res = await connectThroughProxy({proxyPort: port, host: 'api.anthropic.com', caCert, token})
		assert.equal(res.connectFailed, false, 'CONNECT should be accepted (200)')
		// The placeholder the client sent must be REPLACED with the real bearer.
		assert.equal(forwardedAuth, 'Bearer sk-ant-oat-REAL-WIRE')
		assert.notEqual(forwardedAuth, 'Bearer __livinity_credproxy__')
		assert.equal(forwardedXApiKey, undefined, 'x-api-key must be stripped')
		assert.equal(res.status, 200)
		assert.ok(res.body.includes('ok-from-upstream'))
	} finally {
		revokeAppToken(token)
		proxy.close()
		upstream.close()
		await fse.remove(dir)
	}
})

// ── Test 9: non-allowlisted host is still rejected at CONNECT (default-deny intact) ─
test('Test 9: a non-allowlisted host CONNECT is refused — never MITM, never pass-through', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	const leafContexts = await buildLeafContexts(['api.anthropic.com'], caCert, caKey)
	let forwarded = false
	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		bridgeSubnet: '127.0.0.0/8',
		leafContexts,
		readBearer: async () => 'sk-ant-oat-REAL',
		forwardRequest: () => {
			forwarded = true
			return {on: () => undefined, write: () => true, end: () => undefined} as unknown as http.ClientRequest
		},
	})
	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	// Present a valid token so the request reaches (and is rejected by) the
	// host-allowlist check, not merely the token gate.
	const token = mintAppToken()
	registerAppToken(token)
	try {
		const res = await connectThroughProxy({proxyPort: port, host: 'attacker.example', caCert, token})
		assert.equal(res.connectFailed, true, 'non-allowlisted CONNECT must be refused')
		assert.equal(forwarded, false, 'no upstream leg for a denied host')
	} finally {
		revokeAppToken(token)
		proxy.close()
		await fse.remove(dir)
	}
})

// ── Test 10: disallowed source IP is still rejected ──────────────────────────
test('Test 10: a source IP outside the bridge subnet is refused at CONNECT', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	const leafContexts = await buildLeafContexts(['api.anthropic.com'], caCert, caKey)
	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		// The loopback test client (127.0.0.1) is NOT in this subnet → must be refused.
		bridgeSubnet: '172.16.0.0/12',
		leafContexts,
		readBearer: async () => 'sk-ant-oat-REAL',
	})
	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	try {
		const res = await connectThroughProxy({proxyPort: port, host: 'api.anthropic.com', caCert})
		assert.equal(res.connectFailed, true, 'a non-bridge source IP must be refused even for an allowlisted host')
	} finally {
		proxy.close()
		await fse.remove(dir)
	}
})

// ── Test 11: fail-closed when no leaf context exists for an allowed host ──────
test('Test 11: allowlisted host with NO leaf context fails closed (no unauthenticated pass-through)', async () => {
	const {dir, caCert} = await makeTestCa()
	let forwarded = false
	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		bridgeSubnet: '127.0.0.0/8',
		// Empty leaf map → TLS cannot be terminated → MUST refuse, not pass through.
		leafContexts: new Map(),
		readBearer: async () => 'sk-ant-oat-REAL',
		forwardRequest: () => {
			forwarded = true
			return {on: () => undefined, write: () => true, end: () => undefined} as unknown as http.ClientRequest
		},
	})
	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	// Valid token so the request reaches the leaf-context check (which must then
	// fail closed because the map is empty).
	const token = mintAppToken()
	registerAppToken(token)
	try {
		const res = await connectThroughProxy({proxyPort: port, host: 'api.anthropic.com', caCert, token})
		assert.equal(res.connectFailed, true, 'missing leaf cert must fail closed (CONNECT refused)')
		assert.equal(forwarded, false, 'no upstream leg — the placeholder key must NOT leak upstream')
	} finally {
		revokeAppToken(token)
		proxy.close()
		await fse.remove(dir)
	}
})

// ─── LIVOS-046 (262-04): per-app token gate (bind-on-first-use) ───────────────

// ── Test 12: checkAppToken bind-on-first-use + wrong-source + revoke ──────────
test('Test 12: checkAppToken binds on first use, pins to that source IP, and honours revoke', () => {
	const token = mintAppToken()
	assert.equal(token.length, 48, 'mintAppToken → 48 hex chars (24 random bytes)')

	// Unknown / absent token → false (fail-closed).
	assert.equal(checkAppToken(token, '172.18.0.2'), false, 'unregistered token rejected')
	assert.equal(checkAppToken(null, '172.18.0.2'), false, 'null token rejected')

	// Register UNBOUND → first CONNECT claims its source IP (bind-on-first-use).
	registerAppToken(token)
	assert.equal(checkAppToken(token, '172.18.0.2'), true, 'first use binds + passes')
	// Same token from the SAME source → still passes.
	assert.equal(checkAppToken(token, '172.18.0.2'), true, 'bound source passes')
	// Same token from a DIFFERENT source → 403 (pinned).
	assert.equal(checkAppToken(token, '172.18.0.9'), false, 'different source after bind rejected')
	// IPv4-mapped-IPv6 form of the bound source still matches.
	assert.equal(checkAppToken(token, '::ffff:172.18.0.2'), true, 'IPv4-mapped form of bound source matches')

	// Revoke → token no longer valid from any source.
	revokeAppToken(token)
	assert.equal(checkAppToken(token, '172.18.0.2'), false, 'revoked token rejected')
})

// ── Test 12b: pre-binding a token pins it without a first-use claim ───────────
test('Test 12b: registerAppToken with an explicit bridgeIp pins immediately', () => {
	const token = mintAppToken()
	registerAppToken(token, '172.18.0.5')
	try {
		assert.equal(checkAppToken(token, '172.18.0.6'), false, 'wrong source rejected even on first use when pre-bound')
		assert.equal(checkAppToken(token, '172.18.0.5'), true, 'bound source passes')
	} finally {
		revokeAppToken(token)
	}
})

// ── Test 13: parseAppToken extracts the token from both delivery shapes ───────
test('Test 13: parseAppToken reads Proxy-Authorization Basic and X-Livinity-App-Token', () => {
	const basic = `Basic ${Buffer.from('app:tok-ABC').toString('base64')}`
	assert.equal(parseAppToken({'proxy-authorization': basic}), 'tok-ABC')
	// Header fallback.
	assert.equal(parseAppToken({'x-livinity-app-token': 'tok-XYZ'}), 'tok-XYZ')
	// Neither present → null.
	assert.equal(parseAppToken({}), null)
	// Basic with no colon → the whole decoded value is the token.
	assert.equal(parseAppToken({'proxy-authorization': `Basic ${Buffer.from('justtoken').toString('base64')}`}), 'justtoken')
	// Empty credential → null.
	assert.equal(parseAppToken({'proxy-authorization': `Basic ${Buffer.from('app:').toString('base64')}`}), null)
})

// ── Test 14: CONNECT with NO token is refused (403) ──────────────────────────
test('Test 14: a CONNECT with no per-app token is refused (token is now mandatory)', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	const leafContexts = await buildLeafContexts(['api.anthropic.com'], caCert, caKey)
	let forwarded = false
	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		bridgeSubnet: '127.0.0.0/8', // loopback test client passes the coarse bridge gate
		leafContexts,
		readBearer: async () => 'sk-ant-oat-REAL',
		forwardRequest: () => {
			forwarded = true
			return {on: () => undefined, write: () => true, end: () => undefined} as unknown as http.ClientRequest
		},
	})
	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	try {
		// No token presented → 403 even though source IP + host are allowed.
		const res = await connectThroughProxy({proxyPort: port, host: 'api.anthropic.com', caCert})
		assert.equal(res.connectFailed, true, 'a CONNECT without a per-app token must be refused')
		assert.equal(forwarded, false, 'no upstream leg for a tokenless CONNECT')
	} finally {
		proxy.close()
		await fse.remove(dir)
	}
})

// ── Test 15: CONNECT with an UNKNOWN token is refused (403) ───────────────────
test('Test 15: a CONNECT with an unknown per-app token is refused', async () => {
	const {dir, caCert, caKey} = await makeTestCa()
	const leafContexts = await buildLeafContexts(['api.anthropic.com'], caCert, caKey)
	let forwarded = false
	const proxy = createCredEgressProxy({
		creds: {claudeDir: null, geminiDir: null},
		bridgeSubnet: '127.0.0.0/8',
		leafContexts,
		readBearer: async () => 'sk-ant-oat-REAL',
		forwardRequest: () => {
			forwarded = true
			return {on: () => undefined, write: () => true, end: () => undefined} as unknown as http.ClientRequest
		},
	})
	await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', () => r()))
	const port = (proxy.address() as net.AddressInfo).port
	try {
		// A well-formed but never-registered token → 403.
		const res = await connectThroughProxy({proxyPort: port, host: 'api.anthropic.com', caCert, token: mintAppToken()})
		assert.equal(res.connectFailed, true, 'an unknown per-app token must be refused')
		assert.equal(forwarded, false, 'no upstream leg for an unknown token')
	} finally {
		proxy.close()
		await fse.remove(dir)
	}
})

// ── Test 16: per-app compose-network source (172.18.x) with a valid token passes ─
test('Test 16: isFromBridge ACCEPTS a per-app br-* source — token, not a narrowed CIDR, is the auth', () => {
	// The legitimate requiresLocalAiClis container sits on a per-app br-* network
	// (e.g. 172.18.0.2). The /12 bridge gate MUST accept it; a /16 narrowed to
	// docker0 (172.17.0.0/16) would 403 the very feature this protects.
	assert.equal(isFromBridge('172.18.0.2', '172.16.0.0/12'), true)
	assert.equal(isFromBridge('172.17.0.2', '172.16.0.0/12'), true) // docker0
	assert.equal(isFromBridge('10.0.0.5', '172.16.0.0/12'), false) // non-bridge/public
	// The token check then pins identity regardless of which bridge the source is on.
	const token = mintAppToken()
	registerAppToken(token)
	try {
		assert.equal(checkAppToken(token, '172.18.0.2'), true, 'a per-app source binds + passes with a valid token')
	} finally {
		revokeAppToken(token)
	}
})
