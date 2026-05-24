"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/layout/sidebar/IconButton";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ConnectionState } from "@/lib/gateway/types";
import type { Settings } from "@/lib/storage";

import { ConnectionTab } from "./ConnectionTab";
import { GatewayTab } from "./GatewayTab";
import { McpServersTab } from "./McpServersTab";

/**
 * Phase 205 Hot-fix M.1 — REVERT to modal popup.
 *
 * The Hot-fix M side-panel + ProvidersTab redesign was rejected by the
 * operator on 2026-05-24: "Acilan popup UI i inanılmaz kötü… istedigim UI
 * bu degildi". Operator wants Settings to swap the main content area
 * (the chat home page) and add a back button — a route-level navigation,
 * NOT a dialog and NOT a side panel.
 *
 * Until that redesign ships (next session — see project_v40 handoff +
 * Hot-fix N / O plan), this file is restored to the Hot-fix L3 modal
 * shape so the page at least loads. The Phase-204 Providers tab remains
 * reachable at `/liv-ai-app/settings` (Next.js subapp) as a workaround.
 *
 * Carrying forward from Hot-fix K: `suppressConnectionForm` still hides
 * the gateway URL + token form inside LivOS while leaving MCP + Gateway
 * tabs usable.
 */

type SettingsTab = "connection" | "mcp" | "gateway";

interface Props {
  open: boolean;
  currentSettings: Settings | null;
  connectionState: ConnectionState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  /** Phase 205 Hot-fix K — passed straight to ConnectionTab. */
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  useEffect(() => {
    if (open) setActiveTab("connection");
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-2xl border border-border-default/50 bg-background p-l text-text-neutral-primary shadow-2xl outline-none backdrop:bg-overlay dark:border-border-default/16 dark:bg-foreground"
      onClose={onClose}
    >
      <div className="flex flex-col">
        <div className="mb-ml flex items-center justify-between">
          <h2 className="font-heading text-md font-bold text-text-neutral-primary">Settings</h2>
          <IconButton
            icon={X}
            variant="tertiary"
            size="md"
            title="Close"
            aria-label="Close"
            onClick={onClose}
          />
        </div>

        <div className="mb-ml">
          <SegmentedTabs<SettingsTab>
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "connection", label: "Connection" },
              { value: "mcp", label: "MCP Servers" },
              { value: "gateway", label: "Gateway" },
            ]}
            ariaLabel="Settings sections"
          />
        </div>

        <div className="min-h-0 overflow-y-auto">
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
        </div>
      </div>
    </dialog>
  );
}
