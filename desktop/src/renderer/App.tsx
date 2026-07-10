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
import type {
  Status,
  RouteResult,
  CfProvisionUpdate,
  CfScopeRow,
} from '../../shared/ipc-contract';
import Login from './screens/Login';
import AccountChip from './components/AccountChip';
import Routing from './screens/Routing';
import NoEntitlement from './screens/NoEntitlement';
import KeyChoice from './screens/KeyChoice';
import CfToken from './screens/cloudflare/CfToken';
import DomainPicker from './screens/cloudflare/DomainPicker';
import Nameservers from './screens/cloudflare/Nameservers';
import Collision from './screens/cloudflare/Collision';
import CfReady from './screens/cloudflare/CfReady';
import {
  provisionResultToOutcome,
  provisionPhaseCopy,
  provisionStepPhrase,
  apexHostFrom,
  type CfStep,
  type CfReadySummary,
} from './screens/cloudflare/cf-flow';

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

/**
 * Non-secret CF facts the sub-router threads between screens. The five screens
 * are wired verbatim (03-07/03-09) and pass only minimal args up; the domain
 * name / sub-label / name-servers / provisioning summary are recovered by App
 * from the main-side store (getState) and the secret-free zone list (cfGetZones)
 * rather than from the screen props. `scopeRows` holds a WRITE-403's per-scope
 * verdict so the token screen can show the precise "missing permission" banner.
 */
interface CfHolder {
  zoneId: string;
  zoneName: string;
  subLabel: string;
  nameServers: string[];
  summary: CfReadySummary | null;
  scopeRows: CfScopeRow[] | null;
  writeStep: 'tunnel' | 'ingress' | 'dns' | null;
}

