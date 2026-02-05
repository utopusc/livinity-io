import React, {createContext, useCallback, useContext, useState} from 'react'

type WindowRouterContextT = {
	currentRoute: string
	navigate: (to: string) => void
	goBack: () => void
	canGoBack: boolean
}

const WindowRouterContext = createContext<WindowRouterContextT | null>(null)

type WindowRouterProviderProps = {
	initialRoute: string
	children: React.ReactNode
}

export function WindowRouterProvider({initialRoute, children}: WindowRouterProviderProps) {
	const [history, setHistory] = useState<string[]>([initialRoute])
	const [currentIndex, setCurrentIndex] = useState(0)

	const currentRoute = history[currentIndex]

	const navigate = useCallback((to: string) => {
		setHistory((prev) => {
			// Remove any forward history and add new route
			const newHistory = [...prev.slice(0, currentIndex + 1), to]
			return newHistory
		})
		setCurrentIndex((prev) => prev + 1)
	}, [currentIndex])

	const goBack = useCallback(() => {
		if (currentIndex > 0) {
			setCurrentIndex((prev) => prev - 1)
		}
	}, [currentIndex])

	const canGoBack = currentIndex > 0

	return (
		<WindowRouterContext.Provider value={{currentRoute, navigate, goBack, canGoBack}}>
			{children}
		</WindowRouterContext.Provider>
	)
}

export function useWindowRouter() {
	const context = useContext(WindowRouterContext)
	if (!context) {
		throw new Error('useWindowRouter must be used within a WindowRouterProvider')
	}
	return context
}

export function useWindowRouterOptional() {
	return useContext(WindowRouterContext)
}

// Check if we're inside a window context
export function useIsInWindow() {
	return useContext(WindowRouterContext) !== null
}
