/**
 * src/main/supervision/notify-edges.ts
 *
 * Pure, zero-IO D-08 edge-transition notification decider (TRAY-05). Fires
 * exactly one notification per REAL up<->down health transition, never per
 * probe -- a stable state (true->true or false->false), no matter how many
 * times the periodic supervision tick re-confirms it, always decides `null`.
 *
 * This module owns only the WHICH-COPY decision. It does not call
 * `Notification` itself (that impure side lives in engine.ts, 06-07) and it
 * does not own the `prevHealthy` memory -- the caller (the supervision loop)
 * is the single owner of that piece of state across ticks, feeding it in here
 * each time alongside the just-observed `nowHealthy` and whether an active
 * repair action (respawn/self-heal) ran this tick.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface
 * (mirrors decide-supervision.ts / decide-wsl-state.ts).
 */

export type NotifyKind = 'offline' | 'back-online' | 'recovered';

export function decideNotification(
  prevHealthy: boolean,
  nowHealthy: boolean,
  repaired: boolean
): NotifyKind | null {
  // Rule 1 -- healthy -> unhealthy edge. Always 'offline', regardless of repaired.
  if (prevHealthy && !nowHealthy) return 'offline';

  // Rule 2 -- unhealthy -> healthy edge. An active repair (respawn/self-heal)
  // this tick means the engine restored itself ('recovered'); otherwise it
  // reconnected on its own ('back-online', D-02).
  if (!prevHealthy && nowHealthy) return repaired ? 'recovered' : 'back-online';

  // Rule 3 -- stable state (true->true or false->false). No edge, no notification.
  return null;
}
