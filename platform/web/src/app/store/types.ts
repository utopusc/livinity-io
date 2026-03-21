export interface App {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  version: string;
  icon_url: string;
  featured: boolean;
  verified: boolean;
}

// Lightweight version returned by /api/apps list endpoint
export interface AppSummary {
  id: string;
  name: string;
  tagline: string;
  category: string;
  icon_url: string;
  featured: boolean;
  version: string;
}

// --- postMessage Bridge Protocol (Phase 19) ---

// Messages sent from Store iframe to LivOS parent
export type StoreToLivOSMessage =
  | { type: 'ready' }
  | { type: 'install'; appId: string; composeUrl: string }
  | { type: 'uninstall'; appId: string }
  | { type: 'open'; appId: string }
  | { type: 'updateSubdomain'; appId: string; subdomain: string };

// Messages sent from LivOS parent to Store iframe
export type AppStatus = {
  id: string;
  status: 'running' | 'stopped' | 'not_installed' | 'installing' | 'uninstalling';
  progress?: number;
  subdomain?: string;
  defaultUsername?: string;
  defaultPassword?: string;
};

export type InstanceInfo = {
  hostname: string;
  userName: string;
  avatarColor: string;
  version: string;
  versionName: string;
  cpu: string;
  memory: { total: number; used: number };
  disk: { total: number; used: number };
};

export type LivOSToStoreMessage =
  | { type: 'status'; apps: AppStatus[]; instance?: InstanceInfo }
  | { type: 'installed'; appId: string; success: boolean; error?: string }
  | { type: 'uninstalled'; appId: string; success: boolean }
  | { type: 'progress'; appId: string; progress: number }
  | { type: 'credentials'; appId: string; username: string; password: string }
  | { type: 'reportEvent'; appId: string; action: 'install' | 'uninstall'; apiKey: string; instanceName: string };

export type AppCredentials = {
  appId: string;
  username: string;
  password: string;
};

// Extended context value with bridge state
export interface StoreContextValue {
  apps: AppSummary[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (c: string | null) => void;
  token: string | null;
  instanceName: string | null;
  // postMessage bridge (Phase 19)
  isEmbedded: boolean;
  installedApps: Map<string, AppStatus['status']>;
  sendInstall: (appId: string) => void;
  sendUninstall: (appId: string) => void;
  sendOpen: (appId: string) => void;
  getAppStatus: (appId: string) => AppStatus['status'];
  // Progress & credentials (Phase 22)
  installProgress: Map<string, number>;
  getInstallProgress: (appId: string) => number;
  appCredentials: AppCredentials | null;
  clearCredentials: () => void;
  // Subdomain management
  getAppSubdomain: (appId: string) => string | undefined;
  getAppDefaultCreds: (appId: string) => {username: string; password: string} | undefined;
  sendUpdateSubdomain: (appId: string, subdomain: string) => void;
  // Instance info
  instanceInfo: InstanceInfo | null;
}

export const CATEGORIES: Record<string, { label: string; icon: string }> = {
  ai: { label: 'AI & ML', icon: '\uD83E\uDD16' },
  automation: { label: 'Automation', icon: '\u26A1' },
  'cloud-storage': { label: 'Files & Storage', icon: '\u2601' },
  media: { label: 'Media', icon: '\uD83C\uDFAC' },
  management: { label: 'Management', icon: '\u2699' },
  monitoring: { label: 'Monitoring', icon: '\uD83D\uDCCA' },
  development: { label: 'Development', icon: '\uD83D\uDCBB' },
  photography: { label: 'Photography', icon: '\uD83D\uDCF7' },
  security: { label: 'Security', icon: '\uD83D\uDD12' },
  dashboards: { label: 'Dashboards', icon: '\uD83D\uDCC8' },
};
