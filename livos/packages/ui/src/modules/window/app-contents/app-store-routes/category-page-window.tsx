import {ErrorBoundary} from 'react-error-boundary'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {categories} from '@/modules/app-store/constants'
import {getCategoryLabel} from '@/modules/app-store/utils'
import {useWindowRouter} from '@/providers/window-router'
import {useAvailableApps} from '@/providers/available-apps'

import {AppsGridFaintSectionWindow} from './shared-components'

type CategoryPageWindowProps = {
	categoryId: string
}

export default function CategoryPageWindow({categoryId}: CategoryPageWindowProps) {
	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<CategoryContent categoryId={categoryId} />
		</ErrorBoundary>
	)
}

function CategoryContent({categoryId}: {categoryId: string}) {
	const {navigate} = useWindowRouter()
	const {appsGroupedByCategory, apps, isLoading} = useAvailableApps()

	if (!categoryId) return null
	if (isLoading) return null

	const actualCategoryId = categoryId === 'discover' || categoryId === 'all' ? null : categoryId

	// Redirect if category is invalid OR if it's valid but has no apps
	const isPredefinedCategory = actualCategoryId ? categories.includes(actualCategoryId as any) : false
	const existsInData = actualCategoryId
		? !!(appsGroupedByCategory as Record<string, any[]>)[actualCategoryId]
		: false
	const hasApps = actualCategoryId
		? (appsGroupedByCategory as Record<string, any[]>)[actualCategoryId]?.length > 0
		: true

	if (actualCategoryId && ((!isPredefinedCategory && !existsInData) || !hasApps)) {
		// Navigate back to discover in window
		navigate('/')
		return null
	}

	const filteredApps = actualCategoryId
		? (appsGroupedByCategory as Record<string, any[]>)[actualCategoryId] || []
		: apps
	const title = getCategoryLabel(categoryId)

	return <AppsGridFaintSectionWindow title={title} apps={filteredApps} />
}
