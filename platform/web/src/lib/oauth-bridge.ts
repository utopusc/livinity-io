/**
 * OAuth bridge — verify a Supabase GoTrue access token and map the verified
 * provider identity onto our custom `public.users` (Approach A).
 *
 * Supabase Auth is the OAuth broker only. The browser does the provider
 * round-trip; this module runs server-side and:
 *   1. verifySupabaseToken() — cryptographically verifies the GoTrue access
 *      token, then extracts (provider, subject, email, emailVerified).
 *   2. bridgeOAuthUser()     — find-or-create-or-link a users row.
 *
 * SECURITY MODEL
 * --------------
 * - This project's GoTrue is on ASYMMETRIC signing keys (ES256, exposed at
 *   `<url>/auth/v1/.well-known/jwks.json`), NOT the legacy HS256 shared secret.
 *   We verify via the JWKS endpoint (jose createRemoteJWKSet). We restrict the
 *   accepted algorithms to asymmetric ones so a forged HS256 token (which would
 *   only need a leaked symmetric secret) can never be accepted.
 * - issuer + audience are pinned. Expiry is enforced by jose.
 * - Anonymous GoTrue sessions are rejected.
 * - Account auto-link / create only happens when the token reports a
 *   provider-VERIFIED email (`user_metadata.email_verified === true`). Without
 *   this, an IdP that lets a user assert an unverified address could be used to
 *   take over an existing account (or squat a real person's email). Returning
 *   sign-ins (identity row already exists) are exempt — the identity row is the
 *   trust anchor and was only written after a verified first sign-in.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import pool from './db';
import { getSupabasePublicUrl } from './supabase-server';
import { createUser } from './user-creation';

// ---------------------------------------------------------------------------
// Typed errors — every failure the route surfaces to the user is one of these.
// The message is safe to show; the code lets the UI/route branch.
// ---------------------------------------------------------------------------
export type OAuthBridgeErrorCode =
  | 'invalid_token'
  | 'no_email'
  | 'email_unverified'
  | 'provider_untrusted'
  | 'create_failed';

export class OAuthBridgeError extends Error {
  code: OAuthBridgeErrorCode;
  constructor(code: OAuthBridgeErrorCode, message: string) {
    super(message);
    this.name = 'OAuthBridgeError';
    this.code = code;
  }
}

export interface OAuthIdentity {
  provider: string;
  subject: string;
  email?: string;
  emailVerified: boolean;
}

/**
 * Providers we trust to attest email OWNERSHIP — i.e. a verified-email flag from
 * them means the signer actually controls that mailbox. Google, Apple and GitHub
 * verify the address against the account holder.
 *
 * Azure/Entra is deliberately EXCLUDED: its `email`/`upn` claim is a mutable,
 * non-tenant-bound attribute (the "nOAuth" account-takeover class), so a
 * verified-email flag is NOT proof of ownership. Linking/creating by email from
 * such a provider would let an attacker who controls any Azure tenant assert a
 * victim's address and take over the account. Re-enabling Azure requires tenant
 * pinning (a `tid` allowlist) / `xms_edov` verification that this token-only
 * bridge cannot perform. The UI omits it too — this set is the defense-in-depth.
 */
const EMAIL_OWNERSHIP_TRUSTED_PROVIDERS = new Set(['google', 'apple', 'github']);

// ---------------------------------------------------------------------------
// Token verification (JWKS / ES256)
// ---------------------------------------------------------------------------

