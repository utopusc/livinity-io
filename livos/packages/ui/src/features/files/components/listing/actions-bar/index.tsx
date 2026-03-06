import {useActionsBarConfig} from '@/features/files/components/listing/actions-bar/actions-bar-context'
import {MobileActions} from '@/features/files/components/listing/actions-bar/mobile-actions'
import {NavigationControls} from '@/features/files/components/listing/actions-bar/navigation-controls'
import {PathBar} from '@/features/files/components/listing/actions-bar/path-bar'
import {SearchInput} from '@/features/files/components/listing/actions-bar/search-input'
import {SortDropdown} from '@/features/files/components/listing/actions-bar/sort-dropdown'
import {ViewToggle} from '@/features/files/components/listing/actions-bar/view-toggle'
import {useIsFilesEmbedded, useIsFilesReadOnly} from '@/features/files/providers/files-capabilities-context'
import {cn} from '@/shadcn-lib/utils'

// Actions/navigation bar displayed above every files listing.  Its
// contents are driven by the configuration exposed via the
// <ActionsBarProvider /> (see actions-bar-context.tsx).
export function ActionsBar() {
	const {hidePath, hideSearch, desktopActions, mobileActions} = useActionsBarConfig()
	const isReadOnly = useIsFilesReadOnly()
	const isEmbedded = useIsFilesEmbedded()
	const showSearchUi = !hideSearch && !isReadOnly
	const showViewToggleUi = isEmbedded || !isReadOnly
	const showSortUi = isEmbedded || !isReadOnly

	return (
		<nav
			className={cn(
				'flex h-12 w-full min-w-0 items-center',
				'px-1.5',
				!isEmbedded && 'lg:-mt-14',
			)}
			aria-label='File browser actions'
		>
			{/* Left: Navigation + Path */}
			<div className='flex min-w-0 items-center gap-1'>
				<NavigationControls />
				{hidePath ? null : <PathBar />}
			</div>

			{/* Right: Controls grouped with visual separators */}
			<div className='ml-auto flex items-center gap-1.5'>
				{/* Desktop view */}
				<div className='hidden items-center gap-1.5 md:flex'>
					{/* Action buttons */}
					{desktopActions && !isReadOnly ? (
						<div className='flex items-center gap-1'>
							{desktopActions}
						</div>
					) : null}

					{/* Separator between actions and controls */}
					{desktopActions && !isReadOnly && (showSearchUi || showViewToggleUi || showSortUi) ? (
						<div className='mx-0.5 h-5 w-px bg-neutral-200/80' />
					) : null}

					{/* Search + View + Sort controls */}
					{showSearchUi ? <SearchInput /> : null}
					{showViewToggleUi ? <ViewToggle /> : null}
					{showSortUi ? <SortDropdown /> : null}
				</div>

				{/* Mobile view */}
				<div className='md:hidden'>
					<MobileActions DropdownItems={!isReadOnly ? mobileActions : null} />
				</div>
			</div>
		</nav>
	)
}
