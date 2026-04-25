// Phase 29 Plan 29-01 — cmd+k command palette modal (DOC-18).
//
// Searches across all 7 categories: containers / stacks / images / volumes /
// networks / environments / sections. Result click → close palette + write
// the appropriate selection into resource-store + flip section.
//
// Result-click ordering (anti-pitfall):
//   1. addRecent(query) FIRST — so the recent list updates regardless of
//      whether the user clicks or hits Enter.
//   2. closePalette() — start the modal animation immediately so the page
//      underneath becomes visible without waiting for navigation.
//   3. setSelectedX + setSection — these trigger a re-render of the page;
//      with the modal already closing, no flicker.
//   React 18 batches the latter two into the same commit.
//
// CommandInput maxLength=200 (T-29-01) bounds the per-keystroke render cost
// and matches the `query.slice(0, 200)` defensive bound in
// buildPaletteResults.
//
// The component is mounted ONCE at the DockerApp tree root (not inside the
// SearchButton), so the cmd+k listener can open it from any section.

import {
	IconBox,
	IconCloudDownload,
	IconDatabase,
	IconLayoutDashboard,
	IconLogs,
	IconNetwork,
	IconPhoto,
	IconSettings,
	IconStack2,
	IconTerminal2,
	IconActivity,
	IconClock,
	IconWorld,
	IconHistory,
} from '@tabler/icons-react'
import {useMemo, useState} from 'react'

import {useContainers} from '@/hooks/use-containers'
import {useEnvironments} from '@/hooks/use-environments'
import {useImages} from '@/hooks/use-images'
import {useNetworks} from '@/hooks/use-networks'
import {useStacks} from '@/hooks/use-stacks'
import {useVolumes} from '@/hooks/use-volumes'
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/shadcn-components/ui/command'
import {useEnvironmentStore} from '@/stores/environment-store'

import {useDockerResource} from '../resource-store'
import {useDockerStore, type SectionId} from '../store'
import {buildPaletteResults, type PaletteResult, type ResultCategory} from './palette-results'
import {usePaletteStore} from './use-palette-store'
import {useRecentSearches} from './use-recent-searches'

const SECTION_ICONS: Record<SectionId, React.ComponentType<{size?: number; className?: string}>> = {
	dashboard: IconLayoutDashboard,
	containers: IconBox,
	logs: IconLogs,
	shell: IconTerminal2,
	stacks: IconStack2,
	images: IconPhoto,
	volumes: IconDatabase,
	networks: IconNetwork,
	registry: IconCloudDownload,
	activity: IconActivity,
	schedules: IconClock,
	settings: IconSettings,
}

const CATEGORY_ICONS: Record<ResultCategory, React.ComponentType<{size?: number; className?: string}>> = {
	containers: IconBox,
	stacks: IconStack2,
	images: IconPhoto,
	volumes: IconDatabase,
	networks: IconNetwork,
	environments: IconWorld,
	sections: IconLayoutDashboard,
}

const CATEGORY_HEADINGS: Record<ResultCategory, string> = {
	containers: 'Containers',
	stacks: 'Stacks',
	images: 'Images',
	volumes: 'Volumes',
	networks: 'Networks',
	environments: 'Environments',
	sections: 'Sections',
}

