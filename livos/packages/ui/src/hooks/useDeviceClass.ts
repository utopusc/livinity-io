// Phase 181-01 — useDeviceClass hook
//
// Returns 'phone' | 'tablet' | 'desktop' based on viewport width + pointer type.
// Used by routes/chat-mobile/index.tsx to branch between:
//   - tablet: CcTerminal + MobileTerminalKeyBar
//   - phone:  MobileBubbleChat
//   - desktop: legacy panel (transient — deleted in Plan 181-04)
//
// Logic:
//   - phone: viewport < sm (640px) — width alone decides; coarse/fine doesn't matter
//   - tablet: viewport >= sm AND pointer:coarse (touchscreen, wide)
//   - desktop: viewport >= sm AND pointer:fine (mouse/trackpad)
//
// `useBreakpoint()` from @/utils/tw subscribes to resize events via
// react-use/createBreakpoint — no additional listener needed.

import {useBreakpoint} from '@/utils/tw'

export type DeviceClass = 'phone' | 'tablet' | 'desktop'

export function useDeviceClass(): DeviceClass {
	const breakpoint = useBreakpoint()

	// SSR-safe pointer check: use matchMedia only if window exists.
	const isCoarse =
		typeof window !== 'undefined' &&
		window.matchMedia('(pointer: coarse)').matches

	// phone: viewport narrower than sm (640px) — width alone decides
	if (breakpoint === 'sm') return 'phone'
	// tablet: wider viewport but coarse pointer (touch screen)
	if (isCoarse) return 'tablet'
	// desktop: fine pointer (mouse/trackpad)
	return 'desktop'
}
