/**
 * Subdomain Parser
 *
 * Extracts username and optional app name from the Host header.
 *
 * Examples (with RELAY_HOST = "livinity.io"):
 *   "alice.livinity.io"         -> { username: "alice",  appName: null }
 *   "n8n-alice.livinity.io"     -> { username: "alice",  appName: "n8n" }   (Phase 140+ hyphen format — canonical)
 *   "immich.alice.livinity.io"  -> { username: "alice",  appName: "immich" } (legacy dot format)
 *   "livinity.io"               -> { username: null,     appName: null }
 *   "127.0.0.1:4000"            -> { username: null,     appName: null }
 */

import { config } from './config.js';

export interface SubdomainInfo {
  username: string | null;
  appName: string | null;
}

export function parseSubdomain(host: string | undefined): SubdomainInfo {
  if (!host) return { username: null, appName: null };

  // Strip port if present (e.g., "alice.livinity.io:4000" -> "alice.livinity.io")
  const hostname = host.split(':')[0].toLowerCase();

  const baseDomain = config.RELAY_HOST.toLowerCase();

  // Must end with the base domain
  if (!hostname.endsWith(baseDomain)) {
    return { username: null, appName: null };
  }

  // Exact match — no subdomain
  if (hostname === baseDomain) {
    return { username: null, appName: null };
  }

  // Strip the base domain + leading dot to get subdomain parts
  // e.g., "immich.alice.livinity.io" -> "immich.alice"
  const subdomainPart = hostname.slice(0, -(baseDomain.length + 1));

  if (!subdomainPart) {
    return { username: null, appName: null };
  }

  const parts = subdomainPart.split('.');

  if (parts.length === 1) {
    // Phase 210 Bug A fix — canonical Phase 140+ format is `<app>-<username>`
    // (hyphen): e.g. `n8n-alice.livinity.io`. Before this fix, a hyphen-format
    // host was returned with `username='n8n-alice'`, which never matched any
    // tunnel user → fell through to `serveOfflinePage(username)` which renders
    // the offline page for the unknown user (often visually indistinguishable
    // from the legitimate root page of the suffix user).
    //
    // Heuristic: usernames are validated server-side to be hyphen-free
    // (RFC-compliant + UI guard at /register), so the LAST hyphen splits app
    // slug (left, may itself contain hyphens like `code-server`) from username
    // (right). If no hyphen, treat as bare username (legacy single-label case).
    if (parts[0].includes('-')) {
      const lastDash = parts[0].lastIndexOf('-');
      const candidateApp = parts[0].slice(0, lastDash);
      const candidateUser = parts[0].slice(lastDash + 1);
      // Defensive: both halves must be non-empty after split.
      if (candidateApp && candidateUser) {
        return { username: candidateUser, appName: candidateApp };
      }
    }
    // "alice.livinity.io" -> username=alice
    return { username: parts[0], appName: null };
  }

  if (parts.length === 2) {
    // Legacy dot format: "immich.alice.livinity.io" -> appName=immich, username=alice
    return { username: parts[1], appName: parts[0] };
  }

  // 3+ levels of subdomain — treat last as username, second-to-last as appName
  // Unlikely in practice, but handle gracefully
  return { username: parts[parts.length - 1], appName: parts[parts.length - 2] };
}
