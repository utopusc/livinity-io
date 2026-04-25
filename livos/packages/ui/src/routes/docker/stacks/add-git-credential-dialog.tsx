// Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:3314-3448
// (deleted Phase 27-02).
//
// Nested credential creation dialog opened from DeployStackForm's Git tab.
// Stores HTTPS PAT (username + password) or SSH PEM private key — all
// encrypted at rest by the docker.createGitCredential tRPC route.
// Used by Phase 21 GitOps deploy flow.

import {useState} from 'react'

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
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

export function AddGitCredentialDialog({
	open,
	onClose,
	onCreated,
}: {
	open: boolean
	onClose: () => void
	onCreated: (credentialId: string) => void
}) {
	const [name, setName] = useState('')
	const [type, setType] = useState<'https' | 'ssh'>('https')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [privateKey, setPrivateKey] = useState('')

	const createMutation = trpcReact.docker.createGitCredential.useMutation({
		onSuccess: (data: any) => {
			if (data?.id) onCreated(data.id)
			onClose()
			setName('')
			setUsername('')
			setPassword('')
			setPrivateKey('')
		},
	})

	if (!open) return null

	const handleCreate = () => {
		if (!name.trim()) return
		if (type === 'https') {
			if (!username.trim() || !password.trim()) return
			createMutation.mutate({name: name.trim(), type, data: {username, password}})
		} else {
			// Server-side schema requires privateKey.length >= 50 (PEM is always longer).
			if (!privateKey.trim() || privateKey.length < 50) return
			createMutation.mutate({name: name.trim(), type, data: {privateKey}})
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Git Credential</DialogTitle>
					<DialogDescription>
						Stored encrypted at rest. Used only when cloning the repo on this server.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3'>
					<div className='space-y-1.5'>
						<Label htmlFor='cred-name'>Name</Label>
						<Input
							id='cred-name'
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='e.g. github-pat'
						/>
					</div>
					<div className='flex gap-2'>
						<button
							type='button'
							onClick={() => setType('https')}
							className={cn(
								'flex-1 rounded-lg border px-3 py-2 text-sm',
								type === 'https' ? 'border-brand bg-brand/10' : 'border-border-default',
							)}
						>
							HTTPS / PAT
						</button>
						<button
							type='button'
							onClick={() => setType('ssh')}
							className={cn(
								'flex-1 rounded-lg border px-3 py-2 text-sm',
								type === 'ssh' ? 'border-brand bg-brand/10' : 'border-border-default',
							)}
						>
							SSH Key
						</button>
					</div>
					{type === 'https' ? (
						<>
							<div className='space-y-1.5'>
								<Label htmlFor='cred-username'>Username</Label>
								<Input
									id='cred-username'
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder='your-github-username'
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='cred-password'>Personal Access Token</Label>
								<Input
									id='cred-password'
									type='password'
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder='ghp_xxxxxxxxxxxxxxxxxxxx'
								/>
							</div>
						</>
					) : (
						<div className='space-y-1.5'>
							<Label htmlFor='cred-private-key'>Private Key (PEM)</Label>
							<textarea
								id='cred-private-key'
								value={privateKey}
								onChange={(e) => setPrivateKey(e.target.value)}
								placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
								className='w-full rounded-lg border border-border-default bg-neutral-900 p-3 font-mono text-xs text-white placeholder:text-neutral-500'
								style={{minHeight: 160}}
								spellCheck={false}
							/>
						</div>
					)}
					{createMutation.isError && (
						<p className='text-xs text-red-500'>
							{createMutation.error?.message ?? 'Failed to create credential'}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose} disabled={createMutation.isPending}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={createMutation.isPending}>
						{createMutation.isPending ? 'Creating...' : 'Create'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
