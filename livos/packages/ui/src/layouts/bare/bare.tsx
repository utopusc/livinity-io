import {Suspense} from 'react'
import {Outlet} from 'react-router-dom'

import {BarePage, GradientPage} from '@/layouts/bare/bare-page'

export function BareLayout() {
	return (
		<BarePage>
			<Suspense>
				<Outlet />
			</Suspense>
		</BarePage>
	)
}

export function GradientLayout() {
	return (
		<GradientPage>
			<Suspense>
				<Outlet />
			</Suspense>
		</GradientPage>
	)
}