export function CommandPalette() {
	const open = usePaletteStore((s) => s.open)
	const setOpen = usePaletteStore((s) => s.setOpen)
	const closePalette = usePaletteStore((s) => s.closePalette)

	const [query, setQuery] = useState('')

	const {containers} = useContainers()
	const {images} = useImages()
	const {stacks} = useStacks()
	const {volumes} = useVolumes()
	const {networks} = useNetworks()
	const environmentsQ = useEnvironments()
	const environments = environmentsQ.data ?? []

	const {recent, addRecent} = useRecentSearches()

	const results = useMemo(
		() =>
			buildPaletteResults({
				query,
				containers,
				stacks,
				images,
				volumes,
				networks,
				environments,
			}),
		[query, containers, stacks, images, volumes, networks, environments],
	)

	const totalResults =
		results.containers.length +
		results.stacks.length +
		results.images.length +
		results.volumes.length +
		results.networks.length +
		results.environments.length +
		results.sections.length

	const showRecent = !query.trim() && recent.length > 0

	const handleSelect = (result: PaletteResult) => {
		// Anti-pitfall: addRecent(query) — store the QUERY the user typed,
		// not the result label. Matches the user's mental model.
		addRecent(query)

		// Close FIRST so the modal animation kicks off before navigation.
		closePalette()

		// Then mutate stores. React 18 batches both into a single render.
		switch (result.category) {
			case 'containers':
				useDockerResource.getState().setSelectedContainer(result.id)
				useDockerStore.getState().setSection('containers')
				break
			case 'images':
				useDockerResource.getState().setSelectedImage(result.id)
				useDockerStore.getState().setSection('images')
				break
			case 'volumes':
				useDockerResource.getState().setSelectedVolume(result.id)
				useDockerStore.getState().setSection('volumes')
				break
			case 'networks':
				useDockerResource.getState().setSelectedNetwork(result.id)
				useDockerStore.getState().setSection('networks')
				break
			case 'stacks':
				useDockerResource.getState().setSelectedStack(result.id)
				useDockerStore.getState().setSection('stacks')
				break
			case 'environments':
				useEnvironmentStore.getState().setEnvironment(result.id)
				break
			case 'sections':
				useDockerStore.getState().setSection(result.id as SectionId)
				break
		}

		// Reset query for next open.
		setQuery('')
	}

	const handleRecentSelect = (q: string) => {
		setQuery(q)
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) setQuery('')
			}}
		>
			<CommandInput
				placeholder='Search containers, stacks, images, environments…'
				value={query}
				onValueChange={setQuery}
				maxLength={200}
			/>

			<CommandList>
				{showRecent && (
					<CommandGroup heading='Recent'>
						{recent.map((q) => (
							<CommandItem
								key={`recent-${q}`}
								value={`recent-${q}`}
								onSelect={() => handleRecentSelect(q)}
								icon={<IconHistory size={20} className='text-text-tertiary' />}
							>
								<span className='font-mono'>{q}</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{totalResults === 0 && <CommandEmpty>No results.</CommandEmpty>}

				<CategoryGroup
					results={results.containers}
					category='containers'
					onSelect={handleSelect}
				/>
				<CategoryGroup results={results.stacks} category='stacks' onSelect={handleSelect} />
				<CategoryGroup results={results.images} category='images' onSelect={handleSelect} />
				<CategoryGroup results={results.volumes} category='volumes' onSelect={handleSelect} />
				<CategoryGroup results={results.networks} category='networks' onSelect={handleSelect} />
				<CategoryGroup
					results={results.environments}
					category='environments'
					onSelect={handleSelect}
				/>
				<CategoryGroup
					results={results.sections}
					category='sections'
					onSelect={handleSelect}
				/>
			</CommandList>
		</CommandDialog>
	)
}

function CategoryGroup({
	results,
	category,
	onSelect,
}: {
	results: PaletteResult[]
	category: ResultCategory
	onSelect: (r: PaletteResult) => void
}) {
	if (results.length === 0) return null
	const heading = CATEGORY_HEADINGS[category]
	return (
		<CommandGroup heading={heading}>
			{results.map((result) => {
				const Icon =
					category === 'sections'
						? SECTION_ICONS[result.id as SectionId]
						: CATEGORY_ICONS[category]
				return (
					<CommandItem
						key={`${category}-${result.id}`}
						value={`${category}-${result.id}-${result.label}`}
						onSelect={() => onSelect(result)}
						icon={Icon ? <Icon size={20} className='text-text-tertiary' /> : undefined}
					>
						<span className='truncate font-mono'>{result.label}</span>
						{result.sublabel && (
							<span className='ml-2 truncate text-xs text-text-tertiary'>{result.sublabel}</span>
						)}
					</CommandItem>
				)
			})}
		</CommandGroup>
	)
}
