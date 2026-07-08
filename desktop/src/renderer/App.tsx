/**
 * src/renderer/App.tsx
 *
 * The renderer's screen router (Phase 2). Resolves the initial route via
 * `authGetRoute` on mount and switches between the auth/routing screens.
 * The Phase-1 debug shell (vault/state/tray self-tests) is preserved
 * verbatim but moved behind `import.meta.env.DEV` so a packaged
 * (`vite build`) renderer never renders it.
 *
 * `window.api`'s type now lives in `window.d.ts` (widened to
 * `ShellApi & DevSpikeApi & AuthApi`) -- no per-file `declare global` here.
 */

import { useEffect, useState } from 'react';
import type { Status, RouteResult } from '../../shared/ipc-contract';
import Login from './screens/Login';
import AccountChip from './components/AccountChip';

const STATUSES: Status[] = ['installing', 'running', 'stopped', 'error'];

function labelFor(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type Screen =
  | 'loading'
  | 'login'
  | 'routing'
  | 'no-entitlement'
  | 'key-choice'
  | 'byod-wizard'
  | 'pro-wizard'
  | 'legacy-free-wizard';

export default function App() {
  // ---- Screen router state (Phase 2) ----
  const [screen, setScreen] = useState<Screen>('loading');
  const [loginExpired, setLoginExpired] = useState(false);
  const [routeError, setRouteError] = useState(false);

  // ---- Phase 1 debug shell state (dev-gated below) ----
  const [status, setStatus] = useState<Status>('stopped');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [vaultMessage, setVaultMessage] = useState<string>('');
  const [stateMessage, setStateMessage] = useState<string>('');
  const [spikeMessage, setSpikeMessage] = useState<string>('');

  function mapRouteToScreen(route: RouteResult): void {
    if (route.kind === 'login') {
      setLoginExpired(route.expired ?? false);
      setRouteError(false);
      setScreen('login');
      return;
    }
    if (route.kind === 'error') {
      setRouteError(true);
      setScreen('routing');
      return;
    }
    // Remaining kinds (byod-wizard/pro-wizard/legacy-free-wizard/no-entitlement)
    // are literal subtypes of Screen -- no re-mapping needed.
    setRouteError(false);
    setScreen(route.kind);
  }

  useEffect(() => {
    window.api.authGetRoute().then(mapRouteToScreen);
  }, []);

  useEffect(() => {
    window.api.getState().then((s) => setCurrentStep(s.currentStep));
    const unsubscribe = window.api.onStatusChanged((s) => setStatus(s));
    return unsubscribe;
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

  // DEV-ONLY spike triggers (Plan 04) — handlers only exist when !app.isPackaged.
  async function handleSpawnHolderA(): Promise<void> {
    try {
      const result = await window.api.devSpawnHolderA();
      setSpikeMessage(`devSpawnHolderA -> ok: ${result?.ok === true}`);
    } catch (e) {
      setSpikeMessage(`devSpawnHolderA failed (dev-only handler): ${String(e)}`);
    }
  }

  async function handleUpdateSim(): Promise<void> {
    setSpikeMessage('devUpdateSim fired -- app will relaunch...');
    try {
      await window.api.devUpdateSim();
    } catch {
      // Expected: the app exits before the invoke can resolve.
    }
  }

  // Signed-in for header purposes = any screen past login/loading.
  const authenticated = screen !== 'login' && screen !== 'loading';

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
        {/* UI-SPEC Screen 1: no status badge on the login/loading screens --
            header-right slot is empty until an account chip has something to
            show. UI-SPEC Screen 5: AccountChip replaces this slot on every
            authenticated, non-debug screen. */}
        {authenticated && <AccountChip onSignedOut={() => setScreen('login')} />}
      </header>

      <div className="shell-body">
        {screen === 'login' && <Login onRouted={mapRouteToScreen} expired={loginExpired} />}

        {screen === 'loading' && (
          <section className="card">
            <div className="card-row">
              <span className="status-dot" />
              <span className="card-label">Checking your account…</span>
            </div>
          </section>
        )}

        {/* Routing/no-entitlement/key-choice/wizard screens are placeholders
            here -- Plan 06 builds their real content. Kept minimal so this
            router compiles and the screen-state machine is exercisable. */}
        {screen === 'routing' && (
          <section className="card">
            <div className="card-row">
              <span className="status-dot" />
              <span className="card-label">
                {routeError ? 'Routing error (Plan 06)' : 'Routing (Plan 06)'}
              </span>
            </div>
          </section>
        )}

        {screen === 'no-entitlement' && (
          <section className="card">
            <span className="card-label">No-entitlement screen (Plan 06)</span>
          </section>
        )}

        {screen === 'key-choice' && (
          <section className="card">
            <span className="card-label">Key-choice screen (Plan 06)</span>
          </section>
        )}

        {(screen === 'byod-wizard' ||
          screen === 'pro-wizard' ||
          screen === 'legacy-free-wizard') && (
          <section className="card">
            <span className="card-label">Wizard entry ({screen}) placeholder (Plan 06)</span>
          </section>
        )}

        {import.meta.env.DEV && (
          <>
            <section className="card">
              <div className="card-row">
                <span className="card-label">Debug: tray status</span>
                <div className={`status-badge status-${status}`}>
                  <span className="status-dot" />
                  {labelFor(status)}
                </div>
              </div>
            </section>

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

            <section className="card">
              <h2 className="card-title">Spike (dev)</h2>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={handleSpawnHolderA}>
                  Spawn holder A
                </button>
                <button className="btn btn-primary" onClick={handleUpdateSim}>
                  Update-sim (relaunch)
                </button>
              </div>
              {spikeMessage && <p className="result-line">{spikeMessage}</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
