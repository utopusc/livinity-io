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
  // Phase 3 (D-16): non-secret CF facts for SHELL-05 resume + Phase 4/5 install env-vars.
  // The CF token and connector token themselves NEVER live here — they are in the vault
  // (VaultKeySchema `cfToken`/`tunnelToken`). Only these identifiers/labels are persisted.
  tunnelId: z.string().optional(),
  accountId: z.string().optional(),
  zoneId: z.string().optional(),
  zoneName: z.string().optional(),
  subLabel: z.string().optional(),
  // Phase 4 (D-03/SHELL-05): WSL wizard-resume fields so the flow survives the
  // mandatory reboot. NO secret fields ever belong here — the vault is the only
  // place secrets live. wslResource* are non-secret user-chosen resource limits
  // (RAM/CPU/disk), re-validated against WSL value formats before ever being
  // written to `.wslconfig` (04-09) — a tampered state file cannot inject a
  // malformed `.wslconfig` line.
  wslStep: z.string().optional(),
  wslResourceMemoryGb: z.number().optional(),
  wslResourceProcessors: z.number().optional(),
  wslResourceDiskGb: z.number().optional(),
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
  // Cloudflare automation (Phase 3). The token crosses IN once on cfVerifyToken and is
  // stored main-side to the vault on all-pass — it NEVER returns across any of these
  // channels. cfProvisionUpdate is a main -> renderer progress push (mirrors
  // authDeviceLoginUpdate). These literals are duplicated in the sandboxed preload;
  // 03-08 syncs them via the drift-guard test — do NOT edit the preload from this plan.
  cfVerifyToken: 'cf:verifyToken',
  cfGetZones: 'cf:getZones',
  cfSelectDomain: 'cf:selectDomain',
  cfRecheckZone: 'cf:recheckZone',
  cfProvision: 'cf:provision',
  cfOpenExternal: 'cf:openExternal',
  cfProvisionUpdate: 'cf:provisionUpdate',
  // WSL2 provisioning (Phase 4). Same duplication discipline as the cf:* block above:
  // these literals are duplicated in the sandboxed preload (04-09) and kept in sync by
  // the drift-guard test. wslDownloadUpdate/wslInstallUpdate are main -> renderer
  // progress pushes (mirror cfProvisionUpdate), never invoke handlers.
  wslDetect: 'wsl:detect',
  wslEnable: 'wsl:enable',
  wslCheckBios: 'wsl:checkBios',
  wslRestartNow: 'wsl:restartNow',
  wslDistroInstall: 'wsl:distroInstall',
  wslInstallInvoke: 'wsl:installInvoke',
  wslConfigGet: 'wsl:configGet',
  wslConfigApply: 'wsl:configApply',
  wslOpenExternal: 'wsl:openExternal',
  wslDownloadUpdate: 'wsl:downloadUpdate',
  wslInstallUpdate: 'wsl:installUpdate',
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

/**
 * Result of `authProbeKey` (X-API-Key live validation, D-14). NEVER echoes
 * the probed key back. `account_mismatch` (WR-02) means the key is live and
 * belongs to SOME active account, but not the one currently signed in on
 * this device — the mismatch outcome crosses the boundary as a plain reason
 * string, never the mismatched email/username itself.
 */
export const ProbeKeyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['invalid', 'inactive', 'not_found', 'network', 'account_mismatch']),
  }),
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
// Cloudflare automation (Phase 3, Free/BYOD)
// ---------------------------------------------------------------------------

/**
 * Same file-level IPC-boundary invariant as the vault and auth sections: NONE of
 * the Cf* result schemas below, and NO method on `CfApi`, ever returns the CF API
 * token or the tunnel connector token across the boundary. The CF token crosses IN
 * once (cfVerifyToken) and is stored to the vault main-side on an all-scope pass;
 * the connector token is fetched and stored to the vault during provisioning. The
 * renderer only ever receives per-scope verdict rows, secret-free zone summaries,
 * live name-servers, and a display summary — never a secret. (Mirrors the
 * AccountSchema.strict() leak-guard discipline above.)
 */

