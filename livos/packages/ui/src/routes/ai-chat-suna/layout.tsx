// Ported from Suna: app/(dashboard)/layout.tsx
// Substitutions:
//   'use client' removed
//   useRouter/next/navigation -> removed (no auth redirect in Stage 1a — LivOS handles auth at window level)
//   useAuth -> removed (visual-only Stage 1a)
//   useAccounts -> removed
//   checkApiHealth -> removed (always healthy for Stage 1a)
//   MaintenanceAlert/MaintenancePage/VSentry/StatusOverlay -> removed (Stage 2)
//   DeleteOperationProvider -> removed (Stage 2 adds delete wiring)
//   Loader2 loading spinner -> removed (no async auth check)

import {type ReactNode} from 'react'
import {SidebarLeft} from './sidebar/sidebar-left'
import {SidebarInset, SidebarProvider} from './ui/sidebar'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({children}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <SidebarLeft />
      <SidebarInset>
        <div className="bg-background">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
