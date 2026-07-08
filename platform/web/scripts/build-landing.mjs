// Precompiles the landing page's JSX (previously transpiled in-browser by
// @babel/standalone, ~2.5 MB + ~1.5 s main-thread) into one minified classic
// script. Runs automatically via the `prebuild` npm hook, so `next build`
// (local and Vercel) always regenerates public/landing.min.js from source.
//
// The five files share one global lexical scope in the browser (they were
// separate classic <script type="text/babel"> tags), so concatenating them in
// the original tag order preserves semantics exactly.
//
// landing.min.js is COMMITTED (not gitignored) as a safety net: if a build
// pipeline ever skips the prebuild hook, the last committed bundle still
// serves. After editing any of the five .jsx sources, run `npm run build`
// (or this script directly) and commit the regenerated bundle with them.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SOURCES = ['tweaks-panel.jsx', 'atoms.jsx', 'hero.jsx', 'sections.jsx', 'app.jsx'];

const parts = await Promise.all(
  SOURCES.map(async (f) => `// ---- ${f} ----\n${await readFile(join(pub, f), 'utf8')}`),
);
const concat = parts.join('\n;\n');

const { code, warnings } = await transform(concat, {
  loader: 'jsx',
  minify: true,
  target: 'es2019',
  legalComments: 'none',
});
for (const w of warnings) console.warn('[build-landing]', w.text);

const out = join(pub, 'landing.min.js');
await writeFile(out, code, 'utf8');
console.log(
  `[build-landing] wrote landing.min.js (${(code.length / 1024).toFixed(1)} KiB from ${(concat.length / 1024).toFixed(1)} KiB JSX)`,
);
