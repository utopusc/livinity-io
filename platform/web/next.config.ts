import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Allow cross-origin requests to API routes from any *.livinity.io subdomain
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Api-Key, Authorization' },
        ],
      },
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
        { source: '/profile', destination: '/profile.html' },
        { source: '/verify', destination: '/verify.html' },
        { source: '/forgot-password', destination: '/forgot-password.html' },
        { source: '/download', destination: '/download.html' },
        { source: '/customize', destination: '/customize.html' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
