"use client";

import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";

import { useChatAppContext } from "@/components/chat/ChatAppContext";
import { ConnectionTab } from "@/components/settings/ConnectionTab";
import { GatewayTab } from "@/components/settings/GatewayTab";
import { McpServersTab } from "@/components/settings/McpServersTab";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { Button } from "@/components/ui/Button";
import { navigate, type SettingsSection } from "@/lib/hooks/useHashRoute";

/**
 * Phase 205 Hot-fix N — Settings as content-swap route.
 *
 * Replaces the rejected Hot-fix M side panel + the reverted Hot-fix M.1 modal
 * with a route-level view that takes over the main content area (the same
 * area that normally renders the home dashboard "Good morning / Top agents /
 * Top apps / Recent artifacts / Cron Jobs"). Sidebar stays visible; the
 * SettingsDialog modal is gone.
 *
 * Layout
 * ------
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ← Back to chat                       Settings        │
 *   ├──────────────────────────────────────────────────────┤
 *   │ [Connection]  MCP Servers  Gateway  Providers        │
 *   ├──────────────────────────────────────────────────────┤
 *   │                                                      │
 *   │ (active tab content fills the full width)            │
 *   │                                                      │
 *   └──────────────────────────────────────────────────────┘
 *
 * Section gating
 * --------------
 * - When `livOsBypassMode !== "standalone"` the Connection tab still mounts
 *   but suppresses the gateway URL + token form (Hot-fix K behavior). The
 *   status banner is preserved.
 * - The other three tabs (MCP, Gateway, Providers) are operator-facing and
 *   always available.
 *
 * Back button → `navigate({ view: "home" })`. Single deterministic target —
 * we deliberately don't try to remember the previous route since the
 * operator's mental model is "settings is a side trip from the home/chat
 * surface", not "settings is an overlay on whatever I was doing."
 */

const SECTIONS: ReadonlyArray<{ id: SettingsSection; label: string }> = [
  { id: "connection", label: "Connection" },
  { id: "mcp", label: "MCP Servers" },
  { id: "gateway", label: "Gateway" },
  { id: "providers", label: "Providers" },
];

interface Props {
  section?: SettingsSection;
}

export function SettingsRoute({ section }: Props) {
  const ctx = useChatAppContext();
  const active: SettingsSection = section ?? "connection";

  const suppressConnectionForm = ctx.livOsBypassMode !== "standalone";

  const TabContent = useMemo(() => {
    switch (active) {
      case "connection":
        return (
          <ConnectionTab
            open={true}
            currentSettings={ctx.settings}
            connectionState={ctx.connectionState}
            onClose={() => navigate({ view: "home" })}
            onSave={(newSettings) => ctx.onReconnect(newSettings)}
            suppressConnectionForm={suppressConnectionForm}
          />
        );
      case "mcp":
        return <McpServersTab />;
      case "gateway":
        return <GatewayTab />;
      case "providers":
        return <ProvidersTab />;
      default:
        return null;
    }
  }, [active, ctx.settings, ctx.connectionState, ctx.onReconnect, suppressConnectionForm]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background dark:bg-foreground/20">
      {/* Header — back button + title */}
      <header className="flex items-center justify-between border-b border-border-default/50 px-l py-m dark:border-border-default/16">
        <Button
          variant="tertiary"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate({ view: "home" })}
        >
          Back to chat
        </Button>
        <h1 className="font-heading text-md font-bold text-text-neutral-primary">
          Settings
        </h1>
        {/* Spacer to keep the title centered against the back button width. */}
        <span aria-hidden className="w-[120px]" />
      </header>

      {/* Tab strip */}
      <nav
        aria-label="Settings sections"
        className="flex shrink-0 items-center gap-3xs border-b border-border-default/50 px-l dark:border-border-default/16"
      >
        {SECTIONS.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate({ view: "settings", section: s.id })}
              aria-current={isActive ? "page" : undefined}
              className={`relative -mb-px px-m py-s text-sm transition-colors ${
                isActive
                  ? "border-b-2 border-text-interactive-emphasis font-medium text-text-neutral-primary"
                  : "border-b-2 border-transparent text-text-neutral-secondary hover:text-text-neutral-primary"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Content pane */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">{TabContent}</div>
      </div>
    </div>
  );
}
