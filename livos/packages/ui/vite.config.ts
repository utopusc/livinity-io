import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import {defineConfig} from 'vite'
import {imagetools} from 'vite-imagetools'
import {VitePWA} from 'vite-plugin-pwa'

// https://vitejs.dev/config/

export default defineConfig({
	plugins: [
		react(),
		imagetools({
			// Currently we only convert SVGs in features/files/assets/file-items-thumbnails
			include: /src\/features\/files\/assets\/file-items-thumbnails\/[^?]+\.svg(\?.*)?$/,
		}),
		VitePWA({
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
				navigateFallbackDenylist: [/^\/trpc/, /^\/api/, /^\/ws/],
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
	build: {
		rollupOptions: {
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
