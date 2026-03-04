'use client';

import { Suspense, lazy, type ReactNode } from 'react';
import { Loader2, Construction } from 'lucide-react';
import { type WindowState } from '@/providers/window-manager';
import { ErrorBoundary } from '@/components/error-boundary';

const SettingsLayout = lazy(() => import('@/components/settings/layout').then(m => ({ default: m.SettingsLayout })));
const AppStoreLayout = lazy(() => import('@/components/app-store/layout').then(m => ({ default: m.AppStoreLayout })));
const FileManagerLayout = lazy(() => import('@/components/file-manager/layout').then(m => ({ default: m.FileManagerLayout })));
const AiChatLayout = lazy(() => import('@/components/ai-chat/layout').then(m => ({ default: m.AiChatLayout })));
const ServerControlLayout = lazy(() => import('@/components/system/server-control').then(m => ({ default: m.ServerControlLayout })));
const SubagentsLayout = lazy(() => import('@/components/system/subagents').then(m => ({ default: m.SubagentsLayout })));
const SchedulesLayout = lazy(() => import('@/components/system/schedules').then(m => ({ default: m.SchedulesLayout })));
const TerminalLayout = lazy(() => import('@/components/system/terminal').then(m => ({ default: m.TerminalLayout })));
const LiveUsageLayout = lazy(() => import('@/components/system/live-usage').then(m => ({ default: m.LiveUsageLayout })));

/* ------------------------------------------------------------------ */
/*  Loading fallback                                                   */
/* ------------------------------------------------------------------ */

function WindowLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Placeholder for apps not yet built                                 */
/* ------------------------------------------------------------------ */

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Construction className="h-8 w-8 text-text-tertiary" />
      <div>
        <p className="text-sm font-medium text-text">{name}</p>
        <p className="text-xs text-text-tertiary">Coming in a future phase</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Content Router                                                     */
/* ------------------------------------------------------------------ */

/** Full-height apps (no scroll wrapper) */
const fullHeightApps = new Set(['LIVINITY_ai-chat', 'LIVINITY_terminal', 'LIVINITY_settings', 'LIVINITY_app-store', 'LIVINITY_files', 'LIVINITY_subagents', 'LIVINITY_schedules', 'LIVINITY_live-usage', 'LIVINITY_server-control']);

export function WindowContent({ window: win }: { window: WindowState }) {
  const content = getContentForApp(win.appId, win.title);
  const isFullHeight = fullHeightApps.has(win.appId);

  return (
    <ErrorBoundary>
      <Suspense fallback={<WindowLoading />}>
        <div className={isFullHeight ? 'h-full' : 'h-full overflow-y-auto'}>
          {content}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}

function getContentForApp(appId: string, title: string): ReactNode {
  // Phase 04+: These will be replaced with lazy-loaded actual app components
  // For now, show placeholder screens
  switch (appId) {
    case 'LIVINITY_settings':
      return <SettingsLayout />;
    case 'LIVINITY_app-store':
      return <AppStoreLayout />;
    case 'LIVINITY_files':
      return <FileManagerLayout />;
    case 'LIVINITY_ai-chat':
      return <AiChatLayout />;
    case 'LIVINITY_server-control':
      return <ServerControlLayout />;
    case 'LIVINITY_subagents':
      return <SubagentsLayout />;
    case 'LIVINITY_schedules':
      return <SchedulesLayout />;
    case 'LIVINITY_terminal':
      return <TerminalLayout />;
    case 'LIVINITY_live-usage':
      return <LiveUsageLayout />;
    default:
      return <ComingSoon name={title || 'Unknown App'} />;
  }
}
