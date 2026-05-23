/**
 * Phase 202-04 — Sidebar for the `/agents/*` route subtree.
 *
 * Mirrors the structure of `ThreadListSidebar` (Liv AI page) but:
 *   - omits `<ThreadList />` since the agents subtree is NOT mounted under
 *     `<AssistantRuntimeProvider>` (would crash without a runtime in scope)
 *   - adds the Chat / Agents nav links that the threadlist sidebar also gets
 *     (kept consistent so both routes look like the same shell with the
 *     same nav structure)
 *
 * Task 6 + Task 7 acceptance:
 *   - Sidebar header switches between "Liv AI" and "Agents" based on route
 *   - Nav links (Chat, Agents) with active-route highlighting
 */

"use client";

import type * as React from "react";
import { MessageSquare, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import LivinityLogo from "@/components/livinity-logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";

interface AgentsSidebarProps extends React.ComponentProps<typeof Sidebar> {
	headerLabel?: string;
}

export function AgentsSidebar({ headerLabel = "Agents", ...props }: AgentsSidebarProps) {
	const pathname = usePathname();
	const isChatActive = pathname === "/" || pathname === "";
	const isAgentsActive = pathname?.startsWith("/agents") ?? false;
	const isSettingsActive = pathname?.startsWith("/settings") ?? false;

	return (
		<Sidebar {...props}>
			<SidebarHeader className="aui-sidebar-header mb-2 border-b">
				<div className="aui-sidebar-header-content flex items-center justify-between">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								size="lg"
								className="pointer-events-none hover:bg-transparent active:bg-transparent"
							>
								<LivinityLogo className="size-7 shrink-0" />
								<div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
									<span className="aui-sidebar-header-title font-semibold">
										{headerLabel}
									</span>
								</div>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</div>
			</SidebarHeader>
			<SidebarContent className="aui-sidebar-content px-2">
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton asChild isActive={isChatActive}>
									<Link href="/">
										<MessageSquare className="size-4 shrink-0" />
										<span>Chat</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton asChild isActive={isAgentsActive}>
									<Link href="/agents">
										<Users className="size-4 shrink-0" />
										<span>Agents</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
			<SidebarFooter className="aui-sidebar-footer border-t">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild isActive={isSettingsActive}>
							<Link href="/settings">
								<Settings className="size-5 shrink-0" />
								<span className="aui-sidebar-footer-title font-semibold">
									Settings
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
