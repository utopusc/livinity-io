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
			type: 'grid',
			heading: 'Popular Apps',
			subheading: 'Most installed',
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
			heading: 'Media & Entertainment',
			subheading: 'Stream and organize',
			apps: [
				'jellyfin',
				'plex',
				'navidrome',
				'audiobookshelf',
				'calibre-web',
				'photoprism',
				'librephotos',
				'tubearchivist',
			],
			category: 'media',
		},
		{
			type: 'three-column',
			heading: 'Privacy & Security',
			subheading: 'Protect your data',
			apps: ['vaultwarden', 'pi-hole', 'adguard-home'],
			textLocation: 'left',
			description: 'Take control of your digital security with self-hosted password managers, ad blockers, and privacy tools.',
			category: 'networking',
		},
		{
			type: 'horizontal',
			heading: 'Productivity',
			subheading: 'Get things done',
			apps: [
				'nextcloud',
				'vikunja',
				'n8n',
				'paperless',
				'stirling-pdf',
				'trilium-notes',
				'wikijs',
				'code-server',
			],
			category: 'files',
		},
		{
			type: 'grid',
			heading: 'AI & Automation',
			subheading: 'Smart tools',
			apps: [
				'ollama',
				'open-webui',
				'localai',
				'home-assistant',
				'n8n',
				'node-red',
				'activepieces',
				'libretranslate',
			],
			category: 'automation',
		},
		{
			type: 'horizontal',
			heading: 'Developer Tools',
			subheading: 'Build and deploy',
			apps: [
				'gitea',
				'code-server',
				'portainer',
				'grafana',
				'uptime-kuma',
				'dockge',
				'jupyterlab',
				'gitlab',
			],
			category: 'developer-tools',
		},
		{
			type: 'three-column',
			heading: 'Smart Home',
			subheading: 'Automate your life',
			apps: ['home-assistant', 'esphome', 'zigbee2mqtt'],
			textLocation: 'right',
			description: 'Control your entire home with powerful, open-source automation tools that respect your privacy.',
			category: 'automation',
		},
		{
			type: 'horizontal',
			heading: 'Social & Communication',
			subheading: 'Stay connected',
			apps: [
				'element',
				'mattermost',
				'synapse',
				'thelounge',
				'ntfy',
				'snapdrop',
				'databag',
				'usocial',
			],
			category: 'social',
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
