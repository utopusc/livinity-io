import {createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState} from 'react'
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

function loadSettingsFromLocalStorage(): WallpaperSettings {
	try {
		const stored = localStorage.getItem(SETTINGS_KEY)
		if (!stored) return defaultSettings
		return {...defaultSettings, ...JSON.parse(stored)}
	} catch {
		return defaultSettings
	}
}

// ─── Wallpaper id first-paint cache ─────────────────────────────
// The user's wallpaper id (from the WebSocket `user.wallpaper` query) is cached
// here so a cold reload paints the correct wallpaper INSTANTLY instead of a blank
// screen while the WS query is in flight. Same instant-first-paint pattern the
// settings above use. The remote value still wins once it resolves.
const WALLPAPER_ID_KEY = 'livinity-wallpaper-id'

function loadWallpaperIdFromLocalStorage(): WallpaperId | undefined {
	try {
		const id = localStorage.getItem(WALLPAPER_ID_KEY)
		return id && arrayIncludes(wallpaperIds, id) ? (id as WallpaperId) : undefined
	} catch {
		return undefined
	}
}

function saveWallpaperIdToLocalStorage(id: string) {
	try {
		localStorage.setItem(WALLPAPER_ID_KEY, id)
	} catch {
		// localStorage unavailable — ignore
	}
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

	// Instant first paint: the last-known wallpaper from localStorage (or the
	// default) so the desktop is NEVER blank while the WebSocket `user.wallpaper`
	// query is loading. Read once at mount.
	const [firstPaint] = useState<WallpaperBase>(() => {
		const id = loadWallpaperIdFromLocalStorage()
		return (id && wallpapersKeyed[id]) || defaultWallpaper
	})

	const remoteWallpaper = remote.wallpaper
	// Previously this returned `nullWallpaper` while `remote.isLoading`, which
	// blanked the desktop. On cold loads — especially right after a livinityd
	// restart when the WS is still reconnecting — the query could stall (retry was
	// off), so the blank persisted until a manual refresh (the reported bug). Now
	// we always show a real wallpaper (remote → first-paint cache → default); the
	// remote value swaps in seamlessly once it resolves.
	const wallpaper = remoteWallpaper || firstPaint

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
	// Initialize from localStorage for instant first paint, then sync from server
	const [settings, setSettings] = useState<WallpaperSettings>(loadSettingsFromLocalStorage)

	const prevId = usePreviousDistinct(wallpaper.id)

	// Query user's custom accent color
	const userQ = trpcReact.user.accentColor.useQuery(undefined, {retry: false})
	const accentColor = userQ.data ?? null

	// Query per-user wallpaper animation settings from server
	const settingsQ = trpcReact.preferences.get.useQuery({keys: ['wallpaperSettings']}, {retry: false})
	const settingsMut = trpcReact.preferences.set.useMutation()
	const serverSynced = useRef(false)

	// Sync server settings to local state when query loads
	useEffect(() => {
		if (settingsQ.data && !serverSynced.current) {
			serverSynced.current = true
			const remote = settingsQ.data['wallpaperSettings']
			if (remote && typeof remote === 'object') {
				setSettings((prev) => ({...prev, ...remote}))
			}
		}
	}, [settingsQ.data])

	useWallpaperCssVars(wallpaper.id, accentColor)

	useLayoutEffect(() => {
		if (wallpaper.id === prevId) return
		setWallpaperFullyVisible(true)
		setIsLoading(false)
	}, [wallpaper.id, prevId])

	const updateSettings = useCallback((partial: Partial<WallpaperSettings>) => {
		setSettings((prev) => {
			const next = {...prev, ...partial}
			// Save to server (per-user)
			settingsMut.mutate({key: 'wallpaperSettings', value: next})
			return next
		})
	}, [settingsMut])

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
		// Was `retry: false` — a single transient WebSocket hiccup on a cold load
		// (the WS reconnecting right after a livinityd restart) left the query
		// stuck/failed with no recovery, so the wallpaper stayed blank until a
		// manual refresh. Retry a few times with backoff so it self-heals.
		retry: 3,
		retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
	})
	const wallpaperQId = userQ.data

	useEffect(() => {
		if (userQ.isSuccess && wallpaperQId && arrayIncludes(wallpaperIds, wallpaperQId)) {
			// Cache for instant first paint on the next cold load.
			saveWallpaperIdToLocalStorage(wallpaperQId)
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
