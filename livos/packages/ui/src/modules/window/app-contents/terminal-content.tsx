import React, {Suspense, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {TbServer, TbApps, TbTerminal2} from 'react-icons/tb'

import {AnimatedGroup} from '@/components/motion-primitives/animated-group'
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
			<div className='flex h-full flex-col bg-neutral-900'>
				{/* Tab Header */}
				<div className='flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5'>
					{/* Mode Tabs */}
					<div className='flex gap-0.5 rounded-lg bg-neutral-800/80 p-0.5'>
						<button
							onClick={() => setMode('livos')}
							className={cn(
								'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
								mode === 'livos'
									? 'bg-neutral-700 text-neutral-100 shadow-sm'
									: 'text-neutral-400 hover:text-neutral-200',
							)}
						>
							<TbServer className='h-3.5 w-3.5' />
							LivOS
						</button>
						<button
							onClick={() => setMode('app')}
							className={cn(
								'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
								mode === 'app'
									? 'bg-neutral-700 text-neutral-100 shadow-sm'
									: 'text-neutral-400 hover:text-neutral-200',
							)}
						>
							<TbApps className='h-3.5 w-3.5' />
							App
						</button>
					</div>

					{/* App Selector (only show when app mode is selected) */}
					{mode === 'app' && (
						<div className='ml-auto flex items-center gap-2'>
							<span className='text-[12px] font-medium text-neutral-500'>Run in:</span>
							<select
								value={selectedAppId || ''}
								onChange={(e) => setSelectedAppId(e.target.value || null)}
								className='rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[12px] font-medium text-neutral-200 outline-none transition-colors focus:border-neutral-600'
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
				<div className='flex-1 overflow-hidden'>
					<Suspense fallback={<Loading />}>
						{mode === 'livos' ? (
							<XTermTerminal />
						) : selectedAppId ? (
							<XTermTerminal key={selectedAppId} appId={selectedAppId} />
						) : (
							<div className='flex h-full items-center justify-center'>
								<AnimatedGroup preset='blur-slide' className='flex flex-col items-center gap-4'>
									<div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800/80'>
										<TbTerminal2 className='h-8 w-8 text-neutral-500' strokeWidth={1.5} />
									</div>
									<div className='text-center'>
										<p className='text-[13px] font-medium text-neutral-400'>
											Select an app to open its terminal
										</p>
										<p className='mt-1 text-[12px] text-neutral-600'>
											Run commands within a Docker container
										</p>
									</div>
								</AnimatedGroup>
							</div>
						)}
					</Suspense>
				</div>
			</div>
		</ErrorBoundary>
	)
}
