/**
 * Phase 101-03 — Native-app config schema + Redis CRUD store.
 *
 * Provides:
 *   - `nativeAppConfigSchema`: zod schema that enforces T-101-02 (binary
 *     injection / preload-library) mitigations at the trust boundary:
 *       - binaryPath must be an absolute path with no shell metachars
 *       - args (if any) must be free of shell metachars (defense in depth
 *         even though we never pass through a shell)
 *       - env keys may not start with `LD_` or `DYLD_` (rejects LD_PRELOAD,
 *         DYLD_INSERT_LIBRARIES, and friends — classic preload-library
 *         injection vectors)
 *   - `NativeAppConfigStore`: persistent storage at Redis namespace
 *     `liv:apps:native:<uuid>` (D-101-NATIVE-APPS). UUID-keyed, single
 *     JSON-encoded value per config. Mirrors the existing
 *     `liv:apps:webapp:*` shape.
 *
 * The store publishes `liv:config:updated` on every upsert/delete so the
 * subscribers in liv-core (and any future MCP reconcilers) can react —
 * same convention as McpConfigManager.saveAndPublish (agent-runs.ts).
 *
 * Threat model: see 101-03-PLAN.md `<threat_model>` row T-101-02. The schema
 * here is the FIRST line of defense (tRPC route boundary). The spawner in
 * `native-app-spawner.ts` re-parses the same schema at spawn time
 * (defense in depth — never trust persisted Redis values blindly).
 */

import {z} from 'zod'

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Absolute-path regex. Must begin with `/`. Allowed characters: letters,
 * digits, underscore, hyphen, dot, forward slash. Explicitly excludes all
 * shell metacharacters (`; & | $ ` < > ( ) { } \\` etc.) so we are safe even
 * if a downstream caller accidentally passes the value through a shell.
 *
 * Whitespace is intentionally excluded — Unix binary names with spaces are
 * exceedingly rare, and accepting them widens the shell-quoting attack
 * surface for a pure correctness gain we don't need.
 */
const ABSOLUTE_PATH_RE = /^\/[a-zA-Z0-9_\-./]+$/

/**
 * Shell-metachar blocklist for argv entries. Spaces ARE allowed (some app
 * args are sentence-like, e.g. `--message='hello world'`) but the explicit
 * shell-injection vectors are not.
 */
const SHELL_METACHAR_RE = /^[^;&|`$<>(){}\\]*$/

/**
 * Preload-library env vectors. LD_PRELOAD (glibc) and DYLD_INSERT_LIBRARIES
 * (Darwin) are the classic shared-library injection mechanism. We block the
 * entire LD_ and DYLD_ prefix because all variants in the family pose the
 * same risk (LD_LIBRARY_PATH, LD_AUDIT, LD_BIND_NOW, DYLD_FORCE_FLAT_NAMESPACE,
 * etc.).
 */
const PRELOAD_ENV_RE = /^(LD_|DYLD_)/

/**
 * Phase 203-10 widening: iconUrl accepts either a full http(s) URL OR a
 * root-relative path (e.g. `/liv-ai-app/icons/liv-ai-placeholder.svg`).
 * OpenUI apps register desktop icons via `registerOpenUiAppAsDesktopIcon`
 * which passes a root-relative path served by the openclaw gateway under
 * Caddy's `/liv-ai-app/*` reverse proxy. Existing callers passing full
 * `https://example.com/icon.svg` URLs remain valid (additive change).
 */
const ROOT_RELATIVE_PATH_RE = /^\/[A-Za-z0-9_\-./]*$/

