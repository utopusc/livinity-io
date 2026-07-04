/**
 * Shared user-creation helper — the single source of truth for promoting a
 * verified identity into a `public.users` row.
 *
 * Two callers create users today and they MUST do it identically:
 *   1. /api/auth/verify-email  — email-verify-FIRST signup (password account).
 *   2. /api/auth/oauth/bridge  — OAuth sign-in (password_hash NULL).
 *
 * Both create a row with email_verified=TRUE and NOTHING else: no Stripe
 * customer, no CF tunnel, no has_used_trial, no welcome email — those happen
 * later at checkout / on subscribe. Keeping this in one place kills the drift
 * that an inline INSERT in each route would create.
 *
 * `executor` lets the caller run the INSERT inside an existing transaction
 * (verify-email inserts the user and deletes the pending row atomically) or,
 * by default, against the shared pool (the OAuth bridge has no surrounding tx).
 */
import type { Pool, PoolClient } from 'pg';
import pool from './db';

export interface CreateUserParams {
  /**
   * Already validated + normalized (lowercase, format-checked, unique), OR null.
   * Phase 274: signup no longer collects a username — both the email-verify and
   * OAuth flows create the row with username=NULL and the user picks one in the
   * /username step afterward. The UNIQUE index on users.username permits multiple
   * NULLs, so many username-less rows can coexist.
   */
  username: string | null;
  /** Already normalized (lowercased, trimmed). */
  email: string;
  /** bcrypt hash for password accounts, or NULL for OAuth-only accounts. */
  passwordHash: string | null;
  /** TRUE for both flows (email-verified link / provider-verified OAuth). */
  emailVerified: boolean;
  /**
   * TRUE only for the free bring-your-own-domain tier (signup via
   * /register?plan=free). Defaults to FALSE, so every normal (paid/OAuth) signup
   * lands free_byod=false — identical to the pre-feature behavior. The column
   * exists as of migration 0026; this INSERT assumes it is applied.
   */
  freeByod?: boolean;
}

/**
 * Inserts a user row and returns its id. Throws on UNIQUE violation (23505) so
 * the caller can map the race to a friendly message — behavior identical to the
 * previous inline INSERT in verify-email.
 */
export async function createUser(
  params: CreateUserParams,
  executor: Pool | PoolClient = pool,
): Promise<string> {
  const result = await executor.query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash, email_verified, free_byod)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.username, params.email, params.passwordHash, params.emailVerified, params.freeByod ?? false],
  );
  return result.rows[0].id;
}
