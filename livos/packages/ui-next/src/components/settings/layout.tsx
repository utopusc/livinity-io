'use client';

import { useState, lazy, Suspense, type ReactNode } from 'react';
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
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';

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
  group: string;
};

const MENU_ITEMS: MenuItem[] = [
  { id: 'account', icon: User, label: 'Account', description: 'Name and password', group: 'Personal' },
  { id: 'theme', icon: Palette, label: 'Theme', description: 'Wallpaper & accent', group: 'Personal' },
  { id: 'language', icon: Languages, label: 'Language', description: 'Interface language', group: 'Personal' },
  { id: '2fa', icon: Shield, label: '2FA', description: 'Two-factor auth', group: 'Security' },
  { id: 'dm-pairing', icon: ShieldCheck, label: 'DM Security', description: 'Pairing & allowlist', group: 'Security' },
  { id: 'ai-config', icon: Key, label: 'AI Configuration', description: 'Claude subscription', group: 'AI' },
  { id: 'nexus-config', icon: Brain, label: 'Nexus AI', description: 'Agent behavior', group: 'AI' },
  { id: 'usage', icon: BarChart3, label: 'Usage', description: 'Token usage & cost', group: 'AI' },
  { id: 'integrations', icon: Plug, label: 'Integrations', description: 'Telegram & Discord', group: 'Integrations' },
  { id: 'gmail', icon: Mail, label: 'Gmail', description: 'Email integration', group: 'Integrations' },
  { id: 'webhooks', icon: Webhook, label: 'Webhooks', description: 'Endpoints & secrets', group: 'Integrations' },
  { id: 'voice', icon: Mic, label: 'Voice', description: 'Push-to-talk settings', group: 'Integrations' },
  { id: 'domain', icon: Globe, label: 'Domain & HTTPS', description: 'Custom domain & SSL', group: 'System' },
  { id: 'backups', icon: Database, label: 'Backups', description: 'Backup & restore', group: 'System' },
  { id: 'migration', icon: ArrowRightFromLine, label: 'Migration', description: 'Transfer from Pi', group: 'System' },
  { id: 'software-update', icon: RefreshCw, label: 'Software Update', description: 'Check for updates', group: 'System' },
  { id: 'troubleshoot', icon: Wrench, label: 'Troubleshoot', description: 'Debug & logs', group: 'System' },
  { id: 'advanced', icon: Settings2, label: 'Advanced', description: 'Terminal, DNS, Beta', group: 'System' },
];

// Group items for sidebar rendering
const MENU_GROUPS = ['Personal', 'Security', 'AI', 'Integrations', 'System'];

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
      <div className="w-56 shrink-0 border-r border-black/[0.06] bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-black/[0.06]">
          <h2 className="text-sm font-semibold text-neutral-900">Settings</h2>
        </div>
        <ScrollArea className="flex-1">
          <nav className="px-2 pb-4">
            {MENU_GROUPS.map((group) => {
              const groupItems = MENU_ITEMS.filter((item) => item.group === group);
              return (
                <div key={group}>
                  <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider px-3 mt-4 mb-1">
                    {group}
                  </p>
                  <AnimatedBackground
                    defaultValue={activeSection !== 'home' ? activeSection : undefined}
                    className="rounded-lg bg-brand/[0.06]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
                  >
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.id === activeSection;
                      return (
                        <button
                          key={item.id}
                          data-id={item.id}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm',
                            'transition-colors',
                            isActive
                              ? 'text-brand font-medium'
                              : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
                          )}
                          onClick={() => setActiveSection(item.id)}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </AnimatedBackground>
                </div>
              );
            })}
          </nav>
        </ScrollArea>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-neutral-50">
        {activeSection === 'home' ? (
          <SettingsHome onSelectSection={setActiveSection} />
        ) : (
          <div className="p-6 space-y-6">
            {/* Back + title header */}
            <div className="flex items-center gap-3">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700 hover:shadow-sm border border-transparent hover:border-black/[0.06]"
                onClick={() => setActiveSection('home')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  {activeItem?.label}
                </h3>
                <p className="text-xs text-neutral-500">
                  {activeItem?.description}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-black/[0.06] p-5">
              <SectionContent section={activeSection} />
            </div>
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
    <div className="p-6">
      <h3 className="mb-5 text-sm font-semibold text-neutral-900">All Settings</h3>
      <AnimatedGroup
        preset="fade"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-xl p-5 text-left',
                'bg-white border border-black/[0.06]',
                'hover:shadow-sm transition-shadow',
              )}
              onClick={() => onSelectSection(item.id)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/[0.06] text-brand">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                <p className="truncate text-xs text-neutral-500">
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
