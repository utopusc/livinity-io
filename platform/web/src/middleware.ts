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
  if (pathname === '/store' || pathname.startsWith('/store/')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/store', '/store/:path*'],
};
