/**
 * src/renderer/screens/wsl/InstallingProgress.tsx
 *
 * Screen 5 of the WSL2 provisioning wizard (WSL-04; D-14) -- a premium
 * waiting state for the longest, highest-anxiety stretch of onboarding.
 * Kicks off install.sh (wsl:installInvoke) on mount, subscribes to
 * onInstallUpdate progress pushes (unsubscribed on cleanup, IN-06), and
 * renders `installStepCaptions()` (wsl-flow.ts, a thin re-export of the
 * single-source-of-truth `INSTALL_CAPTIONS`) as a 6-item step-list.
 *
 * Phase 5 (INSTALL-02/D-04): the active step is driven by the live
 * `stepIndex` install-invoke.ts streams over onInstallUpdate as it parses
 * real installer markers -- falling back to the coarse 3-phase mapping when
 * `stepIndex` is absent (defense in depth, Pitfall 4: before the first
 * marker arrives, or if install.sh's stderr never emits a recognized title).
 *
 * Step indicators are monochrome (progress-color-discipline, never green --
 * the box is not live yet): done = --fg check glyph, active = the shared
 * `.status-dot-pulse`, pending = a faint --fg-mute dot -- state is glyph +
 * text, never color alone (WCAG 1.4.1), and the active step also carries
 * `aria-current="step"`.
 *
 * D-05/D-14: never renders raw install.sh stdout -- only the 6 fixed
 * INSTALL_CAPTIONS strings ever appear as labels. onOutcome hands the
 * enriched `InstallInvokeResult` (D-07: the raw result PLUS an optional
 * `failureVerdict`) up to the parent (App-level sub-router, 05-09) to map to
 * InstallOutcome/NoTunnel410/UnifiedError's mapped screens.
 */

import { useEffect, useState } from 'react';
import { installStepCaptions } from './wsl-flow';
import type { InstallInvokeResult, WslInstallUpdate } from '../../../../shared/ipc-contract';

interface InstallingProgressProps {
  onOutcome: (result: InstallInvokeResult) => void;
}

const PHASE_ORDER: WslInstallUpdate['phase'][] = ['preparing', 'installing', 'starting'];

function CheckGlyph(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12.5l5 5 11-11"
      />
    </svg>
  );
}

export default function InstallingProgress({ onOutcome }: InstallingProgressProps) {
  const [update, setUpdate] = useState<WslInstallUpdate>({ phase: 'preparing' });

  async function runInstall(): Promise<void> {
    const result = await window.api.wslInstallInvoke();
    onOutcome(result);
  }

  useEffect(() => {
    const unsubscribe = window.api.onInstallUpdate((u) => setUpdate(u));
    void runInstall();
    return unsubscribe;
    // Runs once on mount -- install.sh kicks off exactly once per screen entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captions = installStepCaptions();
  // Live stepIndex (1..6) drives the active step; falls back to the coarse
  // 3-phase mapping when absent (Pitfall 4 defense in depth).
  const activeIndex =
    update.stepIndex !== undefined ? update.stepIndex - 1 : PHASE_ORDER.indexOf(update.phase);

  return (
    <div className="setup-shell">
      <section aria-busy="true">
        <h1 className="display">Installing Livinity</h1>
        <p className="note-line" style={{ marginTop: 16 }}>
          Setting up LivOS on your PC. This usually takes a few minutes.
        </p>

        <div className="step-list" style={{ marginTop: 24 }}>
          {captions.map((label, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <div
                key={label}
                className={`step-item${done ? ' done' : ''}`}
                aria-current={active ? 'step' : undefined}
              >
                <span className="step-indicator" aria-hidden="true">
                  {done ? (
                    <CheckGlyph />
                  ) : active ? (
                    <span className="status-dot status-dot-pulse" />
                  ) : (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'currentColor',
                        display: 'inline-block',
                      }}
                    />
                  )}
                </span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>

        <p className="note-line" style={{ marginTop: 16 }}>
          This runs on its own — you can leave it. We'll let you know when it's done.
        </p>
      </section>
    </div>
  );
}
