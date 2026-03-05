'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, RotateCcw, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { trpcReact } from '@/trpc/client';

type NexusConfig = Record<string, any>;

export default function NexusConfigSection() {
  const { data, isLoading } = trpcReact.ai.getNexusConfig.useQuery();
  const utils = trpcReact.useUtils();
  const [config, setConfig] = useState<NexusConfig>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.config) setConfig(data.config);
  }, [data]);

  const updateMutation = trpcReact.ai.updateNexusConfig.useMutation({
    onSuccess: () => {
      utils.ai.getNexusConfig.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const resetMutation = trpcReact.ai.resetNexusConfig.useMutation({
    onSuccess: () => utils.ai.getNexusConfig.invalidate(),
  });

  const updateField = useCallback((path: string, value: any) => {
    setConfig((prev) => {
      const parts = path.split('.');
      const next = { ...prev };
      let obj: any = next;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...(obj[parts[i]] || {}) };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading config...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="response">
        <TabsList>
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="retry">Retry</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="heartbeat">Heartbeat</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="response">
          <div className="space-y-3 pt-3">
            <Field label="Style">
              <select
                className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
                value={config.response?.style ?? 'detailed'}
                onChange={(e) => updateField('response.style', e.target.value)}
              >
                <option value="detailed">Detailed</option>
                <option value="concise">Concise</option>
                <option value="direct">Direct</option>
              </select>
            </Field>
            <ToggleField
              label="Show Steps"
              checked={config.response?.showSteps ?? true}
              onChange={(v) => updateField('response.showSteps', v)}
            />
            <ToggleField
              label="Show Reasoning"
              checked={config.response?.showReasoning ?? false}
              onChange={(v) => updateField('response.showReasoning', v)}
            />
            <Field label="Language">
              <select
                className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
                value={config.response?.language ?? 'en'}
                onChange={(e) => updateField('response.language', e.target.value)}
              >
                <option value="en">English</option>
                <option value="tr">Turkish</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
              </select>
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="agent">
          <div className="space-y-3 pt-3">
            <NumberField label="Max Turns" value={config.agent?.maxTurns ?? 25} onChange={(v) => updateField('agent.maxTurns', v)} />
            <NumberField label="Max Tokens (K)" value={config.agent?.maxTokens ?? 8} onChange={(v) => updateField('agent.maxTokens', v)} />
            <NumberField label="Timeout (min)" value={config.agent?.timeoutMs ? config.agent.timeoutMs / 60000 : 5} onChange={(v) => updateField('agent.timeoutMs', v * 60000)} />
            <NumberField label="Max Depth" value={config.agent?.maxDepth ?? 3} onChange={(v) => updateField('agent.maxDepth', v)} />
            <ToggleField
              label="Stream Responses"
              checked={config.agent?.streamEnabled ?? true}
              onChange={(v) => updateField('agent.streamEnabled', v)}
            />
          </div>
        </TabsContent>

        <TabsContent value="retry">
          <div className="space-y-3 pt-3">
            <ToggleField
              label="Enable Retry"
              checked={config.retry?.enabled ?? false}
              onChange={(v) => updateField('retry.enabled', v)}
            />
            <NumberField label="Max Attempts" value={config.retry?.attempts ?? 3} onChange={(v) => updateField('retry.attempts', v)} />
            <NumberField label="Min Delay (ms)" value={config.retry?.minDelayMs ?? 1000} onChange={(v) => updateField('retry.minDelayMs', v)} />
            <NumberField label="Max Delay (ms)" value={config.retry?.maxDelayMs ?? 10000} onChange={(v) => updateField('retry.maxDelayMs', v)} />
          </div>
        </TabsContent>

        <TabsContent value="session">
          <div className="space-y-3 pt-3">
            <NumberField label="Idle Timeout (min)" value={config.session?.idleMinutes ?? 30} onChange={(v) => updateField('session.idleMinutes', v)} />
            <NumberField label="Max History Messages" value={config.session?.maxHistoryMessages ?? 50} onChange={(v) => updateField('session.maxHistoryMessages', v)} />
            <NumberField label="Subagent Max Turns" value={config.subagents?.maxTurns ?? 10} onChange={(v) => updateField('subagents.maxTurns', v)} />
            <NumberField label="Max Concurrent Subagents" value={config.subagents?.maxConcurrent ?? 3} onChange={(v) => updateField('subagents.maxConcurrent', v)} />
          </div>
        </TabsContent>

        <TabsContent value="heartbeat">
          <div className="space-y-3 pt-3">
            <ToggleField
              label="Enable Heartbeat"
              checked={config.heartbeat?.enabled ?? false}
              onChange={(v) => updateField('heartbeat.enabled', v)}
            />
            <NumberField label="Interval (min)" value={config.heartbeat?.intervalMinutes ?? 60} onChange={(v) => updateField('heartbeat.intervalMinutes', v)} />
            <Field label="Delivery Target">
              <select
                className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
                value={config.heartbeat?.target ?? 'none'}
                onChange={(e) => updateField('heartbeat.target', e.target.value)}
              >
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="all">All</option>
                <option value="none">None</option>
              </select>
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <div className="space-y-3 pt-3">
            <Field label="Log Level">
              <select
                className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
                value={config.logging?.level ?? 'info'}
                onChange={(e) => updateField('logging.level', e.target.value)}
              >
                <option value="silent">Silent</option>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
              </select>
            </Field>
            <ToggleField
              label="Redact Sensitive Data"
              checked={config.logging?.redactSensitive ?? true}
              onChange={(v) => updateField('logging.redactSensitive', v)}
            />
            <div className="border-t border-border pt-3">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm('Reset all settings to defaults?')) resetMutation.mutate(); }}
                loading={resetMutation.isPending}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to Defaults
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          onClick={() => updateMutation.mutate(config)}
          loading={updateMutation.isPending}
        >
          {saved ? <Check className="mr-1.5 h-3.5 w-3.5" /> : null}
          {saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared field components                                            */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-24 text-right"
      />
    </Field>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}
