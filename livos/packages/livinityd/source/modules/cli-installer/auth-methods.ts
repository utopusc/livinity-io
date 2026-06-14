// Phase 267-01 Task 1 — per-CLI auth-method classification matrix.
//
// THE CONTRACT THE UI BRANCHES ON. Every name in SUPPORTED_CLIS (the D-239-07
// whitelist, 20 names) gets an explicit `branch`:
//
//   'apikey'  — the UI shows a paste field; the server writes the key to the
//               CLI's own config/env file (api-key-writer.ts). NO spawn.
//   'device'  — the UI triggers `cliInstaller.auth(name)` (auth.ts), which
//               spawns the per-CLI login; the device verification URL + user
//               code are streamed live (DEVICE_CODE_RE parse below) so the UI
//               can render them WHILE the login keeps polling.
//   'browser' — the CLI opens a localhost OAuth flow in a real browser; the
//               UI falls back to an apikey paste (apiKeyEnv) when headless.
//   'paste-back' (Phase 268) — the CLI prints a login URL, the user authorizes
//               in a browser, then PASTES a code BACK into the CLI's stdin — the
//               login blocks until stdin receives it. The UI shows the URL
//               ('open link') AND a paste field; the field reveals only when the
//               login is blocked on a stdin prompt (orthogonal capability — see
//               268-RESEARCH §A note; the live-child registry + sendAuthInput in
//               auth.ts are the stdin write-back seam).
//   'n/a'     — not auth-able (e.g. aion-cli is AionUi's embedded Rust backend,
//               not a standalone CLI — no install/auth path exists).
//
// Sourced verbatim from 267-RESEARCH.md "Per-CLI auth matrix". The eager
// assertion at the bottom drift-locks Object.keys(CLI_AUTH_METHODS).length
// against SUPPORTED_CLIS.length so a new CLI can never be added to the
// whitelist without an explicit auth classification.
//
// SECURITY: this module is pure data + one regex pair. It NEVER spawns, writes,
// or logs. The RCE boundary lives in api-key-writer.ts (writeApiKey) and
// auth.ts (authCli) — both re-assert SUPPORTED_CLIS_SET membership first.

import {SUPPORTED_CLIS} from './install-scripts.js'
import type {CliName} from './types.js'

/** UI-branch discriminant — the one thing the auth dialog switches on. */
export type AuthBranch = 'apikey' | 'device' | 'browser' | 'paste-back' | 'n/a'

/**
 * Per-CLI auth classification.
 *   - `branch`     — which UI flow to render (see module header).
 *   - `apiKeyEnv`  — the env-var name the key maps to (for apikey/browser-
 *                    fallback branches). Mirrors the api-key-writer.ts write
 *                    target's env key; informational for the UI label.
 *   - `loginArgv`  — the canonical login command (device/browser branches).
 *                    Mirrors CLI_AUTH_COMMANDS in auth.ts (the value actually
 *                    spawned); duplicated here so the UI can show "what runs"
 *                    without importing the spawn module.
 */
export interface AuthMethod {
	branch: AuthBranch
	apiKeyEnv?: string
	loginArgv?: readonly [string, readonly string[]]
}

/**
 * THE matrix. 20 keys, one per SUPPORTED_CLIS name (drift-locked below).
 *
 * Classification rationale (267-RESEARCH "Per-CLI auth matrix"):
 *   - claude-code: apikey (ANTHROPIC_API_KEY) primary; bare `claude` login is
 *     the paste-back secondary (268 — `setup-token`'s localhost callback fails
 *     headless, the bare login prompts `Paste code here if prompted`).
 *   - gemini: apikey (Google-OAuth headless is unstable → paste GEMINI_API_KEY).
 *   - opencode: apikey (write auth.json); Copilot/ChatGPT device is secondary.
 *   - openclaw: apikey (ANTHROPIC_API_KEY…); `openclaw onboard` device secondary.
 *   - aion-cli: n/a (AionUi embedded Rust backend — no standalone CLI).
 *   - codex: apikey (OPENAI_API_KEY); `codex login --device-auth` secondary.
 *   - qwen-code: apikey (DASHSCOPE_API_KEY — OAuth discontinued 2026-04).
 *   - augment: browser (`auggie login` localhost OAuth) → apikey fallback.
 *   - github-copilot: device (`copilot login` prints code+URL, polls).
 *   - codebuddy: apikey (CODEBUDDY_API_KEY — no login command).
 *   - qoder-cli: device (bare TUI login — obscure, probe at runtime).
 *   - goose: apikey (write ~/.config/goose/secrets.yaml provider block).
 *   - factory-droid: apikey (FACTORY_API_KEY).
 *   - cursor-agent: apikey (CURSOR_API_KEY — browser login has no device flow).
 *   - kimi-cli: device (`kimi login` prints URL+code to stderr, polls).
 *   - mistral-vibe: apikey (write MISTRAL_API_KEY to ~/.vibe/.env).
 *   - hermes-agent: apikey (write ~/.hermes/.env); `hermes setup --portal`
 *     device secondary (loginArgv kept).
 *   - nanobot: apikey (provider env / ~/.nanobot/config.json).
 *   - snow-cli: apikey (obscure — authed via setApiKey, not a login spawn).
 *   - kiro: device (`kiro-cli login` Builder ID/Google/GitHub) or apikey(Pro).
 */
