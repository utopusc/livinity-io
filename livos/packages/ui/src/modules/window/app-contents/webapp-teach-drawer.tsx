// Phase 100-09-06 — DEPRECATED.
//
// Replaced by:
//   - WebAppTeachPopupHost (toast popups during recording — top-right,
//     ~2s auto-dismiss per captured event)
//   - WebAppSkillsPopover (top-right Skills button + Radix popover
//     listing saved skills with Play/Delete; replaces this drawer's
//     skills sidebar per D-100-09-E1)
//   - SaveSkillDialog (already in webapp-stream-window.tsx; opens on
//     stop-recording when events captured)
//
// Per user intent ("teach mode da da aynisi gecerli tiklandiginda panel
// acilmasin onun yerine Click yapildiktan sonra Pop up a yazsin step i").
//
// File and named export retained for backwards-compat. Sheet drawer host
// in webapp-stream-window.tsx no longer renders this component (the
// `teach` branch is excluded from the Sheet's `open` prop and from the
// drawer body). Future v34 cleanup may delete the file if no consumers
// surface during UAT.
//
// ─────────────────────────────────────────────────────────────────
// Phase 100-04 — WebAppTeachDrawer (historical context).
//
// V33-MULTI-04 / G-100-D D2: hosts the Teach-mode surfaces (skills
// sidebar + replay scrubber + recorder controls). Mounted by
// webapp-stream-window.tsx inside the right-side <Sheet> drawer when
// `openDrawer === 'teach'`.
//
// The drawer owns a SEPARATE `useTeachRecorder` instance per the hook's
// "each instantiate independent recorders" contract (96-CONTEXT
// §gray-area #7). The parent's spawn lifecycle and any outstanding
// pendingSave dialog remain in webapp-stream-window.tsx.

import {useCallback, useState} from 'react'

import {useTeachRecorder} from '@/hooks/use-teach-recorder'

import {WebAppSkillsSidebar} from '../webapp-skills-sidebar'
import {SkillReplayScrubber} from '../skill-replay-scrubber'

export interface WebAppTeachDrawerProps {
	webappId: string
}

export function WebAppTeachDrawer({webappId}: WebAppTeachDrawerProps) {
	const recorder = useTeachRecorder()
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)

	const onToggleRecord = useCallback(() => {
		if (recorder.recording) {
			void recorder.stop()
		} else {
			// vncRef intentionally null — the parent webapp-stream-window owns
			// the noVNC container; recording from within the drawer is the
			// affordance only. P96 wiring already lives behind the parent's
			// own recorder instance (see webapp-stream-window.tsx
			// `handleModeChange`). The drawer-side button is a UX preview.
			recorder.start({webappId, vncRef: {current: null}})
		}
	}, [recorder, webappId])

	return (
		<div className='flex h-full w-full flex-col bg-surface-base'>
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3'>
				<h2 className='text-sm font-medium text-text-primary'>Teach</h2>
				<button
					type='button'
					onClick={onToggleRecord}
					className='rounded-radius-sm bg-accent-blue px-3 py-1 text-caption-sm text-white hover:bg-accent-blue/90'
				>
					{recorder.recording ? 'Stop' : 'Record'}
				</button>
			</div>

			<div className='flex-1 overflow-y-auto'>
				<WebAppSkillsSidebar
					webappId={webappId}
					onSelectSkill={(skillId) => setSelectedSkillId(skillId)}
				/>
				{selectedSkillId ? (
					<SkillReplayScrubber
						skillId={selectedSkillId}
						onClose={() => setSelectedSkillId(null)}
					/>
				) : null}
			</div>
		</div>
	)
}

export default WebAppTeachDrawer
