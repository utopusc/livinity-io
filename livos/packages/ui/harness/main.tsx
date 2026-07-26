import {StrictMode, useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {motion, type PanInfo} from 'framer-motion'
import {GripHorizontal, Monitor} from 'lucide-react'

import '@/index.css'
import {DisplaysStripView, type DisplayVM} from '@/modules/desktop/displays-strip'
import {TopSurface, type TopSurfaceMode} from '@/modules/desktop/top-surface'
import {useTopDockReveal} from '@/modules/desktop/use-top-dock-reveal'

// Inline SVG "screenshot" so the harness needs no network/backend.
const shot = (label: string, a: string, b: string) =>
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>` +
			`<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
			`<stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs>` +
			`<rect width='320' height='180' fill='url(#g)'/>` +
			`<text x='18' y='44' font-family='sans-serif' font-size='22' fill='white' opacity='0.92'>${label}</text>` +
			`</svg>`,
	)

const CHROME_SHOT = shot('Chrome', '#3b82f6', '#1e3a8a')
const VNC_LAYOUT_ID = 'stream-:vnc'

const ALL: DisplayVM[] = [
	{id: ':1', name: 'Files', width: 1280, height: 720, screenshotUrl: shot('Files', '#f59e0b', '#b45309')},
	{id: ':2', name: 'Hermes Agent', width: 1280, height: 720, screenshotUrl: shot('Hermes Agent', '#22c55e', '#15803d'), active: true},
	{id: ':3', name: 'Terminal', width: 1280, height: 720, screenshotUrl: shot('Terminal', '#6b7280', '#111827')},
]

// The display that the VNC window morphs INTO on dock (shares VNC_LAYOUT_ID).
const VNC_DISPLAY: DisplayVM = {id: ':vnc', name: 'Chrome', width: 1280, height: 720, screenshotUrl: CHROME_SHOT, morphLayoutId: VNC_LAYOUT_ID}

function btn(active: boolean) {
	return (
		'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ' +
		(active ? 'bg-white/90 text-black' : 'bg-white/10 text-white/80 hover:bg-white/20')
	)
}

function MockNavbar({onDisplays}: {onDisplays: () => void}) {
	return (
		<div className='pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 shadow-[0_12px_34px_-14px_rgba(0,0,0,0.7)] backdrop-blur-xl'>
			<span className='grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[13px]'>🏠</span>
			<span className='px-1 text-[13px] font-medium text-white/85'>bruce</span>
			<span className='mx-1 h-5 w-px bg-white/10' />
			<button
				type='button'
				aria-label='Displays'
				title='Displays'
				onClick={onDisplays}
				className='grid h-7 w-7 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white'
			>
				<Monitor className='h-4 w-4' />
			</button>
			<span className='grid h-7 w-7 place-items-center rounded-full text-white/70'>⚙️</span>
		</div>
	)
}

// Mock VNC/stream window. Shares VNC_LAYOUT_ID with VNC_DISPLAY so docking morphs
// the window box into the strip tile (R3).
function MockVncWindow({
	onDrag,
	onDragEnd,
	hidden,
}: {
	onDrag: (info: PanInfo) => void
	onDragEnd: (info: PanInfo) => void
	hidden: boolean
}) {
	if (hidden) return null
	return (
		<motion.div
			layoutId={VNC_LAYOUT_ID}
			drag
			dragMomentum={false}
			onDrag={(_e, info) => onDrag(info)}
			onDragEnd={(_e, info) => onDragEnd(info)}
			style={{position: 'absolute', top: 360, left: '50%', x: '-50%', width: 360, zIndex: 40}}
			className='pointer-events-auto cursor-grab overflow-hidden rounded-xl border border-white/15 bg-black/70 shadow-2xl active:cursor-grabbing'
		>
			<div className='flex items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2'>
				<GripHorizontal className='h-4 w-4 text-white/50' />
				<span className='text-[12px] font-medium text-white/80'>VNC — Chrome stream</span>
			</div>
			<img src={CHROME_SHOT} alt='stream' style={{height: 200, width: '100%', objectFit: 'cover', display: 'block'}} draggable={false} />
		</motion.div>
	)
}

