'use client';

import { ExternalLink, Mail, Loader2, Check, X } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function GmailSection() {
  const { data: status, isLoading } = trpcReact.ai.getGmailStatus.useQuery();
  const utils = trpcReact.useUtils();

  const startOauth = trpcReact.ai.startGmailOauth.useMutation({
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, '_blank');
    },
  });

  const disconnect = trpcReact.ai.disconnectGmail.useMutation({
    onSuccess: () => utils.ai.getGmailStatus.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Checking Gmail status...</span>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="success">Connected</Badge>
          {status.email && <span className="text-xs text-text-secondary">{status.email}</span>}
        </div>
        <p className="text-xs text-text-tertiary">
          Gmail is connected. LivOS can read and send emails on your behalf.
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => disconnect.mutate()}
          loading={disconnect.isPending}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>
    );
  }

  if (status?.configured) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Configured, not connected</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => startOauth.mutate()}
          loading={startOauth.isPending}
        >
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Connect Gmail
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Connect your Gmail account to let LivOS read and send emails.
        You need to set up a Google Cloud OAuth app first.
      </p>
      <a
        href="https://console.cloud.google.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
      >
        Google Cloud Console <ExternalLink className="h-3 w-3" />
      </a>
      <Button
        size="sm"
        onClick={() => startOauth.mutate()}
        loading={startOauth.isPending}
      >
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Connect Gmail
      </Button>
    </div>
  );
}