/** SUPABASE_URL without a trailing slash, so the issuer string is exact. */
function supabaseOrigin(): string {
  return getSupabasePublicUrl().replace(/\/+$/, '');
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`${supabaseOrigin()}/auth/v1/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

/**
 * Verifies a GoTrue access token and extracts the identity. Throws
 * OAuthBridgeError('invalid_token') on any signature / claim failure — callers
 * must never leak the underlying reason.
 */
export async function verifySupabaseToken(token: string): Promise<OAuthIdentity> {
  if (!token || typeof token !== 'string') {
    throw new OAuthBridgeError('invalid_token', 'Invalid sign-in token.');
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, getJwks(), {
      issuer: `${supabaseOrigin()}/auth/v1`,
      audience: 'authenticated',
      // Asymmetric only — never HS*, which closes the alg-confusion door.
      algorithms: ['ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512'],
    });
    payload = verified.payload;
  } catch {
    throw new OAuthBridgeError('invalid_token', 'Invalid or expired sign-in token.');
  }

  // Reject anonymous GoTrue sessions outright.
  if ((payload as Record<string, unknown>).is_anonymous === true) {
    throw new OAuthBridgeError('invalid_token', 'Anonymous sign-in is not allowed.');
  }

  const subject = typeof payload.sub === 'string' ? payload.sub : '';
  if (!subject) {
    throw new OAuthBridgeError('invalid_token', 'Sign-in token is missing a subject.');
  }

  const userMeta = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
  const appMeta = (payload.app_metadata as Record<string, unknown> | undefined) ?? {};

  const rawEmail = typeof payload.email === 'string' ? payload.email : undefined;
  const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
  const emailVerified = userMeta.email_verified === true;
  const provider =
    typeof appMeta.provider === 'string' && appMeta.provider ? appMeta.provider : 'oauth';

  return { provider, subject, email, emailVerified };
}

// ---------------------------------------------------------------------------
// Find-or-create-or-link
//
// Phase 274: OAuth no longer auto-generates a username. A brand-new OAuth user
// is created with username=NULL and the caller routes them to the /username
// step (same as the email/password flow). `needsUsername` tells the caller a
// user still has to pick one (true whenever the resolved user's username IS
// NULL — brand-new, or a returning user who hasn't picked yet).
// ---------------------------------------------------------------------------

async function linkIdentity(
  userId: string,
  provider: string,
  subject: string,
  email: string | undefined,
): Promise<void> {
  // ON CONFLICT keeps a concurrent first sign-in from erroring on the
  // UNIQUE(provider, provider_subject) constraint.
  await pool.query(
    `INSERT INTO user_oauth_identities (user_id, provider, provider_subject, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_subject) DO NOTHING`,
    [userId, provider, subject, email ?? null],
  );
}

/**
 * Maps a verified OAuth identity to a user id, creating or linking as needed.
 * Returns { userId, isNew, needsUsername }:
 *   - isNew=true means a brand-new account was just created.
 *   - needsUsername=true means the resolved user has no username yet (username
 *     IS NULL) and the caller must route them to /username before /pricing.
 */
export async function bridgeOAuthUser(
  idn: OAuthIdentity,
): Promise<{ userId: string; isNew: boolean; needsUsername: boolean }> {
  const { provider, subject } = idn;
  const email = idn.email?.toLowerCase().trim();

  // 1. Returning sign-in: the identity row is the trust anchor. Join users so we
  // can tell whether this returning user still needs to pick a username.
  const found = await pool.query<{ user_id: string; username: string | null }>(
    `SELECT i.user_id, u.username
       FROM user_oauth_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.provider_subject = $2 LIMIT 1`,
    [provider, subject],
  );
  if (found.rows.length > 0) {
    return {
      userId: found.rows[0].user_id,
      isNew: false,
      needsUsername: !found.rows[0].username,
    };
  }

  // SECURITY: first-time link/create only for providers that attest email
  // OWNERSHIP (see EMAIL_OWNERSHIP_TRUSTED_PROVIDERS). Blocks the nOAuth class.
  if (!EMAIL_OWNERSHIP_TRUSTED_PROVIDERS.has(provider)) {
    throw new OAuthBridgeError(
      'provider_untrusted',
      `Signing in with ${provider} isn't supported yet. Please use Google, Apple, or GitHub — or sign up with email + password.`,
    );
  }

  // First time we see this identity — we need a usable email to create/link.
  if (!email) {
    throw new OAuthBridgeError(
      'no_email',
      "Your provider didn't share an email address. Pick a provider that shares your email, or sign up with email + password.",
    );
  }

  // SECURITY: only proceed (link OR create) for a provider-VERIFIED email.
  if (!idn.emailVerified) {
    throw new OAuthBridgeError(
      'email_unverified',
      'Your provider has not verified this email address. Verify it with your provider, or sign up with email + password.',
    );
  }

  // 2. Existing account with this (verified) email → link the new provider.
  const existing = await pool.query<{ id: string; email_verified: boolean; username: string | null }>(
    'SELECT id, email_verified, username FROM users WHERE lower(email) = $1 LIMIT 1',
    [email],
  );
  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id;
    await linkIdentity(userId, provider, subject, email);
    if (!existing.rows[0].email_verified) {
      await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
    }
    return { userId, isNew: false, needsUsername: !existing.rows[0].username };
  }

  // 3. Brand-new user — created with username=NULL (Phase 274: the user picks a
  //    username in the /username step, never auto-generated). The only remaining
  //    race is a UNIQUE(email) violation (23505) from a concurrent create of the
  //    SAME email; there is no username to collide on. On that race, link to the
  //    winner instead of surfacing a 500.
  try {
    const userId = await createUser({ username: null, email, passwordHash: null, emailVerified: true });
    await linkIdentity(userId, provider, subject, email);
    return { userId, isNew: true, needsUsername: true };
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      const recheck = await pool.query<{ id: string; username: string | null }>(
        'SELECT id, username FROM users WHERE lower(email) = $1 LIMIT 1',
        [email],
      );
      if (recheck.rows.length > 0) {
        const existingId = recheck.rows[0].id;
        await linkIdentity(existingId, provider, subject, email);
        return { userId: existingId, isNew: false, needsUsername: !recheck.rows[0].username };
      }
    }
    throw new OAuthBridgeError(
      'create_failed',
      "We couldn't finish setting up your account just now. Please try signing in again.",
    );
  }
}
