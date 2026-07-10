/**
 * src/renderer/screens/wsl/BiosDeadEnd.tsx
 *
 * Screen 2 of the WSL2 provisioning wizard (WSL-02; D-06) -- a calm,
 * recoverable dead-end when hardware virtualization is switched off in
 * BIOS/UEFI. Framed as a task the user can resolve, never a fault: a
 * monochrome Display title (NOT red), a real ordered help-step list, a
 * working "Check again", and a system-browser help link.
 *
 * T-04-09 (Tampering, open arbitrary URL): the help link calls
 * wslOpenExternal('bios-help') -- an enum target, never a renderer-chosen
 * URL. The main-side handler (04-09) maps it to a fixed URL, mirroring
 * cfOpenExternal's enum-allowlisted external open (never a child window).
 */

import { useState } from 'react';

interface BiosDeadEndProps {
  onResolved: () => void;
}

export default function BiosDeadEnd({ onResolved }: BiosDeadEndProps) {
  const [checking, setChecking] = useState(false);
  const [stillOff, setStillOff] = useState(false);

  async function handleCheckAgain(): Promise<void> {
    setChecking(true);
    setStillOff(false);
    try {
      const result = await window.api.wslCheckBios();
      if (result.kind === 'bios-blocked') {
        setStillOff(true);
      } else {
        onResolved();
      }
    } finally {
      setChecking(false);
    }
  }

  function openHelp(): void {
    void window.api.wslOpenExternal('bios-help');
  }

  return (
    <div className="setup-shell setup-shell--centered">
      <section>
        <h1 className="display">Your PC needs virtualization turned on</h1>
        <p className="note-line" style={{ marginTop: 16 }}>
          LivOS runs in a lightweight virtual machine, and virtualization is currently switched off on
          this PC. It&apos;s a setting in your PC&apos;s firmware — turn it on, restart, and you&apos;re
          set.
        </p>

        {/* Help card (Label title + a real ordered list -- screen-reader-friendly, no color-only meaning). */}
        <div className="card" style={{ marginTop: 24, background: 'var(--surface-2)' }}>
          <p className="field-label">How to turn it on</p>
          <ol className="help-steps" style={{ marginTop: 12 }}>
            <li className="help-step">
              Restart your PC and open its BIOS/UEFI settings — usually by pressing a key like{' '}
              <strong>F2</strong>, <strong>F10</strong>, <strong>Del</strong>, or <strong>Esc</strong>{' '}
              right as it starts up.
            </li>
            <li className="help-step">
              Find the virtualization setting. Every PC names it differently — look for{' '}
              <strong>Virtualization</strong>, <strong>VT-x</strong>, <strong>AMD-V</strong>, or{' '}
              <strong>SVM Mode</strong> — and switch it <strong>On</strong>.
            </li>
            <li className="help-step">
              Save and exit, let Windows start, then come back here and choose{' '}
              <strong>Check again</strong>.
            </li>
          </ol>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 24 }}
          disabled={checking}
          onClick={() => void handleCheckAgain()}
        >
          Check again
        </button>

        <div style={{ marginTop: 16 }}>
          <button type="button" className="link-mute" onClick={openHelp}>
            How do I do this on my PC?
          </button>
        </div>

        {/* Still-off result -- neutral, NOT red (a calm precondition, not a fault). */}
        <div aria-live="polite" aria-busy={checking} style={{ marginTop: 16 }}>
          {checking && (
            <div className="scope-row">
              <span className="status-dot status-dot-pulse" aria-hidden="true" />
              <span className="scope-name">Checking your PC…</span>
            </div>
          )}
          {stillOff && !checking && (
            <p className="note-line">
              Still switched off. Once you&apos;ve turned it on and restarted, choose Check again.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
