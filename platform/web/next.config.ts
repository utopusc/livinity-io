import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // HSTS for the platform host. Deliberately NO includeSubDomains:
        // user boxes live on *.livinity.io and must not inherit policy.
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=15552000' },
        ],
      },
      {
        // CORS for API routes. NOTE: this is a WILDCARD (Access-Control-Allow-Origin: *),
        // NOT scoped to *.livinity.io — any origin may *call* these routes. It carries no
        // Access-Control-Allow-Credentials, so cookie-authed responses can never be read
        // cross-origin. Session-minting auth routes (e.g. /api/auth/oauth/bridge) add their
        // own same-origin (Sec-Fetch-Site) guard on top of this.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Api-Key, Authorization' },
        ],
      },
    ];
  },
  // SEO: canonicalize the host and the raw .html duplicates of the marketing
  // pages. Redirects run before rewrites, so these only match external
  // requests — the internal rewrite of /pricing → /pricing.html is untouched.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.livinity.io' }],
        destination: 'https://livinity.io/:path*',
        permanent: true,
      },
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/pricing.html', destination: '/pricing', permanent: true },
      { source: '/download.html', destination: '/download', permanent: true },
      // The landing terminal mock (and quoted copies of it) say
      // `curl -fsSL https://livinity.io/install | bash` — make that URL real.
      // curl -L follows the 308 to the install.sh route handler.
      { source: '/install', destination: '/install.sh', permanent: true },
    ];
  },
  // Phase 146: serve the canonical landing HTML for user-facing pages, mirroring
  // the Server5 Caddyfile static-path routing. The Next.js page files for these
  // routes (login/page.tsx, dashboard/page.tsx, etc.) become dead code post-cutover
  // but are kept for now to keep this commit minimal.
  // beforeFiles runs BEFORE filesystem routing so the rewrite intercepts even if
  // a matching app/* page exists.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/index.html' },
        { source: '/dashboard', destination: '/dashboard.html' },
        { source: '/dashboard/install', destination: '/dashboard-install.html' },
        { source: '/pricing', destination: '/pricing.html' },
        { source: '/login', destination: '/auth.html' },
        { source: '/register', destination: '/auth.html' },
        { source: '/username', destination: '/username.html' },
        { source: '/auth/callback', destination: '/oauth-callback.html' },
        { source: '/profile', destination: '/profile.html' },
        { source: '/verify', destination: '/verify.html' },
        { source: '/forgot-password', destination: '/forgot-password.html' },
        { source: '/reset-password', destination: '/reset-password.html' },
        { source: '/download', destination: '/download.html' },
        { source: '/customize', destination: '/customize.html' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
