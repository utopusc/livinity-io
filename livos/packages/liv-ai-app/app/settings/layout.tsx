/**
 * Phase 202-07 — Layout for the `/settings` route.
 *
 * Mirrors the SidebarProvider + SidebarInset shell from
 * `app/agents/layout.tsx` so the operator sees the same sidebar chrome
 * across the subapp (Chat / Agents / Settings).
 *
 * Decisions:
 *   D-202-11 — route lives at /settings (subapp root, NOT /agents/settings).
 *   D-202-24 — settings page lives in the subapp under
 *              `livos/packages/liv-ai-app/app/settings/`.
 *
 * Note: like /agents, the /settings subtree is NOT wrapped in
 * AssistantRuntimeProvider — it uses the dedicated `<AgentsSidebar>` (the
 * same one /agents uses) since ThreadList would crash without a runtime in
 * scope. The sidebar header is overridden to "Settings" via the
 * `headerLabel` prop.
 */

import type { ReactNode } from "react";

import { AgentsSidebar } from "@/components/agents/AgentsSidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export default function SettingsLayout({ children }: { children: ReactNode }) {
	return (
		<SidebarProvider>
			<div className="flex h-dvh w-full pr-0.5">
				<AgentsSidebar headerLabel="Settings" />
				<SidebarInset>
					<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
						<SidebarTrigger />
						<Separator orientation="vertical" className="mr-2 h-4" />
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbPage>Settings</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</header>
					<div className="flex-1 overflow-auto">{children}</div>
				</SidebarInset>
			</div>
		</SidebarProvider>
	);
}
