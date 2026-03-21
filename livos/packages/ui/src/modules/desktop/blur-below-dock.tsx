/** Subtle glass blur effect anchored to the bottom of the viewport, fading in above the dock */
export function BlurBelowDock() {
	return (
		<div
			className='pointer-events-none fixed inset-0 backdrop-blur-2xl duration-700 animate-in fade-in fill-mode-both'
			style={{
				background: 'rgba(255, 255, 255, 0.2)',
				WebkitMaskImage: 'linear-gradient(transparent calc(100% - 180px), black calc(100% - 40px))',
			}}
		/>
	)
}
