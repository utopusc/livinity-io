import type {AppManifest} from './schema.js'

// Exported (Phase 341-02, D-341-2b) so the federated compose-safety gate
// (assertFederatedComposeSafe) rejects any federated compose that reaches the
// broker by hostname/sentinel, importing the SAME constant rather than
// hardcoding a duplicate that could drift from this real value.
export const BROKER_HOST = 'livinity-broker'
const BROKER_PORT = 8080
const HOST_GATEWAY_ENTRY = `${BROKER_HOST}:host-gateway`
// The verified-app broker sentinel injected into the *_API_KEY slots. Exported
// (341-02) for the same non-drift reason as BROKER_HOST.
export const BROKER_SENTINEL_KEY = 'livinity-broker-managed'

/**
 * Build the broker env block. `apiKey` is the value injected into the various
 * `*_API_KEY` slots:
 *   - the 'livinity-broker-managed' SENTINEL for VERIFIED apps (the broker
 *     authenticates them by source-IP + URL path), OR
 *   - a REAL per-app `lvb_…` virtual key for UNVERIFIED apps (256-02 SC4b), so
 *     the broker meters + budget-caps that key independently per app.
 */
function buildBrokerEnv(userId: string, apiKey: string = BROKER_SENTINEL_KEY): Record<string, string> {
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
		// Bolt.diy's "OpenAI-Like" provider env var (different name than the SDK
		// convention because Bolt.diy distinguishes "OpenAI proper" from
		// "OpenAI-compatible third-party endpoints" in its UI provider list).
		OPENAI_LIKE_API_BASE_URL: v1,
		// Anthropic SDK convention also under a frequently-used alternative name
		// (some clients read ANTHROPIC_API_KEY rather than relying on the SDK
		// default). For VERIFIED apps this is the sentinel (broker validates by
		// source IP + URL path); for UNVERIFIED apps it is a REAL per-app
		// `lvb_…` virtual key the broker meters + budget-caps (256-02 SC4b).
		ANTHROPIC_API_KEY: apiKey,
		// Many OpenAI-compat clients require a non-empty API key string even when
		// using a custom base URL (Open WebUI's OAuth UI rejects empty key field).
		// For verified apps the string is ignored (URL path + IP guard); for
		// unverified apps it is the real metered virtual key.
		OPENAI_API_KEY: apiKey,
		// Phase 58 (v29.5 post-deploy hot-fix): Bolt.diy's "OpenAI-Like" provider
		// looks up its API key under apiTokenKey: 'OPENAI_LIKE_API_KEY' (NOT the
		// generic OPENAI_API_KEY). When this var is empty, Bolt.diy's
		// getDynamicModels returns [] and the model picker dropdown stays empty.
		// Same value as the other key slots (sentinel or per-app metered key).
		// See: bolt.diy/app/lib/modules/llm/providers/openai-like.ts:32-39
		OPENAI_LIKE_API_KEY: apiKey,
		// v30.5 — OpenCode runtime config (used by Suna and any OpenCode-based agent
		// platform). OpenCode reads provider config from `~/.config/opencode/config.json`,
		// not from env vars directly. Apps that bundle OpenCode can read this JSON
		// string at boot to write that file, OR mount it as a file via
		// `printenv OPENCODE_CONFIG_JSON > ~/.config/opencode/config.json` in their
		// entrypoint. Schema: https://opencode.ai/config.json
		OPENCODE_CONFIG_JSON: JSON.stringify({
			$schema: 'https://opencode.ai/config.json',
			provider: {
				anthropic: {
					options: {
						baseURL: v1,
						apiKey,
					},
				},
			},
		}),
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
 * @param opts - optional. `opts.virtualKey` (256-02 SC4b): a REAL per-app
 *   `lvb_…` metered virtual key for an UNVERIFIED app — injected into the
 *   `*_API_KEY` slots so the broker meters + budget-caps it independently.
 *   When omitted (VERIFIED apps / OAuth path), the 'livinity-broker-managed'
 *   sentinel is used and behavior is UNCHANGED (regression-locked by SC7).
 * @returns the same composeData object (for chaining/test ergonomics)
 */
export function injectAiProviderConfig(
	composeData: any,
	userId: string,
	manifest: AppManifest,
	opts?: {virtualKey?: string},
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

	// Inject env vars (preserve existing keys; do not overwrite). A real per-app
	// virtual key (unverified app) replaces the sentinel in the *_API_KEY slots.
	const apiKey = opts?.virtualKey && opts.virtualKey.length > 0 ? opts.virtualKey : undefined
	const brokerEnv = buildBrokerEnv(userId, apiKey)
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
