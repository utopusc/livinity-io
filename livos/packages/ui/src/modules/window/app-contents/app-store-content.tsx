import React, {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {AvailableAppsProvider} from '@/providers/available-apps'
import {useWindowRouter, WindowRouterProvider} from '@/providers/window-router'

// Lazy load route components
const AppStoreLayout = React.lazy(() => import('./app-store-routes/app-store-layout-window'))
const AppPageWindow = React.lazy(() => import('./app-store-routes/app-page-window'))
const CategoryPageWindow = React.lazy(() => import('./app-store-routes/category-page-window'))
const DiscoverWindow = React.lazy(() => import('./app-store-routes/discover-window'))

type AppStoreWindowContentProps = {
	initialRoute: string
}

export default function AppStoreWindowContent({initialRoute}: AppStoreWindowContentProps) {
	// Convert route to window-local route (remove /app-store prefix if present)
	const localRoute = initialRoute.startsWith('/app-store')
		? initialRoute.replace('/app-store', '') || '/'
		: initialRoute

	return (
		<AvailableAppsProvider>
			<WindowRouterProvider initialRoute={localRoute}>
				<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
					<Suspense fallback={<Loading />}>
						<AppStoreWindowRouter />
					</Suspense>
				</ErrorBoundary>
			</WindowRouterProvider>
		</AvailableAppsProvider>
	)
}

function AppStoreWindowRouter() {
	const {currentRoute} = useWindowRouter()

	// Route matching for app store
	// /app-store/:appId -> /:appId
	// /app-store/category/:categoryId -> /category/:categoryId
	// /app-store -> /

	// Match /:appId (but not /category/...)
	const appIdMatch = currentRoute.match(/^\/([^/]+)$/)
	const isAppPage = appIdMatch && appIdMatch[1] !== 'category'

	// Match /category/:categoryId
	const categoryMatch = currentRoute.match(/^\/category\/([^/]+)/)

	return (
		<AppStoreLayout>
			{isAppPage ? (
				<AppPageWindow appId={appIdMatch[1]} />
			) : categoryMatch ? (
				<CategoryPageWindow categoryId={categoryMatch[1]} />
			) : (
				<DiscoverWindow />
			)}
		</AppStoreLayout>
	)
}
