import {createContext, useContext, useMemo} from 'react'
import {filter} from 'remeda'

import {trpcReact, UserApp} from '@/trpc/trpc'
import {keyBy} from '@/utils/misc'

export type AppT = {
	id: string
	name: string
	icon: string
	systemApp?: boolean
	systemAppTo?: string
}

// Phase 94-05 — unified desktop entries for the AppGrid consumer.
// Discriminated union so the grid renderer can pick the right icon
// component without inspecting the row shape.
export type WebAppEntry = {
	id: string
	url: string
	title: string | null
	faviconUrl: string | null
	createdAt: Date | string
}
export type DesktopEntry =
	| {kind: 'app'; app: UserApp}
	| {kind: 'webapp'; webapp: WebAppEntry}

// `LIVINITY_` prefix to make extra clear the distinction between system app IDs and user installable ids.
export const systemApps = [
	{
		id: 'LIVINITY_system',
		name: 'System',
		icon: '/figma-exports/livinity-app.svg',
		systemApp: true,
		systemAppTo: '/',
	},
	// For the dock...
	{
		id: 'LIVINITY_home',
		name: 'Home',
		icon: '/figma-exports/dock-home.png',
		systemApp: true,
		systemAppTo: '/',
	},
	{
		id: 'LIVINITY_files',
		name: 'Files',
		icon: '/figma-exports/dock-files-new.svg',
		systemApp: true,
		systemAppTo: '/files/Home',
	},
	{
		id: 'LIVINITY_settings',
		name: 'Settings',
		icon: '/figma-exports/dock-settings-new.svg',
		systemApp: true,
		systemAppTo: '/settings',
	},
	{
		id: 'LIVINITY_live-usage',
		name: 'Live Usage',
		icon: '/figma-exports/dock-live-usage.png',
		systemApp: true,
		// NOTE: using this will clear existing search params
		// In practice, this means cmdk will clear params and clicking dock icon will not
		systemAppTo: '?dialog=live-usage',
	},
	{
		id: 'LIVINITY_app-store',
		name: 'App Store',
		icon: '/figma-exports/dock-app-store.png',
		systemApp: true,
		systemAppTo: '/app-store',
	},
	// AI Chat app entry removed with AI Chat teardown.
	// Phase 24-01 — replaced the legacy server-control app id with LIVINITY_docker.
	// Final routes/server-control directory delete completed in Phase 27-02.
	{
		id: 'LIVINITY_docker',
		name: 'Docker',
		icon: '/figma-exports/dock-server.svg',
		systemApp: true,
		systemAppTo: '/docker',
	},
	// Phase 30 hot-patch round 11: icon updated from broken dock-settings.png
	// (file did not exist in /figma-exports/) to the sleek dock-server.svg.
	// User wanted a clean settings-style server icon matching the dock aesthetic.
	{
		id: 'LIVINITY_server-control',
		name: 'Server Management',
		icon: '/figma-exports/dock-server.svg',
		systemApp: true,
		systemAppTo: '/server-control',
	},
	{
		id: 'LIVINITY_my-devices',
		name: 'Devices',
		icon: '/figma-exports/dock-settings.png',
		systemApp: true,
		systemAppTo: '/my-devices',
	},
	// LIVINITY_subagents removed — Phase 182-01 (D-V38-M). Sidebar Settings absorbs agents.
	{
		id: 'LIVINITY_schedules',
		name: 'Schedules',
		icon: '/figma-exports/dock-settings.png',
		systemApp: true,
		systemAppTo: '/schedules',
	},
	{
		id: 'LIVINITY_terminal',
		name: 'Terminal',
		icon: '/figma-exports/dock-terminal.svg',
		systemApp: true,
		systemAppTo: '/terminal',
	},
] as const satisfies readonly AppT[]

export const systemAppsKeyed = keyBy(systemApps, 'id')

type AppsContextT = {
	userApps?: UserApp[]
	userAppsKeyed?: Record<string, UserApp>
	// needs to be explicitly readonly so typescript doesn't complain, though all other props are technically readonly too
	systemApps: readonly AppT[]
	systemAppsKeyed: typeof systemAppsKeyed
	allApps: AppT[]
	allAppsKeyed: Record<string, AppT>
	isLoading: boolean
	// Phase 94-05 — persisted user-defined WebApps (paste-a-URL desktop icons).
	webapps: WebAppEntry[]
	// Unified ordered list for the desktop grid: Docker apps first (their
	// existing order), then WebApps by createdAt ASC. Drag-arrange ordering
	// is deferred to v34 (CONTEXT gray-area #order).
	desktopEntries: DesktopEntry[]
}
const AppsContext = createContext<AppsContextT | null>(null)

