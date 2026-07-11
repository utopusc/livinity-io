/**
 * src/renderer/screens/Settings.tsx
 *
 * DASH-03: the operator's headline ask ("iyi bir settings tasarlarsın
 * server'ı yönetecek") -- the app's steady-state control room. Task 1 of
 * 06-09 ships the Status / Engine cards + the Open dashboard/browser row;
 * Task 2 adds the Resource limits / Startup / Account cards + the "Open logs
 * folder" link on top of this same file.
 *
 * All labels/classes come from the pure `settings-flow.ts` (06-04) -- this
 * file never re-derives the status-badge/toggle/restart copy or class
 * mapping inline. All engine actions go through the SAME `engine:*` IPC the
 * tray uses (D-11 single source of truth), INCLUDING the D-10 stopped-gated
 * `engineOpenInBrowser` for "Open in browser" -- NEVER LiveSuccess's ungated
 * legacy open-in-browser channel (that channel does not appear anywhere in
 * this file).
 *
 * Not mounted yet -- App.tsx routing (the tray "Settings" row + LiveSuccess's
 * "Manage your server" hook) is 06-11.
 *
 * Interface-gap decisions (documented in 06-09-SUMMARY.md, same honesty-guard
 * precedent as 06-04's own documented gap-filling decisions):
 * - `EngineStatusResult` (06-01/06-07's wire contract) carries only a derived
 *   4-value `state` (never a separate `healthy`/`needsAttention` pair) --
 *   `needsAttention` is derived here as `state === 'error'` (the only
 *   "unhealthy, not deliberately stopped" signal the current contract
 *   exposes); `healthy` is derived as `state === 'running'` (unused by
 *   `statusBadge`'s own logic when `desired === 'running'`, kept for
 *   interface completeness).
 * - The in-flight `transition` (starting/stopping/restarting) is a PURELY
 *   LOCAL flag, set right before an engine action's IPC call and cleared in
 *   its `finally` -- `EngineStatusResult` has no wire-level transition field.
 *
 * Security (T-06-10/T-06-08): every read here is the secret-free
 * `EngineStatusResult` -- no vault/token ever reaches this file. "Open in
 * browser"/"Open dashboard" take no renderer payload -- the URL/path is
 * derived MAIN-SIDE (openInBrowserGated, D-10), never renderer-supplied.
 */

import { useEffect, useRef, useState } from 'react';
import type { EngineStatusResult } from '../../../shared/ipc-contract';
import { statusBadge, toggleLabel, restartLabel, formatLastChecked, type Transition } from './settings-flow';

interface SettingsProps {
  onSignedOut: () => void;
}

const COPIED_RESET_MS = 1800;

const ACTION_VERB: Record<Exclude<Transition, null>, string> = {
  starting: 'start',
  stopping: 'stop',
  restarting: 'restart',
};

// SR-only style for the "Copied ✓" live region -- identical to LiveSuccess.tsx/
// Nameservers.tsx (kept out of the button's accessible name so the announcement
// doesn't clobber the aria-label).
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function CopyGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"
      />
    </svg>
  );
}

/** One new glyph this phase (06-UI-SPEC Icon library note) -- a small monochrome
 * restart/refresh arrow, ~14px, same inline-SVG family as CopyGlyph/CheckGlyph. */
function RestartGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 5.36A9 9 0 0 0 20.49 15"
      />
    </svg>
  );
}

/**
 * The animated "Copied ✓" copy button, reused verbatim from LiveSuccess.tsx
 * (itself reused from Nameservers.tsx) -- duplicated per this codebase's
 * existing per-screen convention (no shared copy-button component has been
 * extracted yet).
 */
function CopyButton({ value, label }: { value: string; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard denied -- the value stays selectable text as a fallback.
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        className={`btn copy-btn${copied ? ' copied' : ''}`}
        aria-label={label}
        onClick={() => void handleCopy()}
      >
        <span aria-hidden="true">{copied ? 'Copied' : <CopyGlyph />}</span>
        <span className="copy-check" aria-hidden="true">
          ✓
        </span>
      </button>
      <span role="status" aria-live="polite" style={SR_ONLY}>
        {copied ? 'Copied ✓' : ''}
      </span>
    </>
  );
}

export default function Settings({ onSignedOut }: SettingsProps) {
  void onSignedOut; // consumed by Task 2's Account card (Sign out)

  // ---- Status / Engine ----
  const [status, setStatus] = useState<EngineStatusResult | null>(null);
  const [transition, setTransition] = useState<Transition>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refreshStatus(): Promise<void> {
    const result = await window.api.engineGetStatus();
    setStatus(result);
  }

  useEffect(() => {
    void refreshStatus();
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onStatusChanged(() => {
      void refreshStatus();
    });
    return unsubscribe;
  }, []);

  const desired = status?.desiredState ?? 'stopped';
  const healthy = status?.state === 'running';
  const needsAttention = status?.state === 'error';
  const badge = statusBadge({ desired, transition, healthy, needsAttention });
  const toggle = toggleLabel({ desired, transition });
  const restart = restartLabel({ transition });
  const msAgo = status?.lastCheckedAt != null ? Date.now() - status.lastCheckedAt : null;

  async function runAction(kind: Exclude<Transition, null>): Promise<void> {
    setTransition(kind);
    setActionError(null);
    try {
      const result =
        kind === 'starting'
          ? await window.api.engineStart()
          : kind === 'stopping'
            ? await window.api.engineStop()
            : await window.api.engineRestart();
      if (!result.ok) {
        setActionError(`Couldn't ${ACTION_VERB[kind]} the engine — try again.`);
      }
    } catch {
      setActionError(`Couldn't ${ACTION_VERB[kind]} the engine — try again.`);
    } finally {
      setTransition(null);
      void refreshStatus();
    }
  }

  return (
    <div className="setup-shell">
      <section>
        <h1 className="display">Manage your server</h1>
        <p className="note-line" style={{ marginTop: 16 }}>
          Everything about your Livinity server, in one place.
        </p>

        {/* ---------- Status card ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">STATUS</h2>
          <div aria-live="polite">
            <div className={`status-badge ${badge.className}`}>
              <span className="status-dot" />
              {badge.label}
            </div>
          </div>
          {status?.address && (
            <div className="card-row" style={{ marginTop: 12 }}>
              <span className="field-label">Your address</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="value-chip mono">{status.address}</span>
                <CopyButton value={status.address} label="Copy your address" />
              </div>
            </div>
          )}
          <p className="field-label" style={{ color: 'var(--fg-mute)', marginTop: 12, fontWeight: 400 }}>
            {formatLastChecked(msAgo)}
          </p>
        </div>

        {/* ---------- Engine card ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">ENGINE</h2>
          <div className="btn-row">
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
              <RestartGlyph />
              {restart.label}
            </button>
          </div>
          <p className="note-line" style={{ marginTop: 16 }}>
            Quitting Livinity doesn't stop your server — it keeps running in the background. Use
            Stop to turn it off completely.
          </p>
          {actionError && (
            <p className="error-line" aria-live="polite" style={{ marginTop: 8 }}>
              {actionError}
            </p>
          )}
        </div>

        {/* ---------- Open dashboard / Open in browser (no card, D-10) ---------- */}
        <div style={{ marginTop: 24 }}>
          {desired === 'stopped' && (
            <p className="note-line" style={{ marginBottom: 12 }}>
              Your engine is stopped. Start it above to open your dashboard.
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void window.api.engineOpenDashboard()}>
              Open dashboard
            </button>
            <button type="button" className="btn" onClick={() => void window.api.engineOpenInBrowser()}>
              Open in browser
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
