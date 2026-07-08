/**
 * src/renderer/App.tsx
 *
 * Minimal debug UI exercising all 5 Phase 1 success criteria. `ShellApi` is
 * imported once from shared/ipc-contract.ts (no re-typing of `window.api`).
 *
 * The vault self-test displays only the LOCALLY-GENERATED secret string
 * (known client-side before it is ever sent to main) plus the boolean
 * existence result from `vaultHas` — there is no API that returns the
 * decrypted secret from main, so nothing here ever round-trips plaintext
 * back across IPC (SHELL-04).
 */

import { useEffect, useState } from 'react';
import type { ShellApi, Status } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: ShellApi;
  }
}

const STATUSES: Status[] = ['installing', 'running', 'stopped', 'error'];

function labelFor(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function App() {
  const [status, setStatus] = useState<Status>('stopped');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [vaultMessage, setVaultMessage] = useState<string>('');
  const [stateMessage, setStateMessage] = useState<string>('');

  useEffect(() => {
    window.api.getState().then((s) => setCurrentStep(s.currentStep));
    window.api.onStatusChanged((s) => setStatus(s));
  }, []);

  async function handleSimulate(s: Status): Promise<void> {
    await window.api.simulateStatus(s);
    setStatus(s);
  }

  async function handleVaultTest(): Promise<void> {
    const secret = `test-secret-${Date.now()}`;
    await window.api.vaultSet('session', secret);
    const { exists } = await window.api.vaultHas('session');
    setVaultMessage(`Wrote "${secret}" -- vault has session: ${exists}`);
  }

  async function handleStateTest(): Promise<void> {
    const step = `debug-${Date.now()}`;
    await window.api.setState({ currentStep: step });
    const s = await window.api.getState();
    setCurrentStep(s.currentStep);
    setStateMessage(`currentStep: ${s.currentStep}`);
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <span className="brand-name">Livinity Desktop</span>
            <span className="brand-tag">Debug Shell</span>
          </div>
        </div>
        <div className={`status-badge status-${status}`}>
          <span className="status-dot" />
          {labelFor(status)}
        </div>
      </header>

      <div className="shell-body">
        <section className="card">
          <div className="card-row">
            <span className="card-label">Persisted currentStep on load</span>
            <code className="value-chip">{currentStep || '(none yet)'}</code>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Simulate status (tray color)</h2>
          <div className="btn-row">
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`btn status-${s}${status === s ? ' active' : ''}`}
                onClick={() => handleSimulate(s)}
              >
                <span className="dot" />
                Simulate: {labelFor(s)}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Vault self-test</h2>
          <button className="btn btn-primary" onClick={handleVaultTest}>
            Vault self-test
          </button>
          {vaultMessage && <p className="result-line">{vaultMessage}</p>}
        </section>

        <section className="card">
          <h2 className="card-title">State self-test</h2>
          <button className="btn btn-primary" onClick={handleStateTest}>
            State self-test
          </button>
          {stateMessage && <p className="result-line">{stateMessage}</p>}
        </section>
      </div>
    </div>
  );
}
