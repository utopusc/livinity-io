import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'liv_session';

// Legacy admin routes that authenticate via `x-api-key` header (bcrypt-checked
// against the api_keys table). These keep working unchanged — middleware is a
// soft cookie-presence gate; real `is_admin=true` enforcement lives in
// requireAdmin() inside each new route handler.
const LEGACY_APIKEY_ADMIN_PREFIXES = [
  '/api/admin/apps',
  '/api/admin/devices',
  '/api/admin/icon-upload',
];

function isLegacyApiKeyPath(pathname: string): boolean {
  for (const prefix of LEGACY_APIKEY_ADMIN_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);

  // Legacy x-api-key paths bypass the cookie gate entirely.
  if (isLegacyApiKeyPath(pathname)) {
    return NextResponse.next();
  }

  // New admin API routes: 401 JSON without session cookie.
  // Real is_admin enforcement happens in requireAdmin() inside the handler.
  if (pathname.startsWith('/api/admin/')) {
    if (!hasSession) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
