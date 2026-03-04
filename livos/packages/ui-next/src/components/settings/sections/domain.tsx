'use client';

import { useState } from 'react';
import { Globe, Check, Copy, Loader2, ArrowRight, X } from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

type Step = 'domain' | 'dns-records' | 'verify' | 'activate' | 'done';

export default function DomainSection() {
  const { data: status, isLoading } = trpcReact.domain.getStatus.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading domain status...</span>
      </div>
    );
  }

  if (status?.active) return <DomainActive status={status} />;
  return <DomainSetupWizard />;
}

function DomainActive({ status }: { status: any }) {
  const utils = trpcReact.useUtils();
  const removeMutation = trpcReact.domain.remove.useMutation({
    onSuccess: () => utils.domain.getStatus.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="success">Active</Badge>
        <span className="text-xs text-text-secondary">{status.domain}</span>
      </div>
      <p className="text-xs text-text-tertiary">
        HTTPS is active via Let's Encrypt. Your server is accessible at{' '}
        <a href={`https://${status.domain}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
          https://{status.domain}
        </a>
      </p>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => { if (confirm('Remove domain and HTTPS?')) removeMutation.mutate(); }}
        loading={removeMutation.isPending}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Remove Domain
      </Button>
    </div>
  );
}

function DomainSetupWizard() {
  const [step, setStep] = useState<Step>('domain');
  const [domain, setDomain] = useState('');
  const { data: publicIp } = trpcReact.domain.getPublicIp.useQuery();
  const utils = trpcReact.useUtils();

  const setDomainMutation = trpcReact.domain.setDomain.useMutation({
    onSuccess: () => setStep('dns-records'),
  });

  const { data: dnsCheck } = trpcReact.domain.verifyDns.useQuery(undefined, {
    enabled: step === 'verify',
    refetchInterval: step === 'verify' ? 10000 : false,
  });

  const activateMutation = trpcReact.domain.activate.useMutation({
    onSuccess: () => {
      utils.domain.getStatus.invalidate();
      setStep('done');
    },
  });

  // Auto-advance when DNS matches
  if (step === 'verify' && dnsCheck?.match) {
    setTimeout(() => setStep('activate'), 500);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        {['domain', 'dns-records', 'verify', 'activate', 'done'].map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${s === step ? 'bg-brand' : 'bg-white/10'}`} />
            {i < 4 && <div className="h-px w-4 bg-white/10" />}
          </div>
        ))}
      </div>

      {step === 'domain' && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Enter your domain name:</p>
          <Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} className="max-w-xs" />
          {publicIp?.ip && <p className="text-[11px] text-text-tertiary">Server IP: {publicIp.ip}</p>}
          <Button
            size="sm"
            onClick={() => setDomainMutation.mutate({ domain })}
            loading={setDomainMutation.isPending}
            disabled={!domain.trim()}
          >
            Next <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {step === 'dns-records' && (
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Add this DNS A record to your domain:</p>
          <div className="overflow-hidden rounded-lg border border-white/5">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-white/5 bg-white/3">
                <th className="px-3 py-1.5 text-left text-text-tertiary font-medium">Type</th>
                <th className="px-3 py-1.5 text-left text-text-tertiary font-medium">Name</th>
                <th className="px-3 py-1.5 text-left text-text-tertiary font-medium">Value</th>
              </tr></thead>
              <tbody className="text-text-secondary">
                <tr><td className="px-3 py-1.5">A</td><td className="px-3 py-1.5">@</td><td className="px-3 py-1.5">{publicIp?.ip ?? '...'}</td></tr>
              </tbody>
            </table>
          </div>
          <Button size="sm" onClick={() => setStep('verify')}>
            I've added the record <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            <span className="text-xs text-text-secondary">Verifying DNS records...</span>
          </div>
          {dnsCheck && !dnsCheck.match && (
            <p className="text-[11px] text-text-tertiary">
              Current: {dnsCheck.currentIp ?? 'not found'} · Expected: {dnsCheck.expected}
            </p>
          )}
        </div>
      )}

      {step === 'activate' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-success">
            <Check className="h-4 w-4" />
            <span className="text-xs">DNS verified!</span>
          </div>
          <p className="text-xs text-text-secondary">Click to activate HTTPS with Let's Encrypt.</p>
          <Button
            size="sm"
            onClick={() => activateMutation.mutate()}
            loading={activateMutation.isPending}
          >
            Activate HTTPS
          </Button>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-success">
            <Check className="h-4 w-4" />
            <span className="text-xs font-medium">Domain activated!</span>
          </div>
          <p className="text-xs text-text-secondary">
            Your server is now accessible at{' '}
            <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
              https://{domain}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
