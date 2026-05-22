/**
 * Phase 195 Plan 01 Task 1 — url-extractor.ts
 *
 * Pure helper that scans an arbitrary text buffer (typically captured stdout
 * from the `opencode auth login -p xai -m ...` child process) for the first
 * xAI OAuth URL and returns it, or null if no match.
 *
 * Two host variants are supported:
 *   - https://x.ai/oauth/...        (short host)
 *   - https://auth.x.ai/oauth/...   (canonical auth host)
 *
 * Threat model T-195-01-XSS/Injection: the URL is consumed by `window.open()`
 * in the onboarding UI (195-04). We anchor strictly on the xAI hosts so a
 * compromised CLI cannot smuggle a third-party URL through this extractor.
 *
 * Trailing punctuation (`.,;)]`) is stripped defensively — `console.log("...go to URL.")`
 * shouldn't leak the period into the URL.
 */

// Strict regex: scheme = https, host = x.ai OR auth.x.ai, path starts with /oauth
// followed by either `/` or `?`. Body forbids whitespace and common shell quote chars.
const XAI_OAUTH_URL_RE = /(https:\/\/(?:x\.ai|auth\.x\.ai)\/oauth[/?][^\s'"`<>]+)/

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
