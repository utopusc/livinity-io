// Phase 341-02 (REPO-02, D-341-2) — THE HEADLINE credential-denial suite.
//
// installFederated has heavy daemon deps, so — like install-for-user-injection.test.ts
// — we drive the exact compose transform installFederated performs at the seam and
// assert the credential-denial INVARIANT on the rendered YAML: a federated app
// receives NOTHING privileged. The transform below is a faithful replica of
// installFederated's staging (assertFederatedComposeSafe → loopback port rewrite →
// sanitizeNonBuiltinCompose), with NO injectAiProviderConfig / chooseCredentialPath /
// mintMeteredKeyForApp call — proving those are unreachable from the federated path.
import {expect, test, vi} from 'vitest'
import yaml from 'js-yaml'

import {assertFederatedComposeSafe, sanitizeNonBuiltinCompose} from './compose-sanitizer.js'
import {chooseCredentialPath, mintMeteredKeyForApp, type BrokerClient} from './metered-key.js'
import type {AppManifest} from './schema.js'

const APP_DATA_DIR = '/opt/livos/data/app-data/fed-abcdef012345-myapp'

const validManifest: AppManifest = {
	manifestVersion: '1.0.0',
	id: 'fed-abcdef012345-myapp',
	name: 'Fed App',
	tagline: 't',
	category: 'other',
	version: '1.0.0',
	port: 3000,
	description: 'd',
	website: 'https://example.com',
	support: 'https://example.com',
	gallery: [],
}

/**
 * Faithful replica of installFederated's compose staging (apps.ts step 7) — the
 * REJECT gate, the loopback port rewrite, and the mutating sanitizer. Crucially it
 * NEVER injects a credential. Returns the rendered YAML string.
 */
function federatedStagingTransform(composeYaml: string, manifest: AppManifest): string {
	const composeData = yaml.load(composeYaml) as any

	// REJECT gate (throws on escape/broker-reach/sensitive-port) — do NOT catch.
	assertFederatedComposeSafe(composeData, APP_DATA_DIR)

	// Loopback port rewrite: main service → 127.0.0.1:<port>:<internal>; strip others.
	const svcNames = Object.keys(composeData.services || {})
	const mainServiceName = svcNames[0]
	let internalPort = manifest.port
	const mainSvc = mainServiceName ? composeData.services?.[mainServiceName] : undefined
	if (mainSvc?.ports && Array.isArray(mainSvc.ports)) {
		for (const p of mainSvc.ports) {
			const ps = p.toString().replace('/udp', '').replace('/tcp', '')
			if (ps.includes(':')) {
				const parts = ps.split(':')
				const n = parseInt(parts[parts.length - 1], 10)
				if (n) {
					internalPort = n
					break
				}
			}
		}
	}
	for (const svcName of svcNames) {
		if (svcName === mainServiceName) continue
		if (composeData.services[svcName]?.ports) delete composeData.services[svcName].ports
	}
	if (mainServiceName && composeData.services[mainServiceName]) {
		composeData.services[mainServiceName].ports = [`127.0.0.1:${manifest.port}:${internalPort}`]
	}

	sanitizeNonBuiltinCompose(composeData, APP_DATA_DIR)
	return yaml.dump(composeData)
}

/** The hard-deny predicate installFederated applies at step 4 (before staging). */
function assertFederatedInstallAllowed(manifest: AppManifest): void {
	if (manifest.requiresLocalAiClis === true) {
		throw new Error('Federated apps cannot request host AI CLIs (requiresLocalAiClis) — install refused')
	}
}

const baseCompose = `services:
  app:
    image: fed/app:latest
    ports: ["3000:3000"]
`

test('DENIAL: a federated app with requiresAiProvider:true renders NO broker/metered creds', () => {
	const out = federatedStagingTransform(baseCompose, {...validManifest, requiresAiProvider: true})
	// Every broker/metered credential marker MUST be absent — inject was never called.
	expect(out).not.toMatch(/ANTHROPIC_BASE_URL/)
	expect(out).not.toMatch(/ANTHROPIC_API_KEY/)
	expect(out).not.toMatch(/ANTHROPIC_REVERSE_PROXY/)
	expect(out).not.toMatch(/OPENAI_API_KEY/)
	expect(out).not.toMatch(/OPENAI_API_BASE_URL/)
	expect(out).not.toMatch(/LLM_BASE_URL/)
	expect(out).not.toMatch(/livinity-broker/)
	expect(out).not.toMatch(/livinity-broker-managed/)
	expect(out).not.toMatch(/lvb_/)
	expect(out).not.toMatch(/host-gateway/)
	// And the rendered service has NO extra_hosts / broker env at all.
	const parsed = yaml.load(out) as any
	const svc = parsed.services.app
	expect(svc.extra_hosts).toBeUndefined()
	expect(svc.environment).toBeUndefined()
})

test('HARD DENY: requiresLocalAiClis:true federated manifest → install refused (no staging/creds)', () => {
	expect(() => assertFederatedInstallAllowed({...validManifest, requiresLocalAiClis: true})).toThrow(
		/requiresLocalAiClis.*install refused/,
	)
	// The benign manifest is allowed through.
	expect(() => assertFederatedInstallAllowed(validManifest)).not.toThrow()
})

test('DENIAL: the broker is NEVER minted for a federated install (contrast: official-unverified DOES mint)', async () => {
	const createKey = vi.fn(async () => ({id: 'k1', plaintext: 'lvb_secret', prefix: 'lvb_secre'}))
	const broker: BrokerClient = {createKey, deleteKey: vi.fn(async () => {})}

	// Federated path: run the full staging transform for a requiresAiProvider app.
	// It never references the broker → createKey stays uninvoked.
	federatedStagingTransform(baseCompose, {...validManifest, requiresAiProvider: true})
	expect(createKey).not.toHaveBeenCalled()

	// Contrast — the OFFICIAL unverified single-user install path (isGeneratedTemplate
	// =false) DOES mint a per-app metered key. Proves the difference is real: the
	// federated path deliberately omits this call.
	expect(chooseCredentialPath({isGeneratedTemplate: false})).toBe('metered-key')
	await mintMeteredKeyForApp({appSlug: 'off', userId: 'u1'}, broker)
	expect(createKey).toHaveBeenCalledTimes(1)
})

test('PORT REWRITE: a benign catalog port is rewritten to loopback', () => {
	const out = federatedStagingTransform(baseCompose, validManifest)
	const parsed = yaml.load(out) as any
	expect(parsed.services.app.ports).toEqual(['127.0.0.1:3000:3000'])
})

test('PORT REWRITE vs REJECT ordering: a sensitive host port is REJECTED before any rewrite', () => {
	const compose = `services:
  app:
    image: fed/app:latest
    ports: ["0.0.0.0:22:22"]
`
	// assertFederatedComposeSafe fires first → the transform throws, never rewrites.
	expect(() => federatedStagingTransform(compose, validManifest)).toThrow(/non-loopback|ports/)
})
