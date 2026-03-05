'use client';

import { useState } from 'react';
import { Power, RotateCcw, AlertTriangle, Loader2, Server, Clock, Wifi, Play, Square, ChevronDown, Box } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from '@/components/motion-primitives/disclosure';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// App state type mirrors the backend AppState union
type AppState =
  | 'unknown'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'restarting'
  | 'uninstalling'
  | 'updating'
  | 'ready';

type AppListItem = {
  id: string;
  name?: string;
  icon?: string;
  port?: number;
  path?: string;
  state?: AppState;
  error?: string;
};

export function ServerControlLayout() {
  const { data: version } = trpcReact.system.version.useQuery();
  const { data: uptime } = trpcReact.system.uptime.useQuery();
  const { data: ips } = trpcReact.system.getIpAddresses.useQuery();

  return (
    <div className="space-y-6 p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Server Control</h3>

      {/* System info */}
      <AnimatedGroup preset="fade" className="grid grid-cols-2 gap-3">
        <InfoCard icon={Server} label="Version" value={version ? `${version.name} v${version.version}` : '...'} />
        <UptimeCard uptime={uptime} />
        <InfoCard icon={Wifi} label="Local IP" value={ips?.[0] ?? '...'} className="col-span-2" />
      </AnimatedGroup>

      {/* Actions */}
      <div className="space-y-3">
        <RestartButton />
        <ShutdownButton />
      </div>

      {/* Docker containers */}
      <DockerContainersSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docker Containers Section
// ---------------------------------------------------------------------------

function DockerContainersSection() {
  const { data: apps, isLoading, isError, error } = trpcReact.apps.list.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const validApps = (apps ?? []).filter((a): a is AppListItem & { name: string } => !('error' in a && a.error) && typeof (a as AppListItem).name === 'string') as AppListItem[];
  const runningCount = validApps.filter((a) => a.state === 'running' || a.state === 'ready').length;
  const totalCount = validApps.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="space-y-3"
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-900">Docker Containers</span>
        </div>
        {!isLoading && !isError && (
          <span className="text-[11px] text-neutral-400 tabular-nums">
            {runningCount}/{totalCount} running
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-xl bg-error/[0.06] border border-error/[0.15] p-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-error shrink-0" />
          <p className="text-[11px] text-error">{(error as Error)?.message ?? 'Failed to load containers'}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && validApps.length === 0 && (
        <div className="rounded-xl border border-dashed border-black/[0.08] p-4 text-center">
          <p className="text-[11px] text-neutral-400">No apps installed</p>
        </div>
      )}

      {/* Container list */}
      {!isLoading && !isError && validApps.length > 0 && (
        <div className="space-y-2">
          {validApps.map((app) => (
            <ContainerRow key={app.id} app={app} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Container Row — individual app/container card with disclosure
// ---------------------------------------------------------------------------

function ContainerRow({ app }: { app: AppListItem }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpcReact.useUtils();

  const invalidateList = () => utils.apps.list.invalidate();

  const startMutation = trpcReact.apps.start.useMutation({ onSuccess: invalidateList });
  const stopMutation = trpcReact.apps.stop.useMutation({ onSuccess: invalidateList });
  const restartMutation = trpcReact.apps.restart.useMutation({ onSuccess: invalidateList });

  const isBusy =
    startMutation.isPending ||
    stopMutation.isPending ||
    restartMutation.isPending ||
    app.state === 'starting' ||
    app.state === 'stopping' ||
    app.state === 'restarting' ||
    app.state === 'installing' ||
    app.state === 'updating' ||
    app.state === 'uninstalling';

  const isRunning = app.state === 'running' || app.state === 'ready';
  const isStopped = app.state === 'stopped';

  const mutationError =
    (startMutation.isError ? startMutation.error?.message : null) ||
    (stopMutation.isError ? stopMutation.error?.message : null) ||
    (restartMutation.isError ? restartMutation.error?.message : null);

  return (
    <Disclosure
      open={expanded}
      onOpenChange={setExpanded}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="rounded-xl border border-black/[0.06] bg-white overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Status dot */}
          <StateDot state={app.state} />

          {/* App icon + name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {app.icon && (
              <img
                src={app.icon}
                alt=""
                aria-hidden="true"
                className="h-5 w-5 rounded-md shrink-0 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-900 truncate leading-tight">{app.name ?? app.id}</p>
              <StateBadge state={app.state} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Start — shown when stopped */}
            {isStopped && (
              <ActionButton
                title="Start"
                disabled={isBusy}
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate({ appId: app.id })}
                className="text-success hover:bg-success/[0.08]"
              >
                <Play className="h-3 w-3 fill-current" />
              </ActionButton>
            )}

            {/* Stop — shown when running */}
            {isRunning && (
              <ActionButton
                title="Stop"
                disabled={isBusy}
                loading={stopMutation.isPending}
                onClick={() => stopMutation.mutate({ appId: app.id })}
                className="text-error hover:bg-error/[0.08]"
              >
                <Square className="h-3 w-3 fill-current" />
              </ActionButton>
            )}

            {/* Restart — shown when running */}
            {isRunning && (
              <ActionButton
                title="Restart"
                disabled={isBusy}
                loading={restartMutation.isPending}
                onClick={() => restartMutation.mutate({ appId: app.id })}
                className="text-neutral-500 hover:bg-neutral-100"
              >
                <RotateCcw className="h-3 w-3" />
              </ActionButton>
            )}

            {/* In-progress spinner */}
            {isBusy && !startMutation.isPending && !stopMutation.isPending && !restartMutation.isPending && (
              <span className="flex h-7 w-7 items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
              </span>
            )}

            {/* Expand chevron */}
            <DisclosureTrigger>
              <button
                aria-label={expanded ? 'Collapse details' : 'Expand details'}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100',
                )}
              >
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-center"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </button>
            </DisclosureTrigger>
          </div>
        </div>

        {/* Error feedback */}
        <AnimatePresence>
          {mutationError && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-error/[0.06] border border-error/[0.15] px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 text-error shrink-0" />
                <p className="text-[10px] text-error">{mutationError}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expandable details */}
        <DisclosureContent>
          <div className="border-t border-black/[0.05] bg-neutral-50/60 px-3 py-2.5 space-y-1.5">
            <DetailRow label="App ID" value={app.id} />
            {app.port && <DetailRow label="Port" value={String(app.port)} />}
            {app.path && <DetailRow label="Path" value={app.path} />}
            {app.state && <DetailRow label="State" value={app.state} />}
          </div>
        </DisclosureContent>
      </div>
    </Disclosure>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StateDot({ state }: { state: AppState | undefined }) {
  const isRunning = state === 'running' || state === 'ready';
  const isStopped = state === 'stopped' || state === 'unknown';
  const isBusy = !isRunning && !isStopped;

  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        isRunning && 'bg-success shadow-[0_0_0_2px_rgba(34,197,94,0.15)]',
        isStopped && 'bg-neutral-300',
        isBusy && 'bg-warning animate-pulse',
      )}
      aria-hidden="true"
    />
  );
}

function StateBadge({ state }: { state: AppState | undefined }) {
  if (!state || state === 'unknown') return null;

  const variantMap: Partial<Record<AppState, 'success' | 'error' | 'warning' | 'default'>> = {
    running: 'success',
    ready: 'success',
    stopped: 'default',
    starting: 'warning',
    stopping: 'warning',
    restarting: 'warning',
    installing: 'warning',
    updating: 'warning',
    uninstalling: 'warning',
  };

  const labelMap: Partial<Record<AppState, string>> = {
    running: 'Running',
    ready: 'Running',
    stopped: 'Stopped',
    starting: 'Starting...',
    stopping: 'Stopping...',
    restarting: 'Restarting...',
    installing: 'Installing...',
    updating: 'Updating...',
    uninstalling: 'Removing...',
  };

  return (
    <Badge variant={variantMap[state] ?? 'default'} className="mt-0.5 h-4 px-1.5 text-[10px] leading-none">
      {labelMap[state] ?? state}
    </Badge>
  );
}

function ActionButton({
  children,
  title,
  disabled,
  loading,
  onClick,
  className,
}: {
  children: React.ReactNode;
  title: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : children}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] text-neutral-400 shrink-0">{label}</span>
      <span className="text-[10px] text-neutral-600 font-mono truncate text-right">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server action buttons
// ---------------------------------------------------------------------------

function RestartButton() {
  const [confirming, setConfirming] = useState(false);

  const restart = trpcReact.system.restart.useMutation({
    onSuccess: () => {
      // Server is restarting — nothing further to do in the UI
      setConfirming(false);
    },
  });

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} className="w-full justify-start rounded-lg">
        <RotateCcw className="mr-2 h-4 w-4" />
        Restart Server
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-warning/[0.07] p-3 border border-warning/[0.18] space-y-2">
      <p className="text-xs text-warning font-medium">Restart the server?</p>
      <p className="text-[11px] text-neutral-500">All running apps and connections will be interrupted.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={restart.isPending}
          onClick={() => restart.mutate()}
          className="rounded-lg"
        >
          {restart.isPending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Restarting...
            </>
          ) : (
            'Confirm Restart'
          )}
        </Button>
        <Button size="sm" variant="ghost" disabled={restart.isPending} onClick={() => setConfirming(false)} className="rounded-lg">
          Cancel
        </Button>
      </div>
      {restart.isError && (
        <p className="text-[11px] text-error flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {restart.error.message}
        </p>
      )}
    </div>
  );
}

function ShutdownButton() {
  const [confirming, setConfirming] = useState(false);

  const shutdown = trpcReact.system.shutdown.useMutation({
    onSuccess: () => {
      // Server is shutting down — nothing further to do in the UI
      setConfirming(false);
    },
  });

  if (!confirming) {
    return (
      <Button size="sm" variant="destructive" onClick={() => setConfirming(true)} className="w-full justify-start rounded-lg">
        <Power className="mr-2 h-4 w-4" />
        Shutdown Server
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-error/[0.06] p-3 border border-error/[0.15] space-y-2">
      <p className="text-xs text-error font-medium">Shut down the server?</p>
      <p className="text-[11px] text-neutral-500">The server will become inaccessible until physically restarted.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={shutdown.isPending}
          onClick={() => shutdown.mutate()}
          className="rounded-lg"
        >
          {shutdown.isPending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Shutting down...
            </>
          ) : (
            'Confirm Shutdown'
          )}
        </Button>
        <Button size="sm" variant="ghost" disabled={shutdown.isPending} onClick={() => setConfirming(false)} className="rounded-lg">
          Cancel
        </Button>
      </div>
      {shutdown.isError && (
        <p className="text-[11px] text-error flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {shutdown.error.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info cards
// ---------------------------------------------------------------------------

function InfoCard({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-white border border-black/[0.06] p-4 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-xs text-neutral-500">{label}</span>
      </div>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function UptimeCard({ uptime }: { uptime: number | string | undefined }) {
  const uptimeSeconds = uptime
    ? typeof uptime === 'string'
      ? parseInt(uptime)
      : uptime
    : 0;

  return (
    <div className="rounded-xl bg-white border border-black/[0.06] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-xs text-neutral-500">Uptime</span>
      </div>
      <p className="text-sm font-medium text-neutral-900">
        {uptime ? formatUptime(uptimeSeconds) : '...'}
      </p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (isNaN(seconds)) return '...';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
