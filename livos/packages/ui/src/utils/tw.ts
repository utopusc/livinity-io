import {createBreakpoint} from 'react-use'

/**
 * Tagged template literal for Tailwind class strings.
 * Enables IDE intellisense when configured with classRegex.
 */
export function tw(strings: TemplateStringsArray, ...values: string[]): string {
	let result = strings[0]
	for (let i = 0; i < values.length; i++) {
		result += values[i] + strings[i + 1]
	}
	return result
}

/** Responsive breakpoint values matching tailwind.config.ts */
export const breakpoints = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	'2xl': 1536,
} as const

/** @deprecated Use breakpoints instead */
export const screens = breakpoints

export const useBreakpoint = createBreakpoint(breakpoints as Record<string, number>)
