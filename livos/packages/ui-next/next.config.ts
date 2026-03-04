import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // React Compiler disabled until babel-plugin-react-compiler is installed
  // reactCompiler: true,

  // tRPC proxy to livinityd backend (only works in dev/server mode, not export)
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
    return [
      {
        source: '/trpc/:path*',
        destination: `${backendUrl}/trpc/:path*`,
      },
    ];
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
