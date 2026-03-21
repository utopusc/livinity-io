import {useBreakpoint} from '@/utils/tw'

const MOBILE_BREAKPOINTS = new Set(['sm', 'md'])

/** Returns true when viewport is below the `lg` breakpoint (< 1024px) */
export function useIsMobile(): boolean {
	return MOBILE_BREAKPOINTS.has(useBreakpoint())
}

/** Returns true when viewport is below the `md` breakpoint (< 768px) */
export function useIsSmallMobile(): boolean {
	return useBreakpoint() === 'sm'
}
