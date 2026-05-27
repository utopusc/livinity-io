import path from 'node:path'
import {writeFileSync} from 'node:fs'
import react from '@vitejs/plugin-react-swc'
import {defineConfig, type Plugin} from 'vite'
import {imagetools} from 'vite-imagetools'
import {VitePWA} from 'vite-plugin-pwa'

// Phase 218 T7 — emit dist/version.txt with a build-time stamp matching
// __LIVOS_BUILD_VERSION__. The UI polls this file every 30s; mismatch
// against its compiled-in constant means update.sh ran and the operator
// is looking at a stale tab. Banner prompts a refresh.
function writeVersionFile(version: string): Plugin {
	return {
		name: 'livos-version-stamp',
		apply: 'build',
		closeBundle() {
			const outDir = path.resolve(__dirname, 'dist')
			try {
				writeFileSync(path.join(outDir, 'version.txt'), version, 'utf-8')
			} catch (err) {
				// Don't fail the build; the banner just won't trigger.
				// eslint-disable-next-line no-console
				console.warn('[livos-version-stamp] failed to write dist/version.txt', err)
			}
		},
	}
}

const LIVOS_BUILD_VERSION = String(Date.now())

// https://vitejs.dev/config/

export default defineConfig({
	plugins: [
		writeVersionFile(LIVOS_BUILD_VERSION),
		react(),
		imagetools({
			// Currently we only convert SVGs in features/files/assets/file-items-thumbnails
			include: /src\/features\/files\/assets\/file-items-thumbnails\/[^?]+\.svg(\?.*)?$/,
		}),
		VitePWA({
			// Phase 220 follow-up 2026-05-26 — operator console showed workbox SW
			// failing on every nav: `workbox-2b3e6643.js: Failed to fetch
			// https://bruce.livinity.io/`. Symptom: random panel crashes,
			// stale chunk references after deploys, CF SSL toggle loops
			// getting "stuck" in SW cache. Root cause: PWA brings nothing
			// useful to LivOS (Mini PC at home — if the server is offline the
			// PWA can't help) and brings real risk every time the bundle moves.
			// `selfDestroying: true` ships an empty SW that unregisters
			// itself on first install AND deletes every cache it knows about.
			// Existing operator SWs will detect the new SW on next page load,
			// activate, immediately unregister, and the browser drops back to
			// regular network behavior. Subsequent operators never get a SW
			// at all.
			selfDestroying: true,
			registerType: 'autoUpdate',
			includeAssets: ['favicon/favicon.ico', 'favicon/apple-touch-icon.png'],
			manifest: {
				name: 'Livinity',
				short_name: 'Livinity',
				description: 'Self-hosted AI server platform',
				id: '/',
				start_url: '/',
				scope: '/',
				theme_color: '#f8f9fc',
				background_color: '#f8f9fc',
				display: 'standalone',
				orientation: 'any',
				icons: [
					{
						src: '/favicon/android-chrome-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: '/favicon/android-chrome-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: '/favicon/android-chrome-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
			workbox: {
				// Phase 201 fix 2026-05-23: force the new SW to skip the waiting
				// state and claim all open tabs immediately. Without these, the
				// previously-installed SW keeps controlling open tabs (and keeps
				// intercepting /liv-ai-app for the navigateFallback handler) until
				// every tab is closed — operators experienced this as
				// "LivOS cannot be embedded in an iframe." persisting across
				// reloads on the Phase 200 → 201 cutover.
				skipWaiting: true,
				clientsClaim: true,
				cleanupOutdatedCaches: true,
				// 2026-05-05: precache 16 MB → user reported "site çok yavaş" with 477 entries.
				// Strategy: keep precaching (offline-first), but skip the heavy Shiki
				// syntax-highlighter language chunks + xterm + wasm + recharts. These
				// load on demand and runtime-cache via StaleWhileRevalidate below.
				globPatterns: ['**/*.{js,css,html,woff2}'],
				globIgnores: [
					'**/assets/{cpp,wasm,emacs-lisp,wolfram,angular-ts,xterm,wgsl,zig,zenscript,yaml,xsl,xml,wikitext,wenyan,webhooks,wallpaper,terraform,tex,svelte,sql,sas,scheme,scala,rust,python,nginx,latex,kotlin,julia,html,gherkin,ruby,r,powershell,php,perl,objective,markdown,lua,less,kusto,javascript,handlebars,haml,go,gnuplot,glsl,fsharp,dart,csharp,cobol,clojure,bash,asm,actionscript,abap,pascal,d-c,nasm,toml,coffee}-*.js',
					'**/assets/{generateCategoricalChart,FileSaver}-*.js',
				],
				navigateFallback: '/index.html',
				// Phase 201 fix 2026-05-23: deny /liv-ai-app/* and the bare prefix so
				// the iframe at `<iframe src="/liv-ai-app">` reaches the Next.js
				// subapp on :3010 via Caddy reverse_proxy. Without this, the LivOS
				// PWA service worker intercepts the iframe's navigation request and
				// serves the cached /index.html (LivOS UI shell), which contains
				// IframeChecker → prints "LivOS cannot be embedded in an iframe."
				// Phase 218 T7 — /version.txt must bypass the SW so polling reads the
				// freshly-deployed bundle's stamp, not a cached fallback to index.html.
				navigateFallbackDenylist: [/^\/trpc/, /^\/api/, /^\/ws/, /^\/liv-ai-app/, /^\/version\.txt/],
				runtimeCaching: [
					{
						urlPattern: /\/wallpapers\/.*/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'wallpapers',
							expiration: {maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60},
						},
					},
					{
						urlPattern: /\/figma-exports\/.*/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'app-icons',
							expiration: {maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60},
						},
					},
					{
						// Runtime cache for big chunks excluded from precache (the 200 KB limit).
						// StaleWhileRevalidate: serve cached, refresh in background.
						urlPattern: /\/assets\/.*\.(js|css)$/,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'app-chunks',
							expiration: {maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60},
						},
					},
				],
			},
		}),
	],
	define: {
		__MARKETPLACE_URL__: JSON.stringify(
			process.env.VITE_MARKETPLACE_URL || 'https://livinity.io'
		),
		// Phase 218 T7 — frozen at build time. The UI compares this against
		// the freshly-fetched /version.txt every 30s and shows a refresh
		// banner when they diverge, so operators see a "UI updated — Refresh"
		// prompt within seconds of update.sh instead of having to hard-reload
		// to notice. Companion plugin (writeVersionFile above) emits the
		// matching value into dist/version.txt at build time.
		__LIVOS_BUILD_VERSION__: JSON.stringify(LIVOS_BUILD_VERSION),
	},
	server: {
		proxy: {
			'/trpc': {
				target: process.env.VITE_BACKEND_URL || 'https://livinity.cloud',
				changeOrigin: true,
				secure: true,
				ws: true,
			},
		},
	},
	resolve: {
		alias: {
			'@/': `${path.resolve(__dirname, 'src')}/`,
		},
	},
	optimizeDeps: {
		// 2026-05-15: Vite dev-mode esbuild pre-bundling needs same TLA target as
		// production build below — otherwise dev server crashes on @novnc/novnc.
		esbuildOptions: {
			target: 'es2022',
		},
		// @novnc/novnc uses CJS require() + top-level await in browser.js — esbuild
		// can't bundle this combo. Excluded → browser loads it as native ESM.
		exclude: ['@novnc/novnc'],
	},
	build: {
		// 2026-05-08 hotfix: bump from default `modules` (es2020) to `es2022` so
		// top-level-await in @novnc/novnc's RFB.js compiles. P95-03 added the
		// novnc dep; default vite target rejects TLA with:
		//   "Top-level await is not available in the configured target
		//   environment (chrome87, edge88, es2020, firefox78, safari14)"
		// es2022 is supported by chrome89+, firefox89+, safari15+, edge89+.
		target: 'es2022',
		rollupOptions: {
			// Phase 198-07: @assistant-ui/react-devtools is an OPTIONAL
			// dev-only dep (NOT installed in livos/packages/ui — D-NO-NEW-DEPS).
			// devtools-mount.tsx dynamically imports it ONLY when
			// import.meta.env.DEV === true; in production the DEV branch
			// returns null at the top of the lazy callback. Marking it
			// external tells Rollup not to attempt module resolution —
			// the bare specifier stays in the bundle as a dynamic import
			// string but is never executed at runtime in production.
			// T-198-07-01: production bundle does not load DevTools.
			external: ['@assistant-ui/react-devtools'],
			output: {
				minifyInternalExports: true,
				manualChunks: {
					// remeda: ['remeda'],
					// motion: ['framer-motion'],
					// bignumber: ['bignumber.js'],
					// other: ['react-helmet-async', 'react-error-boundary'],
					// toaster: ['sonner'],
					react: ['react', 'react-dom'],
					i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector', 'i18next-http-backend'],
					fetch: ['@tanstack/react-query', '@trpc/react-query', '@trpc/client'],
					css: ['tailwind-merge', 'clsx'],
					reactRouter: ['react-router-dom'],
					dev: ['@tanstack/react-query-devtools', 'react-json-tree'],
					// sorter: ['match-sorter'],
					// icons: ['react-icons', 'lucide-react'],
					// qr: ['react-qr-code'],
					// pin: ['rci'],
					colorThief: ['colorthief'],
				},
			},
		},
	},
})
