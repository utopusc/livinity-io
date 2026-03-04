'use client';

import { useState, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { trpcReact } from '@/trpc/client';

type Channel = 'telegram' | 'discord' | 'slack' | 'matrix';

export default function IntegrationsSection() {
  return (
    <Tabs defaultValue="telegram">
      <TabsList>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
        <TabsTrigger value="discord">Discord</TabsTrigger>
        <TabsTrigger value="slack">Slack</TabsTrigger>
        <TabsTrigger value="matrix">Matrix</TabsTrigger>
      </TabsList>

      <TabsContent value="telegram"><IntegrationPanel channel="telegram" /></TabsContent>
      <TabsContent value="discord"><IntegrationPanel channel="discord" hasTest /></TabsContent>
      <TabsContent value="slack"><SlackPanel /></TabsContent>
      <TabsContent value="matrix"><MatrixPanel /></TabsContent>
    </Tabs>
  );
}

function IntegrationPanel({ channel, hasTest }: { channel: Channel; hasTest?: boolean }) {
  const { data: config } = trpcReact.ai.getIntegrationConfig.useQuery({ channel });
  const { data: status } = trpcReact.ai.getIntegrationStatus.useQuery({ channel });
  const utils = trpcReact.useUtils();
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation({
    onSuccess: () => {
      utils.ai.getIntegrationConfig.invalidate({ channel });
      utils.ai.getIntegrationStatus.invalidate({ channel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const testMutation = trpcReact.ai.testIntegration.useMutation();

  return (
    <div className="space-y-4 pt-3">
      <StatusIndicator status={status} />

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Bot Token</label>
        <Input
          type="password"
          placeholder={config?.token ? '••••••••' : 'Enter token'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate({ channel, config: { token, enabled: true } })}
          loading={saveMutation.isPending}
          disabled={!token.trim()}
        >
          {saved ? <Check className="mr-1.5 h-3.5 w-3.5" /> : null}
          {saved ? 'Saved' : 'Save & Connect'}
        </Button>
        {hasTest && status?.connected && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => testMutation.mutate({ channel })}
            loading={testMutation.isPending}
          >
            Test
          </Button>
        )}
        {status?.enabled && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => saveMutation.mutate({ channel, config: { enabled: false } })}
          >
            Disable
          </Button>
        )}
      </div>
    </div>
  );
}

function SlackPanel() {
  const channel: Channel = 'slack';
  const { data: config } = trpcReact.ai.getIntegrationConfig.useQuery({ channel });
  const { data: status } = trpcReact.ai.getIntegrationStatus.useQuery({ channel });
  const utils = trpcReact.useUtils();
  const [botToken, setBotToken] = useState('');
  const [appToken, setAppToken] = useState('');
  const [saved, setSaved] = useState(false);

  const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation({
    onSuccess: () => {
      utils.ai.getIntegrationConfig.invalidate({ channel });
      utils.ai.getIntegrationStatus.invalidate({ channel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const testMutation = trpcReact.ai.testIntegration.useMutation();

  return (
    <div className="space-y-4 pt-3">
      <StatusIndicator status={status} />
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Bot Token</label>
        <Input type="password" placeholder="xoxb-..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">App-Level Token</label>
        <Input type="password" placeholder="xapp-..." value={appToken} onChange={(e) => setAppToken(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate({ channel, config: { token: botToken, appToken, enabled: true } })}
          loading={saveMutation.isPending}
        >
          {saved ? 'Saved' : 'Save & Connect'}
        </Button>
        {status?.connected && (
          <Button size="sm" variant="secondary" onClick={() => testMutation.mutate({ channel })} loading={testMutation.isPending}>
            Test
          </Button>
        )}
      </div>
    </div>
  );
}

function MatrixPanel() {
  const channel: Channel = 'matrix';
  const { data: config } = trpcReact.ai.getIntegrationConfig.useQuery({ channel });
  const { data: status } = trpcReact.ai.getIntegrationStatus.useQuery({ channel });
  const utils = trpcReact.useUtils();
  const [homeserver, setHomeserver] = useState('');
  const [token, setToken] = useState('');
  const [roomId, setRoomId] = useState('');
  const [saved, setSaved] = useState(false);

  const saveMutation = trpcReact.ai.saveIntegrationConfig.useMutation({
    onSuccess: () => {
      utils.ai.getIntegrationConfig.invalidate({ channel });
      utils.ai.getIntegrationStatus.invalidate({ channel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const testMutation = trpcReact.ai.testIntegration.useMutation();

  return (
    <div className="space-y-4 pt-3">
      <StatusIndicator status={status} />
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Homeserver URL</label>
        <Input placeholder="https://matrix.org" value={homeserver} onChange={(e) => setHomeserver(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Access Token</label>
        <Input type="password" placeholder="syt_..." value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Room ID</label>
        <Input placeholder="!abc:matrix.org" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate({ channel, config: { homeserverUrl: homeserver, token, roomId, enabled: true } })}
          loading={saveMutation.isPending}
        >
          {saved ? 'Saved' : 'Save & Connect'}
        </Button>
        {status?.connected && (
          <Button size="sm" variant="secondary" onClick={() => testMutation.mutate({ channel })} loading={testMutation.isPending}>
            Test
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: any }) {
  if (!status) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant={status.connected ? 'success' : status.enabled ? 'warning' : 'default'}>
        {status.connected ? 'Connected' : status.enabled ? 'Enabled' : 'Disabled'}
      </Badge>
      {status.botName && <span className="text-xs text-text-tertiary">@{status.botName}</span>}
      {status.error && <span className="text-xs text-error">{status.error}</span>}
    </div>
  );
}
