import {t} from '@/utils/i18n'
import {firstNameFromFullName} from '@/utils/misc'

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

function resolveTimeOfDay(): TimeOfDay {
	const hour = new Date().getHours()
	if (hour >= 5 && hour < 12) return 'morning'
	if (hour >= 12 && hour < 17) return 'afternoon'
	if (hour >= 17 && hour < 21) return 'evening'
	return 'night'
}

const greetingKeys: Record<TimeOfDay, string> = {
	morning: 'desktop.greeting.morning',
	afternoon: 'desktop.greeting.afternoon',
	evening: 'desktop.greeting.evening',
	night: 'desktop.greeting.evening',
}

export function greetingMessage(fullName: string): string {
	const displayName = firstNameFromFullName(fullName)
	const period = resolveTimeOfDay()
	return `${t(greetingKeys[period], {name: displayName})}.`
}
