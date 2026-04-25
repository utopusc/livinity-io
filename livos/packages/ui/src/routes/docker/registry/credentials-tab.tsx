// Phase 29 Plan 29-02 — Registry Credentials tab (DOC-16).
//
// Lists encrypted-at-rest registry credentials (Docker Hub or private).
// "+ Add Credential" opens AddRegistryCredentialDialog. Per-row Delete with
// confirmation prompt. encrypted_data is NEVER returned by the listRegistry
// Credentials query — only metadata (name, registry_url, username, created).

import {useState} from 'react'
import {IconPlus, IconTrash} from '@tabler/icons-react'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

import {AddRegistryCredentialDialog} from './add-credential-dialog'

export function CredentialsTab() {
	const [showAdd, setShowAdd] = useState(false)
	const utils = trpcReact.useUtils()
	const {data: credentials = [], isLoading} =
		trpcReact.docker.listRegistryCredentials.useQuery()

	const deleteMutation = trpcReact.docker.deleteRegistryCredential.useMutation({
		onSuccess: () => {
			toast.success('Credential deleted')
			utils.docker.listRegistryCredentials.invalidate()
		},
		onError: (err: any) => toast.error(err?.message ?? 'Failed to delete credential'),
	})

	const handleDelete = (id: string, name: string) => {
		if (!window.confirm(`Delete credential '${name}'? This cannot be undone.`)) return
		deleteMutation.mutate({id})
	}

	return (
		<div className='py-4'>
			<div className='mb-4 flex items-center justify-between'>
				<div>
					<h3 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
						Saved credentials
					</h3>
					<p className='text-xs text-zinc-500 dark:text-zinc-400'>
						Encrypted at rest. Used for authenticated pulls and private registry search.
					</p>
				</div>
				<Button onClick={() => setShowAdd(true)} size='sm'>
					<IconPlus size={14} className='mr-1' />
					Add Credential
				</Button>
			</div>

			{isLoading ? (
				<p className='py-8 text-center text-sm text-zinc-500'>Loading…</p>
			) : credentials.length === 0 ? (
				<div className='rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700'>
					<p className='text-sm text-zinc-600 dark:text-zinc-400'>
						No registry credentials yet.
					</p>
					<p className='mt-1 text-xs text-zinc-500 dark:text-zinc-500'>
						Add Docker Hub or private registry login to enable private image pulls and
						authenticated search.
					</p>
				</div>
			) : (
				<div className='overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800'>
					<table className='w-full text-sm'>
						<thead className='bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'>
							<tr>
								<th className='px-4 py-2 text-left font-medium'>Name</th>
								<th className='px-4 py-2 text-left font-medium'>Registry URL</th>
								<th className='px-4 py-2 text-left font-medium'>Username</th>
								<th className='px-4 py-2 text-left font-medium'>Created</th>
								<th className='px-4 py-2 text-right font-medium'>Actions</th>
							</tr>
						</thead>
						<tbody className='divide-y divide-zinc-200 dark:divide-zinc-800'>
							{credentials.map((c: any) => (
								<tr
									key={c.id}
									className='hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
								>
									<td className='px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100'>
										{c.name}
									</td>
									<td className='px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300'>
										{c.registryUrl}
									</td>
									<td className='px-4 py-2 text-zinc-700 dark:text-zinc-300'>
										{c.username}
									</td>
									<td className='px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400'>
										{new Date(c.createdAt).toLocaleDateString()}
									</td>
									<td className='px-4 py-2 text-right'>
										<Button
											variant='ghost'
											size='icon'
											onClick={() => handleDelete(c.id, c.name)}
											disabled={deleteMutation.isPending}
											aria-label={`Delete credential ${c.name}`}
											title='Delete credential'
										>
											<IconTrash size={14} />
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<AddRegistryCredentialDialog open={showAdd} onClose={() => setShowAdd(false)} />
		</div>
	)
}
