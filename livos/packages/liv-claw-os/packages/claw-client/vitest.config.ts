import { defineConfig } from "vitest/config";

export default defineConfig({
  // Phase 208-07 — override JSX from the Next.js `"jsx": "preserve"` tsconfig
  // default so vitest can transform `.test.tsx` + `.tsx` source files (e.g.
  // app-icon-renderer.tsx). Vitest 4.x uses oxc (not esbuild) for transforms;
  // setting `jsx.runtime: 'automatic'` injects the React factory implicitly
  // so neither tests nor sources need an explicit `import React from 'react'`.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    exclude: ["node_modules/**", "dist/**", ".next/**", ".wrangler/**", ".open-next/**"],
  },
});
