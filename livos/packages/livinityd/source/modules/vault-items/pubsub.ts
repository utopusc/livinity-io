// Phase 171-05 — ItemStore PubSub wrapper (v38 D-V38-C).
//
// Publishes `liv:tree:updated` JSON envelope on every mutation. Best-effort —
// pub/sub failures are logged, never thrown. Mirrors the Phase 168-04 cc-pty
// manager.ts:243-255 + 281-291 "best-effort publish" pattern verbatim so the
// failure semantics stay consistent across the v38 backplane.
//
// Surface: createItemStorePubSub(store, redis, logger) returns an object that
// has the IDENTICAL public method shape as ItemStore. Read operations
// (`read`, `list`, `itemDir`) pass through unchanged. Mutations
// (`create`, `update`, `archive`, `unarchive`, `delete`) await the underlying
// mutation first, then enqueue a fire-and-forget Redis publish — the
// mutation result still propagates to the caller even if Redis is offline.
//
// Threat model:
//   T-171-05-01 (DoS via Redis outage):     mitigated — publish failures swallowed
//   T-171-05-02 (info disclosure):          accept — payload is metadata only
//                                            (type + itemId + timestamp; no PII)
//   T-171-05-03 (delete=false false signal): mitigated — publish gated on truthy
//                                            return from underlying store.delete
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f (historical;
// current `liv/packages/core/src/sdk-agent-runner.ts` retains the v77+ value
// per MEMORY.md retirement note) + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph backend
// + Phase 171-01 types.ts / vault-root-resolver.ts
// + Phase 171-02 item-store.ts
// + Phase 171-03 tree-resolver.ts
// all UNCHANGED. This NEW file owns the v38 vault pub/sub bridge concern only.

import type {Redis} from 'ioredis'
import type {Item} from './types.js'
import type {ItemStore, CreateInput, ListOptions} from './item-store.js'

// ─── Public surface ──────────────────────────────────────────────────────

/**
 * Redis pub/sub channel name for vault item tree mutations.
 *
 * Phase 174 sidebar UI will subscribe to this channel for cross-tab
 * invalidation. Channel namespace `liv:tree:*` is reserved for the v38
 * vault-items module — do NOT reuse for unrelated traffic.
 */
export const TREE_UPDATED_CHANNEL = 'liv:tree:updated'

export type TreeUpdateEventType = 'create' | 'update' | 'archive' | 'unarchive' | 'delete'

/**
 * Wire format published on the `liv:tree:updated` channel. Subscribers
 * receive this object as a JSON-encoded string.
 *
 * Payload is metadata only — itemId is a UUID v7 (time-sortable, leaks
 * ~48 bits of insertion timestamp by design per Plan 171-01 T-171-01-02),
 * timestamp is the wall-clock `Date.now()` at the moment of publication.
 * NO item names, NO item contents, NO user-controlled strings.
 */
export interface TreeUpdateEvent {
	type: TreeUpdateEventType
	itemId: string
	timestamp: number
}

/**
 * Logger surface accepted by createItemStorePubSub. Matches the
 * livinityd boot logger shape (cc-pty manager and autonomous scheduler
 * both pass a similar `{log, error}` adapter — see index.ts:629-664).
 */
export interface PubSubLogger {
	log: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

// ─── Internal helpers ────────────────────────────────────────────────────

/**
 * Fire-and-forget publish. Mirrors the cc-pty manager.ts:243-255
 * best-effort pattern: we return immediately, attach a `.catch` so any
 * rejection is swallowed and routed to the logger. The mutation result
 * is therefore NEVER blocked on Redis liveness.
 *
 * Rationale: when Redis is down, the v38 sidebar UI loses real-time
 * invalidation but the underlying filesystem mutation still succeeds —
 * the next manual tree refetch will pick up the change. Throwing here
 * would convert a Redis outage into a vault corruption (the caller has
 * already committed bytes to disk).
 */
function publishBestEffort(
	redis: Redis,
	event: TreeUpdateEvent,
	logger: PubSubLogger,
): void {
	redis
		.publish(TREE_UPDATED_CHANNEL, JSON.stringify(event))
		.catch((err) => logger.error('[vault-items/pubsub] publish failed', err))
}

// ─── Factory ─────────────────────────────────────────────────────────────

/**
 * Wrap an ItemStore so every mutation publishes `liv:tree:updated`. The
 * returned object preserves the IDENTICAL public surface of ItemStore so
 * callers can drop-in replace `new ItemStore(...)` with
 * `createItemStorePubSub(new ItemStore(...), redis, logger)`.
 *
 * Read methods (`read`, `list`, `itemDir`) pass through without publishing.
 *
 * Mutation methods (`create`, `update`, `archive`, `unarchive`, `delete`)
 * AWAIT the underlying mutation first, then enqueue a fire-and-forget
 * publish. The mutation's result propagates to the caller unchanged.
 *
 * `delete` is special-cased: it only publishes when the underlying store
 * actually removed the directory (return value === true). When the item
 * was already gone (return value === false) we suppress the publish to
 * avoid spamming subscribers with no-op deletions.
 *
 * @param store   underlying ItemStore (Plan 171-02). Not modified.
 * @param redis   ioredis client. Caller owns lifecycle (usually `livinityd.ai.redis`).
 * @param logger  receives both informational logs and best-effort publish errors.
 * @returns ItemStore-shaped wrapper.
 */
export function createItemStorePubSub(
	store: ItemStore,
	redis: Redis,
	logger: PubSubLogger,
): ItemStore {
	// We forward each public method explicitly rather than using `new Proxy(...)`
	// because:
	//   1. Explicit forwarding lets tsc verify each method signature against
	//      the ItemStore class surface at compile time.
	//   2. The runtime call sites in plan 171-04's tRPC router are simpler to
	//      reason about — there's no meta-programming surprise.
	//   3. The structural cast `as unknown as ItemStore` bridges the gap
	//      between the plain-object wrapper and the ItemStore class private
	//      field declarations (`writeQueue`, `vaultRoot`) which are not
	//      visible from outside the class. The wrapper does NOT need them
	//      because all state lives in the underlying `store`.
	const wrapper = {
		// ─── Read pass-throughs (no publish) ─────────────────────────────
		read: (id: string): Promise<Item | null> => store.read(id),
		list: (opts?: ListOptions): Promise<Item[]> => store.list(opts),
		itemDir: (id: string): string => store.itemDir(id),

		// ─── Mutations (publish after underlying resolves) ───────────────
		create: async (input: CreateInput): Promise<Item> => {
			const item = await store.create(input)
			publishBestEffort(
				redis,
				{type: 'create', itemId: item.id, timestamp: Date.now()},
				logger,
			)
			return item
		},

		update: async (
			id: string,
			patch: Partial<Omit<Item, 'id' | 'type' | 'createdAt' | 'schemaVersion'>>,
		): Promise<Item> => {
			const item = await store.update(id, patch)
			publishBestEffort(
				redis,
				{type: 'update', itemId: id, timestamp: Date.now()},
				logger,
			)
			return item
		},

		archive: async (id: string): Promise<Item> => {
			const item = await store.archive(id)
			publishBestEffort(
				redis,
				{type: 'archive', itemId: id, timestamp: Date.now()},
				logger,
			)
			return item
		},

		unarchive: async (id: string): Promise<Item> => {
			const item = await store.unarchive(id)
			publishBestEffort(
				redis,
				{type: 'unarchive', itemId: id, timestamp: Date.now()},
				logger,
			)
			return item
		},

		delete: async (id: string): Promise<boolean> => {
			const ok = await store.delete(id)
			if (ok) {
				publishBestEffort(
					redis,
					{type: 'delete', itemId: id, timestamp: Date.now()},
					logger,
				)
			}
			return ok
		},
	}

	// Structural cast: the wrapper exposes the IDENTICAL public surface of
	// ItemStore (all six methods above). The class's `private` fields
	// (`writeQueue`, `vaultRoot`) are not on the wrapper but are also not
	// part of the public contract — callers consuming the returned object
	// see only the public methods. Cast through `unknown` to satisfy
	// strict-mode TS without spreading a brittle `Partial<ItemStore>`.
	return wrapper as unknown as ItemStore
}
