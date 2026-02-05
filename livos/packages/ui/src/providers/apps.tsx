import {createContext, useContext} from 'react'
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
		icon: '/figma-exports/dock-files.png',
		systemApp: true,
		systemAppTo: '/files/Home',
	},
	{
		id: 'LIVINITY_settings',
		name: 'Settings',
		icon: '/figma-exports/dock-settings.png',
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
	// LivOS AI pages
	{
		id: 'LIVINITY_ai-chat',
		name: 'AI Chat',
		icon: '/figma-exports/dock-home.png',
		systemApp: true,
		systemAppTo: '/ai-chat',
	},
	{
		id: 'LIVINITY_server-control',
		name: 'Server',
		icon: '/figma-exports/dock-live-usage.png',
		systemApp: true,
		systemAppTo: '/server-control',
	},
	{
		id: 'LIVINITY_subagents',
		name: 'Agents',
		icon: '/figma-exports/dock-settings.png',
		systemApp: true,
		systemAppTo: '/subagents',
	},
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
		icon: '/figma-exports/dock-settings.png',
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
}
const AppsContext = createContext<AppsContextT | null>(null)

export function AppsProvider({children}: {children: React.ReactNode}) {
	const appsQ = trpcReact.apps.list.useQuery()

	// Remove apps that have an error
	// TODO: consider passing these down in some places (like the desktop)
	const userApps = filter(appsQ.data ?? [], (app): app is UserApp => !('error' in app))
	const userAppsKeyed = keyBy(userApps, 'id')

	const allApps = [...userApps, ...systemApps]
	const allAppsKeyed = keyBy(allApps, 'id')

	return (
		<AppsContext.Provider
			value={{
				userApps,
				userAppsKeyed,
				systemApps,
				systemAppsKeyed,
				allApps,
				allAppsKeyed,
				isLoading: appsQ.isLoading,
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
