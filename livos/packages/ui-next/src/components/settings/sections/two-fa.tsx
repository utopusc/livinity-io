'use client';

import { useState } from 'react';
import { Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export default function TwoFaSection() {
  const { data: is2faEnabled, isLoading } = trpcReact.user.is2faEnabled.useQuery();

  if (isLoading) return <p className="text-xs text-text-tertiary">Loading...</p>;

  return is2faEnabled ? <DisableTwoFa /> : <EnableTwoFa />;
}

function EnableTwoFa() {
  const utils = trpcReact.useUtils();
  const [step, setStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const enableMutation = trpcReact.user.enable2fa.useMutation({
    onSuccess: (data: any) => {
      setUri(data.uri ?? data.totpUri ?? '');
      setStep('setup');
    },
    onError: (err) => setError(err.message),
  });

  const verifyMutation = trpcReact.user.verify2fa.useMutation({
    onSuccess: () => {
      utils.user.is2faEnabled.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  if (step === 'idle') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <ShieldOff className="h-4 w-4" />
          <span className="text-xs">2FA is not enabled</span>
        </div>
        <Button size="sm" onClick={() => enableMutation.mutate()} loading={enableMutation.isPending}>
          Enable 2FA
        </Button>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }

  if (step === 'setup') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-text-secondary">
          Scan this URI in your authenticator app, then enter the 6-digit code:
        </p>
        <code className="block rounded-lg bg-neutral-50 border border-border p-2 text-xs text-text-secondary break-all">
          {uri}
        </code>
        <div className="flex gap-2">
          <Input
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="max-w-[160px]"
            maxLength={6}
          />
          <Button
            size="sm"
            onClick={() => verifyMutation.mutate({ token: code })}
            loading={verifyMutation.isPending}
            disabled={code.length !== 6}
          >
            Verify
          </Button>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }

  return null;
}

function DisableTwoFa() {
  const utils = trpcReact.useUtils();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const mutation = trpcReact.user.disable2fa.useMutation({
    onSuccess: () => {
      utils.user.is2faEnabled.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-success">
        <ShieldCheck className="h-4 w-4" />
        <span className="text-xs">2FA is enabled</span>
      </div>
      <p className="text-xs text-text-tertiary">
        Enter your 2FA code to disable two-factor authentication.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="max-w-[160px]"
          maxLength={6}
        />
        <Button
          size="sm"
          variant="destructive"
          onClick={() => mutation.mutate({ token: code })}
          loading={mutation.isPending}
          disabled={code.length !== 6}
        >
          Disable 2FA
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
