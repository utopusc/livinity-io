/**
 * Phase 227-01 — LivAssistantWindow iframe shell.
 *
 * Mounts the AionUi-backed Liv Assistant surface as a same-origin iframe.
 * The Liv Assistant binary listens on the Mini PC at 127.0.0.1:3020 and is
 * proxied through Caddy at https://bruce.livinity.io/liv/ (Phase 226-04
 * SHIPPED — caddy.ts LIV_ASSISTANT_HANDLE constant emits the reverse-proxy
 * block on every regen, strips X-Frame-Options, and sets CSP
 * `frame-ancestors 'self' https://bruce.livinity.io` so this very iframe
 * mount is permitted).
 *
 * Why a RELATIVE default src ('/liv/' not 'https://bruce.livinity.io/liv/'):
 *  - The LivOS shell is served from the same host that proxies /liv. Using
 *    a relative path means the component "just works" on every deployment
 *    shape (apex `bruce.livinity.io`, multi-user subdomains
 *    `<user>.livinity.io`, the null-mainDomain dev fallback) without
 *    knowing the host at build time.
 *  - The env override `VITE_LIV_ASSISTANT_URL` exists for the rare case
 *    where the operator wants to point the shell at a different deployment
 *    (e.g. staging) — set it in `livos/packages/ui/.env.local` (Vite picks
 *    it up at build time).
 *
 * Sandbox rationale (operator-facing; do NOT loosen further):
 *  - allow-same-origin — REQUIRED so AionUi's session cookies + auth token
 *    flow on subsequent requests. `/liv/` is on the same eTLD+1 as the
 *    shell, so the cookie is naturally readable.
 *  - allow-scripts — AionUi is a React SPA; it needs JS.
 *  - allow-forms — login screen + chat input both submit forms.
 *  - allow-popups — Claude OAuth flow (Phase 228) may open a popup window.
 *  - allow-downloads — exporting chat threads to .md / .json downloads a file.
 *  - NOT allowed: allow-top-navigation (prevents the iframe from yanking
 *    the operator out of LivOS), allow-modals (no native alert/prompt
 *    escapes), allow-pointer-lock, allow-presentation, allow-orientation-lock.
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — this
 * file is UI-only and imports nothing from `liv/packages/core/*`.
 */

/** Default URL — relative path so it resolves through the same host the shell is served on. */
export const LIV_ASSISTANT_DEFAULT_URL = '/liv/'

/** Exact sandbox token list (locked by test). Order + spacing matter. */
export const LIV_ASSISTANT_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads'

/**
 * Resolved at module load. Vite inlines `import.meta.env.*` at build time;
 * empty string → fall back to default. Keep this a top-level const (not a
 * hook) so the test can assert it deterministically by file read.
 */
const LIV_ASSISTANT_URL: string =
	(typeof import.meta !== 'undefined' && (import.meta as {env?: Record<string, string | undefined>}).env?.VITE_LIV_ASSISTANT_URL) ||
	LIV_ASSISTANT_DEFAULT_URL

export default function LivAssistantWindow() {
	return (
		<iframe
			src={LIV_ASSISTANT_URL}
			title='Liv Assistant'
			data-testid='liv-assistant-iframe'
			className='h-full w-full border-0 bg-background'
			sandbox={LIV_ASSISTANT_SANDBOX}
			allow='clipboard-read; clipboard-write'
		/>
	)
}
