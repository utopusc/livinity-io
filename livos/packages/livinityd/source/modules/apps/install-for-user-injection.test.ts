/**
 * Integration test for the per-user compose YAML transformation pipeline that
 * runs inside `installForUser` (apps.ts:852-991).
 *
 * Rather than mocking the full Apps class (which has many constructor
 * dependencies — DB, Redis, store, logger, native apps, etc.), this test
 * directly simulates the YAML transformation pipeline:
 *
 *   1. Read the compose template (mocked: returned as a string)
 *   2. Replace ${APP_DATA_DIR}, ${UMBREL_ROOT}, ${DEVICE_HOSTNAME}
 *   3. js-yaml.load → composeData object
 *   4. Per-service patches (container_name + volume remap) — apps.ts:933-958
 *   5. **injectAiProviderConfig(composeData, userId, manifest)** — Phase 43 (apps.ts:963)
 *   6. Host port mapping — apps.ts:961-964
 *   7. js-yaml.dump → YAML string
 *
 * The injection step is identical to the production code path because both
 * import the same `injectAiProviderConfig` function. This test validates that:
 *   (a) FR-MARKET-01 SC #1 — env vars present when flag is true
 *   (b) FR-MARKET-01 SC #2 — env vars absent when flag is false/omitted (Risk R6)
 *   (c) Risk R5 — userId is used VERBATIM in URL
 *
 * The full installForUser end-to-end (including database writes + container
 * spawn) is verified by Plan 43-05 manual UAT on Mini PC.
 */

import {expect, test} from 'vitest'
import yaml from 'js-yaml'

import {injectAiProviderConfig} from './inject-ai-provider.js'
import type {AppManifest} from './schema.js'

const baseTestComposeYaml = `version: "3.7"
services:
  server:
    image: test/app:latest
    restart: unless-stopped
`

/**
 * Simulates the per-user compose transformation pipeline from apps.ts:906-967.
 * Returns the dumped YAML as a string — same as what `installForUser` writes
 * to `${userDataDir}/docker-compose.yml`.
 */
function simulateInstallForUserPipeline({
	composeYamlInput,
	manifest,
	userId,
	username,
	port,
	internalPort,
	appId,
}: {
	composeYamlInput: string
	manifest: AppManifest
	userId: string
	username: string
	port: number
	internalPort: number
	appId: string
}): string {
	// Step 1+2: read + env replacement (apps.ts:906-909)
	const compose = composeYamlInput
		.replace(/\$\{APP_DATA_DIR\}/g, `/tmp/livos-test/users/${username}/app-data/${appId}`)
		.replace(/\$\{UMBREL_ROOT\}/g, '/tmp/livos-test')
		.replace(/\$\{DEVICE_HOSTNAME\}/g, 'test-host')

	// Step 3: parse YAML (apps.ts:910)
	const composeData = yaml.load(compose) as any

	// Step 4: per-service patches (apps.ts:933-958)
	for (const serviceName of Object.keys(composeData.services || {})) {
		const service = composeData.services[serviceName]
		service.container_name = `${appId}_${serviceName}_user_${username}_1`
		// Volume remapping omitted for test brevity (Phase 43 doesn't touch volumes)
	}

	// Step 5: Phase 43 injection (apps.ts:963)
	injectAiProviderConfig(composeData, userId, manifest)

	// Step 6: host port mapping (apps.ts:961-964)
	const mainServiceName = Object.keys(composeData.services || {})[0]
	if (mainServiceName && composeData.services[mainServiceName]) {
		const service = composeData.services[mainServiceName]
		service.ports = [`127.0.0.1:${port}:${internalPort}`]
	}

	// Step 7: dump (apps.ts:967)
	return yaml.dump(composeData)
}

const validBaseManifest: AppManifest = {
	manifestVersion: '1.0.0',
	id: 'test-app',
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

test('POSITIVE (FR-MARKET-01 SC #1): manifest with requiresAiProvider: true → compose has 3 env vars + extra_hosts', () => {
	const writtenYaml = simulateInstallForUserPipeline({
		composeYamlInput: baseTestComposeYaml,
		manifest: {...validBaseManifest, requiresAiProvider: true},
		userId: 'test-user-uuid',
		username: 'tester',
		port: 12345,
		internalPort: 8080,
		appId: 'test-app',
	})
	const parsed = yaml.load(writtenYaml) as any
	const mainService = Object.keys(parsed.services)[0]
	const env = parsed.services[mainService].environment

	expect(env.ANTHROPIC_BASE_URL).toBe('http://livinity-broker:8080/u/test-user-uuid')
	expect(env.ANTHROPIC_REVERSE_PROXY).toBe('http://livinity-broker:8080/u/test-user-uuid')
	expect(env.LLM_BASE_URL).toBe('http://livinity-broker:8080/u/test-user-uuid/v1')
	expect(parsed.services[mainService].extra_hosts).toContain('livinity-broker:host-gateway')
})

test('NEGATIVE (FR-MARKET-01 SC #2 / Risk R6): manifest WITHOUT flag → compose has no broker env vars', () => {
	const writtenYaml = simulateInstallForUserPipeline({
		composeYamlInput: baseTestComposeYaml,
		manifest: validBaseManifest, // requiresAiProvider absent
		userId: 'test-user-uuid',
		username: 'tester',
		port: 12345,
		internalPort: 8080,
		appId: 'test-app',
	})
	const parsed = yaml.load(writtenYaml) as any
	const mainService = Object.keys(parsed.services)[0]
	const env = parsed.services[mainService].environment || {}

	expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
	expect(env.ANTHROPIC_REVERSE_PROXY).toBeUndefined()
	expect(env.LLM_BASE_URL).toBeUndefined()

	const extraHosts = parsed.services[mainService].extra_hosts || []
	expect(extraHosts).not.toContain('livinity-broker:host-gateway')
})

test('USER_ID PROPAGATION (Risk R5): different userId → different URL (verbatim)', () => {
	const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
	const writtenYaml = simulateInstallForUserPipeline({
		composeYamlInput: baseTestComposeYaml,
		manifest: {...validBaseManifest, requiresAiProvider: true},
		userId,
		username: 'tester',
		port: 12345,
		internalPort: 8080,
		appId: 'test-app',
	})
	const parsed = yaml.load(writtenYaml) as any
	const mainService = Object.keys(parsed.services)[0]

	expect(parsed.services[mainService].environment.LLM_BASE_URL).toBe(
		`http://livinity-broker:8080/u/${userId}/v1`,
	)
})
