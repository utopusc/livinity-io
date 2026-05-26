/**
 * Tests for subdomain-parser.ts
 *
 * Phase 210 Bug A coverage — relay's parseSubdomain() must handle:
 *   1. Phase 140+ canonical hyphen format: `<app>-<user>.livinity.io`
 *   2. Legacy dot format: `<app>.<user>.livinity.io`
 *   3. Bare username (no app): `<user>.livinity.io`
 *   4. Invalid hosts (apex, mismatched base, empty, IPs)
 *
 * Before the fix, hyphen-format hosts returned `{ username: '<full-hyphenated>', appName: null }`
 * which never matched any tunnel registration → request fell through to
 * `serveOfflinePage(username)` rendering the offline page for the unknown user
 * (visually similar to the legitimate root page of the trailing user, hence
 * the operator-reported "opens bruce.livinity.io" symptom).
 */

import { describe, test, expect, vi } from 'vitest';

// Stub config so the parser sees a deterministic RELAY_HOST.
vi.mock('./config.js', () => ({
  config: { RELAY_HOST: 'livinity.io' },
}));

import { parseSubdomain } from './subdomain-parser.js';

describe('parseSubdomain — Phase 210 Bug A fix', () => {
  // ─── Case 1: canonical hyphen format (the bug that broke n8n-bruce) ─────────
  test('hyphen format → splits on last hyphen: n8n-bruce.livinity.io', () => {
    expect(parseSubdomain('n8n-bruce.livinity.io')).toEqual({
      username: 'bruce',
      appName: 'n8n',
    });
  });

  test('hyphen format with multi-hyphen app slug: code-server-alice.livinity.io', () => {
    expect(parseSubdomain('code-server-alice.livinity.io')).toEqual({
      username: 'alice',
      appName: 'code-server',
    });
  });

  test('hyphen format with port stripped: n8n-bruce.livinity.io:4000', () => {
    expect(parseSubdomain('n8n-bruce.livinity.io:4000')).toEqual({
      username: 'bruce',
      appName: 'n8n',
    });
  });

  test('hyphen format case-insensitive: N8N-Bruce.LIVINITY.IO → lowercased', () => {
    expect(parseSubdomain('N8N-Bruce.LIVINITY.IO')).toEqual({
      username: 'bruce',
      appName: 'n8n',
    });
  });

  // ─── Case 2: legacy dot format (backward-compat path) ────────────────────────
  test('dot format → appName.username: immich.alice.livinity.io', () => {
    expect(parseSubdomain('immich.alice.livinity.io')).toEqual({
      username: 'alice',
      appName: 'immich',
    });
  });

  // ─── Case 3: bare username (no app) ──────────────────────────────────────────
  test('bare username (no hyphen, no app): alice.livinity.io', () => {
    expect(parseSubdomain('alice.livinity.io')).toEqual({
      username: 'alice',
      appName: null,
    });
  });

  test('bare username with port: bruce.livinity.io:443', () => {
    expect(parseSubdomain('bruce.livinity.io:443')).toEqual({
      username: 'bruce',
      appName: null,
    });
  });

  // ─── Case 4: invalid inputs (apex, mismatch, undefined) ─────────────────────
  test('apex domain returns nulls: livinity.io', () => {
    expect(parseSubdomain('livinity.io')).toEqual({
      username: null,
      appName: null,
    });
  });

  test('undefined host returns nulls', () => {
    expect(parseSubdomain(undefined)).toEqual({
      username: null,
      appName: null,
    });
  });

  test('mismatched base domain returns nulls: alice.example.com', () => {
    expect(parseSubdomain('alice.example.com')).toEqual({
      username: null,
      appName: null,
    });
  });

  test('IP host returns nulls: 127.0.0.1', () => {
    expect(parseSubdomain('127.0.0.1:4000')).toEqual({
      username: null,
      appName: null,
    });
  });

  // ─── Defensive: hyphen at start or end (malformed) ──────────────────────────
  test('leading hyphen "-bruce.livinity.io" → bare username path (both halves required non-empty)', () => {
    // "-bruce" has lastDash=0 → candidateApp="" (empty) → falls back to bare username
    expect(parseSubdomain('-bruce.livinity.io')).toEqual({
      username: '-bruce',
      appName: null,
    });
  });

  test('trailing hyphen "n8n-.livinity.io" → bare username path (both halves required non-empty)', () => {
    // "n8n-" has lastDash=3 (length-1) → candidateUser="" (empty) → falls back to bare username
    expect(parseSubdomain('n8n-.livinity.io')).toEqual({
      username: 'n8n-',
      appName: null,
    });
  });
});
