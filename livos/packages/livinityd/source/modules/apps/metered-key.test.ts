import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
	chooseCredentialPath,
	mintMeteredKeyForApp,
	revokeMeteredKeyForApp,
	type BrokerClient,
} from './metered-key.js'
import {injectAiProviderConfig} from './inject-ai-provider.js'
import type {AppManifest} from './schema.js'

const baseManifest: AppManifest = {
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

/** Minimal in-memory broker stub recording createKey/deleteKey calls. */
function makeBrokerStub() {
	const created: Array<{name: string; budget?: unknown; modelAllowlist?: unknown}> = []
	const revoked: string[] = []
	let n = 0
	const broker: BrokerClient = {
		async createKey(opts) {
			created.push({name: opts.name, budget: opts.budget, modelAllowlist: opts.modelAllowlist})
			n += 1
			return {id: `key-${n}`, plaintext: `lvb_minted${n}`, prefix: `lvb_minted${n}`.slice(0, 10)}
		},
		async deleteKey(keyId) {
			revoked.push(keyId)
		},
	}
	return {broker, created, revoked}
}

// ── Test 1: mint shape ──────────────────────────────────────────────────────
test('Test 1: mintMeteredKeyForApp returns a per-app virtual key + records scope', async () => {
	const {broker, created} = makeBrokerStub()
	const result = await mintMeteredKeyForApp(
		{appSlug: 'untrusted-app', userId: 'u1', budget: {maxUsd: 5}, modelAllowlist: ['claude-3-5-haiku']},
		broker,
	)
	assert.ok(result.virtualKey.startsWith('lvb_'))
	assert.equal(result.appSlug, 'untrusted-app')
	assert.ok(result.keyId.length > 0)
	// createKey was called with the app slug embedded in the name + budget + allowlist.
	assert.equal(created.length, 1)
	assert.ok(created[0].name.includes('untrusted-app'))
	assert.deepEqual(created[0].budget, {maxUsd: 5})
	assert.deepEqual(created[0].modelAllowlist, ['claude-3-5-haiku'])
})

// ── Test 2: revoke + per-app isolation ──────────────────────────────────────
test('Test 2: revokeMeteredKeyForApp revokes one key without affecting another', async () => {
	const {broker, revoked} = makeBrokerStub()
	const a = await mintMeteredKeyForApp({appSlug: 'app-a', userId: 'u1'}, broker)
	const b = await mintMeteredKeyForApp({appSlug: 'app-b', userId: 'u1'}, broker)
	assert.notEqual(a.keyId, b.keyId)
	await revokeMeteredKeyForApp({keyId: a.keyId}, broker)
	assert.deepEqual(revoked, [a.keyId])
	// app-b's key id is NOT in the revoked list.
	assert.ok(!revoked.includes(b.keyId))
})

// ── Test 3: verified → OAuth proxy ──────────────────────────────────────────
test('Test 3: chooseCredentialPath(verified/isGeneratedTemplate:true) → oauth-proxy', () => {
	assert.equal(chooseCredentialPath({isGeneratedTemplate: true}), 'oauth-proxy')
})

// ── Test 4: unverified → metered key ────────────────────────────────────────
test('Test 4: chooseCredentialPath(unverified/isGeneratedTemplate:false) → metered-key', () => {
	assert.equal(chooseCredentialPath({isGeneratedTemplate: false}), 'metered-key')
})

// ── Test 5: inject the REAL minted key (not the sentinel) for unverified apps ─
test('Test 5: injectAiProviderConfig with a virtualKey sets the REAL key, not the sentinel', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectAiProviderConfig(compose, 'u1', {...baseManifest, requiresAiProvider: true}, {
		virtualKey: 'lvb_realPERAPP',
	})
	const env = compose.services.app.environment
	assert.equal(env.ANTHROPIC_API_KEY, 'lvb_realPERAPP')
	assert.equal(env.OPENAI_API_KEY, 'lvb_realPERAPP')
	assert.equal(env.OPENAI_LIKE_API_KEY, 'lvb_realPERAPP')
	// Still points at the broker base-URL so the broker meters this key.
	assert.ok(typeof env.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL.includes('/u/u1'))
})

test('Test 5b: injectAiProviderConfig WITHOUT a virtualKey keeps the sentinel (verified/OAuth path)', () => {
	const compose = {services: {app: {image: 'foo'}}} as any
	injectAiProviderConfig(compose, 'u1', {...baseManifest, requiresAiProvider: true})
	const env = compose.services.app.environment
	assert.equal(env.ANTHROPIC_API_KEY, 'livinity-broker-managed')
	assert.equal(env.OPENAI_API_KEY, 'livinity-broker-managed')
})

// ── Test 6: broker createKey carries the per-app scope ───────────────────────
test('Test 6: the broker createKey persists name/budget/model-allowlist for the app key', async () => {
	const {broker, created} = makeBrokerStub()
	await mintMeteredKeyForApp(
		{appSlug: 'metered-thing', userId: 'u9', budget: {maxUsd: 10}, modelAllowlist: ['gpt-4o-mini']},
		broker,
	)
	assert.equal(created.length, 1)
	const row = created[0]
	assert.ok(row.name.includes('metered-thing'))
	assert.deepEqual(row.budget, {maxUsd: 10})
	assert.deepEqual(row.modelAllowlist, ['gpt-4o-mini'])
})