function Harness() {
	const [count, setCount] = useState(3)
	const [clicked, setClicked] = useState(false)
	const [dockedVnc, setDockedVnc] = useState(false)
	const [slowMorph, setSlowMorph] = useState(false)
	const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const dock = useTopDockReveal()

	// Hold the strip open long enough to watch a slowed morph (debug only).
	const holdMs = slowMorph ? 3000 : 650
	const morphTransition = slowMorph ? {type: 'spring' as const, stiffness: 90, damping: 18} : undefined

	// Strip = existing displays (+ the docked Chrome window once it lands).
	const displays = [...ALL.slice(0, count), ...(dockedVnc ? [VNC_DISPLAY] : [])]

	// surfaceMode = (clicked || dragReveal) ? 'displays' : 'navbar'
	const mode: TopSurfaceMode = clicked || dock.reveal ? 'displays' : 'navbar'

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setClicked(false)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// Dock the window: mount its tile (morph target), unmount the window so Framer
	// morphs window→tile, hold the strip visible for the morph, then return navbar.
	const doDock = () => {
		dock.update(0) // ensure the strip is visible (during a real drag it already is)
		setDockedVnc(true)
		console.log('dock vnc → strip (morph)')
		if (settleTimer.current) clearTimeout(settleTimer.current)
		settleTimer.current = setTimeout(() => dock.reset(), holdMs)
	}

	const handleVncDragEnd = () => {
		if (dock.isRevealed()) doDock()
		else dock.reset()
	}

	const resetWindow = () => {
		if (settleTimer.current) clearTimeout(settleTimer.current)
		setDockedVnc(false)
		dock.reset()
	}

	return (
		<div className='relative flex min-h-screen flex-col text-white' onClick={() => setClicked(false)}>
			{/* Dev controls */}
			<div
				className='fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/60 p-3 text-[12px] backdrop-blur'
				onClick={(e) => e.stopPropagation()}
			>
				<span className='mr-1 opacity-60'>displays:</span>
				{[0, 1, 3].map((n) => (
					<button key={n} className={btn(count === n)} onClick={() => setCount(n)}>
						{n}
					</button>
				))}
				<span className='mx-1 opacity-30'>|</span>
				<button className={btn(clicked)} onClick={() => setClicked((v) => !v)}>
					clicked
				</button>
				<button className={btn(dock.reveal)} onClick={() => (dock.reveal ? dock.reset() : dock.update(0))}>
					reveal
				</button>
				<button className={btn(false)} onClick={doDock}>
					dock vnc (morph)
				</button>
				<button className={btn(slowMorph)} onClick={() => setSlowMorph((v) => !v)}>
					slow morph
				</button>
				<button className={btn(!dockedVnc)} onClick={resetWindow}>
					reset window
				</button>
			</div>

			{/* Mock VNC window — drag UP to dock (morph into strip). */}
			<MockVncWindow onDrag={(info) => dock.update(info.point.y)} onDragEnd={handleVncDragEnd} hidden={dockedVnc} />

			{/* TopSurface (navbar ⇄ displays). */}
			<div onClick={(e) => e.stopPropagation()}>
				<TopSurface
					mode={mode}
					navbar={<MockNavbar onDisplays={() => setClicked(true)} />}
					strip={
						<DisplaysStripView
							displays={displays}
							dropMode={dock.reveal}
							isOver={dock.reveal}
							morphTransition={morphTransition}
							onOpen={(d) => {
								console.log('open', d.id)
								setClicked(false)
							}}
							onClose={(d) => console.log('close', d.id)}
							onFullscreen={(d) => console.log('fullscreen', d.id)}
							onRecallDragDown={(d) => {
								console.log('recall-drag-down', d.id)
								// R4: drag the docked Chrome tile DOWN → un-dock → the window
								// remounts and reverse-morphs (tile rect → window) via the shared
								// layoutId. Surface returns to navbar; window is back on the desktop.
								if (d.id === ':vnc') {
									setDockedVnc(false)
									setClicked(false)
									dock.reset()
								}
							}}
						/>
					}
				/>
			</div>

			<div className='pointer-events-none mt-auto pb-24 text-center text-[11px] text-white/30'>
				260.2 harness — drag the VNC window UP to dock (morph) · Monitor icon toggles displays · Esc returns
			</div>
		</div>
	)
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Harness />
	</StrictMode>,
)
