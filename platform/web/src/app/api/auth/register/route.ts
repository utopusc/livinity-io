/**
 * POST /api/auth/register — Stage 1 of the email-verify-FIRST signup flow.
 *
 * The signup is three stages:
 *   1. (HERE) register → write a `pending_registrations` row + email a verify
 *      link. NO `public.users` row, NO Cloudflare tunnel, NO session yet.
 *   2. POST /api/auth/verify-email (link click) → create the `public.users` row
 *      (email_verified=TRUE) and log the user in.
 *   3. mirrorSubscription (on trial/paid subscribe) → provision the CF tunnel
 *      (lib/user-provisioning.ts).
 *
 * Rationale: we never create a user — or burn a Cloudflare tunnel — for an
 * unverified email. CF resources exist only for actual subscribers.
 *
 * This replaces the pre-existing flow (Phase 140-04) which INSERTed the user +
 * provisioned the tunnel immediately at register, before verification.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import pool from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

const TOKEN_EXPIRY_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    // Phase 274: signup no longer collects a username. The create page asks for
    // email + password (+ confirm-password, client-side). The user picks a
    // username in the /username step AFTER verifying their email, so the pending
    // row + the eventual users row are created username-less.
    const { email, password, plan } = await req.json();
    // Only 'free' is meaningful — it opts the signup into the free BYO-domain
    // tier (the "Choose Free" card on /pricing → /register?plan=free). Anything
    // else (undefined, 'pro', junk) is ignored → a normal signup, unchanged.
    const freeByod = plan === 'free';

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Email uniqueness against CONFIRMED users.
    const existingEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail],
    );
    if (existingEmail.rows.length > 0) {
      return NextResponse.json({ error: 'Email already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = nanoid(48);
    const verificationExpires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Upsert on lower(email): a re-register before verifying refreshes the
    // token + password (and the free-BYOD intent) instead of 409'ing a stale,
    // never-verified pending row. username is left NULL — chosen later in
    // /username. The free_byod column (migration 0027) carries the tier choice
    // to verify-email; if it isn't migrated yet (42703) we fall back to the
    // pre-feature INSERT so signup keeps working — the safe direction is a
    // normal (free_byod=false) account.
    try {
      await pool.query(
        `INSERT INTO pending_registrations
           (email, username, password_hash, verification_token, verification_expires, free_byod)
         VALUES ($1, NULL, $2, $3, $4, $5)
         ON CONFLICT (lower(email)) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           verification_token = EXCLUDED.verification_token,
           verification_expires = EXCLUDED.verification_expires,
           free_byod = EXCLUDED.free_byod,
           created_at = NOW()`,
        [normalizedEmail, passwordHash, verificationToken, verificationExpires, freeByod],
      );
    } catch (err) {
      if ((err as { code?: string })?.code !== '42703') throw err;
      await pool.query(
        `INSERT INTO pending_registrations
           (email, username, password_hash, verification_token, verification_expires)
         VALUES ($1, NULL, $2, $3, $4)
         ON CONFLICT (lower(email)) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           verification_token = EXCLUDED.verification_token,
           verification_expires = EXCLUDED.verification_expires,
           created_at = NOW()`,
        [normalizedEmail, passwordHash, verificationToken, verificationExpires],
      );
    }

    await sendVerificationEmail(normalizedEmail, verificationToken);

    // No user, no session — the client redirects to /verify ("check your email").
    return NextResponse.json({ pending: true }, { status: 201 });
  } catch (err) {
    console.error('[auth] Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
