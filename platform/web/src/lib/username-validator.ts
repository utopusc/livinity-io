/**
 * Username Validator — Phase 140-02
 *
 * Strict, async username validation for the livinity.io SaaS register flow.
 * The username doubles as the user's apex subdomain (`{username}.livinity.io`)
 * AND as the suffix on every per-app subdomain (`{app}-{username}.livinity.io`),
 * so any collision with an app slug or a system-reserved name would break URL
 * routing. This module is the single chokepoint that enforces all four checks
 * in a stable order:
 *
 *   1. FORMAT             — pure regex, no I/O
 *   2. RESERVED           — static blacklist, no I/O
 *   3. APP_COLLISION      — SELECT slug FROM apps WHERE slug = $1
 *   4. TAKEN              — SELECT 1 FROM users WHERE username = $1
 *   5. RESERVED_PERMANENT — SELECT 1 FROM reserved_usernames WHERE username = $1
 *                           (Phase 274: permanently claimed usernames are blocked
 *                           forever for everyone, even after account deletion)
 *
 * The function short-circuits on the first failure so the cheaper checks run
 * before the DB hits. Input is trimmed + lowercased once and that normalized
 * form is what every downstream check (and the success payload) sees.
 *
 * DB access deliberately uses two different patterns to match the rest of
 * platform/web: the `apps` table is in `src/db/schema.ts` and queried via the
 * drizzle helper from `./drizzle`. The `users` table is owned by
 * `platform/relay/src/schema.sql` (NOT drizzle-managed — see schema.ts:35-41
 * comment) and queried via raw SQL through the `pool` export in `./db`, the
 * same pattern `auth.ts` and the register route use.
 *
 * Pure library: no HTTP routes, no side effects beyond the two SELECTs.
 * Consumers (140-04 register handler, install wizard live availability check
 * endpoint) call `validateUsername(input)` and treat the discriminated union
 * result as the source of truth.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { eq } from 'drizzle-orm';

import { apps } from '@/db/schema';
import pool from './db';
import { db } from './drizzle';

// ---------------------------------------------------------------------------
// Types (public)
// ---------------------------------------------------------------------------

export type ValidationErrorCode =
  | 'FORMAT'
  | 'RESERVED'
  | 'APP_COLLISION'
  | 'TAKEN'
  | 'RESERVED_PERMANENT';

export type ValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string; code: ValidationErrorCode };

// ---------------------------------------------------------------------------
// Static rules
// ---------------------------------------------------------------------------

/**
 * 3-32 lowercase alphanumerics — NO hyphens (L-066, Phase 263-04).
 *
 * A hyphen in the username makes the `{app_slug}-{username}.livinity.io`
 * per-app subdomain namespace AMBIGUOUS: user `jean-luc` provisioning app
 * `radarr` and user `luc` provisioning app slug `radarr-jean` BOTH resolve to
 * `radarr-jean-luc.livinity.io` — same hostname, two owners → cross-tenant
 * CNAME-squat / subdomain hijack. Forbidding the hyphen in usernames makes the
 * namespace unambiguous by construction (exactly one valid owner per hostname).
 * App slugs may still legitimately contain a hyphen (`radarr-jean`); only the
 * username half is hyphen-free.
 *
 * The 3-32 length bound is still enforced explicitly via MIN_LEN / MAX_LEN
 * below (and is now also encoded in the regex). The `--` includes check at the
 * call site is redundant once hyphens are banned outright but is left in place
 * (harmless).
 */
const FORMAT = /^[a-z0-9]{3,32}$/;
const MIN_LEN = 3;
const MAX_LEN = 32;

/**
 * Reserved system names that would shadow infra hostnames, brand routes, or
 * landing-page paths if a user grabbed them. List is intentionally a superset
 * of the older `RESERVED_USERNAMES` in lib/auth.ts (which we leave alone —
 * Phase 140-04 will swap the register handler over to this module).
 */
const RESERVED = new Set<string>([
  // DNS / mail / infra
  'api', 'www', 'mail', 'smtp', 'pop', 'imap', 'ns', 'ns1', 'ns2', 'mx', 'dns',
  'ftp', 'ssh', 'vpn', 'tunnel', 'gateway', 'proxy', 'cdn', 'static', 'assets',
  // System / admin
  'admin', 'root', 'system', 'support', 'help', 'docs', 'blog', 'status',
  'health', 'monitor', 'statuspage', 'internal',
  // Platform / brand
  'livinity', 'livos', 'liv', 'livinityd', 'store', 'apps', 'app', 'marketplace',
  'dashboard', 'login', 'signup', 'register', 'logout', 'get', 'install', 'download',
  // Environments
  'dev', 'staging', 'prod', 'test', 'demo', 'sandbox', 'beta', 'alpha', 'preview',
  // Legal / corporate
  'about', 'contact', 'privacy', 'terms', 'legal', 'careers', 'jobs', 'press',
]);

