/**
 * src/renderer/screens/wsl/Downloading.tsx
 *
 * Screen 4 of the WSL2 provisioning wizard (WSL-03; D-09). Kicks off the
 * distro download+import (wsl:distroInstall) on mount, subscribes to
 * onDownloadUpdate progress pushes (unsubscribed on cleanup, IN-06), and
 * renders a determinate MONOCHROME progress bar (the box is not live yet --
 * progress-color-discipline, never the tray "live" accent) + a distinct
 * checksum-verify step + a graceful ARM64 block.
 *
 * Result routing: 'installed' -> onInstalled(); 'disk-too-small' ->
 * onDiskTooSmall(freeGb, driveLetter) (Screen 6's disk stop); 'arch-
 * unsupported' -> the calm, monochrome, no-false-retry ARM block below;
 * 'download-failed'/'checksum-failed'/'error' -> an inline "Try again"
 * state on THIS screen (never proceeds past a checksum mismatch, D-09).
 *
 * Security (T-04-09): the ARM "Learn more" link uses wslOpenExternal('arm-
 * help') -- an enum target, never a renderer-chosen URL (mirrors
 * cfOpenExternal / BiosDeadEnd's wslOpenExternal('bios-help')).
 */

import { useEffect, useState } from 'react';
import { formatDownloadReadout, mapDistroInstallResult } from './wsl-flow';
import type { WslDownloadUpdate } from '../../../../shared/ipc-contract';

interface DownloadingProps {
  onInstalled: () => void;
  onDiskTooSmall: (freeGb: number, driveLetter: string) => void;
  onArchUnsupported: () => void;
}

type DownloadPhase = 'active' | 'download-failed' | 'checksum-failed' | 'arm-blocked';

export default function Downloading({ onInstalled, onDiskTooSmall, onArchUnsupported }: DownloadingProps) {
  const [progress, setProgress] = useState<WslDownloadUpdate | null>(null);
  const [phase, setPhase] = useState<DownloadPhase>('active');

  async function runDownload(): Promise<void> {
    try {
      const result = await window.api.wslDistroInstall();
      const outcome = mapDistroInstallResult(result);
      switch (outcome.kind) {
        case 'installed':
          onInstalled();
          break;
        case 'disk-too-small':
          onDiskTooSmall(outcome.freeGb ?? 0, outcome.driveLetter ?? '');
          break;
        case 'arch-unsupported':
          // Renders the honest ARM block on THIS screen (UI-SPEC Screen 4 owns
          // this state) while also notifying the parent (state-persistence hook).
          setPhase('arm-blocked');
          onArchUnsupported();
          break;
        case 'download-failed':
          setPhase('download-failed');
          break;
        case 'checksum-failed':
          setPhase('checksum-failed');
          break;
        case 'error':
          setPhase('download-failed');
          break;
      }
    } catch {
      setPhase('download-failed');
    }
  }

  useEffect(() => {
    const unsubscribe = window.api.onDownloadUpdate((u) => setProgress(u));
    void runDownload();
    return unsubscribe;
    // Runs once on mount -- the download+import kicks off exactly once per screen entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRetry(): void {
    setPhase('active');
    setProgress(null);
    void runDownload();
  }

  const doneBytes = progress?.doneBytes ?? 0;
  const totalBytes = progress?.totalBytes ?? 0;
  const pct = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0;
  const verifying = progress?.phase === 'verifying';

  return (
    <div className="setup-shell">
      <section aria-busy={phase === 'active'}>
        <h1 className="display">
          {phase === 'arm-blocked' ? "Livinity isn't ready for this PC yet" : 'Setting up Livinity'}
        </h1>

        {phase === 'active' && (
          <>
            <p className="note-line" style={{ marginTop: 16 }}>
              Downloading the Livinity system — a one-time download of a few hundred megabytes.
            </p>
            <div style={{ marginTop: 24 }}>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="progress-readout" style={{ marginTop: 8 }}>
                {formatDownloadReadout(doneBytes, totalBytes)}
              </p>
            </div>
            <p className="note-line" style={{ marginTop: 8 }}>
              {verifying ? 'Checking the download…' : 'Downloading…'}
            </p>
            {verifying && (
              <p className="note-line" style={{ marginTop: 8 }}>
                Making sure everything arrived safely.
              </p>
            )}
            <p className="note-line" style={{ marginTop: 16 }}>
              You can keep using your PC while this runs.
            </p>
          </>
        )}

        {phase === 'download-failed' && (
          <>
            <p className="note-line" style={{ marginTop: 16 }}>
              The download was interrupted. Check your connection and try again.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={handleRetry}
            >
              Try again
            </button>
          </>
        )}

        {phase === 'checksum-failed' && (
          <>
            <p className="note-line" style={{ marginTop: 16 }}>
              That download didn't check out. Let's try it again.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={handleRetry}
            >
              Try again
            </button>
          </>
        )}

        {phase === 'arm-blocked' && (
          <>
            <p className="note-line" style={{ marginTop: 16 }}>
              This PC uses an ARM processor, and the ARM version of Livinity isn't available yet. We're
              working on it — check back soon.
            </p>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="link-mute"
                onClick={() => void window.api.wslOpenExternal('arm-help')}
              >
                Learn more
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
