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
import WslEnable from './screens/wsl/WslEnable';
import BiosDeadEnd from './screens/wsl/BiosDeadEnd';
import ResourceAllocation from './screens/wsl/ResourceAllocation';
import Downloading from './screens/wsl/Downloading';
import InstallingProgress from './screens/wsl/InstallingProgress';
import InstallOutcome from './screens/wsl/InstallOutcome';
import { mapWslDetectResult, mapInstallInvokeResult, type WslStep } from './screens/wsl/wsl-flow';

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
  | 'legacy-free-wizard'
  | 'wsl-wizard';

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

/**
 * The mapped Screen-6 outcome InstallOutcome.tsx renders, threaded between the
 * `installing` and `install-outcome` WSL steps -- carries the optional
 * disk-stop facts / red technical-reason line those variants need.
 */
interface WslOutcomeHolder {
  outcome: 'disk' | 'systemd-retry' | 'our-bug' | 'generic';
  freeGb?: number;
  driveLetter?: string;
  reason?: string;
}

const EMPTY_WSL_OUTCOME: WslOutcomeHolder = { outcome: 'generic' };

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

  // ---- WSL2 provisioning wizard sub-router state (Phase 4) ----
  // Active ONLY inside the `wsl-wizard` branch. 'wsl-detect' is both the
  // initial value AND the sole re-entry target for a live-state re-verify
  // (D-04/T-04-19) -- BiosDeadEnd's "resolved" and a --hidden post-reboot
  // resume both route back through it, never straight to a persisted step.
  const [wslStep, setWslStep] = useState<WslStep>('wsl-detect');
  const [wslOutcome, setWslOutcome] = useState<WslOutcomeHolder>(EMPTY_WSL_OUTCOME);
  // True only when this mount discovered a persisted wslStep (a --hidden
  // auto-resume after the mandatory reboot) -- passed to WslEnable so it
  // shows "Picking up where we left off" instead of the first-run copy.
  const [wslResume, setWslResume] = useState(false);

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
      // A fresh login also resets the WSL wizard sub-router -- a re-login
      // always re-enters the CF/WSL wizards at their own Screen 1.
      setWslStep('wsl-detect');
      setWslOutcome(EMPTY_WSL_OUTCOME);
      setWslResume(false);
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

  // Entry point into the WSL2 provisioning sub-router (Phase 5's real
  // orchestrated handoff seam -- see the byod-wizard cf-handoff / pro /
  // legacy-free placeholders below, plus the DEV debug-shell trigger).
  // Always starts at 'wsl-detect' -- a fresh entry re-verifies live state
  // exactly like a resume does (D-04), it just never had a persisted step.
  function enterWslWizard(): void {
    setWslResume(false);
    setWslStep('wsl-detect');
    setWslOutcome(EMPTY_WSL_OUTCOME);
    setScreen('wsl-wizard');
  }

  useEffect(() => {
    window.api.authGetRoute().then(async (route) => {
      mapRouteToScreen(route);
      // D-04 resume-to-step: a persisted state.wslStep means a WSL wizard
      // reboot/resume is in flight (set by wsl:enable/wsl:restartNow,
      // 04-09) -- ONLY an authenticated, routed destination (never
      // 'login'/'error') may re-enter it, and it ALWAYS re-verifies live
      // WSL state via the 'wsl-detect' gate first -- NEVER blindly
      // continuing straight to the persisted step (T-04-19: a reboot that
      // silently failed or changed state must not be trusted).
      if (route.kind !== 'login' && route.kind !== 'error') {
        const s = await window.api.getState();
        if (s.wslStep) {
          setWslResume(true);
          setWslStep('wsl-detect');
          setScreen('wsl-wizard');
        }
      }
    });
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

  // ---- WSL2 provisioning wizard sub-router handlers (Phase 4) ----

  // The 'wsl-detect' entry gate (D-04): every entry -- the initial mount, a
  // resumed session, or BiosDeadEnd's "resolved" return -- calls wsl:detect
  // itself and routes via mapWslDetectResult, the phase's sole result->step
  // router (wsl-flow.ts). This is a LIVE re-verify, never a blind continue
  // to whatever step was last persisted (T-04-19). 'needs-reboot' collapses
  // into the same 'wsl-enable' mount as every other enable-path outcome --
  // WslEnable owns the restart/resume/resume-failed sub-states internally
  // (its own on-mount wslDetect() re-verifies a SECOND time, defense in
  // depth), so there is no separate top-level render block for a raw
  // 'wsl-restart' WslStep value.
  useEffect(() => {
    if (screen !== 'wsl-wizard' || wslStep !== 'wsl-detect') return;
    let cancelled = false;
    void window.api.wslDetect().then((result) => {
      if (cancelled) return;
      const { step } = mapWslDetectResult(result);
      setWslStep(step === 'wsl-restart' ? 'wsl-enable' : step);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, wslStep]);

  // Progress-push ownership (IN-06): Downloading.tsx and InstallingProgress.tsx
  // each subscribe to their own onDownloadUpdate/onInstallUpdate push
  // (04-08) and unsubscribe on their own unmount -- App does NOT also
  // subscribe here (unlike the CF onProvisionUpdate effect above, which owns
  // its push because the provisioning card itself is inline JSX, not a
  // separate component). Mounting/unmounting the screen below is the only
  // subscribe/unsubscribe trigger needed; a second subscription here would
  // double-fire every progress update.

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
    try {
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
    } catch {
      // The main handler is written to always resolve a safe union, so this never
      // fires in normal operation — but a handler-registration race or a main-side
      // throw OUTSIDE the handler's own try/catch would otherwise leave the
      // "Setting things up" spinner running forever with no recovery control (IN-02).
      // Degrade to the retryable error card like every other failure path.
      setCfProvError('error');
    }
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
      // The zone activated in the window between the dropdown load and the pick,
      // but it NEVER went through selectDomainProbe: DomainPicker routes a
      // non-active zone straight to onPendingZone WITHOUT calling cfSelectDomain,
      // so no {zoneId,zoneName,subLabel,accountId} was persisted for THIS zone.
      // Route back through the picker — exactly like the Nameservers onActive
      // path — so the now-active zone is re-selected via cfSelectDomain (the one
      // place those facts are captured) BEFORE any provision. Provisioning here
      // would either dead-end on the guard (no facts) or silently provision a
      // DIFFERENT earlier zone's stale facts (WR-02).
      setCfStep('cf-domain');
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
                {/* HANDOFF (D-17): this Continue button is the real Phase-5
                    orchestration handoff seam -- Phase 5 will eventually decide
                    WHEN to enter WSL provisioning (resume state, install
                    orchestration); for now it enters the Phase-4 WSL sub-router
                    directly, the same engine Phase 5 drives. */}
                <h1 className="heading">Cloudflare is set up</h1>
                <p className="note-line" style={{ marginTop: 8 }}>
                  Next, Livinity sets up LivOS on this PC.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 24 }}
                  onClick={enterWslWizard}
                >
                  Continue
                </button>
              </section>
            )}
          </>
        )}

        {/* Pro / legacy-free wizards have no CF step (the platform resolves
            domain/tunnel server-side) -- their placeholder's Continue is the
            same Phase-5 handoff seam as the byod-wizard's cf-handoff above,
            entering the WSL sub-router directly for now. */}
        {(screen === 'pro-wizard' || screen === 'legacy-free-wizard') && (
          <section className="card">
            <div className="card-row" style={{ justifyContent: 'flex-start', gap: 12 }}>
              <h1 className="heading">You're signed in — let's get you set up</h1>
              <span className="plan-badge">{planBadgeText(screen)}</span>
            </div>
            <p className="note-line" style={{ marginTop: 16 }}>
              Next, Livinity sets up LivOS on this PC.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={enterWslWizard}
            >
              Continue
            </button>
          </section>
        )}

        {/* WSL2 provisioning wizard (Phase 4): detect -> enable/UAC/reboot ->
            [bios dead-end] -> resource allocation -> download -> install ->
            outcome. Entered from the byod-wizard cf-handoff / pro / legacy-
            free placeholders above, the DEV debug-shell trigger below, or a
            --hidden post-reboot resume (the initial-mount effect above). The
            AccountChip header (top of this component) persists across every
            step, same as the CF sub-router. */}
        {screen === 'wsl-wizard' && (
          <>
            {wslStep === 'wsl-detect' && (
              <div className="setup-shell setup-shell--centered">
                <section aria-busy="true">
                  <h1 className="display">
                    {wslResume ? 'Picking up where we left off' : 'Getting your PC ready'}
                  </h1>
                  <p className="note-line" style={{ marginTop: 16 }}>
                    {wslResume
                      ? 'Finishing your Windows setup…'
                      : 'Checking what Livinity needs to set up. This only takes a moment.'}
                  </p>
                  <div style={{ marginTop: 24 }}>
                    <div
                      className="progress-track progress-indeterminate"
                      role="progressbar"
                      aria-label="Working"
                    >
                      <div className="progress-fill" />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {wslStep === 'wsl-enable' && (
              <WslEnable
                resume={wslResume}
                onProceed={() => setWslStep('resource')}
                onBiosBlocked={() => setWslStep('bios-deadend')}
                onRestartChosen={(later) => {
                  if (!later) void window.api.wslRestartNow();
                }}
              />
            )}

            {wslStep === 'bios-deadend' && (
              <BiosDeadEnd onResolved={() => setWslStep('wsl-detect')} />
            )}

            {wslStep === 'resource' && (
              <ResourceAllocation onContinue={() => setWslStep('downloading')} />
            )}

            {wslStep === 'downloading' && (
              <Downloading
                onInstalled={() => setWslStep('installing')}
                onDiskTooSmall={(freeGb, driveLetter) => {
                  setWslOutcome({ outcome: 'disk', freeGb, driveLetter });
                  setWslStep('install-outcome');
                }}
                onArchUnsupported={() => {
                  // Downloading renders the honest ARM64 "not ready for this PC
                  // yet" block ITSELF and stays on screen (04-08) -- there is no
                  // matching InstallOutcome variant, and navigating away would
                  // hide that message. This hook exists only for parent-side
                  // bookkeeping (04-08's own decision note); no navigation here.
                }}
              />
            )}

            {wslStep === 'installing' && (
              <InstallingProgress
                onOutcome={(r) => {
                  if (r.kind === 'ok') {
                    setWslStep('wsl-handoff');
                    return;
                  }
                  // mapInstallInvokeResult's 'done' member is only ever produced
                  // by the 'ok' branch already handled above -- this cast is a
                  // static-typing artifact of reusing the shared total mapper,
                  // not a runtime possibility here.
                  const { outcome } = mapInstallInvokeResult(r) as {
                    outcome: Exclude<ReturnType<typeof mapInstallInvokeResult>['outcome'], 'done'>;
                  };
                  setWslOutcome({
                    outcome,
                    reason: r.kind === 'generic-failure' ? r.reason : undefined,
                  });
                  setWslStep('install-outcome');
                }}
              />
            )}

            {wslStep === 'install-outcome' && (
              <InstallOutcome
                {...wslOutcome}
                onRetry={() => setWslStep(wslOutcome.outcome === 'disk' ? 'downloading' : 'installing')}
              />
            )}

            {wslStep === 'wsl-handoff' && (
              <section className="card">
                {/* Phase 4's job ends here -- Phase 5 owns the resumable
                    install state machine + the "your box is live" success
                    screen (INSTALL-01/04); this is a placeholder terminal
                    state only. */}
                <h1 className="heading">LivOS is installing on your PC</h1>
                <p className="note-line" style={{ marginTop: 8 }}>
                  This runs in the background — Livinity will let you know when it's ready.
                </p>
              </section>
            )}
          </>
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

            <section className="card">
              <h2 className="card-title">WSL provisioning (dev)</h2>
              <button className="btn btn-primary" onClick={enterWslWizard}>
                Start WSL provisioning (dev)
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
