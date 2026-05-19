// Phase 148 — v37 section enum (SPEC.md §1).
export type Section = 'app' | 'webapp' | 'native' | 'ai' | 'plugin';

export const SECTIONS: { key: Section; label: string; tagline: string }[] = [
  { key: 'app', label: 'Apps', tagline: 'Self-hosted Docker apps' },
  { key: 'webapp', label: 'Web Apps', tagline: 'Hosted services as desktop windows' },
  { key: 'native', label: 'Native', tagline: 'Linux desktop apps' },
  { key: 'ai', label: 'AI', tagline: 'MCP servers, agents & planning skills' },
  { key: 'plugin', label: 'Plugins', tagline: 'Extend LivOS backend + UI' },
];

export interface App {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  section: Section;
  version: string;
  icon_url: string;
  featured: boolean;
  verified: boolean;
  // Manifest shape varies by section (SPEC.md §2). The detail page reads
  // optional fields like installSize / install / port — typed loose here.
  manifest?: unknown;
}

// Lightweight version returned by /api/apps list endpoint
export interface AppSummary {
  id: string;
  name: string;
  tagline: string;
  category: string;
  section: Section;
  icon_url: string;
  featured: boolean;
  verified: boolean;
  version: string;
}

// --- postMessage Bridge Protocol (Phase 19) ---

// Messages sent from Store iframe to LivOS parent
export type StoreToLivOSMessage =
  | { type: 'ready' }
  // Phase 157 — `section` added so the LivOS bridge dispatches to the
  // right installer (Docker / webapp catalog / native apt / MCP / plugin).
  // `composeUrl` is now optional: it only carries data for section='app',
  // legacy LivOS builds that ignore `section` keep working.
  // Phase 157 follow-up — manifest/name/category travel WITH the
  // install message so the LivOS bridge does NOT need to make a
  // cross-origin fetch back to livinity.io (CSP only allows
  // *.livinity.io subdomains, blocking the apex). The iframe is
  // same-origin to livinity.io so it can pre-fetch /api/apps/:id
  // before sending. Empty manifest is fine for section='app' (Docker
  // path uses composeUrl); required for native/ai/plugin/webapp.
  | {
      type: 'install';
      appId: string;
      section: Section;
      composeUrl?: string;
      name?: string;
      category?: string;
      manifest?: unknown;
    }
  // Phase 157 round 3 — uninstall also carries section so the bridge
  // routes v37 sections to apps.uninstallV37 instead of the legacy
  // Docker apps.uninstall (which only knows about ctx.apps.instances).
  | { type: 'uninstall'; appId: string; section?: Section }
  | { type: 'open'; appId: string }
  | { type: 'updateSubdomain'; appId: string; subdomain: string }
  // Phase 151-B — Custom URL form on /store?section=webapp.
  // LivOS host calls webapps-repository.create(url, title, faviconUrl)
  // and pins the new webapp to the dock.
  | {
      type: 'installCustomWebapp';
      url: string;
      title: string;
      faviconUrl?: string | null;
    };

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
  selectedSection: Section;
  setSelectedSection: (s: Section) => void;
  token: string | null;
  instanceName: string | null;
  // postMessage bridge (Phase 19)
  isEmbedded: boolean;
  installedApps: Map<string, AppStatus['status']>;
  sendInstall: (
    appId: string,
    section: Section,
    payload?: { name?: string; category?: string; manifest?: unknown },
  ) => void;
  sendUninstall: (appId: string, section?: Section) => void;
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
  // Custom URL → dock (Phase 151-B)
  sendInstallCustomWebapp: (url: string, title: string, faviconUrl?: string | null) => void;
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
  privacy: { label: 'Privacy', icon: '\uD83D\uDEE1' },
  communication: { label: 'Communication', icon: '\uD83D\uDCAC' },
  productivity: { label: 'Productivity', icon: '\uD83D\uDCDD' },
  'developer-tools': { label: 'Dev Tools', icon: '\uD83D\uDD27' },
  networking: { label: 'Networking', icon: '\uD83C\uDF10' },
};
