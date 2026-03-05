import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output for production deployment (self-contained server)
  output: 'standalone',

  // Turbopack root — needed for monorepo builds (pnpm workspace root)
  turbopack: {
    root: '../..',
  },

  // tRPC proxy to livinityd backend
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:80';
    return [
      {
        source: '/trpc/:path*',
        destination: `${backendUrl}/trpc/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },

  images: {
    unoptimized: true,
  },

  typescript: {
    // Backend (livinityd) has TS errors we can't fix; only our src/ matters
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
