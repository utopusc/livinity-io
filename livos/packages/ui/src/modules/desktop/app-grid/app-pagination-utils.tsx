import {ReactNode, Ref, useLayoutEffect} from 'react'
import {createBreakpoint, useMeasure} from 'react-use'
import {chunk} from 'remeda'

const useBreakpoint = createBreakpoint({S: 0, M: 640})

type PageT = {
	apps: ReactNode[]
}

// TODO: consider refactoring into two parts:
// 1. container size calculation
// 2. grouping into pages

// NOTE: everything is grouped together because into one hook because everything is using
// the same variables. In the future it'll be more obvious if these vars should come from a context,
// or if there's a config object will hold them and then get passed to functions that need it

/**
 * Calculate which apps will go into which pages based on the returned `pageInnerRef`
 */
export function usePager({apps}: {apps: ReactNode[]}): {
	pages: PageT[]
	pageInnerRef: Ref<HTMLDivElement>
	appsPerRow: number
	hasMeasurement: boolean
} {
	// Using breakpoint instead of measure because max inner page width comes from breakpoint
	const breakpoint = useBreakpoint()
	const [pageInnerRef, pageSize] = useMeasure<HTMLDivElement>()

	const pageW = pageSize.width
	const pageH = pageSize.height

	const responsive = (sizes: number | number[]) => {
		if (typeof sizes === 'number') {
			return sizes
		}
		if (breakpoint === 'S') {
			return sizes[0]
		}
		return sizes[1]
	}

	const paddingX = responsive([10, 32])
	const appsPerRowMax = responsive([4, 6])
	const appW = responsive([70, 120])
	const appH = responsive([90, 110])
	const appXGap = responsive([20, 30])
	const appYGap = responsive([0, 12])

	const appsInnerW = (appW + appXGap) * appsPerRowMax - appXGap
	const appsMaxW = appsInnerW + paddingX * 2

	// Putting on document so that app grid has access
	useLayoutEffect(() => {
		const el = document.documentElement
		el.style.setProperty('--page-w', `${pageW}px`)
		el.style.setProperty('--app-w', `${appW}px`)
		el.style.setProperty('--app-h', `${appH}px`)
		el.style.setProperty('--app-x-gap', `${appXGap}px`)
		el.style.setProperty('--app-y-gap', `${appYGap}px`)
		el.style.setProperty('--apps-max-w', `${appsMaxW}px`)
		el.style.setProperty('--apps-padding-x', `${paddingX}px`)
		// All values depend on the breakpoint
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [breakpoint, pageW])

	function countAppsPerRow({pageW}: {pageW: number}) {
		return Math.floor((pageW + appXGap) / (appW + appXGap))
	}

	const appsPerRow = countAppsPerRow({pageW})

	const pages = groupIntoPages({apps, pageW, pageH})

	function groupIntoPages({
		apps,
		pageW,
		pageH,
	}: {
		apps: ReactNode[]
		pageW: number
		pageH: number
	}): PageT[] {
		function countAppsPerCol({pageH}: {pageH: number}) {
			return Math.floor((pageH + appYGap) / (appH + appYGap))
		}

		const appsPerCol = countAppsPerCol({pageH})
		const appsPerRow = countAppsPerRow({pageW})
		const maxAppsPerPage = appsPerRow * appsPerCol

		const appsChunked = maxAppsPerPage === 0 ? [] : chunk(apps, maxAppsPerPage)
		const pages = appsChunked.map((apps) => {
			return {
				apps,
			}
		})

		return pages.length > 0 ? pages : [{apps: []}]
	}

	if (pageH < appH || !apps.length || apps.length === 0) {
		// Don't show any apps
		return {
			pageInnerRef,
			pages: [{apps: []}],
			appsPerRow: 0,
			hasMeasurement: pageH > 0 && pageW > 0,
		}
	}

	return {pageInnerRef, pages, appsPerRow, hasMeasurement: true}
}
