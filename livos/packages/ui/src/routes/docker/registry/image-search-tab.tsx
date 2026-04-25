// Phase 29 Plan 29-02 — Image Search tab (DOC-16).
//
// Search Docker Hub (anonymous) OR a private registry (using a saved
// credential) for images. Each result row exposes a Pull button that
// triggers docker.pullImage with optional registryId for auth + a target
// environment selector (defaults to the currently-selected env from
// useEnvironmentStore).

import {useState} from 'react'
import {IconCloudDownload, IconSearch, IconStar} from '@tabler/icons-react'
import {toast} from 'sonner'

import {useEnvironments} from '@/hooks/use-environments'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {LOCAL_ENV_ID, useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

const REGISTRY_HUB = '__hub__'

export function ImageSearchTab() {
	const [query, setQuery] = useState('')
	const [registryChoice, setRegistryChoice] = useState<string>(REGISTRY_HUB)
	const selectedEnvId = useSelectedEnvironmentId()
	const [targetEnvId, setTargetEnvId] = useState<string>(selectedEnvId)

	const {data: credentials = []} = trpcReact.docker.listRegistryCredentials.useQuery()
	const {data: environments = []} = useEnvironments()

	// Manually-triggered query — only fires after user clicks Search.
	const searchQuery = trpcReact.docker.searchImages.useQuery(
		{
			query,
			registryId: registryChoice === REGISTRY_HUB ? null : registryChoice,
		},
		{enabled: false, retry: false},
	)

	const pullMutation = trpcReact.docker.pullImage.useMutation({
		onSuccess: (_data, vars) => {
			toast.success(`Image '${vars.image}' pulled successfully`)
		},
		onError: (err: any, vars) => {
			toast.error(`Pull failed for '${vars.image}': ${err?.message ?? 'unknown error'}`)
		},
	})

	const handleSearch = () => {
		if (!query.trim()) return
		searchQuery.refetch()
	}

	const handlePull = (pullableRef: string) => {
		pullMutation.mutate({
			image: pullableRef,
			environmentId: targetEnvId === LOCAL_ENV_ID ? null : targetEnvId,
			registryId: registryChoice === REGISTRY_HUB ? null : registryChoice,
		})
	}

	const results = searchQuery.data ?? []
	const showError = searchQuery.isError && searchQuery.error
	const showEmpty =
		!searchQuery.isFetching && !searchQuery.isError && results.length === 0 && searchQuery.isFetched

	return (
		<div className='py-4'>
			<div className='mb-4 space-y-3'>
				<div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
					<div className='flex-1 space-y-1.5'>
						<label htmlFor='img-q' className='text-xs font-medium text-zinc-700 dark:text-zinc-300'>
							Search query
						</label>
						<Input
							id='img-q'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleSearch()
							}}
							placeholder='nginx, postgres, your-org/app…'
							maxLength={200}
						/>
					</div>
					<div className='space-y-1.5 sm:w-56'>
						<label className='text-xs font-medium text-zinc-700 dark:text-zinc-300'>
							Registry
						</label>
						<Select value={registryChoice} onValueChange={setRegistryChoice}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={REGISTRY_HUB}>Docker Hub (public)</SelectItem>
								{credentials.map((c: any) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button onClick={handleSearch} disabled={!query.trim() || searchQuery.isFetching}>
						<IconSearch size={14} className='mr-1' />
						{searchQuery.isFetching ? 'Searching…' : 'Search'}
					</Button>
				</div>
				<div className='flex items-center gap-2 text-xs text-zinc-500'>
					<span>Pull target:</span>
					<Select value={targetEnvId} onValueChange={setTargetEnvId}>
						<SelectTrigger className='h-7 w-56'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{environments.map((env: any) => (
								<SelectItem key={env.id} value={env.id}>
									{env.name} {env.id === LOCAL_ENV_ID ? '(local)' : ''}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{showError && (
				<div className='rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'>
					{searchQuery.error?.message ?? 'Search failed'}
				</div>
			)}

			{showEmpty && (
				<div className='rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'>
					No results. Try a different query or registry.
				</div>
			)}

			{!searchQuery.isFetched && !searchQuery.isFetching && (
				<div className='rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700'>
					Enter a search query and click Search.
				</div>
			)}

			{results.length > 0 && (
				<div className='overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800'>
					<table className='w-full text-sm'>
						<thead className='bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'>
							<tr>
								<th className='px-4 py-2 text-left font-medium'>Name</th>
								<th className='px-4 py-2 text-left font-medium'>Description</th>
								<th className='px-4 py-2 text-left font-medium'>Stars</th>
								<th className='px-4 py-2 text-right font-medium'>Action</th>
							</tr>
						</thead>
						<tbody className='divide-y divide-zinc-200 dark:divide-zinc-800'>
							{results.map((r: any) => (
								<tr
									key={`${r.source}:${r.name}`}
									className='hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
								>
									<td className='px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100'>
										<div className='flex items-center gap-2'>
											{r.name}
											{r.official && (
												<span className='rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'>
													Official
												</span>
											)}
										</div>
									</td>
									<td className='max-w-xs truncate px-4 py-2 text-xs text-zinc-700 dark:text-zinc-300'>
										{r.description || '—'}
									</td>
									<td className='px-4 py-2 text-xs text-zinc-700 dark:text-zinc-300'>
										{r.starCount > 0 ? (
											<span className='inline-flex items-center gap-1'>
												<IconStar size={11} />
												{r.starCount.toLocaleString()}
											</span>
										) : (
											'—'
										)}
									</td>
									<td className='px-4 py-2 text-right'>
										<Button
											size='sm'
											variant='outline'
											onClick={() => handlePull(r.pullableRef)}
											disabled={pullMutation.isPending}
										>
											<IconCloudDownload size={14} className='mr-1' />
											Pull
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
