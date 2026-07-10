/**
 * src/renderer/screens/wsl/WslEnable.tsx
 *
 * Screen 1 of the WSL2 provisioning wizard (WSL-01; D-01..D-05) -- the
 * detect -> pre-UAC explainer -> waiting-for-permission -> declined-recovery
 * -> enabling -> restart -> resume sub-state machine. Every state renders
 * calm human sentences (D-05, zero-terminal, hard rule) inside the same
 * `.setup-shell setup-shell--centered` column -- never a terminal, never a
 * command.
 *
 * This screen NEVER triggers the required Windows restart itself (D-03) --
 * "Restart now" only signals the CHOICE via `onRestartChosen(false)`; the
 * actual restart + auto-resume arming (`openAtLogin --hidden`) is main-side
 * (04-09/04-10). "I'll restart later" is a first-class choice, never a nag.
 *
 * Detection routing reuses `mapWslDetectResult` (wsl-flow.ts) -- the phase's
 * SOLE result->step router -- so this screen never re-implements its own
 * competing branching logic for the same WslDetectResult shape.
 */

import { useEffect, useRef, useState } from 'react';
import { mapWslDetectResult, mapWslEnableResult } from './wsl-flow';

type SubState =
  | 'detect'
  | 'pre-uac'
  | 'waiting'
  | 'declined'
  | 'enabling'
  | 'restart'
  | 'resume'
  | 'resume-failed';

interface WslEnableProps {
  onProceed: () => void;
  onBiosBlocked: () => void;
  /** Signals the user's restart choice only -- never calls a restart API itself (D-03). */
  onRestartChosen: (later: boolean) => void;
  /**
   * Set by the App sub-router (04-10) when re-entering this screen on the
   * `--hidden` auto-resume path after the user restarted (D-04) -- selects
   * the 'resume'/'resume-failed' copy instead of the first-run 'detect'
   * copy. Optional and defaults to false so a first-run mount is unaffected.
   */
  resume?: boolean;
}

/** A calm indeterminate wait indicator shared by every progress sub-state. */
function ProgressIndeterminate(): React.ReactElement {
  return (
    <div className="progress-track progress-indeterminate" role="progressbar" aria-label="Working">
      <div className="progress-fill" />
    </div>
  );
}

const ENABLING_TRANSITION_MS = 2500;

