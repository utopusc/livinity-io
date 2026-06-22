// Phase 292 — server-side raw-HTML sanitizer (Layer 1 of the three-layer XSS
// defense for admin-authored announcements). Runs at PUBLISH time in the Node
// runtime via isomorphic-dompurify (jsdom-backed), so a malicious payload is
// neutralized before it is ever stored or reaches the fleet. Layers 2 + 3
// (sandboxed iframe + client re-sanitize) live in the box UI (Plan 07).
//
// The box UI cannot import this module (separate package), so it copies the
// SAME allowlist — the canonical source is 292-RESEARCH.md. Keep the two in
// sync (see the allowlist-parity gate, Plan 09 / T-292-40).
import DOMPurify from 'isomorphic-dompurify';

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

let hookRegistered = false;
function ensureHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;
  // afterSanitizeAttributes: (a) force safe link behavior, (b) enforce an
  // http/https (+ data:image for media) URI-scheme allowlist on href/src/poster
  // so javascript:, vbscript:, file:, etc. are stripped. (DOMPurify wiki hook.)
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as Element;
    if (typeof el.getAttribute !== 'function') return;

    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    for (const attr of ['href', 'src', 'poster']) {
      const val = el.getAttribute(attr);
      if (val == null) continue;
      const v = val.trim();
      const lower = v.toLowerCase();
      const isHttp = lower.startsWith('http://') || lower.startsWith('https://');
      // data:image/* allowed only for media attributes (src/poster), never href.
      const isDataImage = lower.startsWith('data:image/');
      const ok = isHttp || (attr !== 'href' && isDataImage);
      if (!ok) el.removeAttribute(attr);
    }
  });
}

/**
 * Sanitize admin-authored raw HTML for an announcement. Strips scripts, event
 * handlers, dangerous tags, and non-http(s) URI schemes; forces noopener links.
 * Returns the sanitized HTML string (stored in announcements.raw_html_sanitized).
 */
export function sanitizeAnnouncementHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  ensureHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ANNOUNCEMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: ANNOUNCEMENT_ALLOWED_ATTR,
    FORBID_TAGS: ANNOUNCEMENT_FORBID_TAGS,
    FORBID_ATTR: ANNOUNCEMENT_FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
