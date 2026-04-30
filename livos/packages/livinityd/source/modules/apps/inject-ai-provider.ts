import type {AppManifest} from './schema.js'

const BROKER_HOST = 'livinity-broker'
const BROKER_PORT = 8080
const HOST_GATEWAY_ENTRY = `${BROKER_HOST}:host-gateway`

function buildBrokerEnv(userId: string): Record<string, string> {
	const base = `http://${BROKER_HOST}:${BROKER_PORT}/u/${userId}`
	const v1 = `${base}/v1`
	return {
		// Anthropic SDK convention
		ANTHROPIC_BASE_URL: base,
		// LibreChat / older Anthropic-aware tools
		ANTHROPIC_REVERSE_PROXY: base,
		// Generic OpenAI-compat / LangChain / many marketplace agents (must point at /v1)
		LLM_BASE_URL: v1,
		// OpenAI SDK convention (Open WebUI, MiroFish, CrewAI, LangChain, OpenAI Python SDK)
		OPENAI_API_BASE_URL: v1,
		// Many OpenAI-compat clients require a non-empty API key string even when
		// using a custom base URL (Open WebUI's OAuth UI rejects empty key field).
		// The string is ignored by the broker; auth is enforced by URL path + IP guard.
		OPENAI_API_KEY: 'livinity-broker-managed',
	}
}

/**
 * Mutates `composeData` (parsed docker-compose YAML object) to inject the
 * Livinity AI broker configuration when `manifest.requiresAiProvider === true`.
 *
 * No-op when the flag is absent or false. Idempotent: existing env keys are
 * preserved (not overwritten); extra_hosts entries are appended only if absent.
 * Only the FIRST service (matches apps.ts mainServiceName convention) is mutated.
 *
 * @param composeData - js-yaml-parsed docker-compose object (mutated in place)
 * @param userId - LivOS user UUID (used verbatim in broker URL path)
 * @param manifest - the app manifest (read for `requiresAiProvider` flag)
 * @returns the same composeData object (for chaining/test ergonomics)
 */
export function injectAiProviderConfig(
	composeData: any,
	userId: string,
	manifest: AppManifest,
): any {
	if (manifest.requiresAiProvider !== true) {
		return composeData
	}

	const services = composeData?.services
	if (!services || typeof services !== 'object') {
		return composeData
	}

	const mainServiceName = Object.keys(services)[0]
	if (!mainServiceName) {
		return composeData
	}

	const service = services[mainServiceName]
	if (!service || typeof service !== 'object') {
		return composeData
	}

	// Inject env vars (preserve existing keys; do not overwrite)
	const brokerEnv = buildBrokerEnv(userId)
	if (!service.environment || typeof service.environment !== 'object') {
		service.environment = {}
	}
	for (const [key, value] of Object.entries(brokerEnv)) {
		if (!(key in service.environment)) {
			service.environment[key] = value
		}
	}

	// Append extra_hosts (deduplicate)
	if (!Array.isArray(service.extra_hosts)) {
		service.extra_hosts = []
	}
	if (!service.extra_hosts.includes(HOST_GATEWAY_ENTRY)) {
		service.extra_hosts.push(HOST_GATEWAY_ENTRY)
	}

	return composeData
}
