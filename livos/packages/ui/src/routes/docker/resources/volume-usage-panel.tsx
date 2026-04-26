// Phase 26 Plan 26-02 — VolumeUsagePanel.
//
// Verbatim port of legacy routes/server-control/index.tsx:1687-1738 (deleted
// Phase 27-02).

import {trpcReact} from '@/trpc/trpc'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

// Volume Usage Panel -- shows containers using a volume
export function VolumeUsagePanel({volumeName}: {volumeName: string}) {
	const usageQuery = trpcReact.docker.volumeUsage.useQuery({name: volumeName})

	if (usageQuery.isLoading) {
		return (
			<div className='p-3'>
				<div className='space-y-2'>
					{Array.from({length: 2}).map((_, i) => (
						<div key={i} className='h-4 rounded bg-zinc-200 animate-pulse' />
					))}
				</div>
			</div>
		)
	}

	const containers = usageQuery.data ?? []

	if (containers.length === 0) {
		return (
			<div className='px-4 py-3'>
				<p className='text-xs text-zinc-500'>No containers using this volume</p>
			</div>
		)
	}

	return (
		<div className='px-4 py-3'>
			<div className='rounded-lg border border-zinc-200 bg-white overflow-hidden'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className='pl-3 text-xs'>Container</TableHead>
							<TableHead className='text-xs'>Mount Path</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{containers.map((c, i) => (
							<TableRow key={i} className='bg-white hover:bg-zinc-50'>
								<TableCell className='pl-3'>
									<span className='text-xs font-medium'>{c.containerName}</span>
								</TableCell>
								<TableCell>
									<span className='font-mono text-xs text-zinc-700'>{c.mountPath}</span>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}
