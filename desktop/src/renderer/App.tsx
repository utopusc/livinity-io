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

import { useEffect, useRef, useState } from 'react';
import type { Status, RouteResult } from '../../shared/ipc-contract';
import Login from './screens/Login';
import AccountChip from './components/AccountChip';
import Routing from './screens/Routing';
import NoEntitlement from './screens/NoEntitlement';
import KeyChoice from './screens/KeyChoice';

const STATUSES: Status[] = ['installing', 'running', 'stopped', 'error'];

function labelFor(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type Screen =
  | 'login'
  | 'routing'
  | 'no-entitlement'
  | 'key-choice'
  | 'byod-wizard'
  | 'pro-wizard'
  | 'legacy-free-wizard';

const WIZARD_SCREENS: Screen[] = ['byod-wizard', 'pro-wizard', 'legacy-free-wizard'];

/** UI-SPEC Screen 7 -- neutral badge text, no color-coding by tier. */
function planBadgeText(screen: Screen): string {
  if (screen === 'byod-wizard') return 'Free · your own domain';
  if (screen === 'legacy-free-wizard') return 'Free · managed';
  return 'Pro'; // pro-wizard
}

export default function App() {
  // ---- Screen router state (Phase 2) ----
  // Initial mount and the between-request tier-detection wait both render
  // through 'routing' (Routing.tsx) -- there is no separate 'loading' state.
  const [screen, setScreen] = useState<Screen>('routing');
  const [loginExpired, setLoginExpired] = useState(false);
  const [routeError, setRouteError] = useState(false);
  // The wizard screen a key-choice detour should return to once the key is
  // resolved (paste-validated or regenerate-confirmed) -- set right before
  // switching to 'key-choice' so KeyChoice's onProceed knows where to land.
  const [pendingWizard, setPendingWizard] = useState<Screen>('byod-wizard');
  // Guards the entitled-branch key-resolution check against re-firing on
  // every render of the same wizard screen (only re-armed on a fresh login).
  const keyResolvedRef = useRef(false);

  // ---- Phase 1 debug shell state (dev-gated below) ----
  const [status, setStatus] = useState<Status>('stopped');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [vaultMessage, setVaultMessage] = useState<string>('');
  const [stateMessage, setStateMessage] = useState<string>('');
  const [spikeMessage, setSpikeMessage] = useState<string>('');

  function mapRouteToScreen(route: RouteResult): void {
    if (route.kind === 'login') {
      // A fresh login re-arms the key-resolution guard -- a different
      // account/session may have a different key state.
      keyResolvedRef.current = false;
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

  function handleRoutingRetry(): void {
    setRouteError(false);
    window.api.authGetRoute().then(mapRouteToScreen);
  }

  // Key-resolution step (AUTH-06): entering ANY entitled wizard branch
  // resolves the liv_k_ key exactly once per entry. 'mint'/'use-cached' are
  // already resolved/stored main-side -- stay on the wizard placeholder.
  // 'choice-screen'/'stale-reprompt' detour to KeyChoice, remembering which
  // wizard to return to.
  useEffect(() => {
    if (!WIZARD_SCREENS.includes(screen) || keyResolvedRef.current) return;
    keyResolvedRef.current = true;
    window.api.authGetKeyAction().then((result) => {
      if (result.action === 'choice-screen' || result.action === 'stale-reprompt') {
        setPendingWizard(screen);
        setScreen('key-choice');
      }
      // 'mint' | 'use-cached': the wizard placeholder already showing is the
      // correct destination -- nothing further to do here.
    });
  }, [screen]);

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

  // Signed-in for header purposes = every screen except Login (UI-SPEC
  // Screen 5 notes: Routing/no-entitlement/key-choice/wizard all share the
  // account-chip header treatment once a session is being resolved).
  const authenticated = screen !== 'login';

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

        {screen === 'routing' && <Routing error={routeError} onRetry={handleRoutingRetry} />}

        {screen === 'no-entitlement' && <NoEntitlement onRouted={mapRouteToScreen} />}

        {screen === 'key-choice' && (
          <KeyChoice onProceed={() => setScreen(pendingWizard)} />
        )}

        {WIZARD_SCREENS.includes(screen) && (
          <section className="card">
            <div className="card-row" style={{ justifyContent: 'flex-start', gap: 12 }}>
              <h1 className="heading">You're signed in — let's get you set up</h1>
              <span className="plan-badge">{planBadgeText(screen)}</span>
            </div>
            <p className="note-line" style={{ marginTop: 16 }}>
              Setup wizard continues in the next step.
            </p>
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
