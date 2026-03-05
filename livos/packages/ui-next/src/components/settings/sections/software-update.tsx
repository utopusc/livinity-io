'use client';

import { RefreshCw, Check, Loader2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function SoftwareUpdateSection() {
  const { data: version, isLoading } = trpcReact.system.version.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Checking for updates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-border shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text">{version?.name ?? 'LivOS'}</p>
            <p className="text-[11px] text-text-tertiary">
              Version {version?.version ?? 'unknown'}
            </p>
          </div>
          <Badge variant="success">
            <Check className="mr-1 h-3 w-3" />
            Up to date
          </Badge>
        </div>
      </div>
      <Button size="sm" variant="secondary">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Check for Updates
      </Button>
    </div>
  );
}
