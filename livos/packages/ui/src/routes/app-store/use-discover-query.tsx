import {useQuery} from '@tanstack/react-query'

import {Categoryish} from '@/modules/app-store/constants'

export type Banner = {
	id: string
	image: string
}

export type Section = {
	type: string
	heading: string
	subheading: string
	apps: string[]
	textLocation?: 'left' | 'right' | undefined
	description?: string
	category?: Categoryish
}

export type DiscoverData = {
	banners: Banner[]
	sections: Section[]
}

// Static discover data for LivOS App Store
const STATIC_DISCOVER_DATA: DiscoverData = {
	banners: [],
	sections: [
		{
			type: 'featured-hero',
			heading: 'Featured',
			subheading: 'New',
			apps: ['chromium', 'n8n'],
			description: 'Browse the web privately from your server',
		},
		{
			type: 'grid',
			heading: 'Popular Apps',
			subheading: 'Community favorites',
			apps: [
				'nextcloud',
				'plex',
				'jellyfin',
				'home-assistant',
				'vaultwarden',
				'immich',
				'pi-hole',
				'syncthing',
			],
		},
		{
			type: 'horizontal',
			heading: 'For Developers',
			subheading: 'Code, deploy, monitor',
			apps: [
				'gitea',
				'code-server',
				'portainer',
				'jupyterlab',
				'grafana',
				'uptime-kuma',
				'dockge',
				'gitlab',
			],
			category: 'developer',
		},
		{
			type: 'three-column',
			heading: 'AI & Machine Learning',
			subheading: 'Run AI models on your hardware',
			apps: ['ollama', 'open-webui', 'localai'],
			textLocation: 'left',
			description: 'Run powerful AI models entirely on your own hardware. No cloud dependencies, no data leaving your server.',
			category: 'automation',
		},
		{
			type: 'horizontal',
			heading: 'For Creators',
			subheading: 'Create, organize, share',
			apps: [
				'immich',
				'photoprism',
				'jellyfin',
				'navidrome',
				'audiobookshelf',
				'calibre-web',
				'plex',
				'tubearchivist',
			],
			category: 'media',
		},
		{
			type: 'three-column',
			heading: 'Privacy & Security',
			subheading: 'Take back control',
			apps: ['vaultwarden', 'pi-hole', 'adguard-home'],
			textLocation: 'right',
			description: 'Take control of your digital security with self-hosted password managers, ad blockers, and privacy tools.',
			category: 'networking',
		},
		{
			type: 'horizontal',
			heading: 'Home Automation',
			subheading: 'Your home, your rules',
			apps: [
				'home-assistant',
				'n8n',
				'node-red',
				'esphome',
				'zigbee2mqtt',
				'activepieces',
			],
			category: 'automation',
		},
		{
			type: 'grid',
			heading: 'Stay Connected',
			subheading: 'Self-hosted communication',
			apps: [
				'element',
				'mattermost',
				'ntfy',
				'synapse',
				'thelounge',
				'snapdrop',
				'databag',
			],
			category: 'social',
		},
		{
			type: 'horizontal',
			heading: 'Productivity',
			subheading: 'Work smarter',
			apps: [
				'nextcloud',
				'vikunja',
				'paperless',
				'stirling-pdf',
				'trilium-notes',
				'wikijs',
				'syncthing',
			],
			category: 'files',
		},
	],
}

export function useDiscoverQuery() {
	const discoverQ = useQuery<{data: DiscoverData}>({
		queryKey: ['app-store', 'discover'],
		// Return static data immediately
		queryFn: async () => ({data: STATIC_DISCOVER_DATA}),
		staleTime: Infinity,
	})

	return {...discoverQ, data: discoverQ.data?.data}
}
