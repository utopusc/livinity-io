import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'liv_session';

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  // CARRY-P212-LEGACY-ADMIN-UNIFY closed: all /api/admin/* routes now use
  // requireAdmin() which accepts session cookie OR x-api-key. Middleware
  // skips the gate when EITHER credential type is present and lets the
  // handler do the actual is_admin lookup.
  const hasApiKey = req.headers.has('x-api-key');

  // Admin API routes: 401 JSON only when NO credential is present at all.
  // Real is_admin enforcement happens inside the handler via requireAdmin().
  if (pathname.startsWith('/api/admin/')) {
    if (!hasSession && !hasApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  // Admin UI routes: redirect to /login without session cookie.
  // /login is rewritten by next.config to /auth.html.
  if (pathname.startsWith('/admin')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Phase 214: /store/* is admin-only. Soft gate at the Edge:
  // - no cookie → /login?next=/store/...
  // - cookie present → continue; client-side <StoreAdminGate /> finalizes
  //   the is_admin check and redirects non-admin to /dashboard.
  // UAT 252: the embedded LivOS App Store iframe loads /store?token=<api_key>
  // (cross-origin, no liv_session cookie) and authenticates each /api/apps call
  // with X-Api-Key. Phase 214's cookie gate broke that flow (307→/login). Let
  // token-bearing requests through to the token-authenticated store-provider;
  // the bare /store admin console stays cookie-gated.
  if (pathname === '/store' || pathname.startsWith('/store/')) {
    // The embedded LivOS App Store iframe loads /store?token=<api_key> (the
    // store-provider authenticates each /api/apps call with X-Api-Key). The token
    // rides ONLY in the URL — Next.js client-side navigation (clicking an app →
    // /store/<id>) DROPS the query param, so a bare /store/<id> hit had no token
    // and 307→/login→404 (operator "install çalışmıyor", post-Vercel migration).
    // Fix: on a token-bearing request, PERSIST the token as a cookie so every
    // subsequent navigation stays authed; accept that cookie in the gate too.
    const urlToken = req.nextUrl.searchParams.get('token');
    const STORE_TOKEN_COOKIE = 'liv_store_token';
    if (urlToken) {
      const res = NextResponse.next();
      // httpOnly:false so the client store-provider can read it back for the
      // X-Api-Key header after the URL param is gone. Scoped to /store.
      res.cookies.set(STORE_TOKEN_COOKIE, urlToken, {
        path: '/store',
        sameSite: 'lax',
        secure: true,
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
    if (req.cookies.has(STORE_TOKEN_COOKIE) || hasSession) {
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/store', '/store/:path*'],
};
