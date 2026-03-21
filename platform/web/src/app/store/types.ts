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
  status: 'running' | 'stopped' | 'not_installed' | 'installing';
  progress?: number;
  subdomain?: string;
};

export type LivOSToStoreMessage =
  | { type: 'status'; apps: AppStatus[] }
  | { type: 'installed'; appId: string; success: boolean; error?: string }
  | { type: 'uninstalled'; appId: string; success: boolean }
  | { type: 'progress'; appId: string; progress: number }
  | { type: 'credentials'; appId: string; username: string; password: string };

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
  sendUpdateSubdomain: (appId: string, subdomain: string) => void;
}

export const CATEGORIES: Record<string, { label: string; icon: string }> = {
  automation: { label: 'Automation', icon: '\u26A1' },
  'cloud-storage': { label: 'Cloud Storage', icon: '\u2601' },
  media: { label: 'Media', icon: '\uD83C\uDFAC' },
  management: { label: 'Management', icon: '\u2699' },
  monitoring: { label: 'Monitoring', icon: '\uD83D\uDCCA' },
  development: { label: 'Development', icon: '\uD83D\uDCBB' },
  photography: { label: 'Photography', icon: '\uD83D\uDCF7' },
  dashboards: { label: 'Dashboards', icon: '\uD83D\uDCC8' },
};
