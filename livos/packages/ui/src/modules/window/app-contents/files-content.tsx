import {lazy, Suspense, useEffect, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {HiMenuAlt2} from 'react-icons/hi'
import {TbArrowLeft} from 'react-icons/tb'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {FileViewer} from '@/features/files/components/file-viewer'
import {FilesDndWrapper} from '@/features/files/components/files-dnd-wrapper'
import {ActionsBar} from '@/features/files/components/listing/actions-bar'
import {ActionsBarProvider} from '@/features/files/components/listing/actions-bar/actions-bar-context'
import {DirectoryListing} from '@/features/files/components/listing/directory-listing'
import {AppsListing} from '@/features/files/components/listing/apps-listing'
import {RecentsListing} from '@/features/files/components/listing/recents-listing'
import {SearchListing} from '@/features/files/components/listing/search-listing'
import {TrashListing} from '@/features/files/components/listing/trash-listing'
import {RewindOverlay} from '@/features/files/components/rewind'
import {RewindOverlayProvider} from '@/features/files/components/rewind/overlay-context'
import {Sidebar} from '@/features/files/components/sidebar'
import {MobileSidebarWrapper} from '@/features/files/components/sidebar/mobile-sidebar-wrapper'
import {HOME_PATH, APPS_PATH, RECENTS_PATH, SEARCH_PATH, TRASH_PATH} from '@/features/files/constants'
import {FilesCapabilitiesProvider} from '@/features/files/providers/files-capabilities-context'
import {useFilesStore} from '@/features/files/store/use-files-store'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useWindowRouter, WindowRouterProvider} from '@/providers/window-router'
import {t} from '@/utils/i18n'

const ShareInfoDialog = lazy(() => import('@/features/files/components/dialogs/share-info-dialog'))
const PermanentlyDeleteConfirmationDialog = lazy(
	() => import('@/features/files/components/dialogs/permanently-delete-confirmation-dialog'),
)
const ExternalStorageUnsupportedDialog = lazy(
	() => import('@/features/files/components/dialogs/external-storage-unsupported-dialog'),
)
const AddNetworkShareDialog = lazy(() => import('@/features/files/components/dialogs/add-network-share-dialog'))
const FormatDriveDialog = lazy(() => import('@/features/files/components/dialogs/format-drive-dialog'))

type FilesWindowContentProps = {
	initialRoute: string
}

export default function FilesWindowContent({initialRoute}: FilesWindowContentProps) {
	// Convert route to files path (remove /files prefix if present)
	const filesPath = initialRoute.startsWith('/files')
		? initialRoute.replace('/files', '') || HOME_PATH
		: initialRoute || HOME_PATH

	return (
		<WindowRouterProvider initialRoute={filesPath}>
			<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
				<FilesWindowRouter />
			</ErrorBoundary>
		</WindowRouterProvider>
	)
}

function FilesWindowRouter() {
	const {currentRoute, navigate, goBack, canGoBack} = useWindowRouter()
	const {setSelectedItems} = useFilesStore()
	const setIsSelectingOnMobile = useFilesStore((state) => state.setIsSelectingOnMobile)

	const isMobile = useIsMobile()
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

	// Ensure we have a valid path
	const currentPath = currentRoute || HOME_PATH

	// Handle navigation callback for embedded Files
	const handleNavigate = (path: string) => {
		navigate(path)
	}

	// Clear selected items when navigating
	useEffect(() => {
		setSelectedItems([])
		setIsSelectingOnMobile(false)
		setIsMobileSidebarOpen(false)
	}, [currentPath, setSelectedItems, setIsSelectingOnMobile])

	// Determine which listing component to render based on path
	const renderListing = () => {
		if (currentPath === RECENTS_PATH || currentPath.startsWith(RECENTS_PATH + '/')) {
			return <RecentsListing />
		}
		if (currentPath === SEARCH_PATH || currentPath.startsWith(SEARCH_PATH + '/')) {
			return <SearchListing />
		}
		if (currentPath === APPS_PATH) {
			return <AppsListing />
		}
		if (currentPath.startsWith(TRASH_PATH)) {
			return <TrashListing />
		}
		return <DirectoryListing />
	}

	const showBackButton = canGoBack

	return (
		<FilesCapabilitiesProvider
			value={{
				mode: 'full',
				currentPath: currentPath,
				onNavigate: handleNavigate,
			}}
		>
			<FilesDndWrapper>
				<RewindOverlayProvider>
					<FileViewer />

					<div className='flex h-full flex-col'>
						{/* Header */}
						<div className='flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-3'>
							{showBackButton && (
								<button
									onClick={goBack}
									className='flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors'
								>
									<TbArrowLeft className='h-5 w-5' />
								</button>
							)}
							{isMobile && (
								<HiMenuAlt2
									role='button'
									className='h-5 w-5 cursor-pointer text-white/90'
									onClick={() => setIsMobileSidebarOpen(true)}
								/>
							)}
							<h1 className='text-15 font-semibold'>{t('files')}</h1>
						</div>

						{/* Content */}
						<div className='flex-1 overflow-auto'>
							<div className='grid h-full select-none grid-cols-1 lg:grid-cols-[188px_1fr]'>
								{/* Sidebar */}
								{isMobile ? (
									<MobileSidebarWrapper isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)}>
										<Sidebar className='h-[calc(100svh-140px)]' />
									</MobileSidebarWrapper>
								) : (
									<Sidebar className='h-full' />
								)}

								<div className='flex flex-col gap-3 p-4 lg:gap-6'>
									<ActionsBarProvider>
										<ActionsBar />
										<Suspense fallback={<Loading />}>
											{renderListing()}
										</Suspense>
									</ActionsBarProvider>
								</div>
							</div>
						</div>
					</div>

					<RewindOverlay />

					{/* Lazy loaded dialogs */}
					<Suspense>
						<ShareInfoDialog />
					</Suspense>
					<Suspense>
						<PermanentlyDeleteConfirmationDialog />
					</Suspense>
					<Suspense>
						<ExternalStorageUnsupportedDialog />
					</Suspense>
					<Suspense>
						<AddNetworkShareDialog />
					</Suspense>
					<Suspense>
						<FormatDriveDialog />
					</Suspense>
				</RewindOverlayProvider>
			</FilesDndWrapper>
		</FilesCapabilitiesProvider>
	)
}
