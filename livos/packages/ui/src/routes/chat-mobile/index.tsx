// Phase 167-04 — Mobile / legacy chat route.
// Phase 181-01 — Device class branching: tablet→CcTerminal, phone→MobileBubbleChat.
// Phase 181-03 — Wired CcTerminalHandle ref for direct sendStdin from key bar.
// Phase 181-04 — Legacy panel DELETED; phone branch wires real MobileBubbleChat;
//                desktop visitors see tablet layout (route is mobile-only per D-V35-G).
//
// D-V35-G — mobile users land here from the `/ai-chat` fallback banner.

import {useRef} from 'react'
import {useDeviceClass} from '@/hooks/useDeviceClass'
import {CcTerminal} from '@/features/cc-terminal/CcTerminal'
import type {CcTerminalHandle} from '@/features/cc-terminal/CcTerminal'
import {MobileTerminalKeyBar} from '@/features/mobile-terminal/MobileTerminalKeyBar'
import {MobileBubbleChat} from '@/features/mobile-terminal/MobileBubbleChat'

export default function ChatMobileRoute() {
	const deviceClass = useDeviceClass()
	const termRef = useRef<CcTerminalHandle>(null)

	if (deviceClass === 'phone') {
		return (
			<div className='flex h-full flex-col'>
				<MobileBubbleChat sessionId='mobile-default' className='flex-1' />
			</div>
		)
	}

	// tablet (default for wide touch screens) + desktop
	return (
		<div className='flex h-full flex-col'>
			<div className='flex-1 overflow-hidden'>
				<CcTerminal ref={termRef} sessionId='mobile-default' />
			</div>
			<MobileTerminalKeyBar onKey={(seq) => termRef.current?.sendStdin(seq)} />
		</div>
	)
}
