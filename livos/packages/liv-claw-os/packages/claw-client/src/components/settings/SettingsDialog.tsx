"use client";

import { KeyRound, Link2, ServerCog, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/layout/sidebar/IconButton";
import { ConnectionState } from "@/lib/gateway/types";
import type { Settings } from "@/lib/storage";

import { ConnectionTab } from "./ConnectionTab";
import { GatewayTab } from "./GatewayTab";
import { McpServersTab } from "./McpServersTab";
import { ProvidersTab } from "./ProvidersTab";

/**
 * Phase 205 Hot-fix M — Settings dialog redesigned as a right-side slide-out
 * panel with vertical left navigation. Replaces the prior modal popup whose
 * cramped center placement + horizontal tab strip + dropdown-style inputs
 * were called out as "incredibly bad" during operator UAT on 2026-05-24.
 *
 * Architecture
 * ------------
 *   - Full-height aside (540px) anchored to the right edge.
 *   - `translate-x-full` collapsed → `translate-x-0` open. ~200ms ease.
 *   - Backdrop click closes; Escape key closes.
 *   - Vertical nav on the left (~180px) with 4 tabs:
 *       Connection · MCP Servers · Gateway · Providers
 *   - Content scrolls inside the right pane; nav stays pinned.
 *
 * The component's public prop signature is preserved 1:1 — `ChatApp.tsx`
 * callers compile unchanged. The `suppressConnectionForm` prop continues
 * to suppress the gateway URL + token form when running inside LivOS
 * (Hot-fix K) while the dialog itself remains reachable so MCP Servers,
 * Gateway, and Providers tabs are usable.
 *
 * The Providers tab (Hot-fix M new) closes the cross-shell pain point:
 * operators no longer have to leave the chat surface and visit
 * `/liv-ai-app/settings` to paste an LLM provider key. Phase 204's tRPC
 * surface (`provider.config.*`) is reused 1:1 — wire compatibility is
 * preserved.
 */

type SettingsTab = "connection" | "mcp" | "gateway" | "providers";

interface NavOption {
  id: SettingsTab;
  label: string;
  icon: typeof Link2;
}

const NAV_OPTIONS: NavOption[] = [
  { id: "connection", label: "Connection", icon: Link2 },
  { id: "mcp", label: "MCP Servers", icon: ServerCog },
  { id: "gateway", label: "Gateway", icon: ShieldCheck },
  { id: "providers", label: "Providers", icon: KeyRound },
];

interface Props {
  open: boolean;
  currentSettings: Settings | null;
  connectionState: ConnectionState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  /** Phase 205 Hot-fix K — passed to ConnectionTab. See ConnectionTab.tsx. */
  suppressConnectionForm?: boolean;
}

export function SettingsDialog({
  open,
  currentSettings,
  connectionState,
  onClose,
  onSave,
  suppressConnectionForm = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");

  // Reset to Connection on every open so first-visit UX is predictable.
  useEffect(() => {
    if (open) setActiveTab("connection");
  }, [open]);

  // Escape key closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — click anywhere outside to close. */}
      <div
        aria-hidden
        className={`fixed inset-0 z-40 bg-overlay backdrop-blur-sm transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Side panel. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[540px] transform flex-col bg-background text-text-neutral-primary shadow-2xl outline-none transition-transform duration-200 ease-out dark:bg-foreground ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border-default/50 px-l py-m dark:border-border-default/16">
          <h2
            id="settings-panel-title"
            className="font-heading text-md font-bold"
          >
            Settings
          </h2>
          <IconButton
            icon={X}
            variant="tertiary"
            size="md"
            title="Close (Esc)"
            aria-label="Close settings"
            onClick={onClose}
          />
        </header>

        {/* Body: vertical nav + content */}
        <div className="flex min-h-0 flex-1">
          {/* Left vertical nav */}
          <nav
            aria-label="Settings sections"
            className="flex w-[180px] shrink-0 flex-col gap-3xs border-r border-border-default/50 bg-sunk-light/50 p-s dark:border-border-default/16 dark:bg-elevated/30"
          >
            {NAV_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = activeTab === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveTab(opt.id)}
                  className={`flex items-center gap-s rounded-md px-s py-xs text-left text-sm transition-colors ${
                    isActive
                      ? "bg-background font-medium text-text-neutral-primary shadow-sm dark:bg-foreground"
                      : "text-text-neutral-secondary hover:bg-background/60 hover:text-text-neutral-primary dark:hover:bg-foreground/60"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={14}
                    className={
                      isActive
                        ? "text-text-interactive-emphasis"
                        : "text-text-neutral-tertiary"
                    }
                  />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right content pane */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "connection" && (
              <ConnectionTab
                open={open}
                currentSettings={currentSettings}
                connectionState={connectionState}
                onClose={onClose}
                onSave={onSave}
                suppressConnectionForm={suppressConnectionForm}
              />
            )}
            {activeTab === "mcp" && <McpServersTab />}
            {activeTab === "gateway" && <GatewayTab />}
            {activeTab === "providers" && <ProvidersTab />}
          </div>
        </div>
      </aside>
    </>
  );
}
