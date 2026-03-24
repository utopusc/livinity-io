import { build } from 'esbuild';

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
