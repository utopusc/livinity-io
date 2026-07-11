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
