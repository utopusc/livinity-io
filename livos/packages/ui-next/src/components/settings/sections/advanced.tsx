'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const mutation = trpcReact.system.factoryReset.useMutation({
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') {
        setPasswordError('Incorrect password. Please try again.');
      } else {
        setPasswordError(err.message ?? 'An error occurred. Please try again.');
      }
    },
  });

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPassword('');
      setPasswordError('');
    }
  };

  const handleConfirm = () => {
    if (!password.trim()) {
      setPasswordError('Password is required.');
      return;
    }
    setPasswordError('');
    mutation.mutate({ password });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-error" />
        <p className="text-xs font-medium text-error">Danger Zone</p>
      </div>
      <p className="text-[11px] text-text-tertiary">
        Factory reset will erase all data and settings. This cannot be undone.
      </p>
      <Button size="sm" variant="destructive" onClick={() => setDialogOpen(true)}>
        Factory Reset
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-error/10">
              <AlertTriangle className="h-5 w-5 text-error" />
            </div>
            <DialogTitle>Factory Reset</DialogTitle>
            <DialogDescription>
              This will erase all data and settings. This action cannot be undone.
              Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              className={passwordError ? 'border-error focus-visible:ring-error/30' : ''}
              autoFocus
            />
            {passwordError && (
              <p className="text-[11px] text-error">{passwordError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirm}
              loading={mutation.isPending}
            >
              Yes, Reset Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