export const CLI_AUTH_METHODS: Readonly<Record<CliName, AuthMethod>> = {
	'claude-code': {
		branch: 'apikey',
		apiKeyEnv: 'ANTHROPIC_API_KEY',
		// 268 — bare `claude` first-launch login is the paste-back secondary.
		// `setup-token`'s localhost callback fails headless; the bare login prints
		// a URL + prompts `Paste code here if prompted` in SSH/container/headless.
		loginArgv: ['claude', []],
	},
	opencode: {branch: 'apikey', apiKeyEnv: 'OPENAI_API_KEY'},
	gemini: {branch: 'apikey', apiKeyEnv: 'GEMINI_API_KEY'},
	openclaw: {
		branch: 'apikey',
		apiKeyEnv: 'ANTHROPIC_API_KEY',
		loginArgv: ['openclaw', ['onboard']],
	},
	'aion-cli': {branch: 'n/a'},
	// Wave A
	codex: {
		branch: 'apikey',
		apiKeyEnv: 'OPENAI_API_KEY',
		loginArgv: ['codex', ['login', '--device-auth']],
	},
	'qwen-code': {branch: 'apikey', apiKeyEnv: 'DASHSCOPE_API_KEY'},
	augment: {
		branch: 'browser',
		apiKeyEnv: 'AUGMENT_API_TOKEN',
		loginArgv: ['auggie', ['login']],
	},
	'github-copilot': {
		branch: 'device',
		apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
		loginArgv: ['copilot', []],
	},
	codebuddy: {branch: 'apikey', apiKeyEnv: 'CODEBUDDY_API_KEY'},
	'qoder-cli': {branch: 'device', loginArgv: ['qodercli', []]},
	// Wave B
	goose: {branch: 'apikey', apiKeyEnv: 'ANTHROPIC_API_KEY'},
	'factory-droid': {branch: 'apikey', apiKeyEnv: 'FACTORY_API_KEY'},
	'cursor-agent': {branch: 'apikey', apiKeyEnv: 'CURSOR_API_KEY'},
	// Wave C
	'kimi-cli': {branch: 'device', loginArgv: ['kimi', ['login']]},
	'mistral-vibe': {branch: 'apikey', apiKeyEnv: 'MISTRAL_API_KEY'},
	'hermes-agent': {
		branch: 'apikey',
		apiKeyEnv: 'OPENROUTER_API_KEY',
		loginArgv: ['hermes', ['setup', '--portal']],
	},
	nanobot: {branch: 'apikey', apiKeyEnv: 'ANTHROPIC_API_KEY'},
	'snow-cli': {branch: 'apikey', apiKeyEnv: 'SNOW_API_KEY'},
	kiro: {branch: 'device', loginArgv: ['kiro-cli', ['login']]},
}

/**
 * Device-code transcript parser. A device-flow login prints, early in its
 * stdout/stderr, a verification URL plus a short human-typed code, e.g.:
 *
 *   Visit https://github.com/login/device and enter code ABCD-1234
 *   To sign in, use https://kimi.com/device — code: WXYZ9
 *
 * `DEVICE_CODE_RE.url` captures the first https(s) URL; `DEVICE_CODE_RE.code`
 * captures a short uppercase/digit code (optionally one hyphen group, e.g.
 * ABCD-1234). The auth.ts streaming handler runs each chunk through BOTH and,
 * the FIRST time both match, surfaces {url, code} live (Redis pub/sub + the
 * onChunk DI seam) so the UI can render them while the login keeps polling.
 *
 * NOTE the payload is server-parsed from the CLI's OWN stdout (not user input)
 * — the UI must still require an explicit user click before navigating (267-02).
 */
export const DEVICE_CODE_RE = {
	url: /(https?:\/\/[^\s'"]+)/,
	code: /\b([A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?)\b/,
} as const

// Eager drift-lock: a new CLI can never enter the whitelist without an explicit
// auth classification here (and vice-versa). Mirrors the SUPPORTED_CLIS_SET
// size assertion convention in install-scripts.ts.
const AUTH_METHOD_KEY_COUNT = Object.keys(CLI_AUTH_METHODS).length
if (AUTH_METHOD_KEY_COUNT !== SUPPORTED_CLIS.length) {
	throw new Error(
		`CLI_AUTH_METHODS drift: ${AUTH_METHOD_KEY_COUNT} keys vs ${SUPPORTED_CLIS.length} SUPPORTED_CLIS — every CLI must have an explicit auth-method classification`,
	)
}
