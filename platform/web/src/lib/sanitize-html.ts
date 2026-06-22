// Phase 292 — server-side raw-HTML sanitizer (Layer 1 of the three-layer XSS
// defense for admin-authored announcements). Runs at PUBLISH time in the Node
// runtime so a malicious payload is neutralized before it is ever stored or
// reaches the fleet. Layers 2 + 3 (sandboxed iframe + client re-sanitize) live
// in the box UI (Plan 07).
//
// Phase 293 fix: this used `isomorphic-dompurify` (jsdom-backed), which CRASHES
// AT IMPORT in the Vercel production (Turbopack) serverless bundle — that broke
// the ENTIRE /api/admin/announcements route module (GET + POST both 500'd with a
// framework error, not the route's own JSON). Replaced with `sanitize-html`, a
// pure-JS (htmlparser2) sanitizer with NO jsdom dependency, so it loads + runs
// cleanly in serverless. The strict allowlist below is UNCHANGED (the box UI
// copies the SAME ANNOUNCEMENT_ALLOWED_TAGS — allowlist-parity gate, Plan 09).
import sanitizeHtmlLib from 'sanitize-html';

export const ANNOUNCEMENT_ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'strong', 'em', 'u', 'span', 'div', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'video', 'source', 'figure',
  'figcaption', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
];
export const ANNOUNCEMENT_ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
  'controls', 'poster', 'target', 'rel', 'colspan', 'rowspan',
];
export const ANNOUNCEMENT_FORBID_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link', 'meta',
];
export const ANNOUNCEMENT_FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover'];

/**
 * Sanitize admin-authored raw HTML for an announcement. Strips scripts, event
 * handlers, dangerous tags, and non-http(s) URI schemes; forces noopener links.
 * Returns the sanitized HTML string (stored in announcements.raw_html_sanitized).
 *
 * Security notes vs. the prior DOMPurify config:
 *  - `allowedTags` is a strict allowlist → every FORBID tag (script/iframe/
 *    object/embed/form/input/button/style/link/meta) is discarded, and the
 *    content of script/style is dropped (sanitize-html `nonTextTags` default).
 *  - Any attribute not in `allowedAttributes` is removed → on* event handlers
 *    (onerror/onload/onclick/…) are stripped.
 *  - URL schemes are restricted to http/https on href/src/cite/poster, with
 *    data: allowed ONLY on media tags (img/video/source) for inline images.
 *  - `<a>` is forced to target=_blank rel="noopener noreferrer".
 */
export function sanitizeAnnouncementHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  return sanitizeHtmlLib(html, {
    allowedTags: ANNOUNCEMENT_ALLOWED_TAGS,
    allowedAttributes: { '*': ANNOUNCEMENT_ALLOWED_ATTR },
    // Restrict URI schemes: http/https everywhere; data: only on media tags.
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      video: ['http', 'https', 'data'],
      source: ['http', 'https', 'data'],
    },
    // Default omits `poster`; add it so a poster="javascript:…" is stripped too.
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'poster'],
    disallowedTagsMode: 'discard',
    transformTags: {
      // Force safe link behavior (merge=true keeps any existing attrs).
      a: sanitizeHtmlLib.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true),
    },
  });
}
