/**
 * Subdomain Parser
 *
 * Extracts username and optional app name from the Host header.
 *
 * Examples (with RELAY_HOST = "livinity.io"):
 *   "alice.livinity.io"         -> { username: "alice",  appName: null }
 *   "immich.alice.livinity.io"  -> { username: "alice",  appName: "immich" }
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
    // "alice.livinity.io" -> username=alice
    return { username: parts[0], appName: null };
  }

  if (parts.length === 2) {
    // "immich.alice.livinity.io" -> appName=immich, username=alice
    return { username: parts[1], appName: parts[0] };
  }

  // 3+ levels of subdomain — treat last as username, second-to-last as appName
  // Unlikely in practice, but handle gracefully
  return { username: parts[parts.length - 1], appName: parts[parts.length - 2] };
}
