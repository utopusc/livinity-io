"use client";

import type { AppContinueConversationHandler } from "@/components/apps/AppDetail";
import type { CronJobRecord, CronRunEntry } from "@/lib/cron";
import type {
  AppRecord,
  AppStore,
  AppSummary,
  ArtifactRecord,
  ArtifactStore,
  ArtifactSummary,
} from "@/lib/engines/types";
import { ConnectionState } from "@/lib/gateway/types";
import type { NotificationRecord } from "@/lib/notifications";
import type { Settings } from "@/lib/storage";
import type { ClawThread } from "@/types/claw-thread";
import { createContext, useContext, type ReactNode, type RefObject } from "react";

/**
 * Phase 203 Hot-fix H — handshake state shared across the app. Mirrors the
 * literal union in ChatApp.tsx (`LivOsBypassMode`) — duplicated here to
 * avoid a cycle on a component-internal type.
 */
export type LivOsBypassMode = "probing" | "livos" | "livos-error" | "standalone";

export interface ChatAppContextValue {
  // Data shared by 2+ routes.
  threads: ClawThread[];
  appList: AppSummary[];
  artifactList: ArtifactSummary[];
  notifications: NotificationRecord[];
  cronJobs: CronJobRecord[];
  cronRuns: CronRunEntry[];
  apps: AppStore | undefined;
  artifacts: ArtifactStore | undefined;
  pinnedAppIds: Set<string>;
  knownAgentIds: RefObject<Set<string>>;
  connectionState: ConnectionState;
  /** Phase 205 Hot-fix N — needed by SettingsRoute Connection tab. */
  settings: Settings | null;
  /** Phase 205 Hot-fix N — `livinityd` handshake state; gates the Connection
   * tab's URL/token form. */
  livOsBypassMode: LivOsBypassMode;
  /** Phase 205 Hot-fix N — Settings → Connection tab Save & Connect handler. */
  onReconnect: (settings: Settings) => void;

  // Cross-route handlers.
  openNotification: (n: NotificationRecord) => Promise<void>;
  setCronTrayJobId: (id: string | null) => void;
  onMarkNotificationsRead: (ids?: string[]) => Promise<boolean>;
  onTogglePinned: (appId: string) => void;
  onDeleteApp: (appId: string) => Promise<void>;
  onRefreshApps: () => void;
  onRefreshArtifacts: () => void;
  onRefineApp: (record: AppRecord) => void | Promise<void>;
  onRefineArtifact: (record: ArtifactRecord) => void | Promise<void>;
  onAppContinueConversation: AppContinueConversationHandler;
  onUpdateCronJob: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onRunCronJob: (id: string, mode?: "force" | "due") => Promise<boolean>;
  onRemoveCronJob: (id: string) => Promise<boolean>;
  onRefreshCronData: () => Promise<{
    jobs: CronJobRecord[];
    runs: CronRunEntry[];
    status: unknown;
  }>;
}

const ChatAppContext = createContext<ChatAppContextValue | null>(null);

export function ChatAppProvider({
  value,
  children,
}: {
  value: ChatAppContextValue;
  children: ReactNode;
}) {
  return <ChatAppContext.Provider value={value}>{children}</ChatAppContext.Provider>;
}

export function useChatAppContext(): ChatAppContextValue {
  const value = useContext(ChatAppContext);
  if (!value) {
    throw new Error("useChatAppContext must be used inside <ChatAppProvider>");
  }
  return value;
}
