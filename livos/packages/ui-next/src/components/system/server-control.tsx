'use client';

import { useState } from 'react';
import { Power, RotateCcw, AlertTriangle, Loader2, Server, Clock, Wifi } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

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
    </div>
  );
}

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
