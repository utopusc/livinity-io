import {createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useState} from 'react'
import {usePreviousDistinct} from 'react-use'
import {arrayIncludes} from 'ts-extras'

import {animatedWallpapers, animatedWallpaperIds, type AnimatedWallpaperId} from '@/components/animated-wallpapers'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

type WallpaperBase = {
	id: string | undefined
	url: string
	brandColorHsl: string
}

export type WallpaperId = AnimatedWallpaperId

export const wallpapersKeyed: Record<string, WallpaperBase> = Object.fromEntries(
	animatedWallpaperIds.map((id) => [id, {id, url: '', brandColorHsl: animatedWallpapers[id].brandColorHsl}]),
)

export const wallpaperIds: string[] = [...animatedWallpaperIds]

export function isAnimatedWallpaper(id: string | undefined): id is AnimatedWallpaperId {
	return !!id && id in animatedWallpapers
}

const defaultWallpaperId: WallpaperId = animatedWallpaperIds[0]
const defaultWallpaper = wallpapersKeyed[defaultWallpaperId]

// ---

const nullWallpaper = {
	id: undefined,
	url: '',
	brandColorHsl: '0 0% 50%',
} as const satisfies WallpaperBase

// ─── Wallpaper animation settings ───────────────────────────────

export type WallpaperSettings = {
	paused: boolean
	speed: number // 0.25 to 3
	hueRotate: number // 0 to 360
	brightness: number // 0.5 to 1.5
	saturation: number // 0 to 2
}

const SETTINGS_KEY = 'livinity-wallpaper-settings'

const defaultSettings: WallpaperSettings = {
	paused: false,
	speed: 1,
	hueRotate: 0,
	brightness: 1,
	saturation: 1,
}

function loadSettings(): WallpaperSettings {
	try {
		const stored = localStorage.getItem(SETTINGS_KEY)
		if (!stored) return defaultSettings
		return {...defaultSettings, ...JSON.parse(stored)}
	} catch {
		return defaultSettings
	}
}

function saveSettings(settings: WallpaperSettings) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
	} catch {}
}

// ---

type WallpaperType = {
	wallpaper: WallpaperBase
	isLoading: boolean
	prevWallpaper: WallpaperBase | undefined
	setWallpaperId: (id: WallpaperId) => void
	wallpaperFullyVisible: boolean
	setWallpaperFullyVisible: () => void
	settings: WallpaperSettings
	updateSettings: (partial: Partial<WallpaperSettings>) => void
}

const WallPaperContext = createContext<WallpaperType>(null as any)

export function WallpaperProviderConnected({children}: {children: ReactNode}) {
	const remote = useRemoteWallpaper()

	const remoteWallpaper = remote.wallpaper
	const wallpaper = remote.isLoading ? nullWallpaper : remoteWallpaper || defaultWallpaper

	return (
		<WallpaperProvider
			wallpaper={wallpaper}
			onWallpaperChange={(w) => {
				if (w.id) remote.setWallpaperId(w.id as WallpaperId)
			}}
		>
			{children}
		</WallpaperProvider>
	)
}

export function WallpaperProvider({
	wallpaper,
	onWallpaperChange,
	children,
}: {
	wallpaper: WallpaperBase
	onWallpaperChange: (wallpaper: WallpaperBase) => void
	children: ReactNode
}) {
	const [isLoading, setIsLoading] = useState(false)
	const [wallpaperFullyVisible, setWallpaperFullyVisible] = useState(true)
	const [settings, setSettings] = useState<WallpaperSettings>(loadSettings)

	const prevId = usePreviousDistinct(wallpaper.id)

	// Query user's custom accent color
	const userQ = trpcReact.user.accentColor.useQuery(undefined, {retry: false})
	const accentColor = userQ.data ?? null

	useWallpaperCssVars(wallpaper.id, accentColor)

	useLayoutEffect(() => {
		if (wallpaper.id === prevId) return
		setWallpaperFullyVisible(true)
		setIsLoading(false)
	}, [wallpaper.id, prevId])

	const updateSettings = useCallback((partial: Partial<WallpaperSettings>) => {
		setSettings((prev) => {
			const next = {...prev, ...partial}
			saveSettings(next)
			return next
		})
	}, [])

	return (
		<WallPaperContext.Provider
			value={{
				wallpaper,
				isLoading,
				prevWallpaper: (prevId && wallpapersKeyed[prevId]) || undefined,
				setWallpaperId: (id: WallpaperId) => {
					onWallpaperChange(wallpapersKeyed[id])
				},
				wallpaperFullyVisible,
				setWallpaperFullyVisible: () => setWallpaperFullyVisible(true),
				settings,
				updateSettings,
			}}
		>
			{children}
		</WallPaperContext.Provider>
	)
}

