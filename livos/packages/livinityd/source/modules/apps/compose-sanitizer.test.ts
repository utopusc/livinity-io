import assert from 'node:assert/strict'
import {test} from 'node:test'

import {sanitizeNonBuiltinCompose, ComposeRejected} from './compose-sanitizer.js'
import {CLI_MOUNT_PREFIX} from './inject-local-ai-clis.js'

const APP_DATA_DIR = '/opt/livos/data/app-data/community-app'

function baseCompose(): any {
	return {
		version: '3',
		services: {
			web: {
				image: 'evil/web:latest',
				ports: ['127.0.0.1:8080:80'],
			},
		},
	}
}

// Test 1 — strip privileged
test('strips privileged:true and reports it', () => {
	const compose = baseCompose()
	compose.services.web.privileged = true
	const {compose: out, removed} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal('privileged' in out.services.web, false, 'privileged key must be deleted')
	assert.ok(removed.some((r) => r.includes('privileged')), `removed should mention privileged, got ${removed}`)
})

// Test 2 — strip host net/pid/caps
test('strips network_mode:host, pid:host, cap_add and reports them', () => {
	const compose = baseCompose()
	compose.services.web.network_mode = 'host'
	compose.services.web.pid = 'host'
	compose.services.web.cap_add = ['SYS_ADMIN']
	const {compose: out, removed} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal('network_mode' in out.services.web, false, 'network_mode:host must be deleted')
	assert.equal('pid' in out.services.web, false, 'pid:host must be deleted')
	assert.equal('cap_add' in out.services.web, false, 'cap_add must be deleted')
	assert.ok(removed.some((r) => r.includes('network_mode')), 'reports network_mode')
	assert.ok(removed.some((r) => r.includes('pid')), 'reports pid')
	assert.ok(removed.some((r) => r.includes('cap_add')), 'reports cap_add')
})

// Test 2b — network_mode that is NOT host (e.g. a custom network) is preserved
test('preserves network_mode when value is not host', () => {
	const compose = baseCompose()
	compose.services.web.network_mode = 'bridge'
	const {compose: out} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal(out.services.web.network_mode, 'bridge', 'non-host network_mode survives')
})

// Test 3 — reject docker.sock
test('rejects docker.sock bind with ComposeRejected', () => {
	const compose = baseCompose()
	compose.services.web.volumes = ['/var/run/docker.sock:/var/run/docker.sock']
	assert.throws(
		() => sanitizeNonBuiltinCompose(compose, APP_DATA_DIR),
		(err: any) => err instanceof ComposeRejected && /docker\.sock|host-path/.test(err.message),
		'docker.sock mount must abort install',
	)
})

// Test 4 — reject arbitrary host path; allow app-data bind + named volume
test('rejects out-of-tree host bind, allows app-data bind and named volume', () => {
	// arbitrary host path (another user's data) → reject
	const evil = baseCompose()
	evil.services.web.volumes = ['/opt/livos/data/users/victim/app-data:/loot']
	assert.throws(
		() => sanitizeNonBuiltinCompose(evil, APP_DATA_DIR),
		(err: any) => err instanceof ComposeRejected,
		'out-of-tree host bind must be rejected',
	)

	// app-data bind + named volume → allowed
	const ok = baseCompose()
	ok.services.web.volumes = [`${APP_DATA_DIR}/data:/data`, 'myvol:/data']
	const {compose: out} = sanitizeNonBuiltinCompose(ok, APP_DATA_DIR)
	assert.deepEqual(out.services.web.volumes, [`${APP_DATA_DIR}/data:/data`, 'myvol:/data'])
})

// Test 5 — allowlist WS-B inject path under CLI_MOUNT_PREFIX (fix F)
test('allows host binds under CLI_MOUNT_PREFIX (WS-B inject root)', () => {
	const compose = baseCompose()
	compose.services.web.volumes = [
		`${CLI_MOUNT_PREFIX}/credproxy-ca.pem:${CLI_MOUNT_PREFIX}/credproxy-ca.pem:ro`,
		`${CLI_MOUNT_PREFIX}/glibc:${CLI_MOUNT_PREFIX}/glibc:ro`,
	]
	const {compose: out} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal(out.services.web.volumes.length, 2, 'WS-B inject mounts survive sanitization')
})

// Test 6 — no-new-privileges added (merged, not duplicated)
test('adds no-new-privileges:true to each service, merging with surviving security_opt', () => {
	const compose = baseCompose()
	compose.services.web.security_opt = ['label=disable', 'seccomp=unconfined']
	const {compose: out, removed} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.ok(out.services.web.security_opt.includes('no-new-privileges:true'), 'no-new-privileges added')
	// unconfined entry stripped
	assert.equal(
		out.services.web.security_opt.some((s: string) => /unconfined/.test(s)),
		false,
		'unconfined security_opt entries removed',
	)
	// surviving non-unconfined entry kept
	assert.ok(out.services.web.security_opt.includes('label=disable'), 'benign security_opt kept')
	// not duplicated
	const nnp = out.services.web.security_opt.filter((s: string) => s === 'no-new-privileges:true')
	assert.equal(nnp.length, 1, 'no-new-privileges not duplicated')
	assert.ok(removed.some((r) => /unconfined/.test(r)), 'reports unconfined removal')

	// already has no-new-privileges → still single
	const compose2 = baseCompose()
	compose2.services.web.security_opt = ['no-new-privileges:true']
	const {compose: out2} = sanitizeNonBuiltinCompose(compose2, APP_DATA_DIR)
	const nnp2 = out2.services.web.security_opt.filter((s: string) => s === 'no-new-privileges:true')
	assert.equal(nnp2.length, 1, 'no-new-privileges not duplicated when pre-existing')
})

// Test 7 — multi-service: every service sanitized
test('sanitizes every service, not just the first', () => {
	const compose = baseCompose()
	compose.services.db = {
		image: 'evil/db',
		privileged: true,
		cap_add: ['SYS_ADMIN'],
	}
	const {compose: out} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal('privileged' in out.services.db, false, 'second service privileged stripped')
	assert.equal('cap_add' in out.services.db, false, 'second service cap_add stripped')
	assert.ok(out.services.db.security_opt.includes('no-new-privileges:true'), 'second service gets no-new-privileges')
	assert.ok(out.services.web.security_opt.includes('no-new-privileges:true'), 'first service gets no-new-privileges')
})

// Test 8 — userns_mode:host stripped; volumes as object form ({source,target}) handled
test('strips userns_mode:host and rejects out-of-tree long-form bind', () => {
	const compose = baseCompose()
	compose.services.web.userns_mode = 'host'
	const {compose: out, removed} = sanitizeNonBuiltinCompose(compose, APP_DATA_DIR)
	assert.equal('userns_mode' in out.services.web, false, 'userns_mode:host stripped')
	assert.ok(removed.some((r) => r.includes('userns_mode')), 'reports userns_mode')

	// long-form bind to host root → reject
	const evil = baseCompose()
	evil.services.web.volumes = [{type: 'bind', source: '/', target: '/host'}]
	assert.throws(
		() => sanitizeNonBuiltinCompose(evil, APP_DATA_DIR),
		(err: any) => err instanceof ComposeRejected,
		'long-form bind to / rejected',
	)
})
