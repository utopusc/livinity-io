'use client';

import { Clock, Check, X, Trash2, Loader2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { trpcReact } from '@/trpc/client';

export default function DmPairingSection() {
  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="allowlist">Allowlist</TabsTrigger>
        <TabsTrigger value="policy">Policy</TabsTrigger>
      </TabsList>

      <TabsContent value="pending"><PendingTab /></TabsContent>
      <TabsContent value="allowlist"><AllowlistTab /></TabsContent>
      <TabsContent value="policy"><PolicyTab /></TabsContent>
    </Tabs>
  );
}

function PendingTab() {
  const { data, isLoading } = trpcReact.ai.getDmPairingPending.useQuery(undefined, { refetchInterval: 10000 });
  const utils = trpcReact.useUtils();

  const approveMutation = trpcReact.ai.approveDmPairing.useMutation({
    onSuccess: () => utils.ai.getDmPairingPending.invalidate(),
  });
  const denyMutation = trpcReact.ai.denyDmPairing.useMutation({
    onSuccess: () => utils.ai.getDmPairingPending.invalidate(),
  });

  if (isLoading) return <Loading />;

  const pending = data?.pending ?? [];

  if (pending.length === 0) {
    return <p className="pt-3 text-xs text-text-tertiary">No pending pairing requests.</p>;
  }

  return (
    <div className="space-y-2 pt-3">
      {pending.map((req: any) => (
        <div key={`${req.channel}-${req.userId}`} className="flex items-center justify-between rounded-xl bg-white border border-border shadow-sm p-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="warning">{req.channel}</Badge>
              <span className="text-xs font-medium text-text">{req.userName ?? req.userId}</span>
            </div>
            {req.code && <code className="text-[11px] text-warning">{req.code}</code>}
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => approveMutation.mutate({ channel: req.channel, userId: req.userId })}
            >
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => denyMutation.mutate({ channel: req.channel, userId: req.userId })}
            >
              <X className="h-4 w-4 text-error" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AllowlistTab() {
  const { data: tgData } = trpcReact.ai.getDmPairingAllowlist.useQuery({ channel: 'telegram' }, { refetchInterval: 10000 });
  const { data: dcData } = trpcReact.ai.getDmPairingAllowlist.useQuery({ channel: 'discord' }, { refetchInterval: 10000 });
  const utils = trpcReact.useUtils();

  const removeMutation = trpcReact.ai.removeDmPairingAllowlist.useMutation({
    onSuccess: () => {
      utils.ai.getDmPairingAllowlist.invalidate();
    },
  });

  const renderList = (channel: string, users: string[]) => (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-text capitalize">{channel}</h4>
      {users.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">No users</p>
      ) : (
        users.map((userId) => (
          <div key={userId} className="flex items-center justify-between rounded-lg bg-neutral-50 border border-border px-3 py-1.5">
            <span className="text-xs text-text-secondary">{userId}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => removeMutation.mutate({ channel, userId })}
            >
              <Trash2 className="h-3 w-3 text-error" />
            </Button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-4 pt-3">
      {renderList('telegram', tgData?.users ?? [])}
      {renderList('discord', dcData?.users ?? [])}
    </div>
  );
}

function PolicyTab() {
  const channels = ['telegram', 'discord'] as const;

  return (
    <div className="space-y-4 pt-3">
      {channels.map((channel) => (
        <PolicySelector key={channel} channel={channel} />
      ))}
    </div>
  );
}

function PolicySelector({ channel }: { channel: string }) {
  const { data } = trpcReact.ai.getDmPairingPolicy.useQuery({ channel });
  const utils = trpcReact.useUtils();

  const mutation = trpcReact.ai.setDmPairingPolicy.useMutation({
    onSuccess: () => utils.ai.getDmPairingPolicy.invalidate({ channel }),
  });

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary capitalize">{channel} Policy</span>
      <select
        className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
        value={data?.policy ?? 'pairing'}
        onChange={(e) => mutation.mutate({ channel, policy: e.target.value })}
      >
        <option value="pairing">Pairing Code</option>
        <option value="allowlist">Allowlist</option>
        <option value="open">Open</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 pt-3 text-text-tertiary">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Loading...</span>
    </div>
  );
}
