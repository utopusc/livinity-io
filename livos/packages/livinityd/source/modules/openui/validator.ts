/**
 * Phase 203-04 — OpenUI Lang whitelist validator (server-side).
 *
 * This file MUST stay byte-identical (modulo the export header comment) to
 * `livos/packages/liv-claw-os/packages/claw-plugin/src/openui-validator.ts`
 * so the plugin's `lint-openui` hook + livinityd's `openclawos.apps.create`
 * tRPC route apply the SAME 14-component whitelist + URL guards.
 *
 * Why duplicated instead of extracted to a workspace package: per Plan 203-04
 * SPIKE + plan_context "we replicate the small validator file in both places
 * (pragmatic; OK for ~80 LOC). Document the duplication in SUMMARY so a future
 * cleanup phase can extract it to a workspace-shared @livos/openui-validator
 * package." A future cleanup phase (203-13 follow-up or v204) may extract
 * this into a workspace package once the pnpm install path on Windows is
 * unblocked (Plan 203-02 deviation).
 *
 * The whitelist mirrors `livos/packages/liv-ai-app/src/lib/openui/
 * openui-components.tsx` (Phase 202-08) which is the on-screen source of
 * truth — anything not renderable there is also not persistable here.
 *
 * Threat mitigations:
 *   T-203-03 — reject components not in the whitelist; reject dangerous URL
 *              schemes (javascript:, vbscript:, file:, about:, data:text/*)
 *              in image.props.src + link.props.href; reject raw HTML / script
 *              passthrough by tree-walking strict component allow-list.
 */

/**
 * The 14 component names allowed in the OpenUI Lang tree the LLM emits via
 * `app_create` / `app_update`. Must match the keys in
 * `liv-ai-app/src/lib/openui/openui-components.tsx`.
 */
export const OPENUI_ALLOWED_COMPONENTS: readonly string[] = [
	'heading',
	'text',
	'paragraph',
	'button',
	'list',
	'card',
	'image',
	'link',
	'divider',
	'layout-stack',
	'layout-row',
	'badge',
	'input',
	'table',
]

const ALLOWED_SET = new Set(OPENUI_ALLOWED_COMPONENTS)

const SAFE_IMG_DATA_PREFIX = /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i
const DANGEROUS_SCHEMES = /^(javascript|vbscript|data|file|about):/i

/**
 * URL safety gate — mirrors `isSafeUrl` in
 * `liv-ai-app/src/lib/openui/openui-components.tsx`.
 *
 *  Accepts: https://, protocol-relative //, root-relative /, fragment #,
 *           data:image/* (only when `allowDataImage = true` is passed).
 *  Rejects: javascript:, vbscript:, file:, about:, plain http:// (forces
 *           secure context for any LLM-emitted URL), data:text/* etc.
 */
export function isSafeUrl(
	value: unknown,
	opts: {allowDataImage?: boolean} = {},
): boolean {
	if (typeof value !== 'string' || value.length === 0) return false
	const v = value.trim()
	if (opts.allowDataImage && SAFE_IMG_DATA_PREFIX.test(v)) return true
	if (DANGEROUS_SCHEMES.test(v)) return false
	if (/^https:\/\//i.test(v)) return true
	if (v.startsWith('//')) return true
	if (v.startsWith('/')) return true
	if (v.startsWith('#')) return true
	return false
}

/** Result type — discriminated union so callers can switch on `ok`. */
export type ValidationResult =
	| {ok: true}
	| {ok: false; reason: string; path?: string}

/**
 * Walk the OpenUI Lang JSON tree rejecting:
 *   - any component whose `type`/`name` (we accept either, since the LLM
 *     output shape varies between the renderer and the lang-core AST) is
 *     not in the 14-entry allow list
 *   - any `image.props.src` failing `isSafeUrl({allowDataImage:true})`
 *   - any `link.props.href` failing `isSafeUrl()`
 *   - any object whose key contains `dangerouslySetInnerHTML` (defensive —
 *     we strip raw HTML pass-through even from props objects to mitigate
 *     accidental React-style XSS vectors)
 *
 * Returns on FIRST failure (don't dig deeper). Callers map the `reason`
 * string to a tRPC `OPENUI_DISALLOWED_COMPONENT` / `OPENUI_UNSAFE_URL` /
 * `OPENUI_RAW_HTML` error code.
 *
 * Recursion depth is unbounded but tree size is implicitly capped by the
 * 2-MB JSON body limit on the tRPC mutation; an attacker cannot inflate a
 * pathological tree past Postgres `TEXT` constraints either.
 */
export function validateOpenUITree(node: unknown, path = '$'): ValidationResult {
	if (node == null) return {ok: true}
	if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
		return {ok: true}
	}
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const r = validateOpenUITree(node[i], `${path}[${i}]`)
			if (!r.ok) return r
		}
		return {ok: true}
	}
	if (typeof node !== 'object') return {ok: true}

	const obj = node as Record<string, unknown>

	// Defensive: reject raw-HTML passthrough props anywhere in the tree.
	if ('dangerouslySetInnerHTML' in obj) {
		return {
			ok: false,
			reason: 'OPENUI_RAW_HTML',
			path,
		}
	}

	// A component node looks like {type: 'card', props: {...}, children: [...]}
	// — but the LLM also sometimes emits {name: 'card', ...}. Accept both shapes.
	const compName =
		typeof obj.type === 'string'
			? obj.type
			: typeof obj.name === 'string'
				? obj.name
				: null

	if (compName !== null) {
		if (!ALLOWED_SET.has(compName)) {
			return {
				ok: false,
				reason: `OPENUI_DISALLOWED_COMPONENT:${compName}`,
				path,
			}
		}
		// URL guards on image.src and link.href.
		const props = (obj.props ?? {}) as Record<string, unknown>
		if (compName === 'image') {
			if (props.src !== undefined && !isSafeUrl(props.src, {allowDataImage: true})) {
				return {ok: false, reason: 'OPENUI_UNSAFE_URL:image.src', path}
			}
		}
		if (compName === 'link') {
			if (props.href !== undefined && !isSafeUrl(props.href)) {
				return {ok: false, reason: 'OPENUI_UNSAFE_URL:link.href', path}
			}
		}
	}

	// Recurse into every value of the object (children, props, layout
	// wrappers, etc.). We do NOT special-case `children` vs `props` — any
	// nested object is walked.
	for (const [key, val] of Object.entries(obj)) {
		if (val && typeof val === 'object') {
			const r = validateOpenUITree(val, `${path}.${key}`)
			if (!r.ok) return r
		}
	}

	return {ok: true}
}