/**
 * A single per-scope verify row. `missingLabel` is the EXACT CF permission name
 * (verbatim as the Cloudflare dashboard spells it) when this scope failed (D-03),
 * so the renderer can tell the user precisely which permission to add.
 */
export const CfScopeRowSchema = z.object({
  scope: z.enum(['tunnel', 'dns', 'zone']),
  ok: z.boolean(),
  missingLabel: z.string().optional(),
});
export type CfScopeRow = z.infer<typeof CfScopeRowSchema>;

/**
 * Result of `cf:verifyToken`. On 'verified' the token has been stored to the vault
 * main-side; it NEVER crosses back. `rows` always has 3 entries so the renderer
 * renders three per-scope rows in every non-network case.
 */
export const CfVerifyResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('verified'), rows: z.array(CfScopeRowSchema) }),
  z.object({ kind: z.literal('scope-missing'), rows: z.array(CfScopeRowSchema) }),
  z.object({ kind: z.literal('token-invalid') }),
  z.object({ kind: z.literal('network') }),
]);
export type CfVerifyResult = z.infer<typeof CfVerifyResultSchema>;

/** A secret-free zone summary for the dropdown (the account id stays main-side). */
export const CfZoneSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated']),
});
export type CfZoneSummary = z.infer<typeof CfZoneSummarySchema>;

/** Result of `cf:getZones`. */
export const CfGetZonesResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), zones: z.array(CfZoneSummarySchema) }),
  z.object({ ok: z.literal(false), reason: z.enum(['network', 'unauthorized']) }),
]);
export type CfGetZonesResult = z.infer<typeof CfGetZonesResultSchema>;

/**
 * Result of `cf:selectDomain` (DNS-scope probe on the CHOSEN zone + D-08 collision
 * read). 'collision' deliberately carries NO target hostname (UI-SPEC Screen 4
 * shows none) — it is a bare signal, never a leak of what the record points at.
 */
export const CfSelectDomainResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('collision') }),
  z.object({ kind: z.literal('scope-missing'), rows: z.array(CfScopeRowSchema) }),
  z.object({ kind: z.literal('network') }),
]);
export type CfSelectDomainResult = z.infer<typeof CfSelectDomainResultSchema>;

/**
 * Result of `cf:recheckZone` (CF-04 NS screen). 'pending' carries the live
 * name_servers[] to display; nothing secret.
 */
export const CfRecheckZoneResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('active') }),
  z.object({ kind: z.literal('pending'), nameServers: z.array(z.string()) }),
  z.object({ kind: z.literal('network') }),
]);
export type CfRecheckZoneResult = z.infer<typeof CfRecheckZoneResultSchema>;

/**
 * Result of `cf:provision`. On 'scope-missing' a WRITE-level 403 routes back to
 * the same per-scope shape as Screen 1 (D-04, UI-SPEC provisioning-403 copy). The
 * 'ready' summary carries only display strings — no token, no connector secret.
 * 'collision' is a bare signal (like CfSelectDomainResult's) that provision found a
 * FOREIGN apex record at write time and `takeOver` was not set — the renderer routes
 * to the Collision screen (D-08); it carries no target hostname (never a leak).
 */
export const CfProvisionResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ready'),
    summary: z.object({ address: z.string(), tunnelName: z.string(), recordsLabel: z.string() }),
  }),
  z.object({
    kind: z.literal('scope-missing'),
    step: z.enum(['tunnel', 'ingress', 'dns']),
    rows: z.array(CfScopeRowSchema),
  }),
  z.object({ kind: z.literal('collision') }),
  z.object({ kind: z.literal('error'), reason: z.string() }),
  z.object({ kind: z.literal('network') }),
]);
export type CfProvisionResult = z.infer<typeof CfProvisionResultSchema>;

/** Human-friendly progress pushed main -> renderer on CHANNELS.cfProvisionUpdate. */
export const CfProvisionUpdateSchema = z.object({
  phase: z.enum(['tunnel', 'ingress', 'dns']),
});
export type CfProvisionUpdate = z.infer<typeof CfProvisionUpdateSchema>;

