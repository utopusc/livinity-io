'use client';

import { Suspense, type ReactNode } from 'react';
import { Loader2, Construction } from 'lucide-react';
import { type WindowState } from '@/providers/window-manager';

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
const fullHeightApps = new Set(['LIVINITY_ai-chat', 'LIVINITY_terminal']);

export function WindowContent({ window: win }: { window: WindowState }) {
  const content = getContentForApp(win.appId, win.title);
  const isFullHeight = fullHeightApps.has(win.appId);

  return (
    <Suspense fallback={<WindowLoading />}>
      <div className={isFullHeight ? 'h-full' : 'h-full overflow-y-auto'}>
        {content}
      </div>
    </Suspense>
  );
}

function getContentForApp(appId: string, title: string): ReactNode {
  // Phase 04+: These will be replaced with lazy-loaded actual app components
  // For now, show placeholder screens
  switch (appId) {
    case 'LIVINITY_settings':
      return <ComingSoon name="Settings" />;
    case 'LIVINITY_app-store':
      return <ComingSoon name="App Store" />;
    case 'LIVINITY_files':
      return <ComingSoon name="Files" />;
    case 'LIVINITY_ai-chat':
      return <ComingSoon name="AI Chat" />;
    case 'LIVINITY_server-control':
      return <ComingSoon name="Server Control" />;
    case 'LIVINITY_subagents':
      return <ComingSoon name="Agents" />;
    case 'LIVINITY_schedules':
      return <ComingSoon name="Schedules" />;
    case 'LIVINITY_terminal':
      return <ComingSoon name="Terminal" />;
    case 'LIVINITY_live-usage':
      return <ComingSoon name="Live Usage" />;
    default:
      return <ComingSoon name={title || 'Unknown App'} />;
  }
}
