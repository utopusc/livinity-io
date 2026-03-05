'use client';

import { useState, useMemo } from 'react';
import { BarChart3, Cpu, Zap, MessageCircle, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';
import { AnimatedNumber } from '@/components/motion-primitives/animated-number';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { InView } from '@/components/motion-primitives/in-view';

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
      <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">Live Usage</h3>
        <select
          className="rounded-lg bg-neutral-50 border border-black/[0.06] px-2 py-1 text-xs text-neutral-700 outline-none cursor-pointer hover:bg-neutral-100 transition-colors"
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
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-white border border-black/[0.06] p-4 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl bg-white border border-black/[0.06] p-4 space-y-2 text-center">
                <Skeleton className="h-2.5 w-3/4 mx-auto" />
                <Skeleton className="h-4 w-1/2 mx-auto" />
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white border border-black/[0.06] p-5">
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      )}

      {!isLoading && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Overview Cards */}
          {overview && (
            <AnimatedGroup preset="fade" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={Zap}
                label="Input Tokens"
                value={overview.totalInputTokens}
              />
              <StatCard
                icon={TrendingUp}
                label="Output Tokens"
                value={overview.totalOutputTokens}
              />
              <StatCard
                icon={MessageCircle}
                label="Sessions"
                value={overview.totalSessions}
              />
              <CostCard value={overview.estimatedCostUsd ?? 0} />
            </AnimatedGroup>
          )}

          {/* Additional Stats */}
          {overview && (
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Total Turns" value={overview.totalTurns} />
              <MiniStat label="Active Users" value={overview.activeUsers ?? 1} />
              <MiniStat
                label="Avg Tokens/Session"
                value={overview.totalSessions > 0
                  ? Math.round((overview.totalInputTokens + overview.totalOutputTokens) / overview.totalSessions)
                  : 0
                }
              />
            </div>
          )}

          {/* Usage Chart */}
          <InView
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.3 }}
            once
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-neutral-400" />
                <span className="text-xs font-medium text-neutral-900">Daily Token Usage</span>
              </div>

              {daily.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                  <Calendar className="h-8 w-8" />
                  <p className="mt-2 text-xs">No usage data yet</p>
                </div>
              ) : (
                <div className="rounded-xl bg-white border border-black/[0.06] p-5">
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
                            className="w-full rounded-t-sm bg-brand/40"
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

                  {/* X-axis labels */}
                  <div className="flex justify-between mt-2">
                    {daily.length > 0 && (
                      <>
                        <span className="text-[9px] text-neutral-400">{(daily[0] as any).date?.slice(5)}</span>
                        <span className="text-[9px] text-neutral-400">{(daily[daily.length - 1] as any).date?.slice(5)}</span>
                      </>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-sm bg-brand" />
                      <span className="text-[10px] text-neutral-400">Input</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-sm bg-brand/40" />
                      <span className="text-[10px] text-neutral-400">Output</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </InView>

          {/* Daily breakdown table */}
          {daily.length > 0 && (
            <InView
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.3 }}
              once
            >
              <div className="space-y-2">
                <span className="text-xs font-medium text-neutral-900">Daily Breakdown</span>
                <div className="rounded-xl bg-white border border-black/[0.06] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-black/[0.06] bg-neutral-50 text-neutral-500">
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Input</th>
                        <th className="px-3 py-2 text-right font-medium">Output</th>
                        <th className="px-3 py-2 text-right font-medium">Sessions</th>
                        <th className="px-3 py-2 text-right font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {[...daily].reverse().slice(0, 14).map((day: any, i: number) => (
                        <tr key={i} className="text-neutral-700 hover:bg-neutral-50 transition-colors">
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
            </InView>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border border-black/[0.06] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-xs text-neutral-500">{label}</span>
      </div>
      <AnimatedNumber
        value={value}
        className="mt-0.5 block text-lg font-semibold text-neutral-900"
        springOptions={{ stiffness: 150, damping: 22 }}
      />
    </div>
  );
}

function CostCard({ value }: { value: number }) {
  return (
    <div className="rounded-xl bg-white border border-black/[0.06] p-4">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-xs text-neutral-500">Est. Cost</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold text-neutral-900">${value.toFixed(2)}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border border-black/[0.06] p-4 text-center">
      <p className="text-xs text-neutral-500">{label}</p>
      <AnimatedNumber
        value={value}
        className="mt-0.5 block text-sm font-medium text-neutral-900"
        springOptions={{ stiffness: 150, damping: 22 }}
      />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
