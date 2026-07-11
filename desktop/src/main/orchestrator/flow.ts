/**
 * src/main/orchestrator/flow.ts
 *
 * The INSTALL-01 impure orchestrator -- the resumable state machine itself.
 * `enterFlow` (wizard-entry) and `resumeFlow` (app-launch, D-09) both gather
 * ALREADY-classified live signals by delegating to EXISTING main functions --
 * `isInstalledAndHealthy`/`deriveAddress` (connected-probe.ts, 05-07's sibling
 * module), `isInstallInFlight` (install-invoke.ts), `verifyAndProbe`
 * (cf-verify.ts) -- and feed them into the REAL `decideResumePoint` (05-03).
 * This module NEVER re-implements a probe/provision step (D-01
 * evolution-not-rewrite) and makes NO screen decision of its own beyond what
 * `decideResumePoint`'s pure ladder already decided.
 *
 * T-05-03 (double-entry guard, criterion 1): a module-level `inFlight` flag
 * mirrors install-invoke.ts's/distro-install.ts's established pattern -- a
 * double-click or a resume-overlapping-a-fresh-entry can never re-run the
 * live re-verify collaborators (isInstalledAndHealthy/verifyAndProbe) a
 * second time concurrently. The second overlapping call degrades to the SAME
 * safe FlowRoute the thrown-collaborator catch below returns -- no second
 * side effect, ever.
 *
 * T-05-05 (ledger cannot force a destructive re-run): the ledger's
 * `flowStep` is a HINT only -- `decideResumePoint` ranks the live
 * `installedHealthy` probe above it (Rule 1), so a tampered/stale persisted
 * pointer can never skip past a live "already healthy" verdict into a
 * needless re-provision, nor force one.
 *
 * The safe-union degrade -- both the inFlight guard AND a thrown collaborator
 * -- returns `{ kind: 'wsl-detect', resume: false }`: the schema-valid,
 * non-destructive verify entry (identical to 05-08's flow:enter/resume IPC
 * safe default). This is NEVER the string `'generic-orchestrator'` -- that is
 * a UnifiedError variant (05-05), a completely different vocabulary; it is
 * not a member of the FlowRouteSchema discriminated union at all.
 *
 * Zero imports from ipc/ or tray/ -- a main-process orchestration primitive,
 * same isolation rule as cf-provision.ts/install-invoke.ts. `vaultGet` reads
 * plaintext secrets main-side ONLY -- this module must never be imported from
 * ipc/ directly for its vault access to leak across the IPC boundary.
 */

import { readState as realReadState, patchState as realPatchState } from '../storage/state-store';
import { vaultGet as realVaultGet } from '../storage/secrets-vault';
import { verifyAndProbe as realVerifyAndProbe } from '../cloudflare/cf-verify';
import {
  isInstalledAndHealthy as realIsInstalledAndHealthy,
  deriveAddress as realDeriveAddress,
} from './connected-probe';
import { isInstallInFlight as realIsInstallInFlight } from '../wsl/install-invoke';
import { decideResumePoint, type CfVerifyVerdict, type ResumePointSignals } from './decide-resume-point';
import { logSafe } from '../log';
import type { FlowRoute, CfVerifyResult } from '../../../shared/ipc-contract';

/** Injectable collaborators -- production defaults below, fully fakeable in tests. */
export interface FlowDeps {
  readState: typeof realReadState;
  patchState: typeof realPatchState;
  vaultGet: typeof realVaultGet;
  verifyAndProbe: (token: string) => Promise<CfVerifyResult>;
  isInstalledAndHealthy: () => Promise<boolean>;
  isInstallInFlight: () => boolean;
  deriveAddress: () => Promise<string | null>;
}

/**
 * The schema-valid safe FlowRoute every degrade path returns -- a
 * non-destructive verify entry, never a false live-success/cf-wizard. Also
 * doubles as `resumeFlow`'s "genuinely nothing to resume" shape (see below).
 */
const SAFE_DEFAULT: FlowRoute = { kind: 'wsl-detect', resume: false };

// Module-level in-flight guard, shared by enterFlow AND resumeFlow (T-05-03:
// "a double-click or resume-overlapping-a-fresh-entry can never spawn a
// second provisioning/install") -- only one signal-gathering pass may be
// active at a time.
let inFlight = false;

/** Maps the live CF re-verify result to the decider's already-classified verdict shape. */
function mapCfVerdict(verdict: CfVerifyResult | null): CfVerifyVerdict {
  if (!verdict) return null;
  if (verdict.kind === 'token-invalid') return 'token-invalid';
  if (verdict.kind === 'verified' || verdict.kind === 'scope-missing') return 'ok';
  return null; // 'network' -- unresolved; never forces a reconnect on a blip
}

