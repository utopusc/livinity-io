'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

export default function WebhooksSection() {
  const { data, isLoading } = trpcReact.ai.getWebhooks.useQuery();
  const utils = trpcReact.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [newResult, setNewResult] = useState<{ url: string; secret: string } | null>(null);

  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');

  const createMutation = trpcReact.ai.createWebhook.useMutation({
    onSuccess: (result: any) => {
      utils.ai.getWebhooks.invalidate();
      setNewResult({ url: result.url, secret: result.secret });
      setShowCreate(false);
      setName('');
      setSecret('');
    },
  });

  const deleteMutation = trpcReact.ai.deleteWebhook.useMutation({
    onSuccess: () => utils.ai.getWebhooks.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-surface-0 border border-border shadow-sm p-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create button */}
      {!showCreate && (
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create Webhook
        </Button>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="space-y-2 rounded-xl bg-surface-0 border border-border shadow-sm p-3">
          <Input placeholder="Webhook name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Secret (optional, auto-generated)" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ name, secret: secret || undefined })}
              loading={createMutation.isPending}
              disabled={!name.trim()}
            >
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* New webhook result */}
      {newResult && (
        <div className="rounded-xl bg-success/10 p-3 space-y-2 border border-success/20">
          <p className="text-xs font-medium text-success">Webhook created!</p>
          <CopyField label="URL" value={newResult.url} />
          <CopyField label="Secret" value={newResult.secret} />
          <Button size="sm" variant="ghost" onClick={() => setNewResult(null)}>Dismiss</Button>
        </div>
      )}

      {/* Webhook list */}
      <AnimatedGroup preset="fade" className="space-y-2">
        {data?.webhooks?.map((wh: any) => (
          <div key={wh.id} className="flex items-center justify-between rounded-xl bg-surface-0 border border-border shadow-sm p-3">
            <div>
              <p className="text-xs font-medium text-text">{wh.name}</p>
              <p className="text-[11px] text-text-tertiary">
                {wh.deliveryCount} deliveries
                {wh.lastUsed && ` · Last used ${new Date(wh.lastUsed).toLocaleDateString()}`}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { if (confirm(`Delete webhook "${wh.name}"?`)) deleteMutation.mutate({ id: wh.id }); }}
            >
              <Trash2 className="h-3.5 w-3.5 text-error" />
            </Button>
          </div>
        ))}
        {(!data?.webhooks || data.webhooks.length === 0) && (
          <p className="text-xs text-text-tertiary">No webhooks configured.</p>
        )}
      </AnimatedGroup>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-tertiary w-12">{label}:</span>
      <code className="flex-1 text-[11px] text-text-secondary truncate">{value}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-text-tertiary hover:text-text"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
