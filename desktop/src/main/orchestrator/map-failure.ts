/**
 * src/main/orchestrator/map-failure.ts
 *
 * Pure, zero-IO union failure mapper (INSTALL-03 / D-07). This is the ONE
 * place every failure surface the app can produce -- WSL/install.sh exits,
 * Cloudflare API verdicts, platform 4xx, existing Phase-4 wsl-feature/
 * distro-install unions -- gets turned into a single {screen, copy, retryStep}
 * verdict. `retryStep` re-enters the resumable state machine AT the failed
 * step (a FlowStep string) -- never a blind full-flow restart.
 *
 * THE LOAD-BEARING RULE: install.sh's exit codes 75 and 1 are BOTH heavily
 * overloaded (>=13 distinct exit-75 causes verified via grep of every
 * `fail "..." 75` call site; exit 1 covers every curl failure in the tunnel-
 * token fetch, not just the platform's 410). Neither is ever routed by exit
 * code alone -- both are disambiguated by the (already-redacted) `[FAIL]`
 * reason-text tail install-invoke.ts captures. This is the "not synonymous
 * with disk-too-small" (Pitfall 2) / "410 is text-detected, not exit-code-
 * detected" (Pitfall 3) regression guard.
 *
 * Every other exit code (0/64/65, or any unmapped/null code) is NOT
 * overloaded -- those delegate to the EXISTING `mapInstallExit` ladder
 * (WSL-04/D-14, `src/main/wsl/map-install-exit.ts`), which is REUSED as an
 * already-classified input branch and never re-implemented here (D-01
 * evolution-not-rewrite).
 *
 * The inputs to this function are ALREADY-classified: exitCode/failReason
 * come from install-invoke.ts's exit-time drain (reason already redacted via
 * redactSecretLike before it ever reaches this module); `verdict` (CF) and
 * `status` (platform) are already-resolved discriminants, never a raw
 * response body parsed inline here.
 *
 * Zero runtime imports except the type-only FailureVerdict/FlowStep pull
 * from the shared contract and the existing mapInstallExit function (an
 * already-pure sibling decider, not an IO module) -- mirrors
 * decide-scope-verdict.ts's isolation discipline.
 */

import { mapInstallExit } from '../wsl/map-install-exit';
import type { FailureVerdict, FlowStep } from '../../../shared/ipc-contract';

export type FailureInput =
  | { surface: 'wsl-install'; exitCode: number | null; failReason?: string }
  | { surface: 'cf'; verdict: 'token-invalid' | 'network' | 'scope-missing' }
  | { surface: 'platform'; status: 401 | 402 | 410 }
  | { surface: 'wsl-feature' | 'distro-install'; kind: string };

/** The 5-member mapInstallExit output verdicts, mapped to the D-07 screen enum. */
const WSL_VERDICT_SCREEN: Record<string, FailureVerdict['screen']> = {
  'systemd-retry': 'systemd-retry',
  'our-bug': 'our-bug',
  'disk-too-small': 'disk', // only reachable here if exit 75 slipped past the reason-text gate below
};

export function mapFailure(input: FailureInput): FailureVerdict {
  const retryInstalling: FlowStep = 'installing';

  if (input.surface === 'wsl-install') {
    const reason = input.failReason ?? '';

    // Exit 75 -- disk-too-small-SHAPED, but only ~1 of >=13 real causes is
    // actually disk (Pitfall 2). Corroborate with reason text before routing
    // to the dedicated disk screen; everything else routes to generic with
    // the reason line already surfaced verbatim (it IS the actionable info).
    if (input.exitCode === 75) {
      if (/only \d+gb free on \//i.test(reason) || /needs at least 15gb/i.test(reason)) {
        return { screen: 'disk', retryStep: retryInstalling };
      }
      return { screen: 'generic', copy: reason, retryStep: retryInstalling };
    }

    // Exit 1 -- covers every curl failure in the tunnel-token fetch, not just
    // the platform's 410 (Pitfall 3). curl --fail's own diagnostic embeds the
    // HTTP status verbatim in the [FAIL] tail; a network/401/other reason is
    // NOT the same as 410 and must not be mislabeled as no-tunnel-410.
    if (input.exitCode === 1) {
      if (/error:\s*410/.test(reason) || /NO_TUNNEL/.test(reason)) {
        return { screen: 'no-tunnel-410', retryStep: retryInstalling };
      }
      return { screen: 'generic', copy: reason, retryStep: retryInstalling };
    }

    // Non-overloaded exits (0/64/65, or an unmapped/null code) -- delegate to
    // the existing, already-classified mapInstallExit ladder.
    const verdict = mapInstallExit(input.exitCode);
    const screen = WSL_VERDICT_SCREEN[verdict.kind];
    if (screen) return { screen, retryStep: retryInstalling };
    // 'ok' (exit 0 -- not a failure input; callers guard this before ever
    // reaching mapFailure) and 'generic-failure' both fall through here.
    return { screen: 'generic', copy: reason, retryStep: retryInstalling };
  }

  if (input.surface === 'cf' && input.verdict === 'token-invalid') {
    return { screen: 'cf-reconnect', retryStep: 'cf-token' };
  }

  if (input.surface === 'platform' && input.status === 410) {
    return { screen: 'no-tunnel-410', retryStep: retryInstalling };
  }
  if (input.surface === 'platform' && input.status === 401) {
    return { screen: 'login', retryStep: 'routing' };
  }
  if (input.surface === 'platform' && input.status === 402) {
    return { screen: 'no-entitlement', retryStep: 'routing' };
  }

  // cf 'network'/'scope-missing' and the existing wsl-feature/distro-install
  // unions (Phase 4) -- no dedicated screen exists yet for these surfaces;
  // the generic-failure catch-all re-enters at wsl-detect.
  return { screen: 'generic', retryStep: 'wsl-detect' };
}
