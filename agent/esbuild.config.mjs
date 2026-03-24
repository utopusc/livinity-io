import { build } from 'esbuild';
import { cpSync, existsSync } from 'node:fs';

// Plugin to handle native/external modules for SEA compatibility.
// In SEA mode, `require('systray2')` etc. must resolve from the binary's directory,
// not from the embedded module resolver. We bundle most of systray2 but mark
// the actual require calls for native modules to use a path-based resolver.
const seaExternalsPlugin = {
  name: 'sea-externals',
  setup(build) {
    // systray2 depends on fs-extra — let esbuild bundle it
    // But systray2's own module needs special handling because it uses __dirname
    // to find the tray binary. We'll let esbuild bundle it normally.
    // The key issue is that 'node-screenshots' has a native .node addon
    // that cannot be bundled. Mark it as external.
    build.onResolve({ filter: /^node-screenshots$/ }, () => ({
      path: 'node-screenshots',
      external: true,
    }));
  },
};

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/agent.js',
  plugins: [seaExternalsPlugin],
  // In CJS mode, import.meta is not available.
  // Our setup-server.ts has a try/catch fallback for this.
  define: {
    'import.meta.url': 'undefined',
  },
});

console.log('Built dist/agent.js');

// Copy setup-ui dist alongside the bundle so the Express server can serve it
const uiDist = 'setup-ui/dist';
if (existsSync(uiDist)) {
  cpSync(uiDist, 'dist/setup-ui', { recursive: true });
  console.log('Copied setup-ui/dist/ to dist/setup-ui/');
} else {
  console.warn('Warning: setup-ui/dist/ not found. Run "cd setup-ui && npm run build" first.');
}
