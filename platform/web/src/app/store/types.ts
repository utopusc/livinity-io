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
