'use client';

import { useState, useMemo } from 'react';
import { BarChart3, Cpu, Zap, MessageCircle, DollarSign, Loader2, Calendar, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';

export function LiveUsageLayout() {
  const [days, setDays] = useState(30);
  const { data: overview, isLoading: overviewLoading } = trpcReact.ai.getUsageOverview.useQuery();
  const { data: dailyData, isLoading: dailyLoading } = trpcReact.ai.getUsageDaily.useQuery(
    { userId: 'default', days },
  );

  const isLoading = overviewLoading || dailyLoading;

  const daily = useMemo(() => {
    if (!dailyData?.daily) return [];
    return [...dailyData.daily].sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [dailyData]);

  const maxTokens = useMemo(() => {
    if (!daily.length) return 1;
    return Math.max(...daily.map((d: any) => (d.inputTokens ?? 0) + (d.outputTokens ?? 0)), 1);
  }, [daily]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h3 className="text-sm font-semibold text-text">Live Usage</h3>
        <select
          className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-text outline-none"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
        </div>
      )}

      {!isLoading && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Overview Cards */}
          {overview && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={Zap}
                label="Input Tokens"
                value={formatNumber(overview.totalInputTokens)}
              />
              <StatCard
                icon={TrendingUp}
                label="Output Tokens"
                value={formatNumber(overview.totalOutputTokens)}
              />
              <StatCard
                icon={MessageCircle}
                label="Sessions"
                value={formatNumber(overview.totalSessions)}
              />
              <StatCard
                icon={DollarSign}
                label="Est. Cost"
                value={`$${(overview.estimatedCostUsd ?? 0).toFixed(2)}`}
              />
            </div>
          )}

          {/* Additional Stats */}
          {overview && (
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Total Turns" value={formatNumber(overview.totalTurns)} />
              <MiniStat label="Active Users" value={String(overview.activeUsers ?? 1)} />
              <MiniStat
                label="Avg Tokens/Session"
                value={overview.totalSessions > 0
                  ? formatNumber(Math.round((overview.totalInputTokens + overview.totalOutputTokens) / overview.totalSessions))
                  : '0'
                }
              />
            </div>
          )}

          {/* Usage Chart */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-text-tertiary" />
              <span className="text-xs font-medium text-text">Daily Token Usage</span>
            </div>

            {daily.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
                <Calendar className="h-8 w-8" />
                <p className="mt-2 text-xs">No usage data yet</p>
              </div>
            ) : (
              <div className="rounded-xl bg-white/3 border border-white/5 p-4">
                {/* Bar chart */}
                <div className="flex items-end gap-[2px] h-32">
                  {daily.map((day: any, i: number) => {
                    const total = (day.inputTokens ?? 0) + (day.outputTokens ?? 0);
                    const inputH = (day.inputTokens ?? 0) / maxTokens * 100;
                    const outputH = (day.outputTokens ?? 0) / maxTokens * 100;
                    const dateStr = day.date?.slice(5) ?? '';

                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col justify-end items-center gap-0 group relative"
                        title={`${dateStr}: ${formatNumber(total)} tokens`}
                      >
                        <div
                          className="w-full rounded-t-sm bg-brand/60"
                          style={{ height: `${outputH}%`, minHeight: total > 0 ? 2 : 0 }}
                        />
                        <div
                          className="w-full bg-brand"
                          style={{ height: `${inputH}%`, minHeight: total > 0 ? 1 : 0 }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-axis labels (show every N days) */}
                <div className="flex justify-between mt-2">
                  {daily.length > 0 && (
                    <>
                      <span className="text-[9px] text-text-tertiary">{(daily[0] as any).date?.slice(5)}</span>
                      <span className="text-[9px] text-text-tertiary">{(daily[daily.length - 1] as any).date?.slice(5)}</span>
                    </>
                  )}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-sm bg-brand" />
                    <span className="text-[10px] text-text-tertiary">Input</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-sm bg-brand/60" />
                    <span className="text-[10px] text-text-tertiary">Output</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Daily breakdown table */}
          {daily.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-text">Daily Breakdown</span>
              <div className="rounded-xl bg-white/3 border border-white/5 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-text-tertiary">
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-right font-medium">Input</th>
                      <th className="px-3 py-2 text-right font-medium">Output</th>
                      <th className="px-3 py-2 text-right font-medium">Sessions</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...daily].reverse().slice(0, 14).map((day: any, i: number) => (
                      <tr key={i} className="border-b border-white/3 text-text-secondary">
                        <td className="px-3 py-1.5 font-mono">{day.date}</td>
                        <td className="px-3 py-1.5 text-right">{formatNumber(day.inputTokens ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right">{formatNumber(day.outputTokens ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right">{day.sessions ?? 0}</td>
                        <td className="px-3 py-1.5 text-right">${(day.estimatedCostUsd ?? 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-3 text-center">
      <p className="text-[11px] text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-text">{value}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
