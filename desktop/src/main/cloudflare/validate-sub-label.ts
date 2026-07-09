/**
 * src/main/cloudflare/validate-sub-label.ts
 *
 * Pure single-DNS-label validator (CF-03 / D-07). The sub-label the user types
 * becomes part of a DNS hostname (`<sub>.<zone>`) that is sent to the Cloudflare
 * API — so this function is the SSRF / host-injection gate (T-03-06): it hard-
 * rejects dots and any character outside a single DNS label BEFORE the value can
 * form a hostname in a CF API path. The SAME pure function runs renderer-side for
 * the live preview and main-side (03-05) as the authoritative gate.
 *
 * Discriminated verdict so the renderer can show scope-specific copy: a 'dots'
 * verdict maps to "Use one word — letters, numbers or hyphens, no dots.",
 * 'empty' to "Give your box a name.", etc.
 *
 * Zero imports from the electron module, the Node fs/net built-ins, or anything
 * with IO — plain string in, plain verdict out.
 */

export type SubLabelVerdict =
  | { ok: true }
  | { ok: false; error: 'empty' | 'dots' | 'charset' | 'length' };

// Single DNS label: lowercase alphanumeric + inner hyphens, 1-63 chars,
// no leading/trailing hyphen, no dots (dots are rejected earlier for a
// specific error). Precedent: cf-saas.ts CF_SUBDOMAIN_PART_RE (a 2+ char rule);
// here we allow a single char and cap at the DNS label max of 63.
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateSubLabel(raw: string): SubLabelVerdict {
  const v = raw.trim();
  if (v.length === 0) return { ok: false, error: 'empty' };
  if (v.includes('.')) return { ok: false, error: 'dots' }; // check dots BEFORE the regex so the copy is specific
  if (v.length > 63) return { ok: false, error: 'length' };
  if (!LABEL_RE.test(v)) return { ok: false, error: 'charset' };
  return { ok: true };
}
