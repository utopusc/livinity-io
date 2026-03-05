'use client';

import { useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { trpcReact } from '@/trpc/client';

export default function TroubleshootSection() {
  return (
    <Tabs defaultValue="system">
      <TabsList>
        <TabsTrigger value="system">System Logs</TabsTrigger>
        <TabsTrigger value="apps">App Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="system"><SystemLogs /></TabsContent>
      <TabsContent value="apps"><AppLogs /></TabsContent>
    </Tabs>
  );
}

function SystemLogs() {
  const { data: logs, isLoading, refetch } = trpcReact.system.logs.useQuery({ type: 'system' });

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
        {logs && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadLogs('system-logs.txt', logs)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        )}
      </div>
      <LogViewer logs={logs} isLoading={isLoading} />
    </div>
  );
}

function AppLogs() {
  const [appId, setAppId] = useState('');
  const { data: logs, isLoading, refetch } = trpcReact.apps.logs.useQuery(
    { appId },
    { enabled: !!appId },
  );

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Enter app ID..."
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          className="h-8 rounded-md bg-neutral-50 border border-border px-2.5 text-xs text-text outline-none focus:ring-1 focus:ring-brand"
        />
        <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={!appId}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Load
        </Button>
      </div>
      {appId && <LogViewer logs={logs} isLoading={isLoading} />}
    </div>
  );
}

function LogViewer({ logs, isLoading }: { logs: string | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading logs...</span>
      </div>
    );
  }

  if (!logs) return <p className="text-xs text-text-tertiary">No logs available.</p>;

  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-sm">
      {/* Terminal-style title bar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-neutral-100 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <div className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <span className="ml-2 text-[10px] text-text-tertiary">logs</span>
      </div>
      <div className="max-h-[400px] overflow-auto bg-neutral-900 p-3">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-300">
          {logs}
        </pre>
      </div>
    </div>
  );
}

function downloadLogs(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
