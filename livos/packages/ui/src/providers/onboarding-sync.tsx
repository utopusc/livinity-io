import {useEffect, useRef} from 'react'

import {trpcReact} from '@/trpc/trpc'

const ONBOARDING_KEY = 'livinity-onboarding-personalization'

/**
 * Syncs onboarding personalization data from localStorage to the server
 * after the user's first login. Runs once and cleans up.
 */
export function OnboardingPersonalizationSync() {
	const setPreference = trpcReact.preferences.set.useMutation()
	const synced = useRef(false)

	useEffect(() => {
		if (synced.current) return
		try {
			const stored = localStorage.getItem(ONBOARDING_KEY)
			if (!stored) return

			const data = JSON.parse(stored) as {role?: string; style?: string; useCases?: string[]}
			synced.current = true

			// Save each preference to the server
			if (data.role) {
				setPreference.mutate({key: 'ai_role', value: data.role})
			}
			if (data.style) {
				setPreference.mutate({key: 'ai_response_style', value: data.style})
			}
			if (data.useCases && data.useCases.length > 0) {
				setPreference.mutate({key: 'ai_use_cases', value: data.useCases})
			}

			// Clean up localStorage after sync
			localStorage.removeItem(ONBOARDING_KEY)
		} catch {}
	}, [])

	return null
}
