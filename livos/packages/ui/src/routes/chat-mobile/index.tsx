// Phase 167-04 — Mobile / legacy chat route.
// Phase 181-01 — Device class branching: tablet→CcTerminal, phone→MobileBubbleChat,
//                desktop→legacy panel (desktop branch deleted in Plan 181-04).
// Phase 181-03 — Will wire CcTerminalHandle ref for direct sendStdin.
//
// D-V35-G — mobile users land here from the `/ai-chat` fallback banner.
// D-V35-K — legacy panel still imported once here (deleted in 181-04).

import {useDeviceClass} from '@/hooks/useDeviceClass'
import {CcTerminal} from '@/features/cc-terminal/CcTerminal'
import {MobileTerminalKeyBar} from '@/features/mobile-terminal/MobileTerminalKeyBar'
import {MobileBubbleChat} from '@/features/mobile-terminal/MobileBubbleChat'
import LegacyAiChatPanel from '@/routes/ai-chat/legacy-ai-chat-panel'

export default function ChatMobileRoute() {
	const deviceClass = useDeviceClass()

	if (deviceClass === 'tablet') {
		return (
			<div className='flex h-full flex-col'>
				<div className='flex-1 overflow-hidden'>
					<CcTerminal sessionId='mobile-default' />
				</div>
				{/* 181-03 will wire ref.current.sendStdin once CcTerminal is forwardRef */}
				<MobileTerminalKeyBar onKey={(seq) => {
					// Bridge via CustomEvent until Plan 181-03 adds the forwardRef
					document.dispatchEvent(new CustomEvent('cc-pty-key', {detail: seq}))
				}} />
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
