// Entry point for ai-chat-suna module
// Stage 1a: wraps DashboardLayout + renders DashboardPage (empty state)
// Stage 2: will add sub-routing for /thread/:id views

import DashboardLayout from './layout'
import DashboardPage from './dashboard'

export default function AiChatSuna() {
  return (
    <DashboardLayout>
      <DashboardPage />
    </DashboardLayout>
  )
}
