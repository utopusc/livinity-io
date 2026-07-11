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
  FlowRoute,
  InstallInvokeResult,
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
import ConnectedCheck from './screens/ConnectedCheck';
import LiveSuccess from './screens/LiveSuccess';
import UnifiedError from './screens/UnifiedError';
import NoTunnel410 from './screens/NoTunnel410';
import Settings from './screens/Settings';
import RemoveFlow from './screens/remove/RemoveFlow';
import QuickPanel from './screens/QuickPanel';

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
  | 'wsl-wizard'
  | 'connected-check'
  | 'live-success'
  | 'orchestrator-error'
  | 'no-tunnel-410'
  | 'settings'
  | 'remove';

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
  // Tray-panel addendum (post-Phase-7): the quick-panel window
  // (src/main/tray/quick-panel.ts) loads this SAME renderer entry with a
  // `#quick-panel` hash -- that hash is fixed for the entire lifetime of
  // this window instance (the main process never navigates it elsewhere),
  // so this early branch always takes the same path on every render of a
  // given mount and skips the normal screen router entirely. Additive only.
  if (window.location.hash === '#quick-panel') {
    return <QuickPanel />;
  }

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
  // The live box address for LiveSuccess/ConnectedCheck (D-05/D-06) -- derived
  // MAIN-SIDE by connected-probe.ts's deriveAddress (byod subLabel+zoneName,
  // else the pro/legacy managed {username}.livinity.io via vaultGet+getMe,
  // 05-07) and handed up through ConnectedCheck.onConnected / a live-success
  // FlowRoute's own `address` field -- supersedes the renderer's former
  // byod/boxUsername derivation, now redundant (D-06).
  const [liveAddress, setLiveAddress] = useState<string | null>(null);
  // The D-07 unified orchestrator-error screen's current variant + optional
  // already-redacted reason -- set by applyFlowRoute's cf-reconnect case (a
  // live resume-time stale-CF-token detection) or applyInstallFailure's
  // cf-reconnect case (an install-time failureVerdict); null when
  // 'orchestrator-error' is not the active screen.
  const [orchestratorError, setOrchestratorError] = useState<{
    variant: 'cloudflare-surface' | 'generic-orchestrator';
    reason?: string;
  } | null>(null);

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

  // The single App-level dispatcher for a FlowRoute (flow:enter / flow:resume,
  // 05-07/05-08) -- switches on `route.kind` to land on the right screen.
  // Flat-union style, never nested: every new orchestrator-level screen this
  // phase adds is its own top-level Screen member, not a sub-state of an
  // existing one.
  function applyFlowRoute(route: FlowRoute): void {
    switch (route.kind) {
      case 'cf-wizard':
        // No persisted CF sub-step exists main-side (cfStep is in-memory-only
        // React state, already 'cf-token' on a fresh mount) -- entering the
        // byod-wizard screen always lands on Screen 1, same as a fresh
        // 'byod-wizard' RouteResult.
        setScreen('byod-wizard');
        return;
      case 'wsl-detect':
        // UNCHANGED current behavior (Phase 4) -- a live re-verify, never a
        // blind continue to a persisted step (D-04/T-04-19).
        setWslResume(route.resume);
        setWslStep('wsl-detect');
        setWslOutcome(EMPTY_WSL_OUTCOME);
        setScreen('wsl-wizard');
        return;
      case 'installing':
        // install.sh was mid-run when the app was killed -- re-enter
        // InstallingProgress, which always restarts the invocation from the
        // top (idempotent, D-14), never resumes "mid-marker".
        setWslStep('installing');
        setScreen('wsl-wizard');
        return;
      case 'connected-check':
        setScreen('connected-check');
        return;
      case 'live-success':
        // D-03 fast-path -- NO resource/download/install re-walk, ever, on a
        // healthy repeat launch.
        setLiveAddress(route.address);
        setScreen('live-success');
        return;
      case 'cf-reconnect':
        setOrchestratorError({ variant: 'cloudflare-surface' });
        setScreen('orchestrator-error');
        return;
    }
  }

  // Entry point into the WSL2 provisioning sub-router (Phase 5's real
  // orchestrated handoff seam -- see the byod-wizard cf-handoff / pro /
  // legacy-free placeholders below, plus the DEV debug-shell trigger).
  // Delegates to flow:enter (05-07's resumable state machine, live
  // re-verified inside) instead of blindly jumping straight to 'wsl-detect' --
  // a healthy already-installed relaunch now lands on live-success directly
  // instead of re-walking the whole wizard (D-03).
  async function enterWslWizard(): Promise<void> {
    const route = await window.api.flowEnter();
    applyFlowRoute(route);
  }

  useEffect(() => {
    window.api.authGetRoute().then(async (route) => {
      mapRouteToScreen(route);
      // D-09 resume-to-step (generalizes Phase 4's wslStep-only check to the
      // WHOLE orchestrator, not just the WSL sub-flow): ONLY an
      // authenticated, routed destination (never 'login'/'error') may
      // resume, and it ALWAYS re-verifies live state via flow:resume on
      // EVERY launch -- NEVER blindly continuing straight to a persisted
      // step (T-04-19 carryover: a reboot/relaunch that silently failed or
      // changed state must not be trusted). A null return means nothing to
      // resume -- the route already applied by mapRouteToScreen above (the
      // normal auth destination) stays as-is.
      if (route.kind !== 'login' && route.kind !== 'error') {
        const r = await window.api.flowResume();
        if (r) applyFlowRoute(r);
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

  // The D-07 FailureVerdict.screen -> screen-mount bridge (Blocker-2
  // vocabulary bridge) -- the SOLE place in this file the FailureVerdict.screen
  // enum is translated into a concrete screen/variant. `r.failureVerdict` is
  // present only when install-invoke.ts (05-06) computed a live mapFailure
  // verdict on this exit; when absent, mapInstallInvokeResult (wsl-flow.ts)
  // supplies the same-named fallback for the 4 legacy WSL-surface kinds.
  // 'login'/'no-entitlement' cannot arise from this wsl-install surface (only
  // mapFailure's 'platform' branch produces them, which has no live caller on
  // this path) -- the `default` branch safely routes any such/unmapped screen
  // to the generic InstallOutcome card; those two named screens are reached
  // from OTHER surfaces (Login/NoEntitlement), never from here.
  function applyInstallFailure(r: InstallInvokeResult): void {
    const verdict = r.failureVerdict;
    const verdictScreen = verdict?.screen ?? mapInstallInvokeResult(r).outcome;
    switch (verdictScreen) {
      case 'no-tunnel-410':
        setScreen('no-tunnel-410');
        return;
      case 'cf-reconnect':
        setOrchestratorError({ variant: 'cloudflare-surface', reason: verdict?.copy });
        setScreen('orchestrator-error');
        return;
      case 'disk':
      case 'systemd-retry':
      case 'our-bug':
      case 'generic':
      default:
        setWslOutcome({
          outcome:
            verdictScreen === 'disk' || verdictScreen === 'systemd-retry' || verdictScreen === 'our-bug'
              ? verdictScreen
              : 'generic',
          reason: verdict?.copy ?? (r.kind === 'generic-failure' ? r.reason : undefined),
        });
        setWslStep('install-outcome');
        setScreen('wsl-wizard');
        return;
    }
  }

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

  // Phase 6 (06-11): the tray "Settings" row and the D-10 stopped-open gate
  // (engine.ts's focusSettingsInstead, via engine:openDashboard/openInBrowser)
  // both route the main window here via this SAME push -- the sole place
  // `engine:navigate` is translated into a screen switch.
  useEffect(() => {
    const unsubscribe = window.api.onEngineNavigate((nav) => {
      if (nav.screen === 'settings') setScreen('settings');
    });
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
                    orchestration handoff seam -- flowEnter (05-07's resumable
                    state machine, live re-verified inside) decides WHEN to
                    enter WSL provisioning vs. land straight on live-success
                    (D-03 fast-path) or an error/resume screen. */}
                <h1 className="heading">Cloudflare is set up</h1>
                <p className="note-line" style={{ marginTop: 8 }}>
                  Next, Livinity sets up LivOS on this PC.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 24 }}
                  onClick={() => void enterWslWizard()}
                >
                  Continue
                </button>
              </section>
            )}
          </>
        )}

        {/* Pro / legacy-free wizards have no CF step (the platform resolves
            domain/tunnel server-side) -- their placeholder's Continue is the
            same Phase-5 orchestrator handoff seam as the byod-wizard's
            cf-handoff above (flowEnter decides WHERE to land). */}
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
              onClick={() => void enterWslWizard()}
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
                onBiosBlocked={() => setWslStep('bios-deadend')}
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
                    // D-06: ConnectedCheck -> LiveSuccess replaces the
                    // former bb30bd92 interim wsl-handoff card.
                    setScreen('connected-check');
                    return;
                  }
                  applyInstallFailure(r);
                }}
              />
            )}

            {wslStep === 'install-outcome' && (
              <InstallOutcome
                {...wslOutcome}
                onRetry={() => setWslStep(wslOutcome.outcome === 'disk' ? 'downloading' : 'installing')}
              />
            )}

          </>
        )}

        {/* Screen 6 (INSTALL-04; D-05): the bounded connected-check wait
            between install.sh exiting 0 and the arrival moment -- entered
            either from InstallingProgress's onOutcome 'ok' branch above or
            directly from a resumed FlowRoute (kind: 'connected-check',
            applyFlowRoute). */}
        {screen === 'connected-check' && (
          <ConnectedCheck
            onConnected={(address) => {
              setLiveAddress(address);
              setScreen('live-success');
            }}
          />
        )}

        {/* Screen 2 (INSTALL-04; D-05/D-06): the arrival screen -- supersedes
            the former bb30bd92 wsl-handoff card. Reached from
            ConnectedCheck.onConnected above or directly from a D-03
            fast-path FlowRoute (kind: 'live-success', applyFlowRoute). */}
        {screen === 'live-success' && (
          <LiveSuccess address={liveAddress} onManage={() => setScreen('settings')} />
        )}

        {/* DASH-03: the control-room screen, reached from the tray "Settings" row /
            the D-10 stopped-open gate (both via the onEngineNavigate push above) or
            LiveSuccess's "Manage your server" link. */}
        {screen === 'settings' && (
          <Settings onSignedOut={() => setScreen('login')} onRemove={() => setScreen('remove')} />
        )}

        {/* SUP-02 (07-10): the Remove-flow screen pair, reached from Settings'
            "Remove Livinity…" danger-zone entry (onRemove above). onDone routes
            back to Settings -- the flow holds no persisted step (07-UI-SPEC
            screen-notes §2). */}
        {screen === 'remove' && <RemoveFlow onDone={() => setScreen('settings')} />}

        {/* Screen 3 (INSTALL-03; D-07): the unified orchestrator-error
            screen -- reached from a live resume's stale-CF-token FlowRoute
            (kind: 'cf-reconnect', applyFlowRoute) or the install-failure
            dispatch's 'cf-reconnect' FailureVerdict.screen
            (applyInstallFailure). The CTA re-enters the existing Phase-3
            CfToken screen rather than retrying blindly (05-UI-SPEC Screen 3). */}
        {screen === 'orchestrator-error' && orchestratorError && (
          <UnifiedError
            variant={orchestratorError.variant}
            reason={orchestratorError.reason}
            onRetry={() => {
              setOrchestratorError(null);
              setCfStep('cf-token');
              setScreen('byod-wizard');
            }}
          />
        )}

        {/* Screen 4 (INSTALL-03; D-08): the dedicated calm 410/no-managed-
            tunnel screen -- reached only from the install-failure dispatch's
            'no-tunnel-410' FailureVerdict.screen (applyInstallFailure). Its
            own "Check again" re-checks via flow:resume internally
            (NoTunnel410.tsx); onResolved re-enters the orchestrator fresh
            via flow:enter. */}
        {screen === 'no-tunnel-410' && <NoTunnel410 onResolved={() => void enterWslWizard()} />}

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
              <button className="btn btn-primary" onClick={() => void enterWslWizard()}>
                Start WSL provisioning (dev)
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