/**
 * CfApi — the Cloudflare-automation sibling of AuthApi. Same IPC-boundary
 * invariant: no method here ever returns the CF API token or the tunnel connector
 * token — only verdict rows, secret-free zone summaries, name-servers, and display
 * summaries cross this boundary.
 */
export interface CfApi {
  /** Token crosses IN once (like authProbeKey); stored to the vault only on all-pass. Never returns. */
  cfVerifyToken(token: string): Promise<CfVerifyResult>;
  cfGetZones(): Promise<CfGetZonesResult>;
  cfSelectDomain(zoneId: string, subLabel: string): Promise<CfSelectDomainResult>;
  cfRecheckZone(zoneId: string): Promise<CfRecheckZoneResult>;
  /** takeOver=true only from the Collision screen's confirmed path (D-08). */
  cfProvision(takeOver?: boolean): Promise<CfProvisionResult>;
  /** enum-allowlisted external open (system browser only). */
  cfOpenExternal(target: 'token-form' | 'add-site'): Promise<void>;
  /** Subscribes to provisioning-progress pushes; returns an unsubscribe function (mirrors onStatusChanged). */
  onProvisionUpdate(cb: (update: CfProvisionUpdate) => void): () => void;
}

// ---------------------------------------------------------------------------
// WSL2 provisioning (Phase 4)
// ---------------------------------------------------------------------------

/**
 * None of the Wsl* result schemas, and no method on WslApi, ever returns a
 * secret. The install.sh env vars (LIVOS_API_KEY / LIVOS_CF_TOKEN /
 * LIVOS_CF_TUNNEL_TOKEN) are read from the DPAPI vault main-side inside
 * install-invoke.ts and forwarded via WSLENV; they never cross this IPC
 * boundary — not even to build the invocation, since the renderer never
 * supplies them.
 */

/**
 * Result of `wsl:detect` (and `wsl:checkBios`, which reuses this same shape —
 * it is a reactive re-check of the 0x80370102 BIOS-blocked case). Drives
 * Screen 1 (detect) and Screen 2 (BIOS dead-end).
 */
export const WslDetectResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('needs-enable') }),
  z.object({ kind: z.literal('needs-reboot') }),
  z.object({ kind: z.literal('bios-blocked') }),
  z.object({ kind: z.literal('distro-missing') }),
  z.object({ kind: z.literal('wsl-missing') }),
]);
export type WslDetectResult = z.infer<typeof WslDetectResultSchema>;

/**
 * Result of `wsl:enable`. 'bios-blocked' is defensive/retained — reached via
 * wsl:detect/wsl:checkBios's reactive 0x80370102, NOT from exit 14107, which
 * classifies as needs-enable and is surfaced by wsl:enable as 'error' per the
 * single rule in decide-wsl-state.ts (04-02). 'declined' covers a dismissed/
 * declined UAC prompt — recoverable, not a fault.
 */
export const WslEnableResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('needs-reboot') }),
  z.object({ kind: z.literal('bios-blocked') }),
  z.object({ kind: z.literal('declined') }),
  z.object({ kind: z.literal('error') }),
]);
export type WslEnableResult = z.infer<typeof WslEnableResultSchema>;

/** Result of `wsl:distroInstall`. */
export const WslDistroInstallResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('installed') }),
  z.object({ kind: z.literal('disk-too-small'), freeGb: z.number(), driveLetter: z.string() }),
  z.object({ kind: z.literal('arch-unsupported') }),
  z.object({ kind: z.literal('download-failed') }),
  z.object({ kind: z.literal('checksum-failed') }),
  z.object({ kind: z.literal('error') }),
]);
export type WslDistroInstallResult = z.infer<typeof WslDistroInstallResultSchema>;

/**
 * Result of `wsl:installInvoke`. Mirrors map-install-exit's InstallVerdict
 * (04-03). 'generic-failure' carries an optional `reason` for the ONE red
 * technical line on Screen 6 — never a secret (it is derived from install.sh's
 * own stdout/stderr tail, not from vault contents).
 */
