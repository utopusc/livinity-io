/**
 * src/renderer/screens/QuickPanel.tsx
 *
 * The tray's LEFT-click compact management popover (tray-panel addendum,
 * post-Phase-7): a single card -- status dot+label, Start/Stop toggle +
 * Restart, live RAM/CPU/disk usage rows, and an "Open dashboard" row.
 * Mounted ONLY by App.tsx's `#quick-panel` hash early-branch (main-side,
 * `src/main/tray/quick-panel.ts`, loads this exact renderer entry with that
 * hash) -- never part of the normal screen router.
 *
 * Reuses `statusBadge`/`toggleLabel`/`restartLabel` from settings-flow.ts
 * VERBATIM (D-11 single source of truth, same copy the Settings screen and
 * the tray's own buildTrayView already share) -- never re-derived here.
 * Reuses ONLY existing styles.css classes (card/status-badge/btn/btn-row/
 * note-line/field-label/value-chip/progress-track/progress-fill) -- ZERO new
 * CSS classes, per the locked design.
 *
 * Polls engine:getStatus + engine:getUsage every 2.5s WHILE the window is
 * actually visible (document.visibilityState) -- this window is hidden (not
 * destroyed) on blur, so an unconditional interval would keep polling
 * forever in the background; the visibilitychange listener also fires an
 * immediate poll the moment the panel is shown again, so the numbers are
 * never stale on open.
 */

import { useEffect, useState } from 'react';
import type { EngineStatusResult, UsageResult } from '../../../shared/ipc-contract';
import { statusBadge, toggleLabel, restartLabel, type Transition } from './settings-flow';
import { formatMemRow, formatDiskRow, formatCpuRow, memPercent, usageUnavailableText } from './quick-panel-flow';

const POLL_INTERVAL_MS = 2500;

export default function QuickPanel(): React.ReactElement {
  const [status, setStatus] = useState<EngineStatusResult | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [transition, setTransition] = useState<Transition>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      if (document.visibilityState !== 'visible') return;
      const [s, u] = await Promise.all([window.api.engineGetStatus(), window.api.engineGetUsage()]);
      if (cancelled) return;
      setStatus(s);
      setUsage(u);
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => void poll();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const desired = status?.desiredState ?? 'stopped';
  const healthy = status?.state === 'running';
  const needsAttention = status?.state === 'error';
  const badge = statusBadge({ desired, transition, healthy, needsAttention });
  const toggle = toggleLabel({ desired, transition });
  const restart = restartLabel({ transition });

  async function runAction(kind: Exclude<Transition, null>): Promise<void> {
    setTransition(kind);
    try {
      if (kind === 'starting') await window.api.engineStart();
      else if (kind === 'stopping') await window.api.engineStop();
      else await window.api.engineRestart();
    } finally {
      setTransition(null);
      const s = await window.api.engineGetStatus();
      setStatus(s);
    }
  }

  return (
    <div className="card" style={{ margin: 12 }}>
      <div className="card-row">
        <div className={`status-badge ${badge.className}`}>
          <span className="status-dot" />
          {badge.label}
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={toggle.disabled}
          onClick={() => void runAction(desired === 'stopped' ? 'starting' : 'stopping')}
        >
          {toggle.label}
        </button>
        <button
          type="button"
          className="btn"
          disabled={restart.disabled}
          onClick={() => void runAction('restarting')}
        >
          {restart.label}
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {usage?.ok ? (
          <>
            <div>
              <div className="card-row">
                <span className="field-label">Memory</span>
                <span className="value-chip mono">{formatMemRow(usage.memUsedKb, usage.memTotalKb)}</span>
              </div>
              <div className="progress-track" style={{ marginTop: 6 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${memPercent(usage.memUsedKb, usage.memTotalKb)}%` }}
                />
              </div>
            </div>
            <div className="card-row">
              <span className="field-label">CPU load</span>
              <span className="value-chip mono">{formatCpuRow(usage.load1, usage.cpuCount)}</span>
            </div>
            <div className="card-row">
              <span className="field-label">Disk</span>
              <span className="value-chip mono">{formatDiskRow(usage.diskUsedKb, usage.diskTotalKb)}</span>
            </div>
          </>
        ) : (
          <p className="note-line">{usageUnavailableText(usage?.reason ?? 'engine-stopped')}</p>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-block"
          onClick={() => void window.api.engineOpenDashboard()}
        >
          Open dashboard
        </button>
      </div>
    </div>
  );
}
