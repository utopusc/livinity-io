import assert from 'node:assert/strict'
import {test} from 'node:test'

import {injectLocalAiClisConfig, grantContainerCredsAcl, CLI_MOUNT_PREFIX, type DetectedHostClis} from './inject-local-ai-clis.js'
import {CREDPROXY_HOST, CREDPROXY_PORT, CREDPROXY_PLACEHOLDER_KEY} from './cred-egress-proxy.js'
import {AppManifestSchema, type AppManifest} from './schema.js'

const validBaseManifest: AppManifest = {
	manifestVersion: '1.0.0',
	id: 'test',
	name: 'Test',
	tagline: 't',
	category: 'c',
	version: '1.0.0',
	port: 8080,
	description: 'd',
	website: 'https://example.com',
	support: 'https://example.com',
	gallery: [],
}

const detected: DetectedHostClis = {
	glibc: {lib64: '/lib64', libX86: '/lib/x86_64-linux-gnu', usrLibX86: '/usr/lib/x86_64-linux-gnu'},
	node: '/usr/bin/node',
	claude: {pkgDir: '/usr/lib/node_modules/@anthropic-ai/claude-code', hostExe: '/usr/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'},
	gemini: {pkgDir: '/home/bruce/.npm-global/lib/node_modules/@google/gemini-cli', hostEntry: '/home/bruce/.npm-global/lib/node_modules/@google/gemini-cli/bundle/gemini.js'},
	creds: {claudeDir: '/home/bruce/.claude', geminiDir: '/home/bruce/.gemini'},
	homeDir: '/home/bruce',
}

const APP_DIR = '/data/app-data/open-design'

test('Test 1a: flag false → compose unchanged', () => {
	const compose = {services: {app: {image: 'foo'}}}
	const before = JSON.parse(JSON.stringify(compose))
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: false})
	assert.deepEqual(compose, before)
})

test('Test 1b: flag undefined → compose unchanged', () => {
	const compose = {services: {app: {image: 'foo'}}}
	const before = JSON.parse(JSON.stringify(compose))
	injectLocalAiClisConfig(compose, detected, APP_DIR, {})
	assert.deepEqual(compose, before)
})

test('Test 1c: null detected → compose unchanged even with flag', () => {
	const compose = {services: {app: {image: 'foo'}}}
	const before = JSON.parse(JSON.stringify(compose))
	injectLocalAiClisConfig(compose, null, APP_DIR, {requiresLocalAiClis: true})
	assert.deepEqual(compose, before)
})

test('Test 2: full inject adds safe volumes + PATH (LIVOS-001: NO cred mounts)', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const v: string[] = compose.services.app.volumes
	// Safe glibc/node/CLI/wrapper mounts STILL present (regression-lock).
	assert.ok(v.includes(`/lib64:${CLI_MOUNT_PREFIX}/glibc/lib64:ro`))
	assert.ok(v.includes(`/lib/x86_64-linux-gnu:${CLI_MOUNT_PREFIX}/glibc/lib-x86_64:ro`))
	assert.ok(v.includes(`/usr/lib/x86_64-linux-gnu:${CLI_MOUNT_PREFIX}/glibc/usrlib-x86_64:ro`))
	assert.ok(v.includes(`/usr/bin/node:${CLI_MOUNT_PREFIX}/node/bin/node:ro`))
	assert.ok(v.includes(`/usr/lib/node_modules/@anthropic-ai/claude-code:${CLI_MOUNT_PREFIX}/claude-code:ro`))
	assert.ok(v.includes(`/home/bruce/.npm-global/lib/node_modules/@google/gemini-cli:${CLI_MOUNT_PREFIX}/gemini-cli:ro`))
	assert.ok(v.includes(`${APP_DIR}/host-clis/bin:${CLI_MOUNT_PREFIX}/bin:ro`))
	assert.ok(v.includes(`${APP_DIR}/host-clis/home:${CLI_MOUNT_PREFIX}/home:rw`))
	assert.equal(compose.services.app.environment.PATH, `${CLI_MOUNT_PREFIX}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`)
})

test('Test 2b (LIVOS-001 / SC4): NO cred bind mount for .claude / .gemini', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const v: string[] = compose.services.app.volumes
	// The operator token dirs must NEVER be mounted into the container.
	assert.ok(!v.some((s) => s.includes('/.claude:')), 'no .claude cred mount')
	assert.ok(!v.some((s) => s.includes('/.gemini:')), 'no .gemini cred mount')
})

test('Test 2c (SC4): proxy env injected — HTTPS_PROXY + placeholder key', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const env = compose.services.app.environment
	const proxyUrl = `http://${CREDPROXY_HOST}:${CREDPROXY_PORT}`
	assert.equal(env.HTTPS_PROXY, proxyUrl)
	assert.equal(env.HTTP_PROXY, proxyUrl)
	assert.equal(env.ANTHROPIC_API_KEY, CREDPROXY_PLACEHOLDER_KEY)
})

