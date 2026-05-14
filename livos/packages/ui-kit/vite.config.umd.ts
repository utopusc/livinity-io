import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * UMD-only build (D-119-3-BUILD-TARGETS). ESM + CJS are produced by tsup
 * (see tsup.config.ts). This config is invoked separately via
 * `pnpm build:umd`.
 *
 * Output: dist/umd/livkit.umd.js exposing window.LivKit.
 * React is externalized — UMD consumers must load React UMD first
 * (matches dashboard.html which already loads React via CDN).
 */
export default defineConfig({
  plugins: [react()],
  // Inline NODE_ENV so the bundle doesn't reference `process.env.NODE_ENV` at
  // runtime — UMD ships into plain <script> consumers where `process` is
  // undefined and would throw `process is not defined`. Phase 119-04 verifier
  // catches this; without the inline, smoke pages fail to mount.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: false, // tsup already owns dist/index.* — don't wipe it
    outDir: "dist/umd",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LivKit",
      fileName: () => "livkit.umd.js",
      formats: ["umd"],
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
    minify: "esbuild",
  },
});
