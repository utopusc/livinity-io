import type { NextConfig } from "next"
import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["geist"],
}

export default withMDX(nextConfig)