// ---------------------------------------------------------------------------
// Error message factories (kept centralized so consumers/UI can pattern-match
// either by code or by message and the wording stays consistent everywhere).
// ---------------------------------------------------------------------------

const FORMAT_ERR =
  'Username must be 3-32 lowercase letters or digits — no hyphens, no spaces, no special characters.';

const reservedErr = (normalized: string): string =>
  `"${normalized}" is reserved. Please pick a different name.`;

const appCollisionErr = (normalized: string): string =>
  `"${normalized}" is the name of an installed app — pick a different username to avoid URL conflicts.`;

const takenErr = (normalized: string): string =>
  `"${normalized}" is already taken.`;

// Phase 274: a username that was ever permanently claimed (subscription went
// trialing/active) is reserved forever — blocked for EVERYONE, including the
// original owner, even after the account is deleted. Message is deliberately
// generic (don't leak whether the slot was deleted vs abuser-seeded).
const reservedPermanentErr = (normalized: string): string =>
  `"${normalized}" is no longer available. Please pick a different name.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a candidate username for the SaaS register flow.
 *
 * Input is trimmed and lowercased once before any check runs; the normalized
 * form is what every check sees and what the success payload returns. Checks
 * run in cheapest-first order and short-circuit on first failure:
 *
 *   FORMAT → RESERVED → APP_COLLISION (DB) → TAKEN (DB)
 *
 * Errors:
 *   - FORMAT        : input fails regex or contains `--`
 *   - RESERVED      : input is in the static blacklist
 *   - APP_COLLISION : input equals an existing row in `apps.slug`
 *   - TAKEN         : input equals an existing row in `users.username`
 *
 * On success returns `{ ok: true, normalized }`. The caller is responsible for
 * using `normalized` in the subsequent INSERT — never the raw input — so the
 * uniqueness guarantee actually holds against the DB UNIQUE constraint.
 */
export async function validateUsername(input: string): Promise<ValidationResult> {
  // Treat null/undefined defensively even though TypeScript says it can't
  // happen; the function is reachable from API route handlers parsing JSON.
  if (typeof input !== 'string') {
    return { ok: false, error: FORMAT_ERR, code: 'FORMAT' };
  }

  const normalized = input.trim().toLowerCase();

  // FORMAT — length bound first (regex permits length 1 via the optional
  // group), then explicit `--` check (clearer than relying on regex alone),
  // then the regex itself.
  if (normalized.length < MIN_LEN || normalized.length > MAX_LEN) {
    return { ok: false, error: FORMAT_ERR, code: 'FORMAT' };
  }
  if (normalized.includes('--') || !FORMAT.test(normalized)) {
    return { ok: false, error: FORMAT_ERR, code: 'FORMAT' };
  }

  // RESERVED — static set, O(1).
  if (RESERVED.has(normalized)) {
    return { ok: false, error: reservedErr(normalized), code: 'RESERVED' };
  }

  // APP_COLLISION — drizzle SELECT on `apps.slug`. We only need to know
  // whether any row exists; limit 1 is implicit since `slug` is UNIQUE.
  const appRows = await db
    .select({ slug: apps.slug })
    .from(apps)
    .where(eq(apps.slug, normalized))
    .limit(1);

  if (appRows.length > 0) {
    return {
      ok: false,
      error: appCollisionErr(normalized),
      code: 'APP_COLLISION',
    };
  }

  // TAKEN — raw SQL through `pool` because the `users` table is managed by
  // platform/relay/src/schema.sql, not drizzle (see db/schema.ts:35-41).
  // Mirror the existing pattern from auth.ts / register/route.ts.
  const takenRes = await pool.query<{ exists: number }>(
    'SELECT 1 AS exists FROM users WHERE username = $1 LIMIT 1',
    [normalized],
  );

  if (takenRes.rows.length > 0) {
    return { ok: false, error: takenErr(normalized), code: 'TAKEN' };
  }

  // RESERVED_PERMANENT (Phase 274) — raw SQL through `pool`. A username that was
  // ever permanently claimed is in reserved_usernames forever, even if no live
  // `users` row currently holds it (the prior owner was deleted). This is the
  // structural fix for the delete→recreate username-reuse abuse loop.
  const reservedRes = await pool.query<{ exists: number }>(
    'SELECT 1 AS exists FROM reserved_usernames WHERE username = $1 LIMIT 1',
    [normalized],
  );

  if (reservedRes.rows.length > 0) {
    return {
      ok: false,
      error: reservedPermanentErr(normalized),
      code: 'RESERVED_PERMANENT',
    };
  }

  return { ok: true, normalized };
}
