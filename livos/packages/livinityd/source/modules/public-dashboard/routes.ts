// livos/packages/livinityd/source/modules/public-dashboard/routes.ts
//
// Phase 345-03 (GUEST-01, D-345-4/5/6/7) — the anonymous public-dashboard tRPC
// surface. Namespace `publicDashboard.*` (distinct from the authenticated
// invite-based role:'guest' tier — GUEST-01 is a NO-LOGIN visitor).
//
// get       (publicProcedure query)  — ANONYMOUS. Default-OFF (store key missing
//   or enabled!==true) → returns {enabled:false} and NOTHING else. When enabled,
//   returns a PURPOSE-BUILT, provably leak-free payload: {enabled:true, title?,
//   apps:[{name,icon,url}], links:[{label,url}]}. Built from ctx.apps.instances
//   via curatePublicDashboard — NEVER the flat apps.list shape (which carries
//   secret fields). 258-forbidden + per-user instances excluded.
// getConfig (adminProcedure query)   — raw stored config for the admin section (345-04).
// setConfig (adminProcedure mutation)— persist the box-global config (admin-only —
//   public exposure is a box-security decision, D-345-6).
//
// 🔴 SECURITY-SENSITIVE. Every returned app field is enumerated + field-exact.

import {z} from 'zod'

import {adminProcedure, publicProcedure, router} from '../server/trpc/trpc.js'
import {getBuiltinApp} from '../apps/builtin-apps.js'
import {isPublicForbidden} from '../apps/public-forbidden.js'
import {appIdOwner} from '../domain/caddy.js'
import {
	curatePublicDashboard,
	sanitizeLinks,
	type PublicDashboardCandidate,
} from './curate.js'

// The empty/default config — returned shape when the admin never enabled the page.
const EMPTY_PUBLIC_DASHBOARD = {enabled: false as const, title: undefined as string | undefined, links: [] as {label: string; url: string}[]}

export default router({
	// ANONYMOUS. publicProcedure = no auth. `/trpc` is already on APEX_PUBLIC_PREFIXES,
	// so this is reachable pre-login WITHOUT any apex change (the /public GET prefix is
	// only so the SPA shell page loads for a logged-out browser).
	get: publicProcedure.query(async ({ctx}) => {
		const config = await ctx.livinityd!.store.get('publicDashboard')
		// Default-OFF leaks NOTHING — a missing key or enabled!==true returns just {enabled:false}.
		if (!config || config.enabled !== true) {
			return {enabled: false as const}
		}

		// Build a PURPOSE-BUILT candidate list from the flat instances — resolving ONLY
		// non-secret facts per app. We NEVER spread an App or an apps.list row (those
		// carry credentials/env/state), so a forgotten filter still cannot leak a secret.
		const subdomainMap = new Map<string, {host?: string; subdomain: string}>()
		try {
			for (const s of await ctx.apps!.getAllSubdomains()) {
				subdomainMap.set(s.appId, {host: s.host, subdomain: s.subdomain})
			}
		} catch (error) {
			ctx.logger?.error?.('publicDashboard.get: failed to read subdomains', error)
		}

		const candidates: PublicDashboardCandidate[] = []
		for (const app of ctx.apps!.instances) {
			try {
				// undefined/false ⇒ not opted in — skip the expensive manifest/forbidden reads.
				const showOnPublicDashboard = (await app.getShowOnPublicDashboard()) === true
				if (!showOnPublicDashboard) continue

				const manifest = await app.readManifest()
				const name = manifest.name
				const icon = manifest.icon ?? getBuiltinApp(app.id)?.icon ?? ''

				// Private per-user instance ⇒ never publish (D-345-6).
				const isPerUser = appIdOwner(app.id) !== null

				// 258 never-public class ⇒ exclude (D-345-7 default).
				let forbidden = true // fail-closed: if the signal read throws, treat as forbidden
				try {
					const {signals} = await ctx.apps!.getPublicForbiddenSignals(app.id)
					forbidden = isPublicForbidden(signals).forbidden
				} catch (error) {
					ctx.logger?.error?.(`publicDashboard.get: forbidden-signal read failed for ${app.id}`, error)
				}

				// URL = the canonical FQDN of the app's subdomain (https://). No host ⇒ no url ⇒
				// curation excludes it (nothing to link).
				const sd = subdomainMap.get(app.id)
				const url = sd?.host ? `https://${sd.host}` : undefined

				candidates.push({id: app.id, name, icon, url, showOnPublicDashboard, forbidden, isPerUser})
			} catch (error) {
				// One bad app must never 500 the whole public page — log + skip.
				ctx.logger?.error?.(`publicDashboard.get: candidate build failed for ${app.id}`, error)
			}
		}

		return {
			enabled: true as const,
			title: typeof config.title === 'string' && config.title.trim() ? config.title.trim() : undefined,
			apps: curatePublicDashboard(candidates),
			links: sanitizeLinks(config.links),
		}
	}),

	// ADMIN — raw stored config for the Public-dashboard admin section (345-04).
	getConfig: adminProcedure.query(async ({ctx}) => {
		const config = await ctx.livinityd!.store.get('publicDashboard')
		if (!config) return EMPTY_PUBLIC_DASHBOARD
		return {
			enabled: config.enabled === true,
			title: config.title,
			links: Array.isArray(config.links) ? config.links : [],
		}
	}),

	// ADMIN — persist the box-global config (D-345-6). sanitizeLinks re-applied server-side
	// so the stored config can never become a leak/abuse vector regardless of client input.
	setConfig: adminProcedure
		.input(
			z.object({
				enabled: z.boolean(),
				title: z.string().max(120).optional(),
				links: z
					.array(z.object({label: z.string().max(80), url: z.string().max(2048)}))
					.max(20),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const title = input.title?.trim() ? input.title.trim() : undefined
			const links = sanitizeLinks(input.links)
			await ctx.livinityd!.store.getWriteLock(async ({set}) => {
				await set('publicDashboard', {enabled: input.enabled, title, links})
			})
			return {ok: true as const}
		}),
})
