'use client';

// Reusable, dependency-free chart + display primitives for the admin
// dashboard / billing / analytics pages. All charts are hand-rolled inline
// SVG (no chart library). Styling lives in admin.css.

import type { ReactNode } from 'react';
import { formatNumber, timeAgo } from './format';

export type Tone = 'default' | 'green' | 'red' | 'amber' | 'blue';

const TONE_COLOR: Record<Tone, string> = {
  default: 'var(--fg)',
  green: 'var(--green)',
  red: 'var(--red)',
  amber: 'var(--amber)',
  blue: '#2563eb',
};

// ---------------------------------------------------------------------------
// Section — titled card wrapper
// ---------------------------------------------------------------------------
export type SectionProps = {
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
};

export function Section({ title, meta, right, children }: SectionProps) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">{title}</h2>
          {meta != null ? <div className="admin-section-meta">{meta}</div> : null}
        </div>
        {right != null ? <div className="admin-section-right">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — tiny inline SVG line
// ---------------------------------------------------------------------------
export type SparklineProps = {
  data: number[];
  tone?: Tone;
  width?: number;
  height?: number;
};

export function Sparkline({ data, tone = 'default', width = 64, height = 20 }: SparklineProps) {
  const color = TONE_COLOR[tone];
  if (!data || data.length === 0) {
    return <svg className="spark" width={width} height={height} aria-hidden="true" />;
  }
  if (data.length === 1) {
    const y = height / 2;
    return (
      <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 1.5;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * innerW;
      const y = pad + (1 - (v - min) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KpiCard — supersedes the inline one in page.tsx
// ---------------------------------------------------------------------------
export type KpiDelta = { value: number; dir: 'up' | 'down' | 'flat' };

export type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  delta?: KpiDelta;
  spark?: number[];
};

export function KpiCard({ label, value, hint, tone = 'default', delta, spark }: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
      {(hint || delta || (spark && spark.length > 0)) ? (
        <div className="kpi-foot">
          {delta ? (
            <span
              className={`kpi-delta kpi-delta-${delta.dir}`}
              title={`${delta.dir === 'down' ? '-' : delta.dir === 'up' ? '+' : ''}${Math.abs(delta.value)}`}
            >
              {delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '–'} {Math.abs(delta.value)}
            </span>
          ) : null}
          {hint ? <span className="kpi-hint">{hint}</span> : null}
          {spark && spark.length > 0 ? (
            <span className="kpi-spark">
              <Sparkline data={spark} tone={tone === 'default' ? 'blue' : tone} />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AreaChart — responsive SVG area w/ gradient fill + top stroke
// ---------------------------------------------------------------------------
export type AreaChartProps = {
  data: { label: string; value: number }[];
  height?: number;
  tone?: Tone;
  valueFormat?: (n: number) => string;
};

let areaGradSeq = 0;

export function AreaChart({ data, height = 120, tone = 'blue', valueFormat }: AreaChartProps) {
  const color = TONE_COLOR[tone];
  const gradId = `area-grad-${(areaGradSeq += 1)}`;
  const W = 600; // viewBox width; scales via preserveAspectRatio none
  const H = height;
  const padX = 4;
  const padTop = 6;
  const padBottom = 18;

  if (!data || data.length === 0) {
    return (
      <div className="area-chart">
        <p className="bar-chart-empty">No data.</p>
      </div>
    );
  }

  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 0);
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = data.length;

  const x = (i: number) => (n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => {
    if (max <= 0) return padTop + innerH; // all-zero → baseline, no NaN
    return padTop + (1 - v / max) * innerH;
  };

  const linePts = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const baseY = padTop + innerH;
  const areaPath =
    `M ${x(0).toFixed(2)},${baseY.toFixed(2)} ` +
    linePts.map((p) => `L ${p}`).join(' ') +
    ` L ${x(n - 1).toFixed(2)},${baseY.toFixed(2)} Z`;
  const linePath = `M ${linePts.map((p, i) => (i === 0 ? p : `L ${p}`)).join(' ')}`;

  // sparse x labels: first / mid / last
  const labelIdx = n === 1 ? [0] : n === 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const fmt = valueFormat ?? formatNumber;

  return (
    <div className="area-chart">
      <svg
        className="area-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        role="img"
        aria-label="area chart"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* faint baseline */}
        <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        {max > 0 ? (
          <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
      </svg>
      <div className="area-xlabels">
        {labelIdx.map((i) => (
          <span key={i} className="area-xlabel" title={`${data[i].label}: ${fmt(values[i])}`}>
            {data[i].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BarList — horizontal CSS bar list (generalized from page.tsx BarChart)
// ---------------------------------------------------------------------------
export type BarListRow = { label: string; sublabel?: string; value: number; display: string };

export type BarListProps = {
  title?: string;
  rows: BarListRow[];
  emptyMessage?: string;
};

export function BarList({ title, rows, emptyMessage = 'No data.' }: BarListProps) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <div className="bar-chart-inner">
      {title ? <h3 className="bar-chart-title">{title}</h3> : null}
      {rows.length === 0 ? (
        <p className="bar-chart-empty">{emptyMessage}</p>
      ) : (
        <ul className="bar-list">
          {rows.map((r, idx) => (
            <li key={idx} className="bar-row">
              <div className="bar-row-head">
                <span className="bar-row-label">{r.label}</span>
                <span className="bar-row-value">{r.display}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: max ? `${Math.max(2, Math.round((r.value / max) * 100))}%` : '0%' }}
                />
              </div>
              {r.sublabel ? <div className="bar-row-sub">{r.sublabel}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBar — single horizontal stacked distribution bar + legend
// ---------------------------------------------------------------------------
export type StatusSegment = { label: string; value: number; tone: Tone };

export type StatusBarProps = { segments: StatusSegment[] };

export function StatusBar({ segments }: StatusBarProps) {
  const visible = (segments || []).filter((s) => (Number(s.value) || 0) > 0);
  const total = visible.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  return (
    <div className="status-bar-wrap">
      <div className="status-bar">
        {total <= 0 ? (
          <div className="status-seg status-seg-empty" style={{ width: '100%' }} />
        ) : (
          visible.map((s, i) => (
            <div
              key={i}
              className="status-seg"
              style={{ width: `${(s.value / total) * 100}%`, background: TONE_COLOR[s.tone] }}
              title={`${s.label}: ${formatNumber(s.value)}`}
            />
          ))
        )}
      </div>
      <div className="status-legend">
        {(segments || []).map((s, i) => (
          <div key={i} className="status-legend-item">
            <span className="status-legend-dot" style={{ background: TONE_COLOR[s.tone] }} />
            <span className="status-legend-label">{s.label}</span>
            <span className="status-legend-value">{formatNumber(Number(s.value) || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — billing status → colored badge
// ---------------------------------------------------------------------------
export type StatusBadgeProps = {
  status: string | null;
  legacyFree?: boolean;
  freeByod?: boolean;
  revoked?: boolean;
  /** Stored live status whose own period end has passed (stale raw column —
   *  the webhook missed the transition). Renders an honest "Expired" instead
   *  of a live-looking Pro/Trial. Callers derive it from current_period_end. */
  expired?: boolean;
};

export function StatusBadge({ status, legacyFree, freeByod, revoked, expired }: StatusBadgeProps) {
  if (revoked) return <span className="badge badge-red">Revoked</span>;
  if (expired && (status === 'trialing' || status === 'active')) {
    return <span className="badge badge-mute">Expired</span>;
  }
  switch (status) {
    case 'active':
      return <span className="badge badge-green">Pro</span>;
    case 'trialing':
      return <span className="badge badge-amber">Trial</span>;
    case 'past_due':
      return <span className="badge badge-red">Past due</span>;
    case 'canceled':
      return <span className="badge badge-mute">Canceled</span>;
    default:
      if (legacyFree) return <span className="badge badge-blue">Legacy</span>;
      // Free BYO-domain tier — the user chose Free (vs picking nothing = None).
      if (freeByod) return <span className="badge badge-green">Free</span>;
      return <span className="badge badge-mute">None</span>;
  }
}

// ---------------------------------------------------------------------------
// ProgressMeter — labeled used/limit progress bar
// ---------------------------------------------------------------------------
export type ProgressMeterProps = {
  used: number;
  limit: number;
  label?: string;
};

export function ProgressMeter({ used, limit, label }: ProgressMeterProps) {
  const u = Number(used) || 0;
  const lim = Number(limit) || 0;
  const pct = lim > 0 ? (u / lim) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));
  const state = pct >= 100 ? 'red' : pct > 80 ? 'amber' : 'ok';
  return (
    <div className="progress-meter">
      {(label || lim > 0) ? (
        <div className="progress-label">
          <span>{label}</span>
          <span className="progress-pct">{lim > 0 ? `${Math.round(pct)}%` : '—'}</span>
        </div>
      ) : null}
      <div className="progress-track">
        <div className={`progress-fill progress-fill-${state}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeed — vertical feed w/ per-type dot + relative time
// ---------------------------------------------------------------------------
export type ActivityFeedEvent = {
  type: string;
  title: string;
  sublabel?: string;
  at: string;
};

export type ActivityFeedProps = { events: ActivityFeedEvent[] };

export function ActivityFeed({ events }: ActivityFeedProps) {
  if (!events || events.length === 0) {
    return <p className="bar-chart-empty">No recent activity.</p>;
  }
  return (
    <ul className="activity-feed">
      {events.map((e, i) => (
        <li key={i} className="activity-item">
          <span className={`activity-dot activity-dot-${e.type}`} aria-hidden="true" />
          <div className="activity-body">
            <span className="activity-title">{e.title}</span>
            {e.sublabel ? <span className="activity-sub">{e.sublabel}</span> : null}
          </div>
          <span className="activity-time">{timeAgo(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}
