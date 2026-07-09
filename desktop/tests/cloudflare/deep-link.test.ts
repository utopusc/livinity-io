import { describe, it, expect } from 'vitest';
import {
  buildTokenDeepLink,
  buildAddSiteDeepLink,
  CF_TOKEN_SCOPES,
} from '../../src/main/cloudflare/deep-link';

describe('buildTokenDeepLink', () => {
  const url = buildTokenDeepLink();

  it('starts with the CF user-owned token-form base', () => {
    expect(url.startsWith('https://dash.cloudflare.com/profile/api-tokens?')).toBe(true);
  });

  it('carries the verified accountId / zoneId / name params verbatim', () => {
    expect(url).toContain('accountId=%2A');
    expect(url).toContain('zoneId=all');
    expect(url).toContain('name=Livinity%20Desktop');
  });

  it('carries a url-encoded permissionGroupKeys param', () => {
    expect(url).toContain('permissionGroupKeys=');
    // The JSON must be url-encoded, not raw (no literal [ or { in the URL).
    expect(url).not.toContain('permissionGroupKeys=[');
  });

  it('decodes permissionGroupKeys to exactly the 3 least-privilege scopes in order', () => {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get('permissionGroupKeys');
    expect(raw).not.toBeNull();
    // URLSearchParams.get already url-decodes; JSON.parse yields the array.
    expect(JSON.parse(raw as string)).toEqual([
      { key: 'argo_tunnel', type: 'edit' },
      { key: 'dns', type: 'edit' },
      { key: 'zone', type: 'read' },
    ]);
  });

  it('exposes exactly 3 frozen scope entries (T-03-03: no 4th scope)', () => {
    expect(CF_TOKEN_SCOPES).toHaveLength(3);
    expect(CF_TOKEN_SCOPES.map((s) => s.key)).toEqual(['argo_tunnel', 'dns', 'zone']);
  });

  it('is deterministic (same output on repeat calls)', () => {
    expect(buildTokenDeepLink()).toBe(buildTokenDeepLink());
  });
});

describe('buildAddSiteDeepLink', () => {
  it('returns the CF add-site deep-link opened in the system browser (D-11)', () => {
    expect(buildAddSiteDeepLink()).toBe('https://dash.cloudflare.com/?to=/:account/add-site');
  });
});
