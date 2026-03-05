'use client';

import { useState, lazy, Suspense, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Palette,
  Shield,
  Key,
  Brain,
  Plug,
  Mail,
  ShieldCheck,
  BarChart3,
  Webhook,
  Mic,
  Globe,
  Database,
  ArrowRightFromLine,
  Languages,
  Wrench,
  Settings2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

/* ------------------------------------------------------------------ */
/*  Menu items                                                         */
/* ------------------------------------------------------------------ */

export type SettingsSection =
  | 'home'
  | 'account'
  | 'theme'
  | '2fa'
  | 'ai-config'
  | 'nexus-config'
  | 'integrations'
  | 'gmail'
  | 'dm-pairing'
  | 'usage'
  | 'webhooks'
  | 'voice'
  | 'domain'
  | 'backups'
  | 'migration'
  | 'language'
  | 'troubleshoot'
  | 'advanced'
  | 'software-update';

type MenuItem = {
  id: SettingsSection;
  icon: LucideIcon;
  label: string;
  description: string;
};

const MENU_ITEMS: MenuItem[] = [
  { id: 'account', icon: User, label: 'Account', description: 'Name and password' },
  { id: 'theme', icon: Palette, label: 'Theme', description: 'Wallpaper & accent' },
  { id: '2fa', icon: Shield, label: '2FA', description: 'Two-factor auth' },
  { id: 'ai-config', icon: Key, label: 'AI Configuration', description: 'Claude subscription' },
  { id: 'nexus-config', icon: Brain, label: 'Nexus AI', description: 'Agent behavior' },
  { id: 'integrations', icon: Plug, label: 'Integrations', description: 'Telegram & Discord' },
  { id: 'gmail', icon: Mail, label: 'Gmail', description: 'Email integration' },
  { id: 'dm-pairing', icon: ShieldCheck, label: 'DM Security', description: 'Pairing & allowlist' },
  { id: 'usage', icon: BarChart3, label: 'Usage', description: 'Token usage & cost' },
  { id: 'webhooks', icon: Webhook, label: 'Webhooks', description: 'Endpoints & secrets' },
  { id: 'voice', icon: Mic, label: 'Voice', description: 'Push-to-talk settings' },
  { id: 'domain', icon: Globe, label: 'Domain & HTTPS', description: 'Custom domain & SSL' },
  { id: 'backups', icon: Database, label: 'Backups', description: 'Backup & restore' },
  { id: 'migration', icon: ArrowRightFromLine, label: 'Migration', description: 'Transfer from Pi' },
  { id: 'language', icon: Languages, label: 'Language', description: 'Interface language' },
  { id: 'troubleshoot', icon: Wrench, label: 'Troubleshoot', description: 'Debug & logs' },
  { id: 'advanced', icon: Settings2, label: 'Advanced', description: 'Terminal, DNS, Beta' },
  { id: 'software-update', icon: RefreshCw, label: 'Software Update', description: 'Check for updates' },
];

/* ------------------------------------------------------------------ */
/*  Lazy-loaded sections                                               */
/* ------------------------------------------------------------------ */

const AccountSection = lazy(() => import('./sections/account'));
const ThemeSection = lazy(() => import('./sections/theme'));
const TwoFaSection = lazy(() => import('./sections/two-fa'));
const AiConfigSection = lazy(() => import('./sections/ai-config'));
const NexusConfigSection = lazy(() => import('./sections/nexus-config'));
const IntegrationsSection = lazy(() => import('./sections/integrations'));
const GmailSection = lazy(() => import('./sections/gmail'));
const DmPairingSection = lazy(() => import('./sections/dm-pairing'));
const UsageSection = lazy(() => import('./sections/usage'));
const WebhooksSection = lazy(() => import('./sections/webhooks'));
const VoiceSection = lazy(() => import('./sections/voice'));
const DomainSection = lazy(() => import('./sections/domain'));
const BackupsSection = lazy(() => import('./sections/backups'));
const MigrationSection = lazy(() => import('./sections/migration'));
const LanguageSection = lazy(() => import('./sections/language'));
const TroubleshootSection = lazy(() => import('./sections/troubleshoot'));
const AdvancedSection = lazy(() => import('./sections/advanced'));
const SoftwareUpdateSection = lazy(() => import('./sections/software-update'));

function SectionContent({ section }: { section: SettingsSection }) {
  const fallback = (
    <div className="space-y-4 p-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );

  const components: Record<SettingsSection, ReactNode> = {
    home: null,
    account: <AccountSection />,
    theme: <ThemeSection />,
    '2fa': <TwoFaSection />,
    'ai-config': <AiConfigSection />,
    'nexus-config': <NexusConfigSection />,
    integrations: <IntegrationsSection />,
    gmail: <GmailSection />,
    'dm-pairing': <DmPairingSection />,
    usage: <UsageSection />,
    webhooks: <WebhooksSection />,
    voice: <VoiceSection />,
    domain: <DomainSection />,
    backups: <BackupsSection />,
    migration: <MigrationSection />,
    language: <LanguageSection />,
    troubleshoot: <TroubleshootSection />,
    advanced: <AdvancedSection />,
    'software-update': <SoftwareUpdateSection />,
  };

  return <Suspense fallback={fallback}>{components[section]}</Suspense>;
}

/* ------------------------------------------------------------------ */
/*  Settings Layout                                                    */
/* ------------------------------------------------------------------ */

export function SettingsLayout() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('home');
  const activeItem = MENU_ITEMS.find((m) => m.id === activeSection);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-border bg-surface-1">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
        </div>
        <ScrollArea className="h-[calc(100%-44px)]">
          <nav className="space-y-0.5 px-2 pb-4">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
                    'transition-colors',
                    isActive
                      ? 'bg-brand/8 text-brand'
                      : 'text-text-secondary hover:bg-neutral-100 hover:text-text',
                  )}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </ScrollArea>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-0">
        {activeSection === 'home' ? (
          <SettingsHome onSelectSection={setActiveSection} />
        ) : (
          <div className="p-5">
            {/* Back + title header */}
            <div className="mb-5 flex items-center gap-3">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text"
                onClick={() => setActiveSection('home')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <h3 className="text-sm font-semibold text-text">
                  {activeItem?.label}
                </h3>
                <p className="text-xs text-text-tertiary">
                  {activeItem?.description}
                </p>
              </div>
            </div>

            <SectionContent section={activeSection} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Home (grid overview)                                      */
/* ------------------------------------------------------------------ */

function SettingsHome({
  onSelectSection,
}: {
  onSelectSection: (s: SettingsSection) => void;
}) {
  return (
    <div className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-text">All Settings</h3>
      <AnimatedGroup
        preset="fade"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-xl p-3 text-left',
                'bg-surface-0 transition-colors hover:bg-surface-1',
                'border border-border shadow-sm',
              )}
              onClick={() => onSelectSection(item.id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                <Icon className="h-4 w-4 text-text-secondary" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-text">{item.label}</p>
                <p className="truncate text-[11px] text-text-tertiary">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </AnimatedGroup>
    </div>
  );
}
