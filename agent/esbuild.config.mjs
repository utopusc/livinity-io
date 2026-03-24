import { build } from 'esbuild';
import { cpSync, existsSync } from 'node:fs';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/agent.js',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  external: ['node-screenshots'],
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
