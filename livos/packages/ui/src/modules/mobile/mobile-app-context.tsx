import {createContext, useContext, useState, useCallback} from 'react'

type MobileAppState = {
	appId: string
	route: string
	title: string
	icon: string
} | null

type MobileAppContextT = {
	activeApp: MobileAppState
	openApp: (appId: string, route: string, title: string, icon: string) => void
	closeApp: () => void
}

const MobileAppContext = createContext<MobileAppContextT | null>(null)

export function MobileAppProvider({children}: {children: React.ReactNode}) {
	const [activeApp, setActiveApp] = useState<MobileAppState>(null)

	const openApp = useCallback((appId: string, route: string, title: string, icon: string) => {
		setActiveApp({appId, route, title, icon})
	}, [])

	const closeApp = useCallback(() => {
		setActiveApp(null)
	}, [])

	return (
		<MobileAppContext.Provider value={{activeApp, openApp, closeApp}}>
			{children}
		</MobileAppContext.Provider>
	)
}

export function useMobileApp() {
	const ctx = useContext(MobileAppContext)
	if (!ctx) throw new Error('useMobileApp must be used within MobileAppProvider')
	return ctx
}
