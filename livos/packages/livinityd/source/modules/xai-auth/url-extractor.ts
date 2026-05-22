/**
 * Phase 195 Plan 01 Task 1 — url-extractor.ts
 *
 * Pure helper that scans an arbitrary text buffer (typically captured stdout
 * from the `opencode auth login -p xai -m ...` child process) for the first
 * xAI OAuth URL and returns it, or null if no match.
 *
 * Host variants supported (verified live 2026-05-22 against opencode 1.15.7):
 *   - https://x.ai/oauth/...                (short host — legacy)
 *   - https://auth.x.ai/oauth/...           (canonical auth host)
 *   - https://auth.x.ai/oauth2/authorize... (SuperGrok PKCE redirect flow)
 *   - https://accounts.x.ai/oauth2/device?user_code=...  (Headless / Remote / VPS device code flow — LivOS default)
 *
 * Threat model T-195-01-XSS/Injection: the URL is consumed by `window.open()`
 * in the onboarding UI (195-04). We anchor strictly on the *.x.ai apex so a
 * compromised CLI cannot smuggle a third-party URL through this extractor.
 *
 * Trailing punctuation (`.,;)]`) is stripped defensively — `console.log("...go to URL.")`
 * shouldn't leak the period into the URL.
 */

// Permissive regex: scheme = https, host = any [a-z]+.x.ai subdomain (or bare x.ai),
// path starts with /oauth + optional digit segment (oauth, oauth2, oauth2/device),
// followed by either `/` or `?`. Body forbids whitespace and common shell quote chars.
const XAI_OAUTH_URL_RE = /(https:\/\/(?:[a-z]+\.)?x\.ai\/oauth\w*[/?][^\s'"`<>]+)/

/**
 * Extract the first xAI OAuth URL from a text buffer.
 *
 * Returns the matched URL (trailing punctuation trimmed) or `null` if no
 * xAI OAuth URL is present.
 */
export function extractXaiOAuthUrl(buf: string): string | null {
	if (!buf) return null
	const match = buf.match(XAI_OAUTH_URL_RE)
	if (!match) return null
	let url = match[1]
	// Trim defensive trailing punctuation that often follows URLs in CLI prose.
	while (url.length > 0 && /[.,;)\]]$/.test(url)) {
		url = url.slice(0, -1)
	}
	return url
}
