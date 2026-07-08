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
  authLogin: 'auth:login',
  authSignOut: 'auth:signOut',
  authGetRoute: 'auth:getRoute',
  authChooseFree: 'auth:chooseFree',
  authGetKeyAction: 'auth:getKeyAction',
  authProbeKey: 'auth:probeKey',
  authRegenerateKey: 'auth:regenerateKey',
  authGetAccount: 'auth:getAccount',
  authOpenExternal: 'auth:openExternal',
  authStartDeviceLogin: 'auth:startDeviceLogin',
  authCancelDeviceLogin: 'auth:cancelDeviceLogin',
  authDeviceLoginUpdate: 'auth:deviceLoginUpdate',
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
// Auth / platform routing (Phase 2)
// ---------------------------------------------------------------------------

/**
 * The tier-routing decision, computed by decideRoute (main, pure) for the
 * non-login cases and by session-manager for the `login` case. This is what
 * the renderer switches on to pick a screen — never a raw HTTP status.
 */
export const RouteResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('login'), expired: z.boolean().optional() }),
  z.object({ kind: z.literal('byod-wizard') }),
  z.object({ kind: z.literal('pro-wizard') }),
  z.object({ kind: z.literal('legacy-free-wizard') }),
  z.object({ kind: z.literal('no-entitlement') }),
  z.object({ kind: z.literal('error'), reason: z.enum(['network', 'server']) }),
]);
export type RouteResult = z.infer<typeof RouteResultSchema>;

/** The 4 outcomes of the vault-vs-platform key-state matrix (decideKeyAction, AUTH-06). */
export const KeyActionSchema = z.enum(['mint', 'choice-screen', 'use-cached', 'stale-reprompt']);
export type KeyAction = z.infer<typeof KeyActionSchema>;

/** Result of `authLogin`. NEVER carries the session cookie value — only the routing outcome. */
export const AuthLoginResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), route: RouteResultSchema }),
  z.object({
    ok: z.literal(false),
    status: z.number(),
    error: z.string(),
    retryAfterMs: z.number().optional(),
  }),
]);
export type AuthLoginResult = z.infer<typeof AuthLoginResultSchema>;

/** Result of `authChooseFree`. */
export const ChooseFreeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), route: RouteResultSchema }),
  z.object({ ok: z.literal(false), reason: z.enum(['has_paid_plan', 'not_signed_in', 'unavailable']) }),
]);
export type ChooseFreeResult = z.infer<typeof ChooseFreeResultSchema>;

/** Result of `authGetKeyAction`. `prefix` is a display prefix ONLY, never the full key. */
export const KeyActionResultSchema = z.object({
  action: KeyActionSchema,
  prefix: z.string().nullable().optional(),
});
export type KeyActionResult = z.infer<typeof KeyActionResultSchema>;

/** Result of `authProbeKey` (X-API-Key live validation, D-14). NEVER echoes the probed key back. */
export const ProbeKeyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['invalid', 'inactive', 'not_found', 'network']) }),
]);
export type ProbeKeyResult = z.infer<typeof ProbeKeyResultSchema>;

/**
 * Result of `authRegenerateKey`. DESTRUCTIVE — only `prefix` crosses the
 * boundary on success, never the full `liv_k_...` value.
 */
export const RegenerateKeyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), prefix: z.string() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['email_unverified', 'subscription_required', 'network', 'failed']),
  }),
]);
export type RegenerateKeyResult = z.infer<typeof RegenerateKeyResultSchema>;

/**
 * Safe account fields for the header chip. `.strict()` so an accidental extra
 * field (e.g. a raw `apiKey` or `sessionValue` slipping in upstream) is
 * REJECTED at parse time instead of silently passed through — a schema-level
 * leak guard, not just a convention.
 */
export const AccountSchema = z
  .object({ email: z.string(), username: z.string().nullable() })
  .strict();
export type Account = z.infer<typeof AccountSchema>;

// ---------------------------------------------------------------------------
// Device-flow login (device-flow pivot, D-16/D-18) — replaces the retired
// embedded-browser Google OAuth window (Plan 02-02 BLOCKED verdict).
// ---------------------------------------------------------------------------

/**
 * Device-login progress, pushed main -> renderer on CHANNELS.authDeviceLoginUpdate
 * while a device login is in flight. Same IPC-boundary invariant as the rest
 * of this file: the device access_token and the minted session value never
 * appear here — only the route/account fields that already cross the
 * boundary elsewhere (RouteResultSchema, AccountSchema).
 */
export const DeviceLoginUpdateSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('waiting') }),
  z.object({ phase: z.literal('approved'), route: RouteResultSchema, account: AccountSchema }),
  z.object({ phase: z.literal('expired') }),
  z.object({
    phase: z.literal('error'),
    reason: z.enum(['network', 'exchange_failed', 'session_revoked', 'already_exchanged', 'unknown']),
  }),
  z.object({ phase: z.literal('cancelled') }),
]);
export type DeviceLoginUpdate = z.infer<typeof DeviceLoginUpdateSchema>;

/** Result of `startDeviceLogin`. NEVER carries the device access_token. */
export const AuthStartDeviceLoginResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), userCode: z.string(), expiresInMs: z.number() }),
  z.object({ ok: z.literal(false), reason: z.enum(['network', 'already_running']) }),
]);
export type AuthStartDeviceLoginResult = z.infer<typeof AuthStartDeviceLoginResultSchema>;

/**
 * AuthApi — the auth/platform-routing sibling of ShellApi. Same IPC-boundary
 * invariant as the vault: no method here ever returns a raw session cookie or
 * a full `liv_k_` key value — only booleans, prefixes, routing decisions, and
 * user-safe account fields (email/username) cross this boundary.
 */
export interface AuthApi {
  authLogin(email: string, password: string): Promise<AuthLoginResult>;
  authSignOut(): Promise<{ ok: true }>;
  authGetRoute(): Promise<RouteResult>;
  authChooseFree(): Promise<ChooseFreeResult>;
  /** Resolves the liv_k_ key state (mint invisibly / prompt / use cached). Never returns the key value. */
  authGetKeyAction(): Promise<KeyActionResult>;
  authProbeKey(key: string): Promise<ProbeKeyResult>;
  /** Destructive — reachable ONLY from the KeyChoice screen's confirmed path. */
  authRegenerateKey(): Promise<RegenerateKeyResult>;
  /** Safe account fields for the header chip. Never the cookie/key. */
  authGetAccount(): Promise<Account | null>;
  authOpenExternal(target: 'reset-password' | 'pricing'): Promise<void>;

  // Device-flow login (device-flow pivot, D-16/D-18) — replaces the retired
  // embedded-browser Google OAuth window. Never returns the device
  // access_token or the minted session value.
  /** Registers a device grant and opens the system browser at the fixed livinity.io/device deep link. */
  startDeviceLogin(): Promise<AuthStartDeviceLoginResult>;
  /** Stops the in-flight poll loop. A Cancel click is not a fault. */
  cancelDeviceLogin(): Promise<{ ok: true }>;
  /** Subscribes to device-login progress pushes; returns an unsubscribe function (mirrors onStatusChanged). */
  onDeviceLoginUpdate(cb: (update: DeviceLoginUpdate) => void): () => void;
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