export function useWallpaperCssVars(wallpaperId?: string, accentColor?: string | null) {
	const entry = wallpaperId ? wallpapersKeyed[wallpaperId] : undefined
	const wallpaperColor = entry?.brandColorHsl ?? nullWallpaper.brandColorHsl
	// Custom accent color overrides wallpaper brand color
	const brandColorHsl = accentColor || wallpaperColor

	useLayoutEffect(() => {
		const el = document.documentElement
		el.style.setProperty('--color-brand', brandColorHsl)
		el.style.setProperty('--color-brand-lighter', brandHslLighter(brandColorHsl))
		el.style.setProperty('--color-brand-lightest', brandHslLightest(brandColorHsl))
	}, [brandColorHsl])
}

export const useWallpaper = () => {
	const ctx = useContext(WallPaperContext)
	if (!ctx) throw new Error('useWallpaper must be used within WallpaperProvider')
	return ctx
}

export function Wallpaper({
	className,
	stayBlurred,
	isPreview,
}: {
	className?: string
	stayBlurred?: boolean
	isPreview?: boolean
}) {
	const {wallpaper, settings} = useWallpaper()

	if (!wallpaper || !wallpaper.id) return null

	if (isAnimatedWallpaper(wallpaper.id)) {
		const AnimatedComponent = animatedWallpapers[wallpaper.id].component
		const hasFilter = settings.hueRotate !== 0 || settings.brightness !== 1 || settings.saturation !== 1
		const filterStyle = hasFilter
			? {filter: `hue-rotate(${settings.hueRotate}deg) brightness(${settings.brightness}) saturate(${settings.saturation})`}
			: undefined

		return (
			<div style={filterStyle} className={cn(isPreview && 'absolute inset-0 overflow-hidden')}>
				<AnimatedComponent paused={settings.paused} speed={settings.speed} />
			</div>
		)
	}

	return null
}

function useRemoteWallpaper(onSuccess?: (id: WallpaperId) => void) {
	const userQ = trpcReact.user.wallpaper.useQuery(undefined, {
		retry: false,
	})
	const wallpaperQId = userQ.data

	useEffect(() => {
		if (userQ.isSuccess && wallpaperQId && arrayIncludes(wallpaperIds, wallpaperQId)) {
			onSuccess?.(wallpaperQId as WallpaperId)
		}
	}, [userQ.isSuccess, wallpaperQId, onSuccess])

	const utils = trpcReact.useUtils()
	const userMut = trpcReact.user.set.useMutation({
		onSuccess: () => {
			utils.user.get.invalidate()
			utils.user.wallpaper.invalidate()
		},
	})
	const setWallpaperId = useCallback((id: WallpaperId) => userMut.mutate({wallpaper: id}), [userMut])

	return {
		isLoading: userQ.isLoading,
		wallpaper: wallpaperQId && arrayIncludes(wallpaperIds, wallpaperQId) ? wallpapersKeyed[wallpaperQId] : undefined,
		setWallpaperId,
	}
}

export function RemoteWallpaperInjector() {
	const remote = useRemoteWallpaper()
	const {wallpaper, setWallpaperId} = useWallpaper()

	const localId = wallpaper?.id
	const remoteId = remote.wallpaper?.id

	useEffect(() => {
		if (remoteId && remoteId !== localId) setWallpaperId(remoteId as WallpaperId)
	}, [remoteId, localId, setWallpaperId])

	return null
}

export const LIGHTEN_AMOUNT = 8
function brandHslLighterByAmount(hsl: string, amount: number) {
	const tokens = hsl.split(' ')
	const h = tokens[0]
	const s = parseFloat(tokens[1])
	const l = parseFloat(tokens[2].replace('%', ''))
	const lLighter = l > 100 ? 100 : l + amount
	return `${h} ${s}% ${lLighter}%`
}

export function brandHslLighter(hsl: string) {
	return brandHslLighterByAmount(hsl, LIGHTEN_AMOUNT)
}
export function brandHslLightest(hsl: string) {
	return brandHslLighterByAmount(hsl, LIGHTEN_AMOUNT * 2)
}