export const nativeAppConfigSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(64),
	iconUrl: z
		.string()
		.refine(
			(v) => {
				if (v.startsWith('/')) return ROOT_RELATIVE_PATH_RE.test(v)
				try {
					// Re-use zod's URL gate without recursing the schema.
					new URL(v)
					return true
				} catch {
					return false
				}
			},
			{message: 'iconUrl must be a URL or a root-relative path'},
		)
		.optional(),
	binaryPath: z
		.string()
		.regex(ABSOLUTE_PATH_RE, 'binaryPath must be an absolute path with no shell metachars'),
	args: z
		.array(z.string().regex(SHELL_METACHAR_RE, 'arg contains shell metachars'))
		.max(32)
		.optional(),
	env: z
		.record(z.string())
		.optional()
		.refine(
			(env) => !env || !Object.keys(env).some((k) => PRELOAD_ENV_RE.test(k)),
			{message: 'LD_* and DYLD_* env keys not allowed (preload-library injection)'},
		),
	wmClassHint: z.string().regex(/^[\w-]{1,64}$/).optional(),
})

export type NativeAppConfig = z.infer<typeof nativeAppConfigSchema>

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * Minimal Redis surface NativeAppConfigStore depends on. Production code
 * passes an `ioredis` Redis instance; tests pass a Map-backed fake (see
 * native-app-config.test.ts). Keeping this interface narrow lets us avoid
 * a hard dependency on `ioredis` in the test file and matches the
 * `RedisLike` convention used elsewhere in this package (e.g.
 * seed-builtin-tools.ts).
 */
export interface RedisLike {
	set(key: string, value: string): Promise<string | 'OK' | null>
	get(key: string): Promise<string | null>
	del(key: string): Promise<number>
	keys(pattern: string): Promise<string[]>
	publish(channel: string, message: string): Promise<number>
}

const REDIS_NS = 'liv:apps:native'
const REDIS_CHANNEL = 'liv:config:updated'

export class NativeAppConfigStore {
	constructor(private readonly redis: RedisLike) {}

	private key(id: string): string {
		return `${REDIS_NS}:${id}`
	}

	/**
	 * Upsert a config. Re-parses through the schema first — this is the
	 * authoritative gate at the persistence boundary. tRPC routes also
	 * re-parse at the route boundary; both layers must agree.
	 */
	async upsert(cfg: NativeAppConfig): Promise<void> {
		const parsed = nativeAppConfigSchema.parse(cfg)
		await this.redis.set(this.key(parsed.id), JSON.stringify(parsed))
		await this.redis.publish(
			REDIS_CHANNEL,
			JSON.stringify({kind: 'native-app', id: parsed.id, op: 'upsert'}),
		)
	}

	/**
	 * Get a single config by UUID. Returns null when the key is absent OR
	 * when the persisted value fails schema parse (defense in depth — a
	 * corrupt Redis entry should not crash callers; the caller treats null
	 * as "no such config" and the corrupt entry is left for an operator to
	 * inspect via redis-cli).
	 */
	async get(id: string): Promise<NativeAppConfig | null> {
		const raw = await this.redis.get(this.key(id))
		if (!raw) return null
		try {
			return nativeAppConfigSchema.parse(JSON.parse(raw))
		} catch {
			return null
		}
	}

	/**
	 * List every config in the `liv:apps:native:*` namespace. Corrupt entries
	 * (schema-parse failures) are silently skipped — same rationale as get().
	 */
	async list(): Promise<NativeAppConfig[]> {
		const keys = await this.redis.keys(`${REDIS_NS}:*`)
		if (keys.length === 0) return []
		const values = await Promise.all(keys.map((k) => this.redis.get(k)))
		const out: NativeAppConfig[] = []
		for (const v of values) {
			if (!v) continue
			try {
				out.push(nativeAppConfigSchema.parse(JSON.parse(v)))
			} catch {
				/* skip corrupt */
			}
		}
		return out
	}

	/**
	 * Delete by UUID. Returns true if the key was present + removed,
	 * false if it was already absent (idempotent — repeat deletes are safe).
	 * Only publishes the `delete` event when something actually changed,
	 * so subscribers don't process spurious deletes.
	 */
	async delete(id: string): Promise<boolean> {
		const n = await this.redis.del(this.key(id))
		if (n > 0) {
			await this.redis.publish(
				REDIS_CHANNEL,
				JSON.stringify({kind: 'native-app', id, op: 'delete'}),
			)
			return true
		}
		return false
	}
}
