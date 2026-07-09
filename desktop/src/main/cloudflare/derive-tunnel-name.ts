/**
 * src/main/cloudflare/derive-tunnel-name.ts
 *
 * Pure, deterministic Cloudflare tunnel-name derivation (CF-05 / D-14). The
 * name MUST be deterministic per account so a re-run of the wizard finds the
 * SAME tunnel by name and reuses it instead of creating a duplicate — that
 * convergence is the phase's idempotency guarantee (success criterion 5).
 *
 * Primary shape: `livos-<username>` (matches the box/platform convention shown
 * in UI-SPEC Screen 5, e.g. "livos-drampa"). The platform username is nullable
 * (schemas.ts MeResponseSchema), so a null/blank username falls back to the
 * sub-label; if that is empty too, a fixed `box` keeps the name legal.
 *
 * Zero imports from the electron module, the Node fs/net built-ins, or anything
 * with IO — plain input in, plain string out.
 */

// Lowercase + collapse any run of non-[a-z0-9-] chars into a single hyphen, then
// strip leading/trailing hyphens. Deterministic for a given input string.
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function deriveTunnelName(input: { username: string | null; subLabel: string }): string {
  const base =
    input.username && input.username.trim() ? slug(input.username) : slug(input.subLabel);
  return `livos-${base || 'box'}`;
}
