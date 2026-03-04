'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  Home,
  FolderOpen,
  Settings,
  BarChart3,
  Store,
  MessageCircle,
  Server,
  Bot,
  CalendarClock,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { trpcReact } from '@/trpc/client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SystemApp = {
  id: string;
  name: string;
  icon: LucideIcon;
  windowOnly?: boolean;
};

export type UserApp = {
  id: string;
  name: string;
  icon: string;
  port?: number;
  path?: string;
  state?: string;
};

/* ------------------------------------------------------------------ */
/*  System apps                                                        */
/* ------------------------------------------------------------------ */

export const systemApps: SystemApp[] = [
  { id: 'LIVINITY_home', name: 'Home', icon: Home },
  { id: 'LIVINITY_files', name: 'Files', icon: FolderOpen },
  { id: 'LIVINITY_settings', name: 'Settings', icon: Settings },
  { id: 'LIVINITY_live-usage', name: 'Usage', icon: BarChart3 },
  { id: 'LIVINITY_app-store', name: 'App Store', icon: Store },
  { id: 'LIVINITY_ai-chat', name: 'AI Chat', icon: MessageCircle, windowOnly: true },
  { id: 'LIVINITY_server-control', name: 'Server', icon: Server, windowOnly: true },
  { id: 'LIVINITY_subagents', name: 'Agents', icon: Bot, windowOnly: true },
  { id: 'LIVINITY_schedules', name: 'Schedules', icon: CalendarClock, windowOnly: true },
  { id: 'LIVINITY_terminal', name: 'Terminal', icon: Terminal, windowOnly: true },
];

const systemAppsMap = new Map(systemApps.map((a) => [a.id, a]));

/** Dock groups: [first group] | [second group] */
export const dockAppsGroup1 = systemApps.slice(0, 5); // home → app-store
export const dockAppsGroup2 = systemApps.slice(5);     // ai-chat → terminal

/** Get Lucide icon for a system app */
export function getSystemAppIcon(appId: string): LucideIcon | undefined {
  return systemAppsMap.get(appId)?.icon;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type AppsContextT = {
  userApps: UserApp[];
  isLoading: boolean;
  systemApps: SystemApp[];
};

const AppsContext = createContext<AppsContextT | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AppsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = trpcReact.apps.list.useQuery();

  const userApps = useMemo(() => {
    if (!data) return [];
    return data
      .filter((app: any) => !('error' in app))
      .map((app: any) => ({
        id: app.id,
        name: app.name,
        icon: app.icon,
        port: app.port,
        path: app.path,
        state: app.state,
      }));
  }, [data]);

  const ctx = useMemo(
    () => ({ userApps, isLoading, systemApps }),
    [userApps, isLoading],
  );

  return <AppsContext.Provider value={ctx}>{children}</AppsContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
