// Phase 269-03 Task 1 (WS3) — the PURE join/filter behind the auth-gated
// AionUi agent list.
//
// AionUi's /api/agents lists EVERY installed CLI regardless of LivOS auth
// state, so an unauthed CLI shows in the picker as "ready" and then fails in
// chat (operator: "CLI auth'lu degil ise neden gozukuyor main sayfada?"). This
// module joins AionUi's list against the LivOS `liv:cli:auth:<name>` status and
// FILTERS the ones that are definitely not signed in.
//
// Design constraints (RESEARCH §WS3 + the plan must_haves):
//   - The join uses BIN_TO_CLI_NAME, the EXACT inversion of CLI_BIN_NAMES (one
//     drift-locked source of truth — never a second hand-written map).
//   - "ready/authed" = AionUi `available && enabled` AND the auth status is NOT
//     'failed'. We do NOT gate on `=== 'ok'` alone: the `liv:cli:auth:<name>`
//     key has a 3600s TTL, so an hour after a successful login it EXPIRES and
//     `=== 'ok'` would wrongly re-hide a still-working agent (pitfall P-2). The
//     POSITIVE 'ok' signal is weak; the NEGATIVE 'failed' signal is the only
//     reliable "definitely not signed in" marker. So key-ABSENCE means "kept".
//   - aion-cli (binary_name 'aion') is AionUi's built-in 'aionrs' agent. Per
//     operator request (269.1) it is hidden UNCONDITIONALLY — it must never
//     appear in the Liv AI picker (even on the fail-open path). update.sh sets
//     the default selected agent to Claude Code, so hiding aion never strands
//     the chat.
//   - An agent whose binary_name is not in BIN_TO_CLI_NAME is a non-LivOS agent
//     the operator added manually — we show what we don't manage (assumption A3).
//   - FAIL-OPEN (pitfall P-3): the I/O caller (the Express overlay route, Task 3)
//     passes `authMap = null` when Redis is unavailable; we then return the
//     AionUi list VERBATIM. Hiding is a UX nicety — never break the picker.
//
// This module is PURE (no fetch, no Redis) so it is fully unit-testable; the
// Express route does the I/O and calls buildAgentsOverlay.

import {CLI_BIN_NAMES} from './install-scripts.js'
import type {CliName} from './types.js'

/**
 * Inverse of `CLI_BIN_NAMES` (`CliName -> bin`) built at module load — maps the
 * AionUi `binary_name`/`backend` short-name back to the LivOS `CliName` used in
 * the `liv:cli:auth:<CliName>` Redis key. Built by inversion so it can NEVER
 * drift from the single source of truth in install-scripts.ts.
 */
export const BIN_TO_CLI_NAME: Readonly<Record<string, CliName>> = Object.fromEntries(
	(Object.entries(CLI_BIN_NAMES) as Array<[CliName, string]>).map(([cli, bin]) => [bin, cli]),
) as Record<string, CliName>

// AionUi's built-in Aion agent is hidden unconditionally (operator 269.1). It is
// an INTERNAL agent — agent_type 'aionrs', agent_source 'internal' — with NO
// binary_name (agent_source_info is {}). The original 269.1 predicate matched
// `binary_name === 'aion'`, which NEVER matched this shape, so Aion was never
// actually hidden (caught in Phase 270 live-UAT: it stayed the default-selected
// agent and 404'd on /api/fs/browse). Match the real internal-agent shape below.
const AION_BINARY_NAME = 'aion'
const AION_AGENT_TYPE = 'aionrs'

/**
 * The subset of AionUi's /api/agents agent object that the overlay reads.
 * Extra fields AionUi returns are preserved verbatim on the object (we never
 * reconstruct the agent — we keep or drop it).
 */
export interface AionuiAgent {
	backend?: string
	agent_source_info?: {binary_name?: string} | null
	available?: boolean
	enabled?: boolean
	// AionUi's built-in Aion agent is identified by agent_type 'aionrs' (it has NO
	// binary_name — see isAionAgent). Declared so the predicate is type-clean.
	agent_type?: string
	agent_source?: string
	name?: string
	// AionUi ships more (icon, name, …); kept as-is on the object.
	[key: string]: unknown
}

/** `'filter'` (default — hide unauthed) or `'badge'` (annotate; future picker pass). */
export type OverlayMode = 'filter' | 'badge'

/** Resolve an agent's binary_name (preferring agent_source_info, then backend). */
function binaryNameOf(a: AionuiAgent): string {
	return a.agent_source_info?.binary_name ?? a.backend ?? ''
}

/**
 * True when the agent is AionUi's built-in Aion agent, however AionUi shapes it.
 * Primary signal is `agent_type === 'aionrs'` (the internal agent has NO
 * binary_name); the binary_name fallback keeps backward-compat with any shape
 * that ever reports it as a 'aion' CLI.
 */
function isAionAgent(a: AionuiAgent): boolean {
	return a.agent_type === AION_AGENT_TYPE || binaryNameOf(a) === AION_BINARY_NAME
}

/**
 * Is this agent presented as READY (usable) given AionUi's own flags + the
 * LivOS auth status? See the module header for the rule + the TTL gotcha.
 */
function isReady(a: AionuiAgent, authMap: Map<CliName, string>): boolean {
	const bin = binaryNameOf(a)

	// Aion is hidden unconditionally in buildAgentsOverlay (operator 269.1);
	// defensive guard here in case isReady is ever called on it directly.
	if (isAionAgent(a)) return false

	const cliName = BIN_TO_CLI_NAME[bin]
	// Unknown binary_name → a non-LivOS agent we don't manage → keep unfiltered.
	if (!cliName) return true

	// AionUi's own availability is the floor — a CLI it can't run isn't ready.
	if (a.available === false || a.enabled === false) return false

	// The auth status: ONLY the negative 'failed' signal hides. Absence (key
	// expired after the 3600s TTL, or a manual terminal auth) does NOT hide.
	const status = authMap.get(cliName)
	if (status === 'failed') return false

	return true
}

/**
 * Join AionUi's agent list with the LivOS auth statuses and FILTER (or, in
 * 'badge' mode, annotate) the agents that are not signed in.
 *
 * @param aionuiAgents the verbatim list AionUi returned (`/api/agents`).
 * @param authMap      `CliName -> 'ok' | 'failed' | 'running' | …` from Redis,
 *                     or `null` when Redis is unavailable (FAIL-OPEN).
 * @param mode         `'filter'` (default — hide) or `'badge'` (annotate).
 */
export function buildAgentsOverlay(
	aionuiAgents: AionuiAgent[],
	authMap: Map<CliName, string> | null,
	mode: OverlayMode = 'filter',
): AionuiAgent[] {
	// Phase 269.1 (operator request) — Aion CLI is hidden UNCONDITIONALLY. Drop
	// it FIRST, before the fail-open path, so it is gone even when Redis is down.
	// Phase 270 fix: match the internal 'aionrs' agent_type (the original
	// binary_name predicate never matched — Aion has no binary_name).
	const visible = aionuiAgents.filter((a) => !isAionAgent(a))

	// FAIL-OPEN: Redis unavailable → return the (aion-stripped) list VERBATIM so
	// the picker is never emptied by an infra hiccup (P-3).
	if (authMap === null) return visible

	if (mode === 'badge') {
		// Annotate each agent with a `liv_not_authed` flag; never hide. This is
		// the future vendored-picker pass — the route ships 'filter' today.
		return visible.map((a) =>
			isReady(a, authMap) ? a : {...a, liv_not_authed: true},
		)
	}

	return visible.filter((a) => isReady(a, authMap))
}
