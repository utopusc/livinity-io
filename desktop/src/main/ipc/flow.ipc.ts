/**
 * src/main/ipc/flow.ipc.ts
 *
 * The renderer<->main IPC boundary for the install orchestrator (Phase 5) —
 * the five zod-validated flow:* invoke handlers. Mirrors src/main/ipc/cf.ipc.ts
 * / src/main/ipc/wsl.ipc.ts VERBATIM: every renderer-supplied payload is
 * safeParse'd before it touches an orchestrator, every handler body is
 * wrapped in try/catch so no exception ever crosses the boundary as a
 * rejected IPC promise (a safe result union is returned instead), and every
 * logSafe carries scalar metadata only — never a secret.
 *
 * SECRET DISCIPLINE: none of these handlers ever returns a secret.
 * `flow.ts`/`connected-probe.ts` read the vault plaintext (cfToken/session)
 * entirely MAIN-SIDE — this file never touches the plaintext vault reader at
 * all; the renderer never supplies and never receives a CF token, an API key,
 * or a session value.
 *
 * SAFE DEFAULTS (never a false live-success/connected): a malformed payload
 * or a thrown orchestrator on flow:enter/flow:resume degrades to the SAME
 * schema-valid, non-destructive verify entry flow.ts's own SAFE_DEFAULT
 * uses — `{ kind: 'wsl-detect', resume: false }` — never a live-success
 * without a real healthy probe. flow:connectedCheck degrades to
 * `{ kind: 'still-confirming', address: null }` — an honest "not yet",
 * never a false 'connected'.
 *
 * DEEP-LINK / MAIN-SIDE ADDRESS ALLOWLIST (T-05-06, T-03-15 lineage):
 * flowOpenBox NEVER trusts a renderer-supplied URL — it derives the box
 * address MAIN-SIDE via connected-probe.ts's `deriveAddress` (the SAME
 * reader flow.ts's own signal-gathering uses, D-01 evolution-not-rewrite;
 * "one address-derivation implementation, not two" per 05-07) and only calls
 * `shell.openExternal` when a valid address resolves. flowOpenExternal
 * accepts a single-value enum (`'support'`), not a URL — the handler maps it
 * to a FIXED support URL, so a raw renderer-supplied URL can never reach
 * `shell.openExternal` (mirrors cf.ipc.ts's/wsl.ipc.ts's enum-allowlisted
 * openExternal).
 *
 * NO PUSH CHANNEL: unlike cf.ipc.ts/wsl.ipc.ts, this file registers NO
 * getMainWindow()-backed progress push — flow:enter/flow:resume/
 * flow:connectedCheck are plain invoke handlers (flow:connectedCheck's
 * bounded retry runs entirely inside runConnectedProbe and resolves once);
 * there is no flow:*Update channel in the Phase-5 CHANNELS block. A no-dep
 * register is therefore sufficient — this file imports nothing from tray/ or
 * renderer/.
 *
 * STILL INERT: registerFlowIpc is not yet called from index.ts and no
 * renderer screen is mounted (both are 05-09's job) — this file only makes
 * window.api.flow* reachable end-to-end at the IPC layer.
 */

import { ipcMain, shell } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '../../../shared/ipc-contract';
import type { FlowRoute, ConnectedProbeResult } from '../../../shared/ipc-contract';
import { enterFlow, resumeFlow } from '../orchestrator/flow';
import { runConnectedProbe, deriveAddress } from '../orchestrator/connected-probe';
import { logSafe } from '../log';

// Per-handler payload schemas (mirror cf.ipc.ts:47-56 / wsl.ipc.ts:69-78).
// NoPayload = z.undefined() still runs on every no-arg handler as defense in
// depth (IN-04) — a hostile renderer's stray payload is BRANCHED on, never
// silently discarded.
const NoPayload = z.undefined();
const FlowOpenExternalPayload = z.object({ target: z.enum(['support']) });

const SUPPORT_URL = 'https://livinity.io/support';

