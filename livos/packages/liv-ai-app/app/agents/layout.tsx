/**
 * Phase 202-04 — Layout for the `/agents/*` route subtree.
 *
 * Mirrors the SidebarProvider + SidebarInset shell from `app/assistant.tsx`
 * (Liv AI page) so the operator sees the same sidebar chrome on both
 * surfaces, with the sidebar header switching between "Liv AI" and "Agents"
 * based on route.
 *
 * Decisions:
 *   D-202-24 — agents page lives in the subapp under
 *              `livos/packages/liv-ai-app/app/agents/`.
 *
 * Note: the agents subtree is NOT wrapped in AssistantRuntimeProvider — it
 * uses the dedicated `<AgentsSidebar>` (not `<ThreadListSidebar>`) since
 * ThreadList would crash without a runtime in scope.
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

export default function AgentsLayout({ children }: { children: ReactNode }) {
	return (
		<SidebarProvider>
			<div className="flex h-dvh w-full pr-0.5">
				<AgentsSidebar />
				<SidebarInset>
					<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
						<SidebarTrigger />
						<Separator orientation="vertical" className="mr-2 h-4" />
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbPage>Agents</BreadcrumbPage>
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
