'use client';

import { useState } from 'react';
import { RefreshCw, Check, Loader2, Download, AlertTriangle } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function SoftwareUpdateSection() {
  const { data: version, isLoading: versionLoading } = trpcReact.system.version.useQuery();
  const utils = trpcReact.useUtils();

  // Lazy: enabled=false so we only fetch when the user clicks "Check for Updates"
  const [hasChecked, setHasChecked] = useState(false);
  const checkQuery = trpcReact.system.checkUpdate.useQuery(undefined, {
    enabled: hasChecked,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const installMutation = trpcReact.system.update.useMutation();

  const handleCheck = () => {
    if (hasChecked) {
      // Already enabled — just refetch
      utils.system.checkUpdate.invalidate();
    } else {
      setHasChecked(true);
    }
  };

  const handleInstall = () => {
    installMutation.mutate();
  };

  if (versionLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  const isChecking = checkQuery.isFetching;
  const checkError = checkQuery.error;
  const updateInfo = checkQuery.data;
  const updateAvailable = updateInfo?.available === true;

  return (
    <div className="space-y-4">
      {/* Current version card */}
      <div className="rounded-xl bg-surface-0 border border-border shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text">{version?.name ?? 'LivOS'}</p>
            <p className="text-[11px] text-text-tertiary">
              Version {version?.version ?? 'unknown'}
            </p>
          </div>

          {/* Status badge — only shown after a check has been performed */}
          {hasChecked && !isChecking && !checkError && (
            updateAvailable ? (
              <Badge variant="warning">
                Update available
              </Badge>
            ) : (
              <Badge variant="success">
                <Check className="mr-1 h-3 w-3" />
                Up to date
              </Badge>
            )
          )}
        </div>
      </div>

      {/* Update available details */}
      {updateAvailable && updateInfo && (
        <div className="rounded-xl bg-warning/10 border border-warning/20 p-3 space-y-2">
          <p className="text-xs font-medium text-warning">
            {updateInfo.name ?? updateInfo.version} is available
          </p>
          {updateInfo.releaseNotes && (
            <p className="text-[11px] text-text-tertiary line-clamp-3">
              {updateInfo.releaseNotes}
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={installMutation.isPending}
            onClick={handleInstall}
          >
            {installMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Install Update
              </>
            )}
          </Button>
          {installMutation.isError && (
            <p className="text-[11px] text-error flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {installMutation.error.message}
            </p>
          )}
        </div>
      )}

      {/* Check error */}
      {checkError && (
        <p className="text-[11px] text-error flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {checkError.message}
        </p>
      )}

      {/* Check for Updates button */}
      <Button
        size="sm"
        variant="secondary"
        disabled={isChecking || installMutation.isPending}
        onClick={handleCheck}
      >
        {isChecking ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Check for Updates
          </>
        )}
      </Button>
    </div>
  );
}