export default function WslEnable({
  onProceed,
  onBiosBlocked,
  onRestartChosen,
  resume = false,
}: WslEnableProps) {
  const [subState, setSubState] = useState<SubState>(resume ? 'resume' : 'detect');
  const [laterAcknowledged, setLaterAcknowledged] = useState(false);
  const enablingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (enablingTimerRef.current) clearTimeout(enablingTimerRef.current);
    };
  }, []);

  /**
   * Shared detect/re-verify path for both the first-run 'detect' entry and
   * the post-restart 'resume' entry (D-04: re-verify, never blindly
   * continue). Routes through mapWslDetectResult -- the sole router.
   */
  async function runDetect(): Promise<void> {
    const result = await window.api.wslDetect();
    const { step } = mapWslDetectResult(result);
    switch (step) {
      case 'wsl-enable':
        setSubState(resume ? 'resume-failed' : 'pre-uac');
        break;
      case 'bios-deadend':
        onBiosBlocked();
        break;
      case 'wsl-restart':
        setSubState(resume ? 'resume-failed' : 'restart');
        break;
      case 'wsl-handoff':
      case 'resource':
        onProceed();
        break;
      default:
        onProceed();
    }
  }

  useEffect(() => {
    void runDetect();
    // Runs once on mount only -- re-detection is user-triggered (pre-uac's
    // button, resume-failed's "Try again"), never a background poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTurnOn(): Promise<void> {
    setSubState('waiting');
    // No IPC event distinguishes "prompt is up" from "prompt was accepted,
    // now applying the feature" -- give the user a plausible transitional
    // state if the single wslEnable() call is still in flight after a few
    // seconds, rather than pinning "waiting for permission" copy the whole
    // time (Rule 2: the 'enabling' sub-state must be reachable, not dead).
    enablingTimerRef.current = setTimeout(() => setSubState('enabling'), ENABLING_TRANSITION_MS);
    try {
      const result = await window.api.wslEnable();
      if (enablingTimerRef.current) {
        clearTimeout(enablingTimerRef.current);
        enablingTimerRef.current = null;
      }
      const { outcome } = mapWslEnableResult(result);
      switch (outcome) {
        case 'restart-required':
          setSubState('restart');
          break;
        case 'bios-deadend':
          onBiosBlocked();
          break;
        case 'declined':
        case 'error':
          setSubState('declined');
          break;
      }
    } catch {
      // A rejected call (the IPC handler always resolves a WslEnableResult
      // by design) is treated the same as a declined prompt -- recoverable,
      // never a dead end.
      if (enablingTimerRef.current) {
        clearTimeout(enablingTimerRef.current);
        enablingTimerRef.current = null;
      }
      setSubState('declined');
    }
  }

  function handleRestartLater(): void {
    setLaterAcknowledged(true);
    onRestartChosen(true);
  }

  function handleTryResumeAgain(): void {
    setSubState('resume');
    void runDetect();
  }

  return (
    <div className="setup-shell setup-shell--centered">
      {subState === 'detect' && (
        <section aria-busy="true">
          <h1 className="display">Getting your PC ready</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Checking what Livinity needs to set up. This only takes a moment.
          </p>
          <div style={{ marginTop: 24 }}>
            <ProgressIndeterminate />
          </div>
        </section>
      )}

      {subState === 'pre-uac' && (
        <section>
          <h1 className="display">One quick Windows setup</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Livinity needs to switch on a built-in Windows feature so it can run LivOS on your PC.
            Windows will ask for your permission first — just choose <strong>Yes</strong> when its
            prompt appears.
          </p>
          <p className="note-line" style={{ marginTop: 16 }}>
            This is a one-time setup. You won&apos;t be asked again.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            onClick={() => void handleTurnOn()}
          >
            Turn on Windows features
          </button>
        </section>
      )}

      {subState === 'waiting' && (
        <section aria-busy="true">
          <h1 className="display">One quick Windows setup</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Waiting for Windows to ask your permission… If you don&apos;t see the prompt, check your
            taskbar and choose Yes.
          </p>
          <div style={{ marginTop: 24 }}>
            <ProgressIndeterminate />
          </div>
        </section>
      )}

      {subState === 'declined' && (
        <section>
          <h1 className="display">One quick Windows setup</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Windows setup needs your permission to continue.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            onClick={() => void handleTurnOn()}
          >
            Try again
          </button>
        </section>
      )}

      {subState === 'enabling' && (
        <section aria-busy="true">
          <h1 className="display">One quick Windows setup</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Turning on Windows features… this takes a few seconds.
          </p>
          <div style={{ marginTop: 24 }}>
            <ProgressIndeterminate />
          </div>
        </section>
      )}

      {subState === 'restart' && (
        <section>
          <h1 className="display">Restart to finish setup</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Windows needs to restart to finish turning on the feature Livinity just enabled. Save any
            open work first.
          </p>
          <p className="note-line" style={{ marginTop: 16 }}>
            After your PC restarts and you sign back in, Livinity opens on its own and picks up right
            here. You won&apos;t lose your place.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 48 }}
            onClick={() => onRestartChosen(false)}
          >
            Restart now
          </button>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 24 }}
            onClick={handleRestartLater}
          >
            I&apos;ll restart later
          </button>
          {laterAcknowledged && (
            <p className="note-line" style={{ marginTop: 16 }}>
              No problem — restart whenever you&apos;re ready. We&apos;ll be right here.
            </p>
          )}
        </section>
      )}

      {subState === 'resume' && (
        <section aria-busy="true">
          <h1 className="display">Picking up where we left off</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            Finishing your Windows setup…
          </p>
          <div style={{ marginTop: 24 }}>
            <ProgressIndeterminate />
          </div>
        </section>
      )}

      {subState === 'resume-failed' && (
        <section>
          <h1 className="display">Picking up where we left off</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            It looks like Windows setup didn&apos;t finish. Let&apos;s try that once more.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            onClick={handleTryResumeAgain}
          >
            Try again
          </button>
        </section>
      )}
    </div>
  );
}
