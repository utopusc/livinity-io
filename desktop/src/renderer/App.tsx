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
    <div style={{ fontFamily: 'sans-serif', padding: 16, color: '#1f2937' }}>
      <h1>Livinity Desktop -- Debug Shell</h1>
      <p>
        Tray status: <strong>{status}</strong>
      </p>
      <p>
        Persisted currentStep on load: <strong>{currentStep || '(none yet)'}</strong>
      </p>

      <section style={{ marginTop: 16 }}>
        <h2>Simulate status (tray color)</h2>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => handleSimulate(s)} style={{ marginRight: 8 }}>
            Simulate: {labelFor(s)}
          </button>
        ))}
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Vault self-test</h2>
        <button onClick={handleVaultTest}>Vault self-test</button>
        <p>{vaultMessage}</p>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>State self-test</h2>
        <button onClick={handleStateTest}>State self-test</button>
        <p>{stateMessage}</p>
      </section>
    </div>
  );
}
