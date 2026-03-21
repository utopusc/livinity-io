import {DarkenLayer} from '@/components/darken-layer'
import {Wallpaper} from '@/providers/wallpaper'

export function BarePage({children}: {children: React.ReactNode}) {
	return (
		<>
			<Wallpaper stayBlurred />
			<DarkenLayer />
			<div className='relative flex min-h-dvh flex-col items-center justify-between p-5'>{children}</div>
		</>
	)
}

/**
 * Premium gradient background with animated floating orbs for onboarding/setup flows.
 */
export function GradientPage({children}: {children: React.ReactNode}) {
	return (
		<div className='relative min-h-dvh overflow-hidden bg-[#f8f9fc]'>
			{/* Animated gradient orbs */}
			<div
				className='pointer-events-none fixed left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full opacity-30'
				style={{
					background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)',
					filter: 'blur(80px)',
					animation: 'blob-drift-1 20s ease-in-out infinite',
				}}
			/>
			<div
				className='pointer-events-none fixed bottom-[-5%] right-[-5%] h-[450px] w-[450px] rounded-full opacity-25'
				style={{
					background: 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)',
					filter: 'blur(90px)',
					animation: 'blob-drift-2 25s ease-in-out infinite',
				}}
			/>
			<div
				className='pointer-events-none fixed left-[30%] top-[40%] h-[400px] w-[400px] rounded-full opacity-20'
				style={{
					background: 'radial-gradient(circle, rgba(236,72,153,0.25) 0%, transparent 70%)',
					filter: 'blur(100px)',
					animation: 'blob-drift-3 18s ease-in-out infinite',
				}}
			/>
			{/* Content */}
			<div className='relative flex min-h-dvh flex-col items-center justify-between p-5'>{children}</div>
		</div>
	)
}
