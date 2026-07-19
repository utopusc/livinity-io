// livos/packages/livinityd/source/modules/public-dashboard/curate.ts
//
// Phase 345-03 (GUEST-01, D-345-5/6/7) — the SINGLE, PURE, provably leak-free
// curation for the anonymous public dashboard. The publicDashboard.get
// publicProcedure (routes.ts) builds a PURPOSE-BUILT candidate list from
// ctx.apps.instances and hands it here; the anonymous internet reads whatever
// this returns.
//
// 🔴 SECURITY-SENSITIVE. The core guarantee is STRUCTURAL, not a filter:
//   `PublicDashboardCandidate` DELIBERATELY carries NO secret-bearing field
//   (no credentials / environmentOverrides / meteredKeyId / immichApiKeyEnc /
//   oidcLastProvision / internal state / the raw apps.instances shape). It holds
//   ONLY {id, name, icon, url?, showOnPublicDashboard, forbidden, isPerUser}.
//   Because the input TYPE has no secret field, curatePublicDashboard physically
//   CANNOT project one — a future edit that forgets a filter still cannot leak a
//   secret, since the secret never entered this module's type surface. The output
//   is the FIXED shape {name, icon, url}. This is why the router must NEVER reuse
//   the flat apps.list shape (which carries the sensitive fields): a filter that
//   forgets one leaks; a narrow input type cannot.
//
// PURE module: no Redis, no app instance, no livinityd import, no I/O — like
// public-access.ts / public-forbidden.ts. Fully unit-testable in isolation.

/**
 * The DELIBERATELY-NARROW input to curation. It carries ONLY the non-secret facts
 * needed to decide "list this app" and to render {name, icon, url}. It has NO
 * credentials / env / metered / immich / oidc / state / instances field — so the
 * curator cannot leak one even by accident. The router (routes.ts) resolves each
 * field explicitly (name/icon from the manifest, url from the subdomain entry,
 * showOnPublicDashboard from the per-app store, forbidden from isPublicForbidden,
 * isPerUser from appIdOwner) — never by spreading an App or an apps.list row.
 */
export interface PublicDashboardCandidate {
	/** App id — used only for de-dup/logging by the caller; NOT emitted. */
	id: string
	/** Display name (manifest). Emitted. */
	name: string
	/** Icon URL/ref (manifest). Emitted. */
	icon: string
	/** Fully-qualified public URL (https://<host>) or undefined when the app has no subdomain. */
	url?: string
	/** Admin toggled this app onto the public dashboard (D-345-6). Default OFF. */
	showOnPublicDashboard: boolean
	/** 258-forbidden (never-public class). EXCLUDE even if toggled on (D-345-7 default). */
	forbidden: boolean
	/** Private per-user instance (appIdOwner(id) != null). EXCLUDE — never publish a member's private app (D-345-6). */
	isPerUser: boolean
}

/**
 * The EXACT output shape the anonymous endpoint returns per app. Three fields,
 * nothing else. A test asserts Object.keys === ['name','icon','url'].
 */
export interface PublicDashboardApp {
	name: string
	icon: string
	url: string
}

/**
 * Curate the anonymous app list. Includes an app IFF ALL hold:
 *   - showOnPublicDashboard === true   (admin explicitly opted it in — D-345-6)
 *   - !forbidden                       (258-forbidden apps excluded — D-345-7 default)
 *   - !isPerUser                       (private per-user instances excluded — D-345-6)
 *   - !!url                            (no subdomain ⇒ nothing to link — D-345-5)
 * Each included app is projected to EXACTLY {name, icon, url}. No other field can
 * appear because the input type carries no other field.
 */
export function curatePublicDashboard(candidates: PublicDashboardCandidate[]): PublicDashboardApp[] {
	const out: PublicDashboardApp[] = []
	for (const c of candidates) {
		if (!c.showOnPublicDashboard) continue // not opted in by the admin
		if (c.forbidden) continue // 258 never-public class
		if (c.isPerUser) continue // private per-user instance
		if (!c.url) continue // no subdomain → nothing to link
		// FIELD-EXACT projection — the ONLY three keys ever emitted.
		out.push({name: c.name, icon: c.icon, url: c.url})
	}
	return out
}

/** One admin-curated free-form link on the public dashboard. */
export interface PublicDashboardLink {
	label: string
	url: string
}

/** Max admin free-form links — a config cannot become an unbounded leak/DoS vector. */
export const MAX_PUBLIC_LINKS = 20

/**
 * Sanitize the admin free-form links: trim both fields, drop any entry with an
 * empty label or url, and cap the count at MAX_PUBLIC_LINKS. Returns EXACTLY
 * {label, url} entries (no extra key can survive). The 345-04 UI renders these as
 * text/href only (no HTML), so this + the cap is the leak/abuse interlock (T-345-10).
 */
export function sanitizeLinks(links: PublicDashboardLink[] | undefined | null): PublicDashboardLink[] {
	if (!Array.isArray(links)) return []
	const out: PublicDashboardLink[] = []
	for (const l of links) {
		if (!l || typeof l !== 'object') continue
		const label = typeof l.label === 'string' ? l.label.trim() : ''
		const url = typeof l.url === 'string' ? l.url.trim() : ''
		if (!label || !url) continue // drop empty
		out.push({label, url})
		if (out.length >= MAX_PUBLIC_LINKS) break // cap
	}
	return out
}
