/**
 * src/renderer/screens/Settings.tsx
 *
 * DASH-03: the operator's headline ask ("iyi bir settings tasarlarsın
 * server'ı yönetecek") -- the app's steady-state control room. Five stacked
 * cards (Status / Engine / Resource limits / Startup / Account) plus an Open
 * dashboard/browser row and an Open-logs-folder link, composed ENTIRELY from
 * existing `styles.css` classes (06-UI-SPEC's explicit "ZERO net-new CSS
 * classes" contract) -- reuses `RangeRow` (ResourceAllocation.tsx, exported
 * this plan) + the `CopyButton` pattern (LiveSuccess.tsx, duplicated per the
 * established per-screen convention) + the existing `.status-badge`
 * componentry (Phase 1 scaffolding, given a real signal for the first time).
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
 * - `WslResourceInfo.current` has no `diskGb` (disk is a creation-time cap,
 *   never round-tripped as an "applied" value) -- the Disk slider pre-fills
 *   at `recommended.diskGb` even though Memory/Processors pre-fill at their
 *   real `current` values, per the plan's "current applied values" intent
 *   applied to every field the wire contract actually carries.
 *
 * Security (T-06-10/T-06-08): every read here is the secret-free
 * `EngineStatusResult`/`Account`/`WslResourceInfo` -- no vault/token ever
 * reaches this file. "Open in browser"/"Open dashboard" take no renderer
 * payload -- the URL/path is derived MAIN-SIDE (openInBrowserGated, D-10),
 * never renderer-supplied.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  EngineStatusResult,
  WslResourceInfo,
  Account,
  UpdateUiState,
  DiagnosticsExportResult,
} from '../../../shared/ipc-contract';
import {
  statusBadge,
  toggleLabel,
  restartLabel,
  formatLastChecked,
  resourceSavePlan,
  type Transition,
} from './settings-flow';
import { updateStatusLine, checkButton, restartCta } from './update-flow';
import { RangeRow } from './wsl/ResourceAllocation';

interface SettingsProps {
  onSignedOut: () => void;
}

const COPIED_RESET_MS = 1800;
const SAVED_RESET_MS = 1800;

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
  // ---- Status / Engine ----
  const [status, setStatus] = useState<EngineStatusResult | null>(null);
  const [transition, setTransition] = useState<Transition>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- Resource limits ----
  const [resourceInfo, setResourceInfo] = useState<WslResourceInfo | null>(null);
  const [memoryGb, setMemoryGb] = useState(0);
  const [processors, setProcessors] = useState(0);
  const [diskGb, setDiskGb] = useState(0);
  const [loaded, setLoaded] = useState<{ memoryGb: number; processors: number; diskGb: number } | null>(null);
  const [resourceTouched, setResourceTouched] = useState(false);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceSaved, setResourceSaved] = useState(false);
  const [resourceSaveFailed, setResourceSaveFailed] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Startup ----
  const [startAtLogin, setStartAtLogin] = useState(true);

  // ---- Account ----
  const [account, setAccount] = useState<Account | null>(null);

  // ---- About & updates ----
  const [updateState, setUpdateState] = useState<UpdateUiState | null>(null);
  const [restarting, setRestarting] = useState(false);

  // ---- Diagnostics ----
  const [exporting, setExporting] = useState(false);
  const [diagOutcome, setDiagOutcome] = useState<DiagnosticsExportResult['outcome'] | null>(null);
  const [logsFolderFailed, setLogsFolderFailed] = useState(false);
  const diagSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshStatus(): Promise<void> {
    const result = await window.api.engineGetStatus();
    setStatus(result);
  }

  useEffect(() => {
    // IN-06 fold-in: every independent mount-time fetch below gains a `.catch`
    // so a single rejected snapshot (e.g. a transient IPC failure) never
    // surfaces as an unhandled promise rejection -- each card simply keeps
    // its initial/empty state until the next successful refresh.
    void refreshStatus().catch(() => {});
    window.api
      .wslConfigGet()
      .then((info) => {
        setResourceInfo(info);
        const values = {
          memoryGb: info.current.memoryGb ?? info.recommended.memoryGb,
          processors: info.current.processors ?? info.recommended.processors,
          // No "current" diskGb round-trips on the wire (disk is a creation-time
          // cap, not an applied .wslconfig value) -- fall back to recommended.
          diskGb: info.recommended.diskGb,
        };
        setLoaded(values);
        setMemoryGb(values.memoryGb);
        setProcessors(values.processors);
        setDiskGb(values.diskGb);
      })
      .catch(() => {});
    window.api.authGetAccount().then(setAccount).catch(() => {});
    window.api
      .getState()
      .then((state) => setStartAtLogin(state.startAtLogin ?? true))
      .catch(() => {});
    window.api.updateGetState().then(setUpdateState).catch(() => {});
    // Runs once on mount -- each independent card fetches its own snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onStatusChanged(() => {
      void refreshStatus().catch(() => {});
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onUpdateStatus((s) => {
      setUpdateState(s);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (diagSavedTimerRef.current) clearTimeout(diagSavedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const desired = status?.desiredState ?? 'stopped';
  const healthy = status?.state === 'running';
  const needsAttention = status?.state === 'error';
  const badge = statusBadge({ desired, transition, healthy, needsAttention });
  const toggle = toggleLabel({ desired, transition });
  const restart = restartLabel({ transition });
  const msAgo = status?.lastCheckedAt != null ? Date.now() - status.lastCheckedAt : null;

  // About & updates card display state -- consumed verbatim from update-flow.ts (07-02),
  // never re-derived inline (UI-SPEC Pure-Decider-Seams).
  const checkUpdateBtn = updateState ? checkButton(updateState) : null;
  const restartUpdateCta = updateState ? restartCta(updateState) : null;

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

  function markResourceTouched(): void {
    setResourceTouched(true);
    setResourceSaveFailed(false);
    setResourceSaved(false);
  }

  function handleUndoResources(): void {
    if (!loaded) return;
    setMemoryGb(loaded.memoryGb);
    setProcessors(loaded.processors);
    setDiskGb(loaded.diskGb);
    setResourceTouched(false);
    setResourceSaveFailed(false);
  }

  async function handleSaveResources(): Promise<void> {
    if (!resourceInfo || resourceSaving) return;
    setResourceSaving(true);
    setResourceSaveFailed(false);
    setResourceSaved(false);
    // WR-09: wsl:configApply ends in a whole-VM `wsl --shutdown`. While the
    // engine is desired-running the save is an ORCHESTRATED stop -> apply ->
    // start (surfaced through the existing 'restarting' transition UI), so
    // supervision never has to mop up an "unexpected" death -- no dead engine
    // behind a "Saved." line, no spurious "recovered automatically" toast.
    const plan = resourceSavePlan(desired);
    const restartsEngine = plan.includes('engine-start');
    try {
      if (plan.includes('engine-stop')) {
        setTransition('restarting');
        await window.api.engineStop();
      }
      const limits = resourceInfo.cpuRamTunable ? { memoryGb, processors, diskGb } : { diskGb };
      const result = await window.api.wslConfigApply(limits);
      if (result.ok) {
        setLoaded({ memoryGb, processors, diskGb });
        setResourceTouched(false);
        setResourceSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setResourceSaved(false), SAVED_RESET_MS);
      } else {
        setResourceSaveFailed(true);
      }
      if (restartsEngine) {
        // ALWAYS bring the engine back -- it was deliberately stopped above,
        // even when the apply itself reported a failure.
        await window.api.engineStart();
      }
    } catch {
      setResourceSaveFailed(true);
      if (restartsEngine) {
        try {
          await window.api.engineStart();
        } catch {
          // refreshStatus below re-syncs whatever state we actually landed in.
        }
      }
    } finally {
      if (restartsEngine) setTransition(null);
      setResourceSaving(false);
      void refreshStatus();
    }
  }

  async function handleToggleStartup(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const next = e.target.checked;
    setStartAtLogin(next);
    try {
      const result = await window.api.engineSetStartAtLogin(next);
      setStartAtLogin(result.ok ? result.startAtLogin : !next);
    } catch {
      setStartAtLogin(!next);
    }
  }

  async function handleSignOut(): Promise<void> {
    await window.api.authSignOut();
    onSignedOut();
  }

  async function handleCheckForUpdates(): Promise<void> {
    try {
      await window.api.updateCheck();
    } catch {
      // Background-style call -- the real state (including a 'failed' status
      // line) arrives via the onUpdateStatus push, not this call's return.
    }
  }

  async function handleRestartToUpdate(): Promise<void> {
    setRestarting(true);
    try {
      const result = await window.api.updateRestartToInstall();
      if (!result.ok || result.blocked) {
        // Blocked by the D-06 install-gate (or a raw failure) -- the button
        // returns to its normal state; the install-gate note (driven by
        // updateState.installBlocked) already explains why.
        setRestarting(false);
      }
      // On a real accepted restart the window closes shortly after -- no
      // further local state change needed (Screen Notes §5: no interstitial).
    } catch {
      setRestarting(false);
    }
  }

  async function handleExportDiagnostics(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    setDiagOutcome(null);
    if (diagSavedTimerRef.current) clearTimeout(diagSavedTimerRef.current);
    try {
      const result = await window.api.supportExportDiagnostics();
      if (result.outcome === 'cancelled') {
        // Save dialog cancelled -- no message, button simply re-enables.
        setDiagOutcome(null);
      } else {
        setDiagOutcome(result.outcome);
        if (result.outcome === 'saved') {
          diagSavedTimerRef.current = setTimeout(() => setDiagOutcome(null), SAVED_RESET_MS);
        }
      }
    } catch {
      setDiagOutcome('failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleOpenLogsFolder(): Promise<void> {
    setLogsFolderFailed(false);
    try {
      const result = await window.api.engineOpenLogsFolder();
      setLogsFolderFailed(!result.ok);
    } catch {
      setLogsFolderFailed(true);
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

        {/* ---------- Resource limits card ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">RESOURCE LIMITS</h2>
          {resourceInfo && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {resourceInfo.cpuRamTunable && (
                  <RangeRow
                    id="settings-resource-memory"
                    label="Memory"
                    value={memoryGb}
                    min={1}
                    max={Math.max(resourceInfo.totalRamGb, 1)}
                    recommended={resourceInfo.recommended.memoryGb}
                    formatReadout={(v) => `${v} GB of ${resourceInfo.totalRamGb} GB`}
                    onChange={(v) => {
                      setMemoryGb(v);
                      markResourceTouched();
                    }}
                  />
                )}
                {resourceInfo.cpuRamTunable && (
                  <RangeRow
                    id="settings-resource-processors"
                    label="Processor cores"
                    value={processors}
                    min={1}
                    max={Math.max(resourceInfo.totalCores, 1)}
                    recommended={resourceInfo.recommended.processors}
                    formatReadout={(v) => `${v} of ${resourceInfo.totalCores} cores`}
                    onChange={(v) => {
                      setProcessors(v);
                      markResourceTouched();
                    }}
                  />
                )}
                <RangeRow
                  id="settings-resource-disk"
                  label="Disk space for Livinity"
                  value={diskGb}
                  min={15}
                  max={Math.max(resourceInfo.freeDiskGb, 15)}
                  recommended={resourceInfo.recommended.diskGb}
                  formatReadout={(v) => `Up to ${v} GB`}
                  onChange={(v) => {
                    setDiskGb(v);
                    markResourceTouched();
                  }}
                />
              </div>

              {/* Honest VM-global disclosure (D-17) + WR-09 save-restart disclosure. */}
              <p className="note-line" style={{ marginTop: 16 }}>
                Memory and processor limits apply to every Linux environment on your PC, not just
                Livinity — that's how Windows' WSL works. Disk space is used by Livinity only.
                Saving briefly restarts Windows' Linux layer (including any other Linux
                environments you run) — if your engine is running, Livinity restarts it for you.
              </p>

              {resourceSaving && (
                <p className="note-line" aria-live="polite" style={{ marginTop: 12 }}>
                  Saving…
                </p>
              )}
              {resourceSaved && !resourceSaving && (
                <p className="note-line" aria-live="polite" style={{ marginTop: 12 }}>
                  Saved.
                </p>
              )}
              {resourceSaveFailed && !resourceSaving && (
                <p className="note-line" aria-live="polite" style={{ marginTop: 12 }}>
                  That didn't go through — try again.
                </p>
              )}

              {resourceTouched && (
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={resourceSaving}
                    onClick={() => void handleSaveResources()}
                  >
                    {resourceSaving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className="link-mute" onClick={handleUndoResources}>
                    Undo changes
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------- Startup card ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">STARTUP</h2>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="settings-start-at-login"
              checked={startAtLogin}
              onChange={(e) => void handleToggleStartup(e)}
            />
            <label htmlFor="settings-start-at-login">
              Start Livinity automatically when I sign in to Windows
            </label>
          </div>
        </div>

        {/* ---------- Account card ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">ACCOUNT</h2>
          <div className="card-row">
            <div>
              <span className="field-label">Signed in as</span>
              <p className="note-line" style={{ marginTop: 4 }}>
                {account?.email ?? ''}
              </p>
            </div>
            <button type="button" className="btn" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        </div>

        {/* ---------- About & updates card (07-09/UI-SPEC §3) ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">ABOUT & UPDATES</h2>
          <div className="card-row">
            <span className="field-label">Version</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="value-chip mono">{updateState?.currentVersion ?? ''}</span>
              <span className="plan-badge">Beta</span>
            </div>
          </div>
          {updateState && (
            <div aria-live="polite">
              <p className="note-line" style={{ marginTop: 12 }}>
                {updateStatusLine(updateState)}
              </p>
            </div>
          )}
          {(checkUpdateBtn?.visible || restartUpdateCta?.visible) && (
            <div className="btn-row" style={{ marginTop: 16 }}>
              {checkUpdateBtn?.visible && (
                <button
                  type="button"
                  className="btn"
                  disabled={checkUpdateBtn.disabled}
                  onClick={() => void handleCheckForUpdates()}
                >
                  {checkUpdateBtn.label}
                </button>
              )}
              {restartUpdateCta?.visible && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={restartUpdateCta.disabled || restarting}
                  onClick={() => void handleRestartToUpdate()}
                >
                  {restarting ? 'Restarting…' : restartUpdateCta.label}
                </button>
              )}
            </div>
          )}
          {restartUpdateCta?.visible && restartUpdateCta.blockedNote && !restarting && (
            <p className="note-line" style={{ marginTop: 8 }}>
              {restartUpdateCta.blockedNote}
            </p>
          )}
        </div>

        {/* ---------- Diagnostics card (07-09/UI-SPEC §4) ---------- */}
        <div className="card" style={{ marginTop: 24 }}>
          <h2 className="card-title">DIAGNOSTICS</h2>
          <p className="note-line">
            If something isn't working, export a diagnostics file to share with support.
            Passwords, keys, and tokens are removed automatically.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              disabled={exporting}
              onClick={() => void handleExportDiagnostics()}
            >
              {exporting ? 'Exporting…' : 'Export diagnostics…'}
            </button>
            <button type="button" className="link-mute" onClick={() => void handleOpenLogsFolder()}>
              Open logs folder
            </button>
          </div>
          <div aria-live="polite">
            {diagOutcome === 'saved' && (
              <p className="note-line" style={{ marginTop: 12 }}>
                Saved.
              </p>
            )}
            {diagOutcome === 'folder-fallback' && (
              <p className="note-line" style={{ marginTop: 12 }}>
                Couldn't package the file — Livinity opened a folder with the diagnostics files
                instead.
              </p>
            )}
            {diagOutcome === 'failed' && (
              <p className="error-line" style={{ marginTop: 12 }}>
                Couldn't export diagnostics — try again.
              </p>
            )}
            {logsFolderFailed && (
              <p className="note-line" style={{ marginTop: 12 }}>
                Couldn't open the logs folder — try again.
              </p>
            )}
          </div>
        </div>

      </section>
    </div>
  );
}
