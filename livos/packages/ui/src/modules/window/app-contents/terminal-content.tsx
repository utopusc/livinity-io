import React, {Suspense, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {TbServer, TbApps} from 'react-icons/tb'

import {ErrorBoundaryCardFallback} from '@/components/ui/error-boundary-card-fallback'
import {Loading} from '@/components/ui/loading'
import {useApps} from '@/providers/apps'
import {cn} from '@/shadcn-lib/utils'

import '@xterm/xterm/css/xterm.css'

// Lazy load the XTermTerminal component
const XTermTerminal = React.lazy(() =>
	import('@/routes/settings/terminal/_shared').then((m) => ({default: m.XTermTerminal})),
)

type TerminalMode = 'livos' | 'app'

export default function TerminalWindowContent() {
	const [mode, setMode] = useState<TerminalMode>('livos')
	const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
	const {userApps, isLoading} = useApps()

	return (
		<ErrorBoundary FallbackComponent={ErrorBoundaryCardFallback}>
			<div className='flex h-full flex-col'>
				{/* Tab Header */}
				<div className='flex items-center gap-2 border-b border-white/10 px-4 py-3'>
					{/* Mode Tabs */}
					<div className='flex gap-1 rounded-lg bg-white/5 p-1'>
						<button
							onClick={() => setMode('livos')}
							className={cn(
								'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
								mode === 'livos'
									? 'bg-white/15 text-white'
									: 'text-white/60 hover:text-white/80',
							)}
						>
							<TbServer className='h-4 w-4' />
							LivOS
						</button>
						<button
							onClick={() => setMode('app')}
							className={cn(
								'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
								mode === 'app'
									? 'bg-white/15 text-white'
									: 'text-white/60 hover:text-white/80',
							)}
						>
							<TbApps className='h-4 w-4' />
							App
						</button>
					</div>

					{/* App Selector (only show when app mode is selected) */}
					{mode === 'app' && (
						<div className='ml-auto flex items-center gap-2'>
							<span className='text-sm text-white/50'>Run commands in:</span>
							<select
								value={selectedAppId || ''}
								onChange={(e) => setSelectedAppId(e.target.value || null)}
								className='rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30'
								disabled={isLoading}
							>
								<option value=''>Select an app...</option>
								{userApps?.map((app) => (
									<option key={app.id} value={app.id}>
										{app.name}
									</option>
								))}
							</select>
						</div>
					)}
				</div>

				{/* Terminal Content */}
				<div className='flex-1 overflow-hidden p-4'>
					<Suspense fallback={<Loading />}>
						{mode === 'livos' ? (
							<XTermTerminal />
						) : selectedAppId ? (
							<XTermTerminal key={selectedAppId} appId={selectedAppId} />
						) : (
							<div className='flex h-full items-center justify-center'>
								<div className='text-center'>
									<TbApps className='mx-auto h-12 w-12 text-white/20' />
									<p className='mt-3 text-white/50'>Select an app to open its terminal</p>
									<p className='mt-1 text-sm text-white/30'>
										Run custom commands within a specific Docker container
									</p>
								</div>
							</div>
						)}
					</Suspense>
				</div>
			</div>
		</ErrorBoundary>
	)
}
