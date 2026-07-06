// POST /api/user/delete — self-service account deletion.
//
// profile.html has shipped a "Delete account" modal POSTing { password } here
// since Phase 274 — but this route never existed (every attempt 404'd; July
// '26 forensics finding self-delete-endpoint-missing). This implements it on
// the SAME hardened teardown as the admin delete_user action
// (lib/user-deletion): Stripe cancel-all keyed on the customer, FAIL-CLOSED
// (no deletion if cancellation fails), best-effort CF teardown, transactional
// DB delete. Contract: { password } → { success: true }.
//
// Guards:
//   - password re-verification (a hijacked session alone must not be able to
//     destroy the account); OAuth-only accounts (password_hash NULL) cannot
//     use this route — clear error instead of a silent bypass.
//   - admins cannot self-delete (last-admin / loss-of-control protection —
//     mirrors the admin route's "cannot delete an admin" rule).
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, verifyPassword, SESSION_COOKIE_NAME } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin-actions';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { deleteUserAccount, StripeCancelFailedError, DeletionDbFailedError } from '@/lib/user-deletion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SelfDeleteRow {
  id: string;
  username: string | null;
  email: string | null;
  is_admin: boolean;
  password_hash: string | null;
  stripe_customer_id: string | null;
  cf_tunnel_id: string | null;
  cf_dns_record_id_apex: string | null;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let password = '';
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    /* fall through to the empty-password rejection */
  }
  if (!password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  // Brute-force guard: the password check below exists precisely to stop a
  // hijacked session from destroying the account — don't hand that attacker
  // an unthrottled password oracle. 5 attempts / 15 min per user.
  const rl = await rateLimit(`self-delete:${session.userId}`, 5, 900);
  if (!rl.allowed) return tooManyRequests(rl.retryAfter);

  const res = await pool.query<SelfDeleteRow>(
    `SELECT id, username, email, is_admin, password_hash,
            stripe_customer_id, cf_tunnel_id, cf_dns_record_id_apex
       FROM users WHERE id = $1 LIMIT 1`,
    [session.userId],
  );
  const user = res.rows[0];
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.is_admin) {
    return NextResponse.json(
      { error: 'Admin accounts cannot be self-deleted. Remove the admin role first.' },
      { status: 403 },
    );
  }

  // OAuth-only accounts have no password to verify — refusing is safer than
  // deleting on session alone. (Support can delete via the admin panel.)
  if (!user.password_hash) {
    return NextResponse.json(
      { error: 'This account signs in with Google/GitHub and has no password. Contact support to delete it.' },
      { status: 400 },
    );
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
  }

  try {
    const { canceledSubs } = await deleteUserAccount({
      id: user.id,
      username: user.username ?? '',
      stripe_customer_id: user.stripe_customer_id,
      cf_tunnel_id: user.cf_tunnel_id,
      cf_dns_record_id_apex: user.cf_dns_record_id_apex,
    });

    // Durable trace (admin_actions has no FK to users; best-effort, never throws).
    await logAdminAction({
      adminUserId: user.id,
      adminUsername: user.username ?? '(self)',
      targetUserId: user.id,
      targetUsername: user.username ?? '(self)',
      action: 'self_delete',
      detail: { email: user.email, had_tunnel: user.cf_tunnel_id !== null, canceled_subs: canceledSubs },
    });

    // The sessions row is already cascade-deleted with the user; clear the
    // cookie too so the browser doesn't keep presenting a dead token.
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (err) {
    if (err instanceof StripeCancelFailedError) {
      console.error('[user-delete] Stripe cancel failed — account NOT deleted:', err);
      return NextResponse.json(
        { error: "We couldn't cancel your subscription just now, so nothing was deleted. Try again in a minute." },
        { status: 502 },
      );
    }
    if (err instanceof DeletionDbFailedError) {
      // Subs are canceled but the account row survived — leave a durable
      // trace; a retry converges (cancel pass no-ops on canceled subs).
      console.error('[user-delete] PARTIAL — subs canceled, DB delete failed:', err);
      await logAdminAction({
        adminUserId: user.id,
        adminUsername: user.username ?? '(self)',
        targetUserId: user.id,
        targetUsername: user.username ?? '(self)',
        action: 'self_delete_partial',
        detail: { canceled_subs: err.canceledSubs, note: 'Stripe subs canceled but DB delete failed — retry' },
      });
      return NextResponse.json(
        { error: 'Your subscription was canceled but the delete did not finish — try again.' },
        { status: 500 },
      );
    }
    console.error('[user-delete] teardown failed:', err);
    return NextResponse.json({ error: 'Delete failed. Try again.' }, { status: 500 });
  }
}