// The schema-valid safe FlowRoute every flow:enter/flow:resume degrade path
// returns — mirrors flow.ts's own SAFE_DEFAULT exactly (a non-destructive
// verify entry, never a false live-success/cf-wizard).
const SAFE_DEFAULT_ROUTE: FlowRoute = { kind: 'wsl-detect', resume: false };

// The honest "not yet" ConnectedProbeResult every flow:connectedCheck
// degrade path returns — never a false 'connected'.
const SAFE_DEFAULT_PROBE: ConnectedProbeResult = { kind: 'still-confirming', address: null };

export function registerFlowIpc(): void {
  // flow:enter — resume-point compute on a wizard entry (replaces
  // enterWslWizard's blind jump into wsl-wizard, 05-09). A malformed payload
  // never reaches enterFlow; a thrown collaborator degrades to
  // SAFE_DEFAULT_ROUTE — never a false live-success.
  ipcMain.handle(CHANNELS.flowEnter, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return SAFE_DEFAULT_ROUTE;
    }
    try {
      return await enterFlow();
    } catch {
      logSafe('flow.enter', { exception: true });
      return SAFE_DEFAULT_ROUTE;
    }
  });

  // flow:resume — resume-point compute on app launch (D-09). resumeFlow
  // itself may resolve `null` (genuinely nothing to resume — the renderer's
  // normal auth route); a malformed payload or a thrown collaborator instead
  // degrades to SAFE_DEFAULT_ROUTE (the same non-destructive verify entry
  // flow:enter uses on a handler-level failure) — never null on an error, so
  // a boundary fault never silently masquerades as "nothing to resume".
  ipcMain.handle(CHANNELS.flowResume, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return SAFE_DEFAULT_ROUTE;
    }
    try {
      return await resumeFlow();
    } catch {
      logSafe('flow.resume', { exception: true });
      return SAFE_DEFAULT_ROUTE;
    }
  });

  // flow:connectedCheck — runs the D-05 three-probe "connected" verdict
  // (bounded retry entirely inside runConnectedProbe). A malformed payload or
  // a thrown collaborator degrades to SAFE_DEFAULT_PROBE — never a false
  // 'connected'.
  ipcMain.handle(CHANNELS.flowConnectedCheck, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) {
      return SAFE_DEFAULT_PROBE;
    }
    try {
      return await runConnectedProbe();
    } catch {
      logSafe('flow.connectedCheck', { exception: true });
      return SAFE_DEFAULT_PROBE;
    }
  });

  // flow:openBox — derives the box address MAIN-SIDE via connected-probe.ts's
  // deriveAddress (state subLabel/zoneName, else session username via
  // getMe — the SAME reader flow.ts's own signal-gathering uses); NEVER
  // trusts a renderer-supplied URL (T-05-06, T-03-15 lineage — this handler
  // takes no payload at all, so a renderer URL is structurally unreachable).
  // shell.openExternal is only ever called with a resolved, valid address.
  ipcMain.handle(CHANNELS.flowOpenBox, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      const address = await deriveAddress();
      if (!address) {
        logSafe('flow.openBox', { opened: false });
        return;
      }
      logSafe('flow.openBox', { opened: true });
      await shell.openExternal(`https://${address}`);
    } catch {
      logSafe('flow.openBox', { exception: true });
    }
  });

  // flow:openExternal — enum-allowlisted (mirrors cf:openExternal/
  // wsl:openExternal). The renderer sends the single fixed enum target
  // 'support'; the handler maps it to a frozen support URL. A raw renderer-
  // supplied URL can NEVER reach shell.openExternal (the schema admits no
  // URL string at all).
  ipcMain.handle(CHANNELS.flowOpenExternal, async (_event, raw: unknown) => {
    const parsed = FlowOpenExternalPayload.safeParse(raw);
    if (!parsed.success) return;

    logSafe('flow.openExternal', { target: parsed.data.target });
    try {
      await shell.openExternal(SUPPORT_URL);
    } catch {
      logSafe('flow.openExternal', { exception: true });
    }
  });
}
