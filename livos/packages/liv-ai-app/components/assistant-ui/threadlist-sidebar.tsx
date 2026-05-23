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
import { ThreadList } from "@/components/thread-list";

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  // Phase 202-04 Task 7 — usePathname() drives the active-route highlight
  // on the Chat / Agents nav rows. The hook is safe under "use client" and
  // matches the AgentsSidebar pattern.
  const pathname = usePathname();
  const isChatActive = pathname === "/" || pathname === "";
  const isAgentsActive = pathname?.startsWith("/agents") ?? false;

  return (
    <Sidebar {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none hover:bg-transparent active:bg-transparent">
                <LivinityLogo className="size-7 shrink-0" />
                <div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-header-title font-semibold">
                    Liv AI
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        {/* Phase 202-04 Task 7 — top-level nav above ThreadList. Keeps
            Threads visible below since the operator may want to bounce
            between an active chat thread and the Agents dashboard
            without losing thread context. */}
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
        <ThreadList />
      </SidebarContent>
      <SidebarRail />
      <SidebarFooter className="aui-sidebar-footer border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => {
                // TODO(P201): open Liv AI settings panel
              }}
            >
              <Settings className="size-5 shrink-0" />
              <span className="aui-sidebar-footer-title font-semibold">
                Settings
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
