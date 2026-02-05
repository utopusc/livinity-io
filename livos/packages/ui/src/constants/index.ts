import {t} from '@/utils/i18n'

export const UNKNOWN = () => t('unknown')
// This is an en dash (U+2013)
export const LOADING_DASH = '–'

export const SETTINGS_SYSTEM_CARDS_ID = 'settings-system-cards'

const hostEnvironments = ['livinity-home', 'raspberry-pi', 'docker-container', 'unknown'] as const
export type LivinityHostEnvironment = (typeof hostEnvironments)[number]

export const hostEnvironmentMap = {
	'livinity-home': {
		icon: '/figma-exports/system-livinity-home.png',
	},
	'raspberry-pi': {
		icon: '/figma-exports/system-pi.svg',
	},
	'docker-container': {
		icon: '/figma-exports/system-docker.svg',
	},
	unknown: {
		icon: '/figma-exports/system-generic-device.svg',
	},
} satisfies Record<
	LivinityHostEnvironment,
	{
		icon?: string
	}
>
