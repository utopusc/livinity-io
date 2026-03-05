'use client';

import { Loader2 } from 'lucide-react';
import { trpcReact } from '@/trpc/client';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';

export default function UsageSection() {
  const { data: overview, isLoading } = trpcReact.ai.getUsageOverview.useQuery();
  const { data: daily } = trpcReact.ai.getUsageDaily.useQuery({ days: 30 });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading usage data...</span>
      </div>
    );
  }

  const totalTokens = (overview?.totalInputTokens ?? 0) + (overview?.totalOutputTokens ?? 0);

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Tokens"
          value={totalTokens}
          sub={`${formatNumber(overview?.totalInputTokens ?? 0)} in / ${formatNumber(overview?.totalOutputTokens ?? 0)} out`}
        />
        <StatCard
          label="Sessions"
          value={overview?.totalSessions ?? 0}
          sub={`${overview?.totalTurns ?? 0} turns`}
        />
        <CostCard value={overview?.estimatedCostUsd ?? 0} />
        <StatCard label="Active Users" value={overview?.activeUsers ?? 0} />
      </div>

      {/* Daily chart */}
      {daily?.daily && daily.daily.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text">Daily Usage (30 days)</h4>
          <div className="flex h-32 items-end gap-px">
            {daily.daily.map((d: any, i: number) => {
              const total = (d.inputTokens ?? 0) + (d.outputTokens ?? 0);
              const max = Math.max(...daily.daily.map((dd: any) => (dd.inputTokens ?? 0) + (dd.outputTokens ?? 0)), 1);
              const height = (total / max) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-brand/60 transition-all hover:bg-brand"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${d.date}: ${formatNumber(total)} tokens`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Model pricing reference */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text">Model Pricing (per 1M tokens)</h4>
        <div className="overflow-hidden rounded-lg border border-border shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-neutral-50">
                <th className="px-3 py-1.5 text-left text-text-tertiary font-medium">Model</th>
                <th className="px-3 py-1.5 text-right text-text-tertiary font-medium">Input</th>
                <th className="px-3 py-1.5 text-right text-text-tertiary font-medium">Output</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border"><td className="px-3 py-1.5">Haiku</td><td className="px-3 py-1.5 text-right">$0.25</td><td className="px-3 py-1.5 text-right">$1.25</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-1.5">Sonnet</td><td className="px-3 py-1.5 text-right">$3.00</td><td className="px-3 py-1.5 text-right">$15.00</td></tr>
              <tr><td className="px-3 py-1.5">Opus</td><td className="px-3 py-1.5 text-right">$15.00</td><td className="px-3 py-1.5 text-right">$75.00</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-border shadow-sm p-3">
      <p className="text-[11px] text-text-tertiary">{label}</p>
      <AnimatedNumber
        value={value}
        className="mt-0.5 block text-lg font-semibold text-text"
        springOptions={{ stiffness: 200, damping: 25 }}
      />
      {sub && <p className="text-[11px] text-text-tertiary">{sub}</p>}
    </div>
  );
}

function CostCard({ value }: { value: number }) {
  return (
    <div className="rounded-xl bg-white border border-border shadow-sm p-3">
      <p className="text-[11px] text-text-tertiary">Est. Cost</p>
      <p className="mt-0.5 text-lg font-semibold text-text">${value.toFixed(2)}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
