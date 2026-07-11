/**
 * src/main/supervision/decide-supervision.ts
 *
 * Pure, zero-IO supervision-tick decider (TRAY-02/TRAY-06). Encodes RESEARCH
 * Pattern 3's respawn-gate ordering: `installInFlight` is checked FIRST (IN-06 --
 * a live 15-20min `install.sh` run must never be interleaved with a self-heal or
 * respawn, Pitfall 4), THEN `desiredState !== 'running'` gates a dead holder from
 * ever being respawned (a deliberately-stopped engine stays stopped -- the STOP
 * handler in engine.ts, 06-07, persists `engineDesiredState: 'stopped'` BEFORE
 * killing the holder, so this ladder's ordering alone is the race fix, not a lock).
 * Only once both gates pass does holder liveness / health decide respawn vs.
 * heal vs. ok.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface (mirrors
 * decide-wsl-state.ts / decide-resume-point.ts).
 */

export interface SupervisionSignals {
  installInFlight: boolean;
  desiredState: 'running' | 'stopped' | undefined;
  holderAlive: boolean;
  healthy: boolean;
}

export type SupervisionAction = 'skip' | 'noop' | 'respawn' | 'heal' | 'ok';

export function decideSupervisionAction(s: SupervisionSignals): SupervisionAction {
  // Rule 1 -- a live install is in flight. FIRST branch, source-order enforced
  // (IN-06): never probe, never respawn, never heal while install.sh is running.
  if (s.installInFlight) return 'skip';

  // Rule 2 -- the engine's desired-state is not 'running' (Pattern 3 respawn-gate).
  // A dead holder here is expected/intentional (the user just stopped it, or it
  // was never started) -- never respawn.
  if (s.desiredState !== 'running') return 'noop';

  // Rule 3 -- desiredState==='running' but the holder process is dead. Respawn it.
  if (!s.holderAlive) return 'respawn';

  // Rule 4 -- holder alive but the health probe is failing. Self-heal (D-06).
  if (!s.healthy) return 'heal';

  // Rule 5 -- holder alive and healthy. Nothing to do.
  return 'ok';
}

// ---------------------------------------------------------------------------
// decideAutoBringUp -- WR-08: launch-time auto-bring-up gate
// ---------------------------------------------------------------------------

export interface AutoBringUpSignals {
  engineDesiredState: 'running' | 'stopped' | undefined;
  /** The Phase-5 INSTALL-01 hint-ledger pointer (StateSchema.flowStep) -- a
   * FlowRoute kind string, or undefined when no flow has ever run. */
  flowStep: string | undefined;
}

export type AutoBringUpDecision = 'start' | 'skip-stopped' | 'skip-never-installed';

/** The two flowStep values that positively indicate install.sh COMPLETED
 * (decide-resume-point's post-install routes). 'installing' deliberately
 * excluded -- a relaunch mid-install must resume through the flow, never
 * boot-and-heal a half-provisioned distro. */
const INSTALL_COMPLETE_FLOW_STEPS: ReadonlySet<string> = new Set(['connected-check', 'live-success']);

/**
 * WR-08: whether launch-time auto-bring-up (TRAY-01) may call startEngine.
 * The "undefined => bring-up" default is only sensible AFTER an install has
 * ever completed; on a fresh machine (no login/CF/WSL yet) it produced a red
 * "Error" tray at first launch, persisted `engineDesiredState:'running'`
 * pre-install, and a doomed holder respawn + 15s failing probe every 45s
 * through the entire wizard journey.
 *
 * - 'stopped'   -> skip (honors the user's own STOP -- unchanged, D-03).
 * - 'running'   -> start ('running' is only ever persisted by startEngine,
 *                  itself evidence a real start happened before).
 * - undefined   -> start ONLY with persisted evidence the install flow
 *                  reached a post-install route; otherwise skip silently.
 */
export function decideAutoBringUp(s: AutoBringUpSignals): AutoBringUpDecision {
  if (s.engineDesiredState === 'stopped') return 'skip-stopped';
  if (s.engineDesiredState === 'running') return 'start';
  return s.flowStep !== undefined && INSTALL_COMPLETE_FLOW_STEPS.has(s.flowStep)
    ? 'start'
    : 'skip-never-installed';
}
