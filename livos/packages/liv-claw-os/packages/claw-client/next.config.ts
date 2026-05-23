import type { NextConfig } from "next";

// `output: "export"` produces a static bundle in `out/` that the openclaw
// plugin serves at /plugins/openclawos. basePath/assetPrefix make the emitted
// HTML reference assets under /plugins/openclawos/* so the plugin route resolves
// them. Set NEXT_OUTPUT=server to disable export (e.g. for `pnpm dev`).
const isStaticExport = process.env["NEXT_OUTPUT"] !== "server";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const, basePath: "/plugins/openclawos", assetPrefix: "/plugins/openclawos" } : {}),
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
