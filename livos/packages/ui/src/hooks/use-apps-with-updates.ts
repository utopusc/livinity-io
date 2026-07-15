import {useApps} from '@/providers/apps'
import {useAllAvailableApps} from '@/providers/available-apps'

export function useAppsWithUpdates() {
	const apps = useApps()
	const availableApps = useAllAvailableApps()

	// NOTE: a parent should have the apps loaded before we get here, but don't wanna assume
	if (apps.isLoading || availableApps.isLoading) {
		return {
			appsWithUpdates: [],
			isLoading: true,
		} as const
	}

	const appsWithUpdates = (apps.userApps ?? [])
		.filter((app) => {
			const availableApp = availableApps.appsKeyed[app.id]
			// D-05: a pinned app (ignoredVersion === the available version) is skipped so it never
			// appears in the Updates dialog (mirror filter lives in use-update-all-apps).
			return availableApp && availableApp.version !== app.version && app.ignoredVersion !== availableApp.version
		})
		.map((app) => availableApps.appsKeyed[app.id])

	return {appsWithUpdates, isLoading: apps.isLoading || availableApps.isLoading} as const
}
