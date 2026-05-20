// Phase 167-04 — Mobile / legacy chat route.
// Phase 181-01 — Device class branching: tablet→CcTerminal, phone→MobileBubbleChat,
//                desktop→legacy panel (desktop branch deleted in Plan 181-04).
// Phase 181-03 — Wired CcTerminalHandle ref for direct sendStdin from key bar.
//
// D-V35-G — mobile users land here from the `/ai-chat` fallback banner.
// D-V35-K — legacy panel still imported once here (deleted in 181-04).

import {useRef} from 'react'
import {useDeviceClass} from '@/hooks/useDeviceClass'
import {CcTerminal} from '@/features/cc-terminal/CcTerminal'
import type {CcTerminalHandle} from '@/features/cc-terminal/CcTerminal'
import {MobileTerminalKeyBar} from '@/features/mobile-terminal/MobileTerminalKeyBar'
import {MobileBubbleChat} from '@/features/mobile-terminal/MobileBubbleChat'
import LegacyAiChatPanel from '@/routes/ai-chat/legacy-ai-chat-panel'

export default function ChatMobileRoute() {
	const deviceClass = useDeviceClass()
	const termRef = useRef<CcTerminalHandle>(null)

	if (deviceClass === 'tablet') {
		return (
			<div className='flex h-full flex-col'>
				<div className='flex-1 overflow-hidden'>
					<CcTerminal ref={termRef} sessionId='mobile-default' />
				</div>
				<MobileTerminalKeyBar onKey={(seq) => termRef.current?.sendStdin(seq)} />
			</div>
		)
	}

	if (deviceClass === 'phone') {
		return (
			<div className='flex h-full flex-col'>
				<MobileBubbleChat sessionId='mobile-default' className='flex-1' />
			</div>
		)
	}

	// desktop fallback — deleted in Plan 181-04
	return (
		<div className='flex h-full flex-col'>
			<LegacyAiChatPanel />
		</div>
	)
}
