// Phase 341-02 (REPO-02, D-341-2 §2b) — the installForUser multi-user sentinel
// gap-close, fail-closed. installForUser used to inject the REAL broker OAuth
// sentinel UNCONDITIONALLY (no chooseCredentialPath branch). Now it keys off the
// same isGeneratedTemplate trust dimension install() uses:
//   - VERIFIED (isGeneratedTemplate===true)  → sentinel, BYTE-IDENTICAL to before
//     (the only case that reaches installForUser today; official/builtin apps).
//   - UNVERIFIED (isGeneratedTemplate===false) → per-app metered key, NEVER the
//     operator sentinel (the fail-closed guard for this latent path).
//
// This replicates the exact T4 branch (chooseCredentialPath → mint → inject) so
// the two arms are locked without standing up the whole Apps class.
import {expect, test, vi} from 'vitest'
import yaml from 'js-yaml'

import {injectAiProviderConfig, BROKER_SENTINEL_KEY} from './inject-ai-provider.js'
import {chooseCredentialPath, mintMeteredKeyForApp, type BrokerClient} from './metered-key.js'
import type {AppManifest} from './schema.js'

const manifest: AppManifest = {
	manifestVersion: '1.0.0',
	id: 'test-app',
	name: 'Test',
	tagline: 't',
	category: 'other',
	version: '1.0.0',
	port: 8080,
	description: 'd',
	website: 'https://example.com',
	support: 'https://example.com',
	gallery: [],
	requiresAiProvider: true,
}

/** Faithful replica of the T4 installForUser credential branch. */
async function installForUserCredentialBranch(
	composeData: any,
	userId: string,
	isGeneratedTemplate: boolean,
	broker: BrokerClient,
): Promise<void> {
	if (manifest.requiresAiProvider === true) {
		if (chooseCredentialPath({isGeneratedTemplate}) === 'metered-key') {
			const {virtualKey} = await mintMeteredKeyForApp(
				{appSlug: manifest.id, userId, budget: {maxUsd: 5}, modelAllowlist: undefined},
				broker,
			)
			injectAiProviderConfig(composeData, userId, manifest, {virtualKey})
		} else {
			injectAiProviderConfig(composeData, userId, manifest)
		}
	}
}

function freshCompose(): any {
	return {services: {server: {image: 'test/app:latest'}}}
}

test('VERIFIED (isGeneratedTemplate=true) → broker sentinel, byte-identical to before; broker NOT called', async () => {
	const createKey = vi.fn(async () => ({id: 'k', plaintext: 'lvb_x', prefix: 'lvb_x'}))
	const broker: BrokerClient = {createKey, deleteKey: vi.fn(async () => {})}
	const compose = freshCompose()

	await installForUserCredentialBranch(compose, 'user-1', true, broker)

	const env = compose.services.server.environment
	expect(env.ANTHROPIC_API_KEY).toBe(BROKER_SENTINEL_KEY)
	expect(env.OPENAI_API_KEY).toBe(BROKER_SENTINEL_KEY)
	expect(env.ANTHROPIC_BASE_URL).toBe('http://livinity-broker:8080/u/user-1')
	expect(compose.services.server.extra_hosts).toContain('livinity-broker:host-gateway')
	// The verified path never mints a metered key.
	expect(createKey).not.toHaveBeenCalled()
})

test('UNVERIFIED (isGeneratedTemplate=false) → metered virtualKey, NEVER the operator sentinel', async () => {
	const createKey = vi.fn(async () => ({id: 'k9', plaintext: 'lvb_realmeteredkey', prefix: 'lvb_realme'}))
	const broker: BrokerClient = {createKey, deleteKey: vi.fn(async () => {})}
	const compose = freshCompose()

	await installForUserCredentialBranch(compose, 'user-2', false, broker)

	const env = compose.services.server.environment
	// The minted per-app virtual key is injected...
	expect(env.ANTHROPIC_API_KEY).toBe('lvb_realmeteredkey')
	expect(env.OPENAI_API_KEY).toBe('lvb_realmeteredkey')
	// ...and the operator sentinel is ABSENT (the gap is closed fail-closed).
	const dumped = yaml.dump(compose)
	expect(dumped).not.toMatch(new RegExp(BROKER_SENTINEL_KEY))
	expect(createKey).toHaveBeenCalledTimes(1)
})
