/**
 * shared/ipc-contract.ts
 *
 * Single source of truth for every Phase 1 IPC channel: zod schemas (validated at
 * the preload<->main boundary) plus the inferred TypeScript types every renderer,
 * preload, and main-process IPC handler imports — never re-typed ad hoc per file.
 *
 * CRITICAL (SHELL-04 / RESEARCH.md Security Domain): the vault getter below
 * (`vaultHas`) returns ONLY a derived boolean (`{ exists: boolean }`). No schema in
 * this file, and no method on `ShellApi`, ever returns a decrypted secret value
 * across the IPC boundary. The renderer may ask "do we have a session token?" —
 * it may never ask for (and can never receive) the token itself.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

/** The known, closed set of secrets the vault may hold. Unknown keys are rejected. */
export const VaultKeySchema = z.enum(['session', 'apiKey', 'cfToken', 'tunnelToken']);
export type VaultKey = z.infer<typeof VaultKeySchema>;

/** Result of a vault write — a discriminated union, never a bare throw across IPC. */
export const VaultSetResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.enum(['VAULT_UNAVAILABLE', 'ENCRYPT_FAILED']) }),
]);
export type VaultSetResult = z.infer<typeof VaultSetResultSchema>;

/**
 * Result of a vault read. CRITICAL: this is `{ exists: boolean }` ONLY.
 * The decrypted secret value NEVER has a return path across the IPC boundary —
 * this is enforced here at the schema/type level, not just by convention.
 */
export const VaultGetResultSchema = z.object({ exists: z.boolean() });
export type VaultGetResult = z.infer<typeof VaultGetResultSchema>;

// ---------------------------------------------------------------------------
// Status (tray-simulated, Phase 1)
// ---------------------------------------------------------------------------

/** The 4 Phase-1 simulated tray states — NOT connected/connecting/disconnected. */
export const StatusSchema = z.enum(['installing', 'running', 'stopped', 'error']);
export type Status = z.infer<typeof StatusSchema>;

// ---------------------------------------------------------------------------
// Durable wizard/provisioning state
// ---------------------------------------------------------------------------

/**
 * The durable-state shape persisted to userData/state.json (Plan 02 implements
 * the store; this is the shared shape). NO secret fields ever belong here — the
 * vault is the only place secrets live.
 */
export const StateSchema = z.object({
  version: z.literal(1),
  currentStep: z.string(),
  domainLabel: z.string().optional(),
});
export type State = z.infer<typeof StateSchema>;

// ---------------------------------------------------------------------------
// IPC channel names (namespace:action convention)
// ---------------------------------------------------------------------------

export const CHANNELS = {
  vaultSet: 'vault:set',
  vaultHas: 'vault:has',
  stateGet: 'state:get',
  stateSet: 'state:set',
  statusSimulate: 'status:simulate',
  statusChanged: 'status:changed',
  windowMinimize: 'window:minimize',
  windowHide: 'window:hide',
  appQuit: 'app:quit',
} as const;

// ---------------------------------------------------------------------------
// ShellApi — the ONE interface preload + renderer + ipc handlers all reference
// ---------------------------------------------------------------------------

export interface ShellApi {
  vaultSet(key: VaultKey, value: string): Promise<VaultSetResult>;
  /** Existence check only — never returns the decrypted secret. */
  vaultHas(key: VaultKey): Promise<VaultGetResult>;
  getState(): Promise<State>;
  setState(patch: Partial<State>): Promise<State>;
  simulateStatus(status: Status): Promise<void>;
  /**
   * Subscribes `cb` to status-changed pushes and returns an unsubscribe
   * function. Callers (e.g. a React effect) MUST call the returned function
   * on cleanup to avoid accumulating duplicate listeners across remounts/HMR
   * (IN-06).
   */
  onStatusChanged(cb: (status: Status) => void): () => void;
  minimize(): void;
  hide(): void;
  quit(): void;
}

// ---------------------------------------------------------------------------
// DevSpikeApi — DEV-ONLY spike surface (Phase 1 Plan 04)
// ---------------------------------------------------------------------------

/**
 * DEV-ONLY (Plan 04 spike): typed surface for the two spike triggers. The
 * corresponding main-process handlers (`dev:spawnHolderA`, `dev:updateSim`)
 * are registered ONLY when `!app.isPackaged` (see shell.ipc.ts) — in a
 * packaged build these methods reject with "No handler registered", so
 * exposing them through the preload is inert in production. The channel
 * names are deliberately NOT part of the production CHANNELS object above:
 * this is throwaway research surface, kept typed here only so the sandboxed
 * preload and the debug UI reference one contract instead of re-typing it.
 */
export interface DevSpikeApi {
  /** Spawns spike/holder-candidate-a.js FROM the main process (inside Electron's Job Object tree). */
  devSpawnHolderA(): Promise<{ ok: boolean }>;
  /** Test B update simulation: app.relaunch() + app.exit(0) — quitAndInstall's process semantics minus the installer binary. */
  devUpdateSim(): Promise<void>;
}
