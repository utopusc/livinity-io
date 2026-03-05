'use client';

import { useState, useEffect } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';

export default function VoiceSection() {
  const { data: config, isLoading } = trpcReact.ai.getVoiceConfig.useQuery();
  const utils = trpcReact.useUtils();

  const [enabled, setEnabled] = useState(false);
  const [deepgramKey, setDeepgramKey] = useState('');
  const [cartesiaKey, setCartesiaKey] = useState('');
  const [cartesiaVoiceId, setCartesiaVoiceId] = useState('');
  const [sttLanguage, setSttLanguage] = useState('en');
  const [sttModel, setSttModel] = useState('nova-3');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled ?? false);
    setCartesiaVoiceId(config.cartesiaVoiceId ?? '');
    setSttLanguage(config.sttLanguage ?? 'en');
    setSttModel(config.sttModel ?? 'nova-3');
  }, [config]);

  const mutation = trpcReact.ai.updateVoiceConfig.useMutation({
    onSuccess: () => {
      utils.ai.getVoiceConfig.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    );
  }

  const isReady = config?.hasDeepgramKey && config?.hasCartesiaKey;

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="flex items-center gap-2">
        <Badge variant={isReady && enabled ? 'success' : isReady ? 'warning' : 'default'}>
          {isReady && enabled ? 'Ready' : isReady ? 'Disabled' : 'Not configured'}
        </Badge>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">Enable Voice Mode</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Deepgram */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">Deepgram API Key</label>
          {config?.hasDeepgramKey && <Badge variant="success">Configured</Badge>}
        </div>
        <Input
          type="password"
          placeholder={config?.hasDeepgramKey ? '••••••••' : 'Enter API key'}
          value={deepgramKey}
          onChange={(e) => setDeepgramKey(e.target.value)}
        />
        <a
          href="https://console.deepgram.com/signup"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
        >
          Get API key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Cartesia */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">Cartesia API Key</label>
          {config?.hasCartesiaKey && <Badge variant="success">Configured</Badge>}
        </div>
        <Input
          type="password"
          placeholder={config?.hasCartesiaKey ? '••••••••' : 'Enter API key'}
          value={cartesiaKey}
          onChange={(e) => setCartesiaKey(e.target.value)}
        />
        <a
          href="https://play.cartesia.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
        >
          Get API key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Voice ID */}
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Cartesia Voice ID</label>
        <Input
          placeholder="UUID"
          value={cartesiaVoiceId}
          onChange={(e) => setCartesiaVoiceId(e.target.value)}
        />
      </div>

      {/* STT Language */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">STT Language</span>
        <select
          className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
          value={sttLanguage}
          onChange={(e) => setSttLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="tr">Turkish</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="multi">Multi-language</option>
        </select>
      </div>

      {/* STT Model */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">STT Model</span>
        <select
          className="h-8 rounded-md bg-neutral-50 border border-border px-2 text-xs text-text"
          value={sttModel}
          onChange={(e) => setSttModel(e.target.value)}
        >
          <option value="nova-3">Nova 3</option>
          <option value="nova-2">Nova 2</option>
        </select>
      </div>

      {/* Save */}
      <Button
        size="sm"
        onClick={() => {
          const payload: any = { enabled, sttLanguage, sttModel };
          if (deepgramKey) payload.deepgramApiKey = deepgramKey;
          if (cartesiaKey) payload.cartesiaApiKey = cartesiaKey;
          if (cartesiaVoiceId) payload.cartesiaVoiceId = cartesiaVoiceId;
          mutation.mutate(payload);
        }}
        loading={mutation.isPending}
      >
        {saved ? <Check className="mr-1.5 h-3.5 w-3.5" /> : null}
        {saved ? 'Saved' : 'Save'}
      </Button>
    </div>
  );
}
