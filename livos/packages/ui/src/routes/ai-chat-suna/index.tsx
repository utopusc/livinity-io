// v32-redo Stage 2b — entry point.
//
// Wraps everything in <ChatRouterProvider> so the sidebar, dashboard, and
// thread view share the "currently selected conversation" state without
// touching the host app's URL.
//
// View switching:
//   - selectedConversationId === null → DashboardPage (hero + composer).
//   - selectedConversationId === <uuid> → ThreadPage (message list +
//     composer).

import DashboardLayout from './layout'
import DashboardPage from './dashboard'
import {ThreadPage} from './thread'
import {ChatRouterProvider, useChatRouter} from './lib/chat-router'

function ChatBody() {
	const {selectedConversationId} = useChatRouter()
	if (selectedConversationId) {
		// Key on conversationId so React fully unmounts/remounts the thread
		// when the user picks a different conversation — this resets local
		// scroll position, the live SSE slice subscription, and the
		// "have we already persisted this assistant turn" ref.
		return <ThreadPage key={selectedConversationId} conversationId={selectedConversationId} />
	}
	return <DashboardPage />
}

export default function AiChatSuna() {
	return (
		<ChatRouterProvider>
			<DashboardLayout>
				<ChatBody />
			</DashboardLayout>
		</ChatRouterProvider>
	)
}
