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
import {RewindOverlayProvider, useRewindOverlay} from '@/features/files/components/rewind/overlay-context'
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
const EncryptedFolderDialog = lazy(() => import('@/features/files/components/dialogs/encrypted-folder-dialog'))
// FILES-01 (324-07) — NEW public share-link mint dialog (distinct from ShareInfoDialog).
const PublicShareDialog = lazy(() => import('@/features/files/components/dialogs/public-share-dialog'))

type FilesWindowContentProps = {
	initialRoute: string
}

// Dialog names the launch suffix is allowed to auto-open inside the window.
// The in-memory WindowRouterProvider has no browser URL, so the existing
// ?dialog=/?rewind= auto-open mechanisms (which read useSearchParams /
// window.location.search) never fire — we parse the suffix off initialRoute
// once on mount instead. SECURITY: only honor a name on this fixed allow-list.
const ALLOWED_DIALOGS = ['files-format-drive'] as const

export default function FilesWindowContent({initialRoute}: FilesWindowContentProps) {
	// Split the launch suffix off the route BEFORE deriving the files path, so
	// WindowRouterProvider receives a clean path (not "…?rewind=open").
	// initialRoute may carry "?rewind=open" or "?dialog=files-format-drive&deviceId=sdc".
	const [routePart, queryPart] = initialRoute.split('?')
	const suffixParams = new URLSearchParams(queryPart || '')

	// Convert route to files path (remove /files prefix if present)
	// Decode URI components so encoded names (e.g. "Untitled%20Folder") become filesystem paths
	const raw = routePart.startsWith('/files')
		? routePart.replace('/files', '') || HOME_PATH
		: routePart || HOME_PATH
	const filesPath = decodeURIComponent(raw)

	// SECURITY — validate the parsed launch signal against a fixed allow-list.
	const wantRewind = suffixParams.get('rewind') === 'open'
	const dialogParam = suffixParams.get('dialog')
	const wantFormat = dialogParam != null && (ALLOWED_DIALOGS as readonly string[]).includes(dialogParam)
	// deviceId is an OPAQUE string passed straight to FormatDriveDialog, which
	// self-gates on a real drive (`if (!drive ...) return null`). Never eval'd,
	// never used in a dynamic import / DOM injection / URL write.
	const formatDeviceId = wantFormat ? suffixParams.get('deviceId') : null

	return (
		<WindowRouterProvider initialRoute={filesPath}>
			<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
				<FilesWindowRouter initialRewind={wantRewind} initialFormatDeviceId={formatDeviceId} />
			</ErrorBoundary>
		</WindowRouterProvider>
	)
}

/**
 * Fires a MOUNT-ONLY effect that translates the parsed launch suffix into a
 * programmatic dialog open. Rendered under RewindOverlayProvider so
 * useRewindOverlay() resolves. The suffix is a one-shot launch signal.
 */
function InitialDialogTrigger({
	rewind,
	formatDeviceId,
	onFormat,
}: {
	rewind: boolean
	formatDeviceId: string | null
	onFormat: (id: string) => void
}) {
	const {setRepoOpen} = useRewindOverlay()
	useEffect(() => {
		if (rewind) setRepoOpen(true)
		else if (formatDeviceId) onFormat(formatDeviceId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []) // mount-only — the suffix is a one-shot launch signal
	return null
}

function FilesWindowRouter({
	initialRewind,
	initialFormatDeviceId,
}: {
	initialRewind: boolean
	initialFormatDeviceId: string | null
}) {
	const {currentRoute, navigate, goBack, canGoBack} = useWindowRouter()
	const {setSelectedItems} = useFilesStore()
	const setIsSelectingOnMobile = useFilesStore((state) => state.setIsSelectingOnMobile)

	const isMobile = useIsMobile()
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

	// Forced (windowed) format-drive device — opens FormatDriveDialog without a browser URL.
	const [forcedFormatDeviceId, setForcedFormatDeviceId] = useState<string | null>(null)

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
					<InitialDialogTrigger
						rewind={initialRewind}
						formatDeviceId={initialFormatDeviceId}
						onFormat={setForcedFormatDeviceId}
					/>
					<FileViewer />

					<div className='flex h-full flex-col'>
						{/* Header */}
						<div className='flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3'>
							{showBackButton && (
								<button
									onClick={goBack}
									className='flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-1 transition-colors -ml-2'
								>
									<TbArrowLeft className='h-5 w-5' />
								</button>
							)}
							{isMobile && (
								<button
									onClick={() => setIsMobileSidebarOpen(true)}
									className='flex h-11 w-11 items-center justify-center -ml-2'
								>
									<HiMenuAlt2 className='h-5 w-5 text-text-primary' />
								</button>
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
						<FormatDriveDialog
							forcedDeviceId={forcedFormatDeviceId}
							onForcedClose={() => setForcedFormatDeviceId(null)}
						/>
					</Suspense>
					<Suspense>
						<EncryptedFolderDialog />
					</Suspense>
					<Suspense>
						<PublicShareDialog />
					</Suspense>
				</RewindOverlayProvider>
			</FilesDndWrapper>
		</FilesCapabilitiesProvider>
	)
}
