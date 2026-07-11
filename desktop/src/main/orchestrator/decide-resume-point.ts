/**
 * src/main/orchestrator/decide-resume-point.ts
 *
 * Pure, zero-IO resume-point decider (INSTALL-01 / D-02 / D-09). This is the
 * SINGLE place that computes where a resumed launch lands. It is the resume
 * counterpart of decide-wsl-state.ts's exit-code ladder, and the SAME
 * ordering discipline applies:
 *
 * LIVE PROBE IS TRUTH -- the ledger is only a hint. `installedHealthy` (the
 * D-03 fast-path live probe) is checked FIRST, before any ledger-driven
 * CF/WSL sub-flow re-entry decision -- exactly as decide-wsl-state's reactive
 * BIOS check (the authoritative live signal) is checked before the
 * exit-code buckets (the hint-shaped signal). A tampered/stale persisted
 * `flowStep` can therefore never force a destructive re-run past a live
 * "already healthy" verdict (T-05-05).
 *
 * A CF SCREEN IS UNREACHABLE UNLESS cfWasEntered (D-10 / criterion 5): the
 * cf-wizard/cf-reconnect branch is gated on `cfWasEntered === true`. A
 * Pro/legacy/trial sign-in never enters the CF sub-flow, so `cfWasEntered`
 * stays false for that whole session -- meaning this decider can PROVABLY
 * never route a Pro/legacy user to a CF screen, for any ledger/cfVerify
 * combination whatsoever (see the plan's D-10 guard test rows).
 *
 * The caller (flow.ts, impure) gathers every signal below via the EXISTING
 * live re-verify calls (wsl:detect / cf:verifyToken / the D-03 health probe)
 * and hands already-classified results in -- this module reads no raw exit
 * code, no raw HTTP status, no narrative text.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface; the
 * only import is a type-only pull of the result shape from the shared
 * contract (mirrors decide-wsl-state.ts / decide-scope-verdict.ts).
 */

import type { FlowRoute } from '../../../shared/ipc-contract';

/** Already-classified live-verify verdict for a re-checked CF token, when applicable. */
export type CfVerifyVerdict = 'ok' | 'token-invalid' | null;

/**
 * Already-captured, already-classified signals fed in by the caller (flow.ts):
 * `ledgerFlowStep` is the raw hint from `StateSchema.flowStep` (a plain
 * string, not a strict enum -- mirrors how `wslStep` itself is loosely typed
 * so new step names never require a schema migration); `cfWasEntered` is the
 * tier proxy (subLabel/zoneName present -- a Pro/legacy sign-in never sets
 * these); `installedHealthy` is the D-03 live probe result; `cfVerify` is the
 * live re-verify outcome of a re-checked CF token, only meaningful when
 * `cfWasEntered`; `installMidRun` is a LIVE probe of an actively-running
 * install child process (distinct from the ledger hint that a PAST run left
 * off mid-install -- either signal alone is enough to re-enter `installing`,
 * idempotently, per D-14). `address` is an already-derived display string
 * (pure string logic over already-loaded state, e.g. subLabel+zoneName or
 * `${username}.livinity.io` -- never IO); only consumed by the live-success
 * branch, which FlowRouteSchema requires to carry an address (nullable).
 */
export interface ResumePointSignals {
  ledgerFlowStep: string | undefined;
  cfWasEntered: boolean;
  installedHealthy: boolean;
  cfVerify: CfVerifyVerdict;
  installMidRun?: boolean;
  address?: string | null;
}

/** FlowStep values that represent "already past the CF sub-flow, in WSL/install/beyond" territory. */
const WSL_OR_LATER = new Set(['wsl-detect', 'resource', 'installing', 'connected-check', 'live-success']);

export function decideResumePoint(signals: ResumePointSignals): FlowRoute {
  // Rule 1 -- installed & healthy (D-03), the most-authoritative live signal.
  // Checked BEFORE any CF/WSL sub-flow re-entry decision, exactly as
  // decide-wsl-state checks the reactive BIOS block before the exit-code
  // buckets.
  if (signals.installedHealthy) {
    return { kind: 'live-success', address: signals.address ?? null };
  }

  // Rule 2 -- install.sh was (or IS live) mid-run. Either the ledger hint or
  // a live probe of an active install child routes here, idempotently
  // (D-14: re-entering `installing` always restarts install.sh from the top
  // -- never "resume mid-marker").
  if (signals.installMidRun || signals.ledgerFlowStep === 'installing') {
    return { kind: 'installing' };
  }

  // Rule 3 -- a Pro/legacy signal (cfWasEntered=false) can NEVER reach the CF
  // branch below (D-10 / criterion 5): both Rule 3 and Rule 4 are gated on
  // cfWasEntered === true.
  if (signals.cfWasEntered) {
    // Rule 3a -- the live re-verify came back stale. This fires regardless of
    // how far the ledger progressed (a token can go stale after the CF
    // sub-flow completed) -- re-connect before continuing.
    if (signals.cfVerify === 'token-invalid') {
      return { kind: 'cf-reconnect' };
    }
    // Rule 3b -- CF was entered, not yet re-verified stale, and the ledger
    // has not yet reached WSL/install/beyond -- still in (or re-entering)
    // the CF sub-flow.
    if (!WSL_OR_LATER.has(signals.ledgerFlowStep ?? '')) {
      return { kind: 'cf-wizard' };
    }
  }

  // Rule 4 -- install exited 0 but the connected-check probe was killed
  // mid-run; re-enter the confirm-reachability step, not the whole install.
  if (signals.ledgerFlowStep === 'connected-check') {
    return { kind: 'connected-check' };
  }

  // Rule 5 (catch-all) -- no ledger / fresh entry -> wsl-detect, resume:false;
  // any other recorded ledger step (a WSL sub-step, e.g. 'wsl-detect' or
  // 'resource') -> wsl-detect, resume:true (D-09: auto-continue through
  // non-destructive verify steps without a click).
  return { kind: 'wsl-detect', resume: Boolean(signals.ledgerFlowStep) };
}
