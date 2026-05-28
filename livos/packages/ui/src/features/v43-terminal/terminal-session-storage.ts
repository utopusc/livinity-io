/**
 * Phase 246-04 — Browser-local tab ↔ server-sessionId map.
 *
 * Storage key shape per CONTEXT D-V44 spec (drift-locked):
 *   `livos.v44.terminal.session.<tabKey>` → <serverSessionId>
 *
 * The prefix is exported as a constant so tests can drift-lock the exact
 * string and so the parent panel can iterate `Object.keys(localStorage)`
 * (via the typed `Storage.key(i)` API) to discover every saved tab on
 * mount. The value at each key is the server-side `sessionId` returned
 * by livinityd in the WS `{type:'ready'|'reattached', sessionId}` frame.
 *
 * Each helper accepts an optional `storage` argument so tests can inject
 * a fake `Storage` implementation without touching the real
 * `window.localStorage`.
 */
export const TERMINAL_SESSION_STORAGE_PREFIX = 'livos.v44.terminal.session.'

function buildKey(tabKey: string): string {
	return TERMINAL_SESSION_STORAGE_PREFIX + tabKey
}

export function readAllTabSessions(
	storage: Pick<Storage, 'key' | 'length' | 'getItem'> = window.localStorage,
): Record<string, string> {
	const out: Record<string, string> = {}
	for (let i = 0; i < storage.length; i++) {
		const fullKey = storage.key(i)
		if (fullKey && fullKey.startsWith(TERMINAL_SESSION_STORAGE_PREFIX)) {
			const tabKey = fullKey.slice(TERMINAL_SESSION_STORAGE_PREFIX.length)
			const sessionId = storage.getItem(fullKey)
			if (sessionId) out[tabKey] = sessionId
		}
	}
	return out
}

export function writeTabSession(
	tabKey: string,
	sessionId: string,
	storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
	storage.setItem(buildKey(tabKey), sessionId)
}

export function removeTabSession(
	tabKey: string,
	storage: Pick<Storage, 'removeItem'> = window.localStorage,
): void {
	storage.removeItem(buildKey(tabKey))
}
