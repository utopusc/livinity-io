import tailwindContainerQueries from '@tailwindcss/container-queries'
import tailwindTypography from '@tailwindcss/typography'
import {mapValues} from 'remeda'
import tailwindCssAnimate from 'tailwindcss-animate'
import tailwindRadix from 'tailwindcss-radix'
import tailwindSafeArea from 'tailwindcss-safe-area'
import defaultTheme from 'tailwindcss/defaultTheme'
import {PluginAPI} from 'tailwindcss/types/config'

import {screens} from './src/utils/tw'

/** @type {import('tailwindcss').Config} */
export default {
	// Phase 24-01 — class-based dark mode for the Docker app (`/routes/docker`).
	// Adding `dark` class to the docker-app root (via useDockerTheme) turns on
	// `dark:*` variants beneath. No other LivOS surface uses dark variants today,
	// so existing components render unchanged.
	darkMode: 'class',
	content: [
		'./index.html',
		'./src/**/*.{js,ts,jsx,tsx}',
		'./stories/**/*.{js,ts,jsx,tsx}',
		'./node_modules/streamdown/dist/*.js',
		'./node_modules/@streamdown/code/dist/*.js',
	],
	future: {
		// This allows ring-brand/40 (ring color with opacity to work correctly)
		// https://github.com/tailwindlabs/tailwindcss/issues/9016#issuecomment-1205713065
		respectDefaultRingColorOpacity: true,
	},
	theme: {
		fontFamily: {
			// v32 (Phase 80): Geist Variable prepended; existing stack kept as fallback
			sans: ['Geist Variable', 'var(--font-jakarta)', 'var(--font-inter)', 'Inter Variable', 'Inter', ...defaultTheme.fontFamily.sans],
			// v32 (Phase 80): Geist Mono Variable prepended
			mono: ['Geist Mono Variable', 'JetBrains Mono', 'Roboto Mono', ...defaultTheme.fontFamily.mono],
			sticker: ['"Permanent Marker"', 'cursive'],
		},
		container: {
			center: true,
			padding: '2rem',
		},
		screens: mapValues(screens, (value) => value + 'px'),
		extend: {
			flexShrink: {
				// Used if you want to shrink the item totally if no room
				full: '9999',
			},
			spacing: {
				'icon-sm': '16px',
				'icon-md': '20px',
				'icon-lg': '24px',
			},
			borderRadius: {
				// Using numbers instead of sm, md, lg because easier to add radii in between later
				3: '3px',
				4: '4px',
				5: '5px',
				6: '6px',
				8: '8px',
				10: '10px',
				12: '12px',
				14: '14px',
				15: '15px',
				16: '16px',
				17: '17px',
				18: '18px',
				20: '20px',
				22: '22px',
				24: '24px',
				28: '28px',
				32: '32px',
				// Semantic border radii
				'radius-sm': '8px',
				'radius-md': '12px',
				'radius-lg': '16px',
				'radius-xl': '20px',
				'radius-2xl': '24px',
				'radius-3xl': '28px',
			},
			colors: {
				// v32 OKLCH tokens (Phase 80) — bound to --liv-* CSS custom properties.
				// Use as: bg-liv-background, text-liv-foreground, border-liv-border, etc.
				// Light/dark values controlled by ThemeProvider toggling <html class="dark">.
				// var() passthrough: Tailwind emits `color: var(--liv-*)` in the output CSS.
				// The actual OKLCH values live in v32-tokens.css and switch on `.dark`.
				'liv-background': 'var(--liv-background)',
				'liv-foreground': 'var(--liv-foreground)',
				'liv-card': 'var(--liv-card)',
				'liv-card-foreground': 'var(--liv-card-foreground)',
				'liv-popover': 'var(--liv-popover)',
				'liv-popover-foreground': 'var(--liv-popover-foreground)',
				'liv-primary': 'var(--liv-primary)',
				'liv-primary-foreground': 'var(--liv-primary-foreground)',
				'liv-secondary': 'var(--liv-secondary)',
				'liv-secondary-foreground': 'var(--liv-secondary-foreground)',
				'liv-muted': 'var(--liv-muted)',
				'liv-muted-foreground': 'var(--liv-muted-foreground)',
				'liv-accent': 'var(--liv-accent)',
				'liv-accent-foreground': 'var(--liv-accent-foreground)',
				'liv-destructive': 'var(--liv-destructive)',
				'liv-destructive-foreground': 'var(--liv-destructive-foreground)',
				'liv-border': 'var(--liv-border)',
				'liv-input': 'var(--liv-input)',
				'liv-ring': 'var(--liv-ring)',
				'liv-sidebar': 'var(--liv-sidebar)',
				'liv-sidebar-foreground': 'var(--liv-sidebar-foreground)',
				'liv-sidebar-primary': 'var(--liv-sidebar-primary)',
				'liv-sidebar-primary-foreground': 'var(--liv-sidebar-primary-foreground)',
				'liv-sidebar-accent': 'var(--liv-sidebar-accent)',
				'liv-sidebar-accent-foreground': 'var(--liv-sidebar-accent-foreground)',
				'liv-sidebar-border': 'var(--liv-sidebar-border)',
				'liv-sidebar-ring': 'var(--liv-sidebar-ring)',
				// Extracted from background
				brand: 'hsl(var(--color-brand) / <alpha-value>)',
				'brand-lighter': 'hsl(var(--color-brand-lighter) / <alpha-value>)',
				'brand-lightest': 'hsl(var(--color-brand-lightest) / <alpha-value>)',
				//
				destructive: '#E03E3E',
				destructive2: '#E22C2C',
				'destructive2-lighter': '#F53737',
				'destructive2-lightest': '#F45A5A',
				success: '#299E16',
				'success-light': '#51CB41',
				'dialog-content': '#FFFFFF',
				// Semantic surface colors (light theme)
				'surface-base': 'rgba(0, 0, 0, 0.03)',
				'surface-1': 'rgba(0, 0, 0, 0.05)',
				'surface-2': 'rgba(0, 0, 0, 0.08)',
				'surface-3': 'rgba(0, 0, 0, 0.12)',
				// Semantic border colors
				'border-subtle': 'rgba(0, 0, 0, 0.06)',
				'border-default': 'rgba(0, 0, 0, 0.12)',
				'border-emphasis': 'rgba(0, 0, 0, 0.20)',
				// Semantic text colors
				'text-primary': 'rgba(15, 23, 42, 0.92)',
				'text-secondary': 'rgba(15, 23, 42, 0.60)',
				'text-tertiary': 'rgba(15, 23, 42, 0.40)',
				// Semantic status colors
				info: '#3B82F6',
				'info-surface': 'rgba(59, 130, 246, 0.06)',
				warning: '#F59E0B',
				'warning-surface': 'rgba(245, 158, 11, 0.06)',
			},
			borderWidth: {
				px: '1px',
				hpx: '0.5px',
			},
			boxShadow: {
				// Semantic elevation shadows (light theme)
				'elevation-sm': '0px 1px 3px rgba(0, 0, 0, 0.08), 0px 1px 2px rgba(0, 0, 0, 0.06)',
				'elevation-md': '0px 4px 6px -1px rgba(0, 0, 0, 0.08), 0px 2px 4px -2px rgba(0, 0, 0, 0.06)',
				'elevation-lg': '0px 10px 15px -3px rgba(0, 0, 0, 0.08), 0px 4px 6px -4px rgba(0, 0, 0, 0.04)',
				'elevation-xl': '0px 20px 25px -5px rgba(0, 0, 0, 0.08), 0px 8px 10px -6px rgba(0, 0, 0, 0.04)',
				// Component-specific shadows (light theme)
				dock: '0px 4px 24px rgba(0, 0, 0, 0.08), 0px 1px 3px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.04)',
				'floating-island':
					'0px 4px 24px rgba(0, 0, 0, 0.10), 0px 1px 3px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.04)',
				'glass-button':
					'0px 1px 2px rgba(0, 0, 0, 0.05), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				widget:
					'0px 8px 24px rgba(0, 0, 0, 0.08), 0px 2px 4px rgba(0, 0, 0, 0.04), 0px 0px 0px 1px rgba(0, 0, 0, 0.04)',
				'context-menu':
					'0px 8px 24px rgba(0, 0, 0, 0.12), 0px 2px 4px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				'sheet-shadow': '0px -1px 0px 0px rgba(0, 0, 0, 0.06)',
				dropdown:
					'0px 8px 16px rgba(0, 0, 0, 0.10), 0px 2px 4px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				dialog: '0px 16px 48px rgba(0, 0, 0, 0.12), 0px 4px 8px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				'button-highlight': '0px 1px 0px 0px rgba(255, 255, 255, 0.8) inset',
				'button-highlight-hpx': '0px 0.5px 0px 0px rgba(255, 255, 255, 0.8) inset',
				'button-highlight-soft': '0px 1px 0px 0px rgba(255, 255, 255, 0.4) inset',
				'button-highlight-soft-hpx': '0px 0.5px 0px 0px rgba(255, 255, 255, 0.4) inset',
				'immersive-dialog-close':
					'0px 8px 24px rgba(0, 0, 0, 0.12), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				'radio-outline': '0 0 0 1px rgba(0, 0, 0, 0.12) inset',
				// Professional card shadows
				'card-elevated': '0px 4px 12px rgba(0, 0, 0, 0.06), 0px 1px 3px rgba(0, 0, 0, 0.04), 0px 0px 0px 1px rgba(0, 0, 0, 0.04)',
				'card-hover': '0px 8px 24px rgba(0, 0, 0, 0.10), 0px 2px 4px rgba(0, 0, 0, 0.06), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)',
				// Input focus shadow
				'input-focus': '0px 0px 0px 3px rgba(var(--color-brand), 0.12)',
			},
			dropShadow: {
				'desktop-label': '0px 1px 2px rgba(0, 0, 0, 0.10)',
			},
			opacity: {
				3: '0.03',
				4: '0.04',
				6: '0.06',
			},
			fontSize: {
				// Numeric font sizes (preserved for backward compatibility)
				9: '9px',
				11: '11px',
				12: '12px',
				13: '13px',
				14: '14px',
				15: '15px',
				16: '16px',
				17: '17px',
				19: '19px',
				24: '24px',
				32: '32px',
				36: '36px',
				48: '48px',
				56: '56px',
				// Legacy semantic font sizes (kept for backward-compat with non-Liv UI:
				// settings, docker, file-manager, etc.). New Liv UI (Phase 66+) uses the
				// liv-* keys further below.
				'caption-sm': ['11px', {lineHeight: '1.4', letterSpacing: '0.01em'}],
				'body-sm': ['13px', {lineHeight: '1.5', letterSpacing: '0.01em'}],
				'body-lg': ['15px', {lineHeight: '1.5', letterSpacing: '0.01em'}],
				'heading-sm': ['17px', {lineHeight: '1.3', letterSpacing: '0em', fontWeight: '600'}],
				heading: ['19px', {lineHeight: '1.3', letterSpacing: '0em', fontWeight: '600'}],
				'heading-lg': ['24px', {lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600'}],
				'display-sm': ['32px', {lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700'}],
				display: ['36px', {lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700'}],
				'display-lg': ['48px', {lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700'}],
				// Liv Design System v1 type scale (Phase 66, D-11) per v31-DRAFT.md line 238.
				// Keys `display-1`, `display-2`, `h1`, `body`, `caption`, `mono-sm` produce
				// the `text-display-1`, `text-h1`, `text-body`, etc. Tailwind utilities that
				// P67+ chat UI / side panel / composer consume.
				'display-1': ['48px', {lineHeight: '1.1', fontWeight: '600', letterSpacing: '-0.02em'}],
				'display-2': ['36px', {lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.02em'}],
				h1: ['24px', {lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em'}],
				body: ['15px', {lineHeight: '1.5', fontWeight: '400'}],
				caption: ['12px', {lineHeight: '1.4', fontWeight: '400'}],
				'mono-sm': ['13px', {lineHeight: '1.5', fontWeight: '400', fontFamily: 'JetBrains Mono, monospace'}],
			},
			backdropBlur: {
				'4xl': '180px',
			},
			lineHeight: {
				'inter-trimmed': '0.73',
			},
			lineClamp: {
				10: '10',
			},
			letterSpacing: {
				'1': '0.01em',
				'2': '0.02em',
				'3': '0.03em',
				'4': '0.04em',
			},
			ringWidth: {
				3: '3px',
				6: '6px',
			},
			aspectRatio: {
				'2.25': '225 / 100',
				'1.6': '160 / 100',
				'1.9': '190 / 100',
			},
			keyframes: {
				'accordion-down': {
					from: {height: '0px'},
					to: {height: 'var(--radix-accordion-content-height)'},
				},
				'accordion-up': {
					from: {height: 'var(--radix-accordion-content-height)'},
					to: {height: '0px'},
				},
				// Keyframes from:
				// https://css-tricks.com/snippets/css/shake-css-keyframe-animation/
				shake: {
					'10%, 90%': {
						transform: 'translate3d(-1px, 0, 0)',
					},
					'20%, 80%': {
						transform: 'translate3d(2px, 0, 0)',
					},
					'30%, 50%, 70%': {
						transform: 'translate3d(-4px, 0, 0)',
					},
					'40%, 60%': {
						transform: 'translate3d(4px, 0, 0)',
					},
				},
				'sliding-loader': {
					'0%, 100%': {
						left: '-30%',
					},
					'50%': {
						left: '100%',
					},
				},
				'files-drop-zone-ripple': {
					'0%, 100%': {
						transform: 'translate(-50%, -50%) scale(1)',
					},
					'50%': {
						transform: 'translate(-50%, -50%) scale(0.9)',
					},
				},
				'files-folder-blink-on-drag-hover': {
					'0%, 100%': {backgroundColor: 'hsl(var(--color-brand))'},
					'25%, 75%': {backgroundColor: 'transparent'},
					'50%': {backgroundColor: 'hsl(var(--color-brand))'},
				},
			},
			animation: {
				'files-drop-zone-ripple': 'files-drop-zone-ripple var(--duration,2s) ease calc(var(--i, 0)*.2s) infinite',
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				shake: 'shake 0.7s ease-out both',
				'sliding-loader': 'sliding-loader 1s ease infinite',
				'files-folder-blink-on-drag-hover': 'files-folder-blink-on-drag-hover 0.4s linear',
			},
			typography: () => ({
				neutral: {
					css: {
						'--tw-prose-bullets': 'rgb(0 0 0 / 50%)',
						'--tw-prose-pre-bg': 'rgb(0 0 0 / 5%)',
					},
				},
			}),
		},
	},
	plugins: [
		tailwindCssAnimate,
		tailwindContainerQueries,
		tailwindTypography,
		utilPlugin,
		tailwindRadix({variantPrefix: 'radix'}),
		tailwindSafeArea,
	],
}

function utilPlugin(plugin: PluginAPI) {
	plugin.addUtilities({
		'.absolute-center': {
			position: 'absolute',
			left: '50%',
			top: '50%',
			transform: 'translate(-50%, -50%)',
		},
	})
}
