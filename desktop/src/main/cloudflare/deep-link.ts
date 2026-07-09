/**
 * src/main/cloudflare/deep-link.ts
 *
 * Pure builders for the two Cloudflare-dashboard deep-links the wizard opens
 * in the SYSTEM BROWSER via shell.openExternal (D-01 token form, D-11 add-site)
 * — NEVER a child BrowserWindow. Plain-in / plain-out, no arguments, so the
 * emitted URL is a frozen contract a unit test can assert byte-for-byte.
 *
 * The token-form URL is the VERIFIED user-owned template format
 * (03-RESEARCH "The deep-link", Code Example 1):
 *   https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=<enc>&accountId=%2A&zoneId=all&name=Livinity%20Desktop
 *
 * This module has zero dependencies — it does not touch the electron module,
 * the Node fs/net built-ins, or anything with side effects.
 */

// The 3 least-privilege scopes, frozen `as const` (T-03-03: exactly 3, no 4th).
//
// Keys are a CANDIDATE — VERIFIED/patched at plan 03-10 via
// GET /user/tokens/permission_groups. The always-visible 3-scope checklist
// card (D-02) is the load-bearing fallback regardless: a template URL only
// pre-fills the form, so verification (decideScopeVerdict) is the real gate.
export const CF_TOKEN_SCOPES = [
  { key: 'argo_tunnel', type: 'edit' }, // Account · Cloudflare Tunnel · Edit
  { key: 'dns', type: 'edit' }, //         Zone · DNS · Edit
  { key: 'zone', type: 'read' }, //        Zone · Zone · Read
] as const;

export function buildTokenDeepLink(): string {
  const keys = encodeURIComponent(JSON.stringify(CF_TOKEN_SCOPES));
  return (
    `https://dash.cloudflare.com/profile/api-tokens` +
    `?permissionGroupKeys=${keys}&accountId=%2A&zoneId=all&name=Livinity%20Desktop`
  );
}

export function buildAddSiteDeepLink(): string {
  return `https://dash.cloudflare.com/?to=/:account/add-site`;
}
