/**
 * POST /api/auth/oauth/bridge — exchange a verified Supabase GoTrue access
 * token for a `liv_session` cookie (Approach A OAuth bridge).
 *
 * The browser performs the provider round-trip via Supabase Auth and lands on
 * /auth/callback, which materializes the GoTrue session and POSTs its
 * access_token here. We verify it (JWKS / ES256), map the verified identity to
 * a `public.users` row (find-or-create-or-link), mint our own session, and set
 * the httpOnly `liv_session` cookie. The browser then drops the GoTrue session
 * — the app authorizes only off `liv_session`.
 *
 * All failures return a typed 4xx with a user-safe message; the underlying
 * reason is never leaked.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth';
import {
  verifySupabaseToken,
  bridgeOAuthUser,
  OAuthBridgeError,
} from '@/lib/oauth-bridge';

export async function POST(req: NextRequest) {
  try {
    // Defense-in-depth login-CSRF guard: this endpoint mints a 30-day session
    // cookie and is only ever called same-origin from /auth/callback. Browsers
    // tag cross-site/same-site requests via Sec-Fetch-Site; reject those. (The
    // cookie is already SameSite=Lax, which blocks the cross-site cookie plant —
    // this makes the intent explicit and survives a future SameSite change.)
    const fetchSite = req.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      return NextResponse.json(
        { error: 'Cross-origin sign-in is not allowed.', code: 'bad_origin' },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = (body as { supabaseAccessToken?: unknown }).supabaseAccessToken;
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Missing sign-in token.', code: 'invalid_token' },
        { status: 400 },
      );
    }

    let identity;
    try {
      identity = await verifySupabaseToken(token);
    } catch (err) {
      if (err instanceof OAuthBridgeError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
      }
      throw err;
    }

    let result;
    try {
      result = await bridgeOAuthUser(identity);
    } catch (err) {
      if (err instanceof OAuthBridgeError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }

    const sessionToken = await createSession(
      result.userId,
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      req.headers.get('user-agent') ?? undefined,
    );

    const response = NextResponse.json({ ok: true, isNew: result.isNew });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (err) {
    console.error('[auth] OAuth bridge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
