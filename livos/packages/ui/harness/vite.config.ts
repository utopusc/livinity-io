import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vite'

// Phase 260.2 — no-auth dev harness for the displays surface / drag-dock
// choreography. Renders presentational components with MOCK data so the full
// interaction can be driven + screenshotted via chrome-devtools without a
// LivOS login. NOT shipped (dev-only; lives under harness/).
export default defineConfig({
	plugins: [react()],
	root: 'harness',
	publicDir: '../public',
	resolve: {
		alias: {
			'@/': `${path.resolve(__dirname, '../src')}/`,
		},
	},
	optimizeDeps: {
		esbuildOptions: {target: 'es2022'},
	},
})