const EMPTY_CF_HOLDER: CfHolder = {
  zoneId: '',
  zoneName: '',
  subLabel: '',
  nameServers: [],
  summary: null,
  scopeRows: null,
  writeStep: null,
};

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

  // ---- CF (Free/BYOD) wizard sub-router state (Phase 3) ----
  // Active ONLY inside the `byod-wizard` branch, AFTER the key-choice detour has
  // resolved. cfHolder carries the non-secret facts the built screens need but
  // do not surface through their own callbacks (the domain screens persist them
  // main-side; App reads them back via getState()/cfGetZones()).
  const [cfStep, setCfStep] = useState<CfStep>('cf-token');
  const [cfHolder, setCfHolder] = useState<CfHolder>(EMPTY_CF_HOLDER);
  const [cfProvError, setCfProvError] = useState<'error' | 'network' | null>(null);
  const [cfProvPhase, setCfProvPhase] = useState<CfProvisionUpdate['phase'] | null>(null);
  // The last `takeOver` flag passed to cfProvision, so a provisioning "Try again"
  // re-runs the SAME intent (a take-over retry stays a take-over, never silently
  // downgrading back into the collision guard it already cleared).
  const cfTakeOverRef = useRef(false);

  // ---- Phase 1 debug shell state (dev-gated below) ----
  const [status, setStatus] = useState<Status>('stopped');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [vaultMessage, setVaultMessage] = useState<string>('');
  const [stateMessage, setStateMessage] = useState<string>('');
  const [spikeMessage, setSpikeMessage] = useState<string>('');

  function mapRouteToScreen(route: RouteResult): void {
    if (route.kind === 'login') {
      // A fresh login re-arms the key-resolution guard -- a different
      // account/session may have a different key state -- and resets the CF
      // wizard sub-router so a re-login always re-enters at Screen 1.
      keyResolvedRef.current = false;
      setCfStep('cf-token');
      setCfHolder(EMPTY_CF_HOLDER);
      setCfProvError(null);
      setCfProvPhase(null);
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

  // ---- CF (Free/BYOD) wizard sub-router handlers (Phase 3) ----

  // cfProvisionUpdate progress push: subscribe while the provisioning card is
  // showing, tear the listener down on leaving the step / unmount (IN-06). The
  // returned unsubscribe from onProvisionUpdate is the effect cleanup.
  useEffect(() => {
    if (cfStep !== 'cf-provisioning') return;
    const unsubscribe = window.api.onProvisionUpdate((u) => setCfProvPhase(u.phase));
    return unsubscribe;
  }, [cfStep]);

  // CfToken.onVerified: a fresh all-scope pass clears any stale provisioning-403
  // rows and advances to the domain picker.
  function handleTokenVerified(): void {
    setCfHolder((h) => ({ ...h, scopeRows: null, writeStep: null }));
    setCfStep('cf-domain');
  }

  // Start (or retry) provisioning. Records the takeOver intent so the error
  // card's "Try again" re-runs the same intent.
  async function startProvision(takeOver: boolean): Promise<void> {
    cfTakeOverRef.current = takeOver;
    setCfProvError(null);
    setCfProvPhase(null);
    setCfStep('cf-provisioning');
    const r = await window.api.cfProvision(takeOver);
    const outcome = provisionResultToOutcome(r);
    if (outcome.step === 'cf-ready') {
      setCfHolder((h) => ({ ...h, summary: outcome.summary }));
      setCfStep('cf-ready');
      return;
    }
    if (outcome.step === 'cf-collision') {
      await enterCollision();
      return;
    }
    if (outcome.step === 'cf-token') {
      // WRITE-403 -> precise per-scope screen (never a generic failure).
      setCfHolder((h) => ({ ...h, scopeRows: outcome.rows, writeStep: outcome.writeStep }));
      setCfStep('cf-token');
      return;
    }
    // error | network: stay on the provisioning card and show the error state.
    setCfProvError(outcome.error);
  }

  // DomainPicker.onCollision (and a provision-time collision): selectDomainProbe
  // persisted {zoneName,subLabel} main-side BEFORE returning collision (03-05),
  // so getState() has the apex facts the Collision copy needs.
  async function enterCollision(): Promise<void> {
    const s = await window.api.getState();
    setCfHolder((h) => ({
      ...h,
      zoneName: s.zoneName ?? h.zoneName,
      subLabel: s.subLabel ?? h.subLabel,
    }));
    setCfStep('cf-collision');
  }

  // DomainPicker.onPendingZone passes only the zoneId; recover the display name
  // from the secret-free zone list and the live name-servers from a recheck,
  // since the built Nameservers screen is passed both as props.
  async function enterPendingZone(zoneId: string): Promise<void> {
    let zoneName = '';
    const zr = await window.api.cfGetZones();
    if (zr.ok) zoneName = zr.zones.find((z) => z.id === zoneId)?.name ?? '';
    const r = await window.api.cfRecheckZone(zoneId);
    if (r.kind === 'active') {
      await startProvision(false);
      return;
    }
    if (r.kind === 'pending') {
      setCfHolder((h) => ({ ...h, zoneId, zoneName, nameServers: r.nameServers }));
      setCfStep('cf-nameservers');
      return;
    }
    // network: fall back to the domain picker; the user can re-pick / retry.
    setCfStep('cf-domain');
  }

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

        {/* Free/BYOD (byod-wizard): the five-screen CF sub-router, entered AFTER
            the key-choice detour resolved. Screen 1 -> 2 -> [3 nameservers] ->
            [4 collision] -> provisioning -> 5 ready -> handoff. The AccountChip
            header (above) persists across every step. */}
        {screen === 'byod-wizard' && (
          <>
            {cfStep === 'cf-token' && (
              <>
                {/* Provisioning-403 inline per-scope banner (D-04 / UI-SPEC): a
                    WRITE-level 403 routed back here — name the exact missing
                    permission, never a generic failure. */}
                {cfHolder.scopeRows && cfHolder.writeStep && (
                  <section className="card" style={{ background: 'var(--surface-2)' }}>
                    <p className="error-line">
                      Livinity couldn&apos;t {provisionStepPhrase(cfHolder.writeStep)} — your
                      Cloudflare token is missing a permission. Re-open the token form and add it.
                    </p>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {cfHolder.scopeRows
                        .filter((r) => !r.ok)
                        .map((r) => (
                          <li key={r.scope} className="error-line">
                            Missing: {r.missingLabel ?? r.scope}
                          </li>
                        ))}
                    </ul>
                    <button
                      type="button"
                      className="link-mute"
                      style={{ marginTop: 8 }}
                      onClick={() => void window.api.cfOpenExternal('token-form')}
                    >
                      Re-open token form
                    </button>
                  </section>
                )}
                <CfToken onVerified={handleTokenVerified} />
              </>
            )}

            {cfStep === 'cf-domain' && (
              <DomainPicker
                onReady={() => void startProvision(false)}
                onPendingZone={(zoneId) => void enterPendingZone(zoneId)}
                onCollision={() => void enterCollision()}
              />
            )}

            {cfStep === 'cf-nameservers' && (
              <Nameservers
                zoneId={cfHolder.zoneId}
                zoneName={cfHolder.zoneName}
                nameServers={cfHolder.nameServers}
                onActive={() => setCfStep('cf-domain')}
              />
            )}

            {cfStep === 'cf-collision' && (
              <Collision
                apexHost={apexHostFrom(cfHolder.subLabel, cfHolder.zoneName)}
                onPickDifferent={() => setCfStep('cf-domain')}
                onTakeOver={() => void startProvision(true)}
              />
            )}

            {cfStep === 'cf-provisioning' && (
              <section className="card">
                {cfProvError ? (
                  <>
                    <h1 className="heading">
                      {cfProvError === 'network'
                        ? "Couldn't reach Cloudflare"
                        : 'Something went wrong'}
                    </h1>
                    <p className="error-line" style={{ marginTop: 8 }}>
                      {cfProvError === 'network'
                        ? "Couldn't reach Cloudflare. Check your connection and try again."
                        : "Something went wrong on Cloudflare's side. Try again in a moment."}
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ marginTop: 24 }}
                      onClick={() => void startProvision(cfTakeOverRef.current)}
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <h1 className="heading">Setting things up</h1>
                    <div
                      aria-live="polite"
                      aria-busy="true"
                      style={{
                        marginTop: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span className="status-dot status-dot-pulse" aria-hidden="true" />
                      <p className="note-line">{provisionPhaseCopy(cfProvPhase)}</p>
                    </div>
                    <p className="note-line" style={{ marginTop: 16 }}>
                      This only takes a moment. You can leave this window open.
                    </p>
                  </>
                )}
              </section>
            )}

            {cfStep === 'cf-ready' && cfHolder.summary && (
              <CfReady summary={cfHolder.summary} onContinue={() => setCfStep('cf-handoff')} />
            )}

            {cfStep === 'cf-handoff' && (
              <section className="card">
                {/* HANDOFF (D-17): in a standalone Phase-3 build "Continue" ends
                    the CF section here. Phase 5's install orchestrator wires this
                    button into WSL provisioning — this placeholder IS that
                    Phase-5 handoff point. */}
                <h1 className="heading">Cloudflare is set up</h1>
                <p className="note-line" style={{ marginTop: 8 }}>
                  Installing LivOS on your machine is the next step — coming in a later update.
                </p>
              </section>
            )}
          </>
        )}

        {/* Pro / legacy-free wizards are out of Phase 3's scope — keep the
            Phase-2 placeholder card unchanged. */}
        {(screen === 'pro-wizard' || screen === 'legacy-free-wizard') && (
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