/**
 * Gathers every already-classified signal `decideResumePoint` needs, calling
 * only EXISTING main functions -- never a raw exit code, never a raw HTTP
 * status parsed inline here. The CF stale-token re-check
 * (`verifyAndProbe`) only runs when `cfWasEntered` AND `decideResumePoint`'s
 * Rule 3 would actually be REACHED (i.e. Rule 1/Rule 2 have not already
 * short-circuited past it) -- never a blind extra CF probe.
 *
 * No per-call defensive `.catch()` here (unlike connected-probe.ts's own
 * "never false-block a probe glitch" internal guards) -- every REAL
 * production collaborator this function calls (readState/vaultGet/
 * verifyAndProbe/isInstalledAndHealthy/deriveAddress) already degrades
 * internally and NEVER throws; a rejection here can only come from a
 * test-injected fake collaborator, and is meant to propagate to
 * `computeFlowRoute`'s single outer try/catch (the ONE safe-union degrade
 * point, mirroring install-invoke.ts's/distro-install.ts's single-try-block
 * shape rather than sprinkling per-call catches).
 */
async function gatherSignals(deps: Partial<FlowDeps>): Promise<ResumePointSignals> {
  const readStateFn = deps.readState ?? realReadState;
  const vaultGetFn = deps.vaultGet ?? realVaultGet;
  const verifyAndProbeFn = deps.verifyAndProbe ?? realVerifyAndProbe;
  const isInstalledAndHealthyFn = deps.isInstalledAndHealthy ?? realIsInstalledAndHealthy;
  const isInstallInFlightFn = deps.isInstallInFlight ?? realIsInstallInFlight;
  const deriveAddressFn = deps.deriveAddress ?? realDeriveAddress;

  const st = await readStateFn();
  const ledgerFlowStep = st?.flowStep;
  const cfWasEntered = Boolean(st?.subLabel && st?.zoneName);
  const installMidRun = isInstallInFlightFn();

  const [installedHealthy, address] = await Promise.all([isInstalledAndHealthyFn(), deriveAddressFn()]);

  const cfGateReachable = cfWasEntered && !installedHealthy && !installMidRun && ledgerFlowStep !== 'installing';
  let cfVerify: CfVerifyVerdict = null;
  if (cfGateReachable) {
    const token = await vaultGetFn('cfToken');
    if (token) {
      const verdict = await verifyAndProbeFn(token);
      cfVerify = mapCfVerdict(verdict);
    }
  }

  return { ledgerFlowStep, cfWasEntered, installedHealthy, cfVerify, installMidRun, address };
}

/**
 * The shared, inFlight-guarded compute core for enterFlow/resumeFlow. Gathers
 * live signals, feeds them into the REAL `decideResumePoint`, persists the
 * resulting ledger pointer via `patchState({ flowStep })` (INSTALL-01
 * hint-ledger), and NEVER throws -- every exit (a thrown collaborator, a
 * malformed read) degrades to `SAFE_DEFAULT`.
 */
async function computeFlowRoute(deps: Partial<FlowDeps>): Promise<FlowRoute> {
  if (inFlight) {
    logSafe('flow.compute', { guarded: true });
    return SAFE_DEFAULT;
  }
  inFlight = true;
  try {
    const signals = await gatherSignals(deps);
    const route = decideResumePoint(signals);

    const patchStateFn = deps.patchState ?? realPatchState;
    await patchStateFn({ flowStep: route.kind }).catch(() => undefined);

    logSafe('flow.compute', { kind: route.kind });
    return route;
  } catch {
    logSafe('flow.compute', { exception: true });
    return SAFE_DEFAULT;
  } finally {
    inFlight = false;
  }
}

/**
 * Resume-point compute on a wizard entry (replaces `enterWslWizard`'s blind
 * jump into `wsl-wizard`). A healthy box short-circuits straight to
 * `live-success` (D-03 fast-path) -- no install re-walk. Never throws, never
 * rejects -- degrades to `SAFE_DEFAULT`.
 */
export async function enterFlow(deps: Partial<FlowDeps> = {}): Promise<FlowRoute> {
  return computeFlowRoute(deps);
}

/**
 * Resume-point compute on app launch (D-09) -- every launch re-verifies live
 * state. Returns `null` when there is genuinely nothing to resume (no ledger
 * hint recorded, no live signal fired) so the renderer keeps its normal auth
 * route -- `computeFlowRoute`'s catch-all "fresh entry" shape
 * (`{ kind:'wsl-detect', resume:false }`) IS `SAFE_DEFAULT`, so a thrown
 * collaborator during a resume is indistinguishable from a genuinely fresh
 * launch; both correctly fall back to the renderer's normal auth route
 * rather than forcing an orchestrator screen.
 */
export async function resumeFlow(deps: Partial<FlowDeps> = {}): Promise<FlowRoute | null> {
  const route = await computeFlowRoute(deps);
  if (route.kind === 'wsl-detect' && !route.resume) {
    return null;
  }
  return route;
}
