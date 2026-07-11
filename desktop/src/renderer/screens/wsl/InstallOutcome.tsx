/**
 * src/renderer/screens/wsl/InstallOutcome.tsx
 *
 * Screen 6 of the WSL2 provisioning wizard (D-10/D-11/D-14) -- the
 * disk-too-small stop plus every mapped install-failure outcome. Each
 * variant keeps a MONOCHROME Display title + --fg-dim body + the accent
 * "Try again"/"Check again" as the single focal element; at most ONE
 * optional red `.error-line` (the our-bug/generic technical reason) ever
 * appears, and titles are never red (T-04-04 defense in depth -- `reason`
 * is already sanitized main-side via redactSecretLike, 04-06, before it
 * ever reaches this screen).
 *
 * NO destructive action anywhere in this phase (D-11): every retry
 * re-verifies live state and reuses the existing distro -- there is no
 * distro-removal command and no confirmation-gated red button anywhere
 * on this screen.
 *
 * "Export diagnostics…" (07-09/D-10/UI-SPEC §5): the 'our-bug' variant's
 * former inert placeholder link is now an enabled `.link-mute` calling
 * the SAME `window.api.supportExportDiagnostics()` exporter as the Settings
 * Diagnostics card -- one code path, two entry points. Relabelled (not just
 * enabled): nothing is sent in v1, a file is saved locally, so the prior
 * "sending" copy would have been a false promise.
 */

import { useState } from 'react';

interface InstallOutcomeProps {
  outcome: 'disk' | 'systemd-retry' | 'our-bug' | 'generic';
  freeGb?: number;
  driveLetter?: string;
  reason?: string;
  onRetry: () => void;
}

export default function InstallOutcome({ outcome, freeGb, driveLetter, reason, onRetry }: InstallOutcomeProps) {
  const [exporting, setExporting] = useState(false);
  const [exportOutcome, setExportOutcome] = useState<'saved' | 'failed' | null>(null);

  async function handleExportDiagnostics(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    setExportOutcome(null);
    try {
      const result = await window.api.supportExportDiagnostics();
      if (result.outcome === 'saved' || result.outcome === 'folder-fallback') {
        setExportOutcome('saved');
      } else if (result.outcome === 'failed') {
        setExportOutcome('failed');
      }
      // 'cancelled' -- no message, button simply re-enables.
    } catch {
      setExportOutcome('failed');
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="setup-shell setup-shell--centered">
      <section>
        {outcome === 'disk' && (
          <>
            <h1 className="display">Not enough free space</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Livinity needs at least 15 GB free to install. This PC has about {freeGb ?? 0} GB free right
              now on {driveLetter ?? 'your drive'}.
            </p>
            <p className="note-line" style={{ marginTop: 16 }}>
              Free up some room — empty the Recycle Bin, remove files you don't need, or move them to
              another drive — then check again.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Check again
            </button>
          </>
        )}

        {outcome === 'systemd-retry' && (
          <>
            <h1 className="display">Livinity needs one more try</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              A background service didn't come up on the first attempt — restarting Livinity's system
              usually clears it.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        )}

        {outcome === 'our-bug' && (
          <>
            <h1 className="display">Something went wrong on our end</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Livinity hit an unexpected setup error — this one's on us. Trying again usually sorts it
              out.
            </p>
            {reason && (
              <p className="error-line" style={{ marginTop: 16 }}>
                {reason}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Try again
            </button>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="link-mute"
                disabled={exporting}
                onClick={() => void handleExportDiagnostics()}
              >
                {exporting ? 'Exporting…' : 'Export diagnostics…'}
              </button>
              <div aria-live="polite">
                {exportOutcome === 'saved' && (
                  <p className="note-line" style={{ marginTop: 8 }}>
                    Saved. Attach this file if you contact support.
                  </p>
                )}
                {exportOutcome === 'failed' && (
                  <p className="error-line" style={{ marginTop: 8 }}>
                    Couldn't export diagnostics — try again.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {outcome === 'generic' && (
          <>
            <h1 className="display">Installation didn't finish</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Something interrupted the install. Trying again is safe — Livinity won't double-install or
              lose your setup.
            </p>
            {reason && (
              <p className="error-line" style={{ marginTop: 16 }}>
                {reason}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        )}
      </section>
    </div>
  );
}
