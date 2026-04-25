// Phase 29 Plan 29-02 — Add Registry Credential dialog (DOC-16).
//
// Modal form: Name + Registry URL (default Docker Hub) + Username + Password.
// Submit creates an encrypted-at-rest credential via
// docker.createRegistryCredential. Dialog closes + invalidates the parent
// list query on success.
//
// Mirrors AddGitCredentialDialog UX from Plan 21-02.

import {useState} from 'react'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {trpcReact} from '@/trpc/trpc'

const DEFAULT_DOCKER_HUB = 'https://index.docker.io/v1/'

export function AddRegistryCredentialDialog({
	open,
	onClose,
	onCreated,
}: {
	open: boolean
	onClose: () => void
	onCreated?: (credentialId: string) => void
}) {
	const [name, setName] = useState('')
	const [registryUrl, setRegistryUrl] = useState(DEFAULT_DOCKER_HUB)
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')

	const utils = trpcReact.useUtils()
	const createMutation = trpcReact.docker.createRegistryCredential.useMutation({
		onSuccess: (data: any) => {
			toast.success(`Credential '${data?.name}' saved`)
			utils.docker.listRegistryCredentials.invalidate()
			if (data?.id) onCreated?.(data.id)
			handleClose()
		},
		onError: (err: any) => {
			// CONFLICT (duplicate name) renders inline; other errors → toast
			if (err?.data?.code !== 'CONFLICT') {
				toast.error(err?.message ?? 'Failed to create credential')
			}
		},
	})

	const handleClose = () => {
		setName('')
		setRegistryUrl(DEFAULT_DOCKER_HUB)
		setUsername('')
		setPassword('')
		onClose()
	}

	const handleCreate = () => {
		if (!name.trim()) return
		if (!registryUrl.trim()) return
		if (!username.trim()) return
		if (!password.trim()) return
		createMutation.mutate({
			name: name.trim(),
			registryUrl: registryUrl.trim(),
			username: username.trim(),
			password,
		})
	}

	if (!open) return null

	return (
		<Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Registry Credential</DialogTitle>
					<DialogDescription>
						Stored encrypted at rest (AES-256-GCM). Used for authenticated image pulls and
						private registry search.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3'>
					<div className='space-y-1.5'>
						<Label htmlFor='reg-name'>Name</Label>
						<Input
							id='reg-name'
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='e.g. docker-hub'
							maxLength={100}
						/>
					</div>
					<div className='space-y-1.5'>
						<Label htmlFor='reg-url'>Registry URL</Label>
						<Input
							id='reg-url'
							type='url'
							value={registryUrl}
							onChange={(e) => setRegistryUrl(e.target.value)}
							placeholder={DEFAULT_DOCKER_HUB}
						/>
					</div>
					<div className='space-y-1.5'>
						<Label htmlFor='reg-username'>Username</Label>
						<Input
							id='reg-username'
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder='your-registry-username'
							autoComplete='off'
						/>
					</div>
					<div className='space-y-1.5'>
						<Label htmlFor='reg-password'>Password / Token</Label>
						<Input
							id='reg-password'
							type='password'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder='••••••••'
							autoComplete='new-password'
						/>
					</div>
					{createMutation.isError && (
						<p className='text-xs text-red-500'>
							{createMutation.error?.message ?? 'Failed to create credential'}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={handleClose} disabled={createMutation.isPending}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={createMutation.isPending}>
						{createMutation.isPending ? 'Saving...' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
