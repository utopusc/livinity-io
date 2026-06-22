/**
 * Phase 292 — [BLOCKING] sandboxed raw-HTML renderer (DEC-04 Layers 2 & 3).
 *
 * Admin-authored raw HTML is the dominant XSS threat in this phase: it renders
 * in EVERY user's desktop. This component is the blast-radius wall.
 *
 *  Layer 2 — the iframe sandbox OMITS the script-execution flag (and the
 *            same-origin flag): even if a DOMPurify bypass slips a <script>
 *            through, srcdoc JS cannot execute and cannot touch the parent
 *            document's origin. A CSP <meta> inside the srcdoc further forbids
 *            script/connect/frame and bounds img/media to https:/data:.
 *  Layer 3 — DOMPurify.sanitize is run AGAIN here, client-side, with the same
 *            strict allowlist the publish route used (Plan 02). Never trust that
 *            the stored HTML stayed sanitized.
 *
 * The component NEVER injects untrusted HTML into the desktop document (no
 * inline innerHTML render) — untrusted HTML only ever reaches the DOM via the
 * iframe `srcDoc`, isolated from the parent origin.
 */
import DOMPurify from 'dompurify'

import type {ResolvedTheme} from '@/providers/theme-provider'

/**
 * Exact sandbox token list — LOCKED by announcement-iframe.unit.test.tsx.
 * NO script-execution flag (the wall) and NO same-origin flag. `allow-popups`(+
 * escape) only so a user-clicked link can open a real tab.
 */
export const ANNOUNCEMENT_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox'

// Strict allowlist — MUST stay identical to the server list in
// platform/web/src/lib/sanitize-html.ts (allowlist-parity gate, Plan 09 / T-292-40).
// Canonical source: 292-RESEARCH.md.
export const ANNOUNCEMENT_ALLOWED_TAGS = [
	'p', 'br', 'b', 'i', 'strong', 'em', 'u', 'span', 'div', 'a', 'ul', 'ol', 'li',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'video', 'source', 'figure',
	'figcaption', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
]
export const ANNOUNCEMENT_ALLOWED_ATTR = [
	'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
	'controls', 'poster', 'target', 'rel', 'colspan', 'rowspan',
]
export const ANNOUNCEMENT_FORBID_TAGS = [
	'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link', 'meta',
]
export const ANNOUNCEMENT_FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover']

let hookRegistered = false
function ensureHook(): void {
	if (hookRegistered) return
	hookRegistered = true
	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		const el = node as Element
		if (typeof el.getAttribute !== 'function') return
		if (el.tagName === 'A') {
			el.setAttribute('target', '_blank')
			el.setAttribute('rel', 'noopener noreferrer')
		}
		for (const attr of ['href', 'src', 'poster']) {
			const val = el.getAttribute(attr)
			if (val == null) continue
			const lower = val.trim().toLowerCase()
			const isHttp = lower.startsWith('http://') || lower.startsWith('https://')
			const isDataImage = lower.startsWith('data:image/')
			const ok = isHttp || (attr !== 'href' && isDataImage)
			if (!ok) el.removeAttribute(attr)
		}
	})
}

export function sanitizeAnnouncementHtml(html: string): string {
	if (typeof html !== 'string' || html.length === 0) return ''
	ensureHook()
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: ANNOUNCEMENT_ALLOWED_TAGS,
		ALLOWED_ATTR: ANNOUNCEMENT_ALLOWED_ATTR,
		FORBID_TAGS: ANNOUNCEMENT_FORBID_TAGS,
		FORBID_ATTR: ANNOUNCEMENT_FORBID_ATTR,
		ALLOW_DATA_ATTR: false,
	})
}

// Theme palettes injected into the iframe document (a separate document that
// does NOT inherit body.dark / body.iridescent). Hex here is permitted — it
// lives ONLY inside the iframe <style> theme block, never the desktop DOM.
const THEME_STYLES: Record<ResolvedTheme, {fg: string; heading: string; link: string}> = {
	light: {fg: '#1f2937', heading: '#111827', link: '#2563eb'},
	dark: {fg: '#e5e7eb', heading: '#f9fafb', link: '#60a5fa'},
	iridescent: {fg: '#e8eafc', heading: '#ffffff', link: '#a5b4fc'},
}

function buildSrcDoc(clean: string, theme: ResolvedTheme): string {
	const p = THEME_STYLES[theme] ?? THEME_STYLES.light
	// CSP forbids script/connect/frame and bounds img/media — no beacon can fire.
	return `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; frame-src 'none'; connect-src 'none';">
<style>
  :root { color-scheme: ${theme === 'light' ? 'light' : 'dark'}; }
  html, body { margin: 0; padding: 0; }
  body { padding: 4px 2px; background: transparent; color: ${p.fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
    font-size: 14px; line-height: 1.55; word-wrap: break-word; }
  a { color: ${p.link}; text-decoration: underline; }
  h1, h2, h3, h4, h5, h6 { color: ${p.heading}; line-height: 1.25; margin: 0.6em 0 0.3em; }
  p { margin: 0.5em 0; }
  img, video { max-width: 100%; height: auto; border-radius: 8px; }
  ul, ol { padding-left: 1.3em; }
  blockquote { margin: 0.5em 0; padding-left: 0.8em; border-left: 3px solid ${p.link}; opacity: 0.9; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid ${p.fg}33; padding: 4px 8px; }
</style>
</head><body>${clean}</body></html>`
}

export default function AnnouncementIframe({
	html,
	theme,
}: {
	html: string
	theme: ResolvedTheme
}) {
	// Layer 3: re-sanitize client-side even though Plan 02 sanitized at publish.
	const clean = sanitizeAnnouncementHtml(html)
	const srcDoc = buildSrcDoc(clean, theme)
	return (
		<iframe
			sandbox={ANNOUNCEMENT_SANDBOX}
			srcDoc={srcDoc}
			title="Announcement content"
			className="h-full w-full border-0 bg-transparent"
		/>
	)
}
