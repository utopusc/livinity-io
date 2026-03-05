'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { Switch } from '@/components/ui/switch';
import { trpcReact } from '@/trpc/client';

export default function AdvancedSection() {
  return (
    <div className="space-y-6">
      <BetaChannel />
      <div className="border-t border-border" />
      <ExternalDns />
      <div className="border-t border-border" />
      <DangerZone />
    </div>
  );
}

function BetaChannel() {
  const { data: channel, isLoading } = trpcReact.system.getReleaseChannel.useQuery();
  const utils = trpcReact.useUtils();
  const mutation = trpcReact.system.setReleaseChannel.useMutation({
    onSuccess: () => utils.system.getReleaseChannel.invalidate(),
  });

  if (isLoading) return <Loading />;

  const isBeta = channel === 'beta';

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-text">Beta Updates</p>
        <p className="text-[11px] text-text-tertiary">
          Receive early access updates (may be unstable)
        </p>
      </div>
      <Switch
        checked={isBeta}
        onCheckedChange={(checked) =>
          mutation.mutate({ channel: checked ? 'beta' : 'stable' })
        }
      />
    </div>
  );
}

function ExternalDns() {
  const { data: isExternal, isLoading } = trpcReact.system.isExternalDns.useQuery();
  const utils = trpcReact.useUtils();
  const mutation = trpcReact.system.setExternalDns.useMutation({
    onSuccess: () => utils.system.isExternalDns.invalidate(),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-text">External DNS</p>
        <p className="text-[11px] text-text-tertiary">
          Use external DNS resolver instead of built-in
        </p>
      </div>
      <Switch
        checked={isExternal ?? false}
        onCheckedChange={(checked) => mutation.mutate(checked)}
      />
    </div>
  );
}

function DangerZone() {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-error" />
        <p className="text-xs font-medium text-error">Danger Zone</p>
      </div>
      <p className="text-[11px] text-text-tertiary">
        Factory reset will erase all data and settings. This cannot be undone.
      </p>
      {!confirm ? (
        <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
          Factory Reset
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl bg-error/10 p-3 border border-error/20">
          <p className="text-xs text-error font-medium">Are you absolutely sure?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => window.location.href = '/factory-reset'}>
              Yes, Reset Everything
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-text-tertiary">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Loading...</span>
    </div>
  );
}