export function AppsProvider({children}: {children: React.ReactNode}) {
	const appsQ = trpcReact.apps.list.useQuery()
	const myAppsQ = trpcReact.apps.myApps.useQuery()
	// Phase 94-05 — pull the user's persisted WebApp rows. The fetch is
	// fire-and-forget on first render; the desktop grid's loading state is
	// driven by `appsQ` (Docker apps) only, to avoid a late-arriving WebApp
	// list flickering icons in after the desktop has rendered (CONTEXT gray
	// area "Provider's loading state").
	const webappsQ = trpcReact.webapp.list.useQuery(undefined, {
		// Cheap query — keep cache fresh-ish so a delete from another tab
		// reflects soon. Invalidations from create/delete mutations remain
		// the primary refresh path.
		staleTime: 30 * 1000,
		retry: false,
	})

	// Remove apps that have an error
	// TODO: consider passing these down in some places (like the desktop)
	let userApps = filter(appsQ.data ?? [], (app): app is UserApp => !('error' in app))

	// Filter to only show apps the user has access to (installed, shared, or per-user instances)
	if (myAppsQ.data && !myAppsQ.data.globalApps) {
		const perUserAppIds = new Set(myAppsQ.data.userInstances.map((i: any) => i.appId))
		const accessibleAppIds = new Set([
			...myAppsQ.data.sharedAppIds,
			...perUserAppIds,
		])
		userApps = userApps.filter((app) => accessibleAppIds.has(app.id))

		// For per-user instances, override port and subdomain with the user's own values
		if (myAppsQ.data.userInstances.length > 0) {
			userApps = userApps.map((app) => {
				if (!perUserAppIds.has(app.id)) return app
				const inst = myAppsQ.data!.userInstances.find((i: any) => i.appId === app.id)
				if (!inst) return app
				return {
					...app,
					port: inst.port,
					subdomain: inst.subdomain || app.id,
					state: inst.state || app.state,
				} as typeof app
			})
		}
	}

	const userAppsKeyed = keyBy(userApps, 'id')

	const allApps = [...userApps, ...systemApps]
	const allAppsKeyed = keyBy(allApps, 'id')

	// Phase 94-05 — normalize WebApp rows into the discriminated entry shape.
	// Sort ASC by createdAt so newer WebApps appear after older ones (matches
	// CONTEXT gray-area "Order of WebApps in grid"). Memoized so the
	// downstream grid useMemo identity is stable when nothing changed.
	const webapps: WebAppEntry[] = useMemo(() => {
		const rows = webappsQ.data ?? []
		return [...rows]
			.map((row) => ({
				id: row.id,
				url: row.url,
				title: row.title,
				faviconUrl: row.faviconUrl,
				createdAt: row.createdAt,
			}))
			.sort((a, b) => {
				const ta = new Date(a.createdAt).getTime()
				const tb = new Date(b.createdAt).getTime()
				return ta - tb
			})
	}, [webappsQ.data])

	const desktopEntries: DesktopEntry[] = useMemo(() => {
		const appEntries: DesktopEntry[] = userApps.map((app) => ({kind: 'app' as const, app}))
		const webappEntries: DesktopEntry[] = webapps.map((w) => ({kind: 'webapp' as const, webapp: w}))
		return [...appEntries, ...webappEntries]
	}, [userApps, webapps])

	return (
		<AppsContext.Provider
			value={{
				userApps,
				userAppsKeyed,
				systemApps,
				systemAppsKeyed,
				allApps,
				allAppsKeyed,
				// Loading is driven by Docker apps only — WebApps load lazily
				// behind the existing skeleton without flickering icons in late.
				isLoading: appsQ.isLoading,
				webapps,
				desktopEntries,
			}}
		>
			{children}
		</AppsContext.Provider>
	)
}

export function useApps() {
	const ctx = useContext(AppsContext)
	if (!ctx) throw new Error('useApps must be used within AppsProvider')

	return ctx
}

export function useUserApp(id?: string | null) {
	const ctx = useContext(AppsContext)
	if (!ctx) throw new Error('useUserApp must be used within AppsProvider')

	if (!id) return {isLoading: false, app: undefined} as const
	if (ctx.isLoading) return {isLoading: true} as const

	return {
		isLoading: false,
		app: ctx.userAppsKeyed?.[id],
	} as const
}