export const WslInstallInvokeResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok') }),
  z.object({ kind: z.literal('systemd-retry') }),
  z.object({ kind: z.literal('disk-too-small') }),
  z.object({ kind: z.literal('our-bug') }),
  z.object({ kind: z.literal('generic-failure'), reason: z.string().optional() }),
]);
export type WslInstallInvokeResult = z.infer<typeof WslInstallInvokeResultSchema>;

/**
 * The secret-free resource snapshot for `wsl:configGet` (Screen 3). `cpuRamTunable`
 * is the D-16/D-17 flag the ResourceAllocation screen uses to render full
 * (CPU/RAM+disk) vs disk-only.
 */
export const WslResourceInfoSchema = z.object({
  totalRamGb: z.number(),
  totalCores: z.number(),
  freeDiskGb: z.number(),
  driveLetter: z.string(),
  recommended: z.object({
    memoryGb: z.number(),
    processors: z.number(),
    diskGb: z.number(),
  }),
  current: z.object({
    memoryGb: z.number().optional(),
    processors: z.number().optional(),
  }),
  cpuRamTunable: z.boolean(),
});
export type WslResourceInfo = z.infer<typeof WslResourceInfoSchema>;

/** Result of `wsl:configApply` (the invisible `wsl --shutdown` behind Screen 3's "Applying"). */
export const WslConfigApplyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['invalid_values', 'write_failed', 'shutdown_failed']),
  }),
]);
export type WslConfigApplyResult = z.infer<typeof WslConfigApplyResultSchema>;

/** Progress pushed main -> renderer on CHANNELS.wslDownloadUpdate (Screen 4). */
export const WslDownloadUpdateSchema = z.object({
  phase: z.enum(['disk-check', 'downloading', 'verifying', 'importing', 'sparse']),
  doneBytes: z.number().optional(),
  totalBytes: z.number().optional(),
});
export type WslDownloadUpdate = z.infer<typeof WslDownloadUpdateSchema>;

/**
 * Progress pushed main -> renderer on CHANNELS.wslInstallUpdate (Screen 5). Coarse
 * Phase-4 step-list; Phase 5 enriches with parsed install.sh step markers without a
 * schema change.
 */
export const WslInstallUpdateSchema = z.object({
  phase: z.enum(['preparing', 'installing', 'starting']),
});
export type WslInstallUpdate = z.infer<typeof WslInstallUpdateSchema>;

/**
 * WslApi — the WSL2-provisioning sibling of CfApi. Same IPC-boundary invariant:
 * no method here ever returns a secret — only detection verdicts, resource
 * snapshots, and progress updates cross this boundary.
 */
export interface WslApi {
  wslDetect(): Promise<WslDetectResult>;
  wslEnable(): Promise<WslEnableResult>;
  wslCheckBios(): Promise<WslDetectResult>;
  /** USER-INITIATED reboot ONLY — invoked solely from the D-03 "Restart now" button, never
   * auto-called; the main handler also arms `openAtLogin --hidden` resume per D-04. */
  wslRestartNow(): Promise<void>;
  wslDistroInstall(): Promise<WslDistroInstallResult>;
  wslInstallInvoke(): Promise<WslInstallInvokeResult>;
  wslConfigGet(): Promise<WslResourceInfo>;
  wslConfigApply(limits: {
    memoryGb?: number;
    processors?: number;
    diskGb: number;
  }): Promise<WslConfigApplyResult>;
  /** enum-allowlisted external open (system browser only), mirrors cfOpenExternal. */
  wslOpenExternal(target: 'bios-help' | 'arm-help'): Promise<void>;
  /** Subscribes to download-progress pushes; returns an unsubscribe function (mirrors onProvisionUpdate). */
  onDownloadUpdate(cb: (u: WslDownloadUpdate) => void): () => void;
  /** Subscribes to install-progress pushes; returns an unsubscribe function (mirrors onProvisionUpdate). */
  onInstallUpdate(cb: (u: WslInstallUpdate) => void): () => void;
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
