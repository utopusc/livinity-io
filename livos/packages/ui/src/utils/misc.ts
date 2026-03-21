import {indexBy} from 'remeda'

import {UserApp} from '@/trpc/trpc'

export function fixmeAlert() {
	alert('fixme')
}

export const fixmeHandler = () => fixmeAlert()

/** Extract first name from a full name string */
export function firstNameFromFullName(fullName: string): string {
	return fullName.split(' ')[0]
}

/** Promise-based delay */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Type guard for finite, non-NaN numbers */
export function isNormalNumber(val: number | null | undefined): val is number {
	return val != null && Number.isFinite(val)
}

/** Exhaustiveness check for switch/if-else chains */
export function assertUnreachable(value: never): never {
	throw new Error(`Unexpected value: ${value}`)
}

/** Index an array by a key field, returning a typed Record */
export function keyBy<T, K extends keyof T>(items: ReadonlyArray<T>, key: K): Record<T[K] & string, T> {
	return indexBy(items, (item) => item[key])
}

/** Join a base URL with a path segment, preserving trailing slashes */
export function urlJoin(base: string, segment: string): string {
	return new URL(segment, base).href
}

/** Simple path concatenation with slash normalization */
export function pathJoin(base: string, segment: string): string {
	return base.replace(/\/$/, '') + '/' + segment.replace(/^\//, '')
}

/** Resolve the external URL for an installed app based on current hostname */
export function appToUrl(app: UserApp): string {
	if (isOnionPage()) {
		return `${location.protocol}//${app.hiddenService}`
	}

	// Local development — use port-based URL
	if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
		return `${location.protocol}//${location.hostname}:${app.port}`
	}

	// Production — prepend app subdomain to user's base domain
	const appSubdomain = (app as any).subdomain || app.id
	const hostParts = location.hostname.split('.')

	let userDomain = location.hostname
	if (hostParts.length > 3 && hostParts.slice(-2).join('.') === 'livinity.io') {
		userDomain = hostParts.slice(-3).join('.')
	} else if (hostParts.length > 2 && hostParts.slice(-2).join('.') !== 'livinity.io') {
		userDomain = hostParts.slice(-2).join('.')
	}

	return `${location.protocol}//${appSubdomain}.${userDomain}`
}

/** Resolve app URL including the app's configured path */
export function appToUrlWithAppPath(app: UserApp): string {
	return urlJoin(appToUrl(app), app.path ?? '')
}

/** Check if the current page is accessed via a Tor .onion address */
export function isOnionPage(): boolean {
	return location.origin.includes('.onion')
}

/** Preload an image by creating a hidden Image element */
export function preloadImage(src: string): Promise<void> {
	return new Promise((resolve) => {
		const img = new Image()
		img.onload = () => resolve()
		img.onerror = () => resolve()
		img.src = src
	})
}

/** Wrap a callback in View Transition API if supported */
export function transitionViewIfSupported(fn: () => void): void {
	document.startViewTransition ? document.startViewTransition(fn) : fn()
}

// ── Platform detection ──────────────────────────────────

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

export const isWindows = () => /Win/i.test(ua)
export const isLinux = () => /Linux/i.test(ua)
export const isMac = () => /Mac/i.test(ua)

export function platform(): 'windows' | 'linux' | 'mac' | 'other' {
	if (isWindows()) return 'windows'
	if (isMac()) return 'mac'
	if (isLinux()) return 'linux'
	return 'other'
}

export const IS_ANDROID = /Android/i.test(ua)
export const IS_DEV = localStorage.getItem('debug') === 'true'

/** Returns the platform-appropriate modifier key symbol */
export const cmdOrCtrl = () => (isMac() ? '⌘' : 'Ctrl+')
