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
 * Phase 205-02 — Settings dialog shell.
 *
 * Previously the dialog body rendered the gateway status banner +
 * URL/token form directly. This wave wraps the body in a 3-tab
 * SegmentedTabs strip (Connection → MCP Servers → Gateway):
 *
 *  - The original body (verbatim) moved into `ConnectionTab.tsx`.
 *  - `McpServersTab.tsx` is a placeholder shell — Wave 2 (Plan 205-03)
 *    fills it with the External MCP servers CRUD UI.
 *  - `GatewayTab.tsx` is a placeholder shell — Wave 3 (Plan 205-04)
 *    fills it with the paired devices / allowed origins / auth mode UI.
 *
 * The component's public prop signature is UNCHANGED — callers in
 * `ChatApp.tsx` (and tests) keep working without edits.
 */

type SettingsTab = "connection" | "mcp" | "gateway";

interface Props {
  open: boolean;
  currentSettings: Settings | null;
  connectionState: ConnectionState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}

export function SettingsDialog({ open, currentSettings, connectionState, onClose, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  // Reset to the Connection tab every time the dialog opens — keeps the
  // first-visit UX predictable. (Mid-session tab switches still work.)
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
            />
          )}
          {activeTab === "mcp" && <McpServersTab />}
          {activeTab === "gateway" && <GatewayTab />}
        </div>
      </div>
    </dialog>
  );
}
