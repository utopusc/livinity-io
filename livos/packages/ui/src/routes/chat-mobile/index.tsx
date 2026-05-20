// Phase 167-04 — Mobile / legacy chat route.
//
// Wraps the legacy AI chat panel (moved verbatim from
// `routes/ai-chat/index.tsx` → `routes/ai-chat/legacy-ai-chat-panel.tsx`
// in Phase 167-04) without any refactor.
//
// D-V35-G — mobile users land here from the `/ai-chat` fallback banner.
// Desktop users CAN visit this URL directly to opt into the legacy UX.
//
// D-V35-K — the legacy panel module (`legacy-ai-chat-panel.tsx`) is
// imported in EXACTLY ONE PLACE in production source: this file. The
// (renamed) module is no longer imported by `routes/ai-chat/index.tsx`
// — Phase 167-04 swapped that file to mount `<CcTerminal>` instead.

import LegacyAiChatPanel from '@/routes/ai-chat/legacy-ai-chat-panel'

export default function ChatMobileRoute() {
	return (
		<div className='flex h-full flex-col'>
			<LegacyAiChatPanel />
		</div>
	)
}
