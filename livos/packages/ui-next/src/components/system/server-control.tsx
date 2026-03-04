'use client';

import { useState } from 'react';
import { Power, RotateCcw, AlertTriangle, Loader2, Server, Clock, Wifi } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export function ServerControlLayout() {
  const { data: version } = trpcReact.system.version.useQuery();
  const { data: uptime } = trpcReact.system.uptime.useQuery();
  const { data: ips } = trpcReact.system.getIpAddresses.useQuery();

  return (
    <div className="space-y-6 p-5">
      <h3 className="text-sm font-semibold text-text">Server Control</h3>

      {/* System info */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard icon={Server} label="Version" value={version ? `${version.name} v${version.version}` : '...'} />
        <InfoCard icon={Clock} label="Uptime" value={uptime ? formatUptime(uptime) : '...'} />
        <InfoCard icon={Wifi} label="Local IP" value={ips?.[0] ?? '...'} className="col-span-2" />
      </div>

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

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} className="w-full justify-start">
        <RotateCcw className="mr-2 h-4 w-4" />
        Restart Server
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-warning/10 p-3 border border-warning/20 space-y-2">
      <p className="text-xs text-warning font-medium">Restart the server?</p>
      <p className="text-[11px] text-text-tertiary">All running apps and connections will be interrupted.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => { /* TODO: system.restart mutation */ setConfirming(false); }}>
          Confirm Restart
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function ShutdownButton() {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button size="sm" variant="destructive" onClick={() => setConfirming(true)} className="w-full justify-start">
        <Power className="mr-2 h-4 w-4" />
        Shutdown Server
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-error/10 p-3 border border-error/20 space-y-2">
      <p className="text-xs text-error font-medium">Shut down the server?</p>
      <p className="text-[11px] text-text-tertiary">The server will become inaccessible until physically restarted.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={() => { /* TODO: system.shutdown mutation */ setConfirming(false); }}>
          Confirm Shutdown
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-white/3 p-3 border border-white/5 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">{label}</span>
      </div>
      <p className="mt-1 text-xs font-medium text-text">{value}</p>
    </div>
  );
}

function formatUptime(seconds: number | string): string {
  const s = typeof seconds === 'string' ? parseInt(seconds) : seconds;
  if (isNaN(s)) return String(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