test('Test 2d (SC4): extra_hosts carries livinity-credproxy:host-gateway (deduped)', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const eh: string[] = compose.services.app.extra_hosts
	assert.ok(Array.isArray(eh))
	assert.equal(eh.filter((h) => h === `${CREDPROXY_HOST}:host-gateway`).length, 1)
})

test('Test 2e (SC4): CA cert mounted READ-ONLY + NODE_EXTRA_CA_CERTS points at it', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const v: string[] = compose.services.app.volumes
	const caTarget = `${CLI_MOUNT_PREFIX}/credproxy-ca.pem`
	// CA cert is mounted read-only into the container (the cert is public).
	assert.ok(v.some((s) => s.endsWith(`${caTarget}:ro`)), 'CA cert :ro mount present')
	assert.equal(compose.services.app.environment.NODE_EXTRA_CA_CERTS, caTarget)
})

test('Test 2f (SC4): grantContainerCredsAcl is a no-op — setfacl NEVER invoked', async () => {
	let setfaclCalled = false
	const fakeExec = ((..._args: unknown[]) => {
		// Any invocation that reaches setfacl trips the flag.
		setfaclCalled = true
		return Promise.resolve({stdout: '', stderr: ''})
	}) as any
	await grantContainerCredsAcl(APP_DIR, detected, undefined, fakeExec)
	assert.equal(setfaclCalled, false)
})

test('Test 3: idempotent — second inject does not duplicate volumes', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	const count1 = compose.services.app.volumes.length
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	assert.equal(compose.services.app.volumes.length, count1)
	// PATH prefix not doubled
	assert.equal(
		compose.services.app.environment.PATH.split(`${CLI_MOUNT_PREFIX}/bin`).length - 1,
		1,
	)
})

test('Test 4: existing PATH (map form) is preserved and prefixed', () => {
	const compose = {services: {app: {image: 'foo', environment: {PATH: '/opt/app/bin:/usr/bin'}}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	assert.equal(compose.services.app.environment.PATH, `${CLI_MOUNT_PREFIX}/bin:/opt/app/bin:/usr/bin`)
})

test('Test 4b: existing PATH (array form) is preserved and prefixed', () => {
	const compose = {services: {app: {image: 'foo', environment: ['FOO=bar', 'PATH=/opt/app/bin']}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	assert.ok(compose.services.app.environment.includes('FOO=bar'))
	assert.ok(compose.services.app.environment.includes(`PATH=${CLI_MOUNT_PREFIX}/bin:/opt/app/bin`))
})

test('Test 5: existing volumes are preserved', () => {
	const compose = {services: {app: {image: 'foo', volumes: ['/data:/data']}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	assert.ok(compose.services.app.volumes.includes('/data:/data'))
})

test('Test 6: only the first service is mutated', () => {
	const compose = {services: {app: {image: 'foo'}, db: {image: 'postgres'}}} as any
	injectLocalAiClisConfig(compose, detected, APP_DIR, {requiresLocalAiClis: true})
	assert.ok(compose.services.app.volumes)
	assert.equal(compose.services.db.volumes, undefined)
	assert.equal(compose.services.db.environment, undefined)
})

test('Test 7: claude-only host (no gemini/node) omits gemini mounts', () => {
	const claudeOnly: DetectedHostClis = {...detected, gemini: null, node: null, creds: {claudeDir: '/home/bruce/.claude', geminiDir: null}}
	const compose = {services: {app: {image: 'foo'}}} as any
	injectLocalAiClisConfig(compose, claudeOnly, APP_DIR, {requiresLocalAiClis: true})
	const v: string[] = compose.services.app.volumes
	assert.ok(v.includes(`/usr/lib/node_modules/@anthropic-ai/claude-code:${CLI_MOUNT_PREFIX}/claude-code:ro`))
	assert.ok(!v.some((s) => s.includes('gemini-cli')))
	assert.ok(!v.some((s) => s.includes('/node/bin/node')))
	assert.ok(!v.some((s) => s.includes('.gemini')))
})

test('Test 8a: schema accepts requiresLocalAiClis: true', () => {
	assert.equal(AppManifestSchema.safeParse({...validBaseManifest, requiresLocalAiClis: true}).success, true)
})

test('Test 8b: schema accepts manifest without the field (optional)', () => {
	assert.equal(AppManifestSchema.safeParse(validBaseManifest).success, true)
})

test('Test 8c: schema rejects non-boolean requiresLocalAiClis', () => {
	assert.equal(AppManifestSchema.safeParse({...validBaseManifest, requiresLocalAiClis: 'yes'}).success, false)
})
