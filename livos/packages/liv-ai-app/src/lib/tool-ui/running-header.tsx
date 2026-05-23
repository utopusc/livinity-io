/**
 * Phase 199-06 Task 1 — `<RunningHeader />` micro-primitive (D-199-05).
 *
 * Renders a small status row used by the 10 P198-03 generative-UI tool
 * renderers while their tool-call is in flight (`status.type === 'running'`).
 * Replaces the bare `<Skeleton>` placeholders P198 originally shipped with
 * an args-echo label per the RESEARCH E5 table — e.g.
 *
 *   <RunningHeader label='Checking weather in Istanbul…' />
 *   <RunningHeader label='Listing windows…' />
 *
 * T-199-06 mitigation: `label` is interpolated via React text-children
 * ONLY (NEVER `dangerouslySetInnerHTML`). The XSS regression-lock test in
 * `running-header.test.tsx` asserts that an angle-bracketed label renders
 * as escaped text content, not as parsed HTML.
 *
 * D-NO-NEW-DEPS — `lucide-react` is already a direct dependency of
 * `@livos/ui` (see livos/packages/ui/package.json). Loader2 + the
 * existing Tailwind `animate-spin` utility supply the spinner.
 */

import {Loader2} from 'lucide-react'
import type {ReactNode} from 'react'

export interface RunningHeaderProps {
	/** The status text rendered next to the spinner. */
	label: string
	/**
	 * Optional icon override. Defaults to a spinning Loader2 from
	 * lucide-react. Supply a custom icon (e.g. a screenshot camera glyph
	 * for the LuseScreenshotToolUI variant) without losing the chrome.
	 */
	icon?: ReactNode
}

export function RunningHeader({icon, label}: RunningHeaderProps) {
	return (
		<div className='flex items-center gap-2 rounded-lg border bg-card p-3 text-sm'>
			{icon ?? <Loader2 className='size-4 animate-spin' />}
			<span className='text-muted-foreground'>{label}</span>
		</div>
	)
}

export default RunningHeader
