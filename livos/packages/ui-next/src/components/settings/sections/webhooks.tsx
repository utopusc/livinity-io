'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

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
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading webhooks...</span>
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
        <div className="space-y-2 rounded-xl bg-white/3 p-3 border border-white/5">
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
      <div className="space-y-2">
        {data?.webhooks?.map((wh: any) => (
          <div key={wh.id} className="flex items-center justify-between rounded-xl bg-white/3 p-3 border border-white/5">
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
      </div>
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
