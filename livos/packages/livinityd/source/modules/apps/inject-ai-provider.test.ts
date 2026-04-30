import assert from 'node:assert/strict'
import {test} from 'node:test'

import {injectAiProviderConfig} from './inject-ai-provider.js'
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

test('Test 1a: flag false → compose unchanged', () => {
	const composeIn = {services: {app: {image: 'foo'}}}
	const composeBefore = JSON.parse(JSON.stringify(composeIn))
	injectAiProviderConfig(composeIn, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: false,
	})
	assert.deepEqual(composeIn, composeBefore)
})

test('Test 1b: flag undefined → compose unchanged', () => {
	const composeIn = {services: {app: {image: 'foo'}}}
	const composeBefore = JSON.parse(JSON.stringify(composeIn))
	injectAiProviderConfig(composeIn, 'user-uuid', validBaseManifest)
	assert.deepEqual(composeIn, composeBefore)
})

test('Test 2: flag true on bare service → 3 env vars + extra_hosts added', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	const svc = compose.services.app
	assert.equal(svc.environment.ANTHROPIC_BASE_URL, 'http://livinity-broker:8080/u/user-uuid')
	assert.equal(svc.environment.ANTHROPIC_REVERSE_PROXY, 'http://livinity-broker:8080/u/user-uuid')
	assert.equal(svc.environment.LLM_BASE_URL, 'http://livinity-broker:8080/u/user-uuid/v1')
	assert.deepEqual(svc.extra_hosts, ['livinity-broker:host-gateway'])
})

test('Test 3: existing env preserved, broker keys added (no overwrite)', () => {
	const compose = {
		services: {
			app: {image: 'foo', environment: {N8N_HOST: 'localhost', GENERIC_TIMEZONE: 'UTC'}},
		},
	} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	const env = compose.services.app.environment
	assert.equal(env.N8N_HOST, 'localhost')
	assert.equal(env.GENERIC_TIMEZONE, 'UTC')
	assert.equal(env.ANTHROPIC_BASE_URL, 'http://livinity-broker:8080/u/user-uuid')
	assert.equal(env.LLM_BASE_URL, 'http://livinity-broker:8080/u/user-uuid/v1')
	assert.equal(Object.keys(env).length, 5)
})

test('Test 3b: pre-existing ANTHROPIC_BASE_URL is PRESERVED (do not overwrite)', () => {
	const compose = {
		services: {
			app: {image: 'foo', environment: {ANTHROPIC_BASE_URL: 'https://user-set.example/'}},
		},
	} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	const env = compose.services.app.environment
	assert.equal(env.ANTHROPIC_BASE_URL, 'https://user-set.example/')
	// The other two keys still get added
	assert.equal(env.LLM_BASE_URL, 'http://livinity-broker:8080/u/user-uuid/v1')
})

test('Test 4: existing extra_hosts → broker host appended', () => {
	const compose = {
		services: {app: {image: 'foo', extra_hosts: ['mydb:172.17.0.5']}},
	} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	assert.deepEqual(compose.services.app.extra_hosts, [
		'mydb:172.17.0.5',
		'livinity-broker:host-gateway',
	])
})

test('Test 4b: extra_hosts already contains broker → no duplicate', () => {
	const compose = {
		services: {app: {image: 'foo', extra_hosts: ['livinity-broker:host-gateway']}},
	} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	assert.deepEqual(compose.services.app.extra_hosts, ['livinity-broker:host-gateway'])
})

test('Test 5: userId verbatim in URL (no encoding)', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	const id = 'a1b2c3d4-5678-90ab-cdef-1234567890ab'
	injectAiProviderConfig(compose, id, {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	assert.equal(
		compose.services.app.environment.ANTHROPIC_BASE_URL,
		`http://livinity-broker:8080/u/${id}`,
	)
})

test('Test 6: multi-service compose → only first service mutated', () => {
	const compose = {
		services: {app: {image: 'foo'}, db: {image: 'postgres'}},
	} as any
	injectAiProviderConfig(compose, 'user-uuid', {
		...validBaseManifest,
		requiresAiProvider: true,
	})
	assert.ok(compose.services.app.environment)
	assert.equal(compose.services.db.environment, undefined)
	assert.equal(compose.services.db.extra_hosts, undefined)
})

test('Test 7a: schema accepts requiresAiProvider: true', () => {
	const result = AppManifestSchema.safeParse({...validBaseManifest, requiresAiProvider: true})
	assert.equal(result.success, true)
})

test('Test 7b: schema accepts requiresAiProvider: false', () => {
	const result = AppManifestSchema.safeParse({...validBaseManifest, requiresAiProvider: false})
	assert.equal(result.success, true)
})

test('Test 7c: schema accepts manifest without the field (optional)', () => {
	const result = AppManifestSchema.safeParse(validBaseManifest)
	assert.equal(result.success, true)
})

test('Test 7d: schema rejects non-boolean requiresAiProvider', () => {
	const result = AppManifestSchema.safeParse({
		...validBaseManifest,
		requiresAiProvider: 'yes',
	})
	assert.equal(result.success, false)
})

test('Test 8: regression — flag false on populated compose → deep-equal unchanged', () => {
	const compose = {
		services: {
			server: {
				image: 'n8nio/n8n:latest',
				restart: 'unless-stopped',
				environment: {N8N_BASIC_AUTH_ACTIVE: 'true', GENERIC_TIMEZONE: 'Europe/Istanbul'},
				volumes: ['/data:/home/node/.n8n'],
				ports: ['127.0.0.1:5678:5678'],
			},
		},
	}
	const before = JSON.parse(JSON.stringify(compose))
	injectAiProviderConfig(compose, 'user-uuid', validBaseManifest) // flag absent
	assert.deepEqual(compose, before)
})
