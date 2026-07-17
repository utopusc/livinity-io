// Phase 324-08 (FILES-02, D-08/D-09/D-10) — Settings > File access admin UI.
// A NEW lazy admin Settings section (cloned from the groups.tsx + settings-content
// 5-touchpoint lazy pattern) that is ADDITIVE IN THE ADMIN TREE ONLY — it never
// touches the Files app's own UI tree (D-10). It surfaces:
//   1. A per-folder grant editor over the 324-04 admin ACL procedures
//      (system.aclGrant / system.aclRevoke / system.aclList): pick a virtual path,
//      add a user- OR group-principal, set none/read/write, list + revoke grants.
//   2. A per-user Samba secondary-password surface (generate-once, shown once to
//      the admin, never synced from the login password) via system.sambaProvisionUser,
//      plus the OPT-IN, BREAKING per-user-auth migration toggle (sambaGetPerUserAuth /
//      sambaSetPerUserAuth) with a clear breaking-change warning.
// Every mutation is server-gated (adminProcedure, 324-04); this UI is a convenience
// surface. All copy flows through t('files-acl.*') + t('files-samba-user.*') with an
// en/tr twin per key (parity gate). Principal pickers reuse the Phase-322 sources
// (user.listAllUsers / groups.list) that the Groups section already uses.

import {useEffect, useState} from 'react'
import {TbAlertTriangle, TbCopy, TbKey, TbLoader2, TbPlus, TbServer2, TbTrash, TbUserShield, TbX} from 'react-icons/tb'
import {useCopyToClipboard} from 'react-use'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

type PrincipalType = 'user' | 'group'
type AclLevel = 'none' | 'read' | 'write'

export function FileAclsSection() {
	return (
		<div className='space-y-6'>
			<GrantEditor />
			<PerUserSambaPanel />
			<RecyclePolicyPanel />
			<SftpInfoPanel />
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-folder grant editor (aclGrant / aclRevoke / aclList)
// ─────────────────────────────────────────────────────────────────────────────

function GrantEditor() {
	const utils = trpcReact.useUtils()
	const [virtualPath, setVirtualPath] = useState('')
	const [activePath, setActivePath] = useState('')
	const [principalType, setPrincipalType] = useState<PrincipalType>('user')
	const [principalId, setPrincipalId] = useState('')
	const [level, setLevel] = useState<AclLevel>('read')

	const usersQ = trpcReact.user.listAllUsers.useQuery()
	const allUsers = usersQ.data ?? []
	const groupsQ = trpcReact.groups.list.useQuery()
	const allGroups = groupsQ.data ?? []

	// aclList is queried for the "loaded" path only (the one the admin committed via
	// the Load button), so typing does not spam the server on every keystroke.
	const listQ = trpcReact.system.aclList.useQuery(
		{virtualPath: activePath},
		{enabled: activePath.length > 0},
	)
	const grants = listQ.data ?? []

	const grantMut = trpcReact.system.aclGrant.useMutation({
		onSuccess: () => {
			if (activePath) utils.system.aclList.invalidate({virtualPath: activePath})
			setPrincipalId('')
			toast.success(t('files-acl.granted'))
		},
		onError: (error) => toast.error(error.message),
	})

	const revokeMut = trpcReact.system.aclRevoke.useMutation({
		onSuccess: () => {
			if (activePath) utils.system.aclList.invalidate({virtualPath: activePath})
			toast.success(t('files-acl.revoked'))
		},
		onError: (error) => toast.error(error.message),
	})

	const handleLoad = () => {
		const trimmed = virtualPath.trim()
		if (!trimmed) return
		setActivePath(trimmed)
	}

	const handleGrant = () => {
		const path = (activePath || virtualPath).trim()
		if (!path || !principalId) return
		// Adding a grant also pins the editor to this path so the list below reflects it.
		if (path !== activePath) setActivePath(path)
		grantMut.mutate({virtualPath: path, principalType, principalId, level})
	}

	// Switching principal type clears the selection (a user id is not a group id).
	const handlePrincipalTypeChange = (value: string) => {
		setPrincipalType(value as PrincipalType)
		setPrincipalId('')
	}

	const principalLabel = (type: PrincipalType, id: string) => {
		if (type === 'user') {
			const u = allUsers.find((x) => x.id === id)
			return u ? `@${u.username}` : id
		}
		const g = allGroups.find((x) => x.id === id)
		return g ? g.name : id
	}

	return (
		<div className='space-y-4'>
			<div>
				<h3 className='text-base font-medium text-text-primary'>{t('files-acl.title')}</h3>
				<p className='text-body-sm text-text-secondary'>{t('files-acl.description')}</p>
			</div>

			{/* Virtual path picker */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>{t('files-acl.path-label')}</label>
				<div className='flex items-center gap-2'>
					<Input
						value={virtualPath}
						onValueChange={setVirtualPath}
						placeholder={t('files-acl.path-placeholder')}
						className='flex-1'
					/>
					<Button variant='default' size='sm' className='h-11' onClick={handleLoad} disabled={!virtualPath.trim()}>
						{t('files-acl.load')}
					</Button>
				</div>
				<p className='text-caption text-text-tertiary'>{t('files-acl.path-hint')}</p>
			</div>

			{/* Add-grant row */}
			<div className='space-y-2 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='text-body-sm font-medium text-text-primary'>{t('files-acl.add-grant')}</div>
				<div className='grid gap-2 sm:grid-cols-[auto_1fr_auto]'>
					<Select value={principalType} onValueChange={handlePrincipalTypeChange}>
						<SelectTrigger className='w-full sm:w-32'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='user'>{t('files-acl.principal-user')}</SelectItem>
							<SelectItem value='group'>{t('files-acl.principal-group')}</SelectItem>
						</SelectContent>
					</Select>

					<Select value={principalId} onValueChange={setPrincipalId}>
						<SelectTrigger className='flex-1'>
							<SelectValue placeholder={t('files-acl.select-principal')} />
						</SelectTrigger>
						<SelectContent>
							{principalType === 'user'
								? allUsers.map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.display_name} (@{u.username})
										</SelectItem>
									))
								: allGroups.map((g) => (
										<SelectItem key={g.id} value={g.id}>
											{g.name}
										</SelectItem>
									))}
						</SelectContent>
					</Select>

					<Select value={level} onValueChange={(v) => setLevel(v as AclLevel)}>
						<SelectTrigger className='w-full sm:w-32'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='none'>{t('files-acl.level-none')}</SelectItem>
							<SelectItem value='read'>{t('files-acl.level-read')}</SelectItem>
							<SelectItem value='write'>{t('files-acl.level-write')}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Button
					variant='primary'
					size='sm'
					className='h-11'
					onClick={handleGrant}
					disabled={!(activePath || virtualPath).trim() || !principalId || grantMut.isPending}
				>
					{grantMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbPlus className='h-4 w-4' />}
					{t('files-acl.add-grant')}
				</Button>
			</div>

			{/* Existing grants for the loaded path */}
			{activePath && (
				<div className='space-y-2'>
					<div className='text-body-sm font-medium text-text-primary'>
						{t('files-acl.grants-for', {path: activePath})}
					</div>
					{listQ.isLoading ? (
						<div className='flex items-center justify-center py-6'>
							<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
						</div>
					) : grants.length === 0 ? (
						<div className='py-6 text-center text-body-sm text-text-tertiary'>{t('files-acl.empty')}</div>
					) : (
						<div className='space-y-1.5'>
							{grants.map((g) => (
								<div
									key={`${g.principal_type}:${g.principal_id}`}
									className='flex items-center justify-between rounded-radius-md border border-border-default/50 bg-surface-1 px-3 py-2'
								>
									<div className='flex min-w-0 items-center gap-2'>
										<span className='shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-caption text-brand'>
											{g.principal_type === 'user'
												? t('files-acl.principal-user')
												: t('files-acl.principal-group')}
										</span>
										<span className='truncate text-body-sm text-text-primary'>
											{principalLabel(g.principal_type, g.principal_id)}
										</span>
										<span className='shrink-0 text-caption text-text-tertiary'>
											{t(`files-acl.level-${g.level}` as 'files-acl.level-read')}
										</span>
									</div>
									<Button
										variant='default'
										size='sm'
										title={t('files-acl.revoke')}
										disabled={revokeMut.isPending}
										onClick={() =>
											revokeMut.mutate({
												virtualPath: activePath,
												principalType: g.principal_type,
												principalId: g.principal_id,
											})
										}
									>
										<TbX className='h-4 w-4' />
									</Button>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-user Samba secondary password + opt-in per-user-auth migration toggle
// ─────────────────────────────────────────────────────────────────────────────

function PerUserSambaPanel() {
	const utils = trpcReact.useUtils()
	const [, copyToClipboard] = useCopyToClipboard()
	const [selectedUsername, setSelectedUsername] = useState('')
	const [revealedPassword, setRevealedPassword] = useState<string | null>(null)

	const usersQ = trpcReact.user.listAllUsers.useQuery()
	const allUsers = usersQ.data ?? []

	const perUserAuthQ = trpcReact.system.sambaGetPerUserAuth.useQuery()
	const perUserAuth = perUserAuthQ.data?.perUserAuth ?? false

	const setAuthMut = trpcReact.system.sambaSetPerUserAuth.useMutation({
		onSuccess: (res) => {
			utils.system.sambaGetPerUserAuth.invalidate()
			toast.success(res.perUserAuth ? t('files-samba-user.migration-enabled') : t('files-samba-user.migration-disabled'))
		},
		onError: (error) => toast.error(error.message),
	})

	const provisionMut = trpcReact.system.sambaProvisionUser.useMutation({
		onSuccess: (res) => {
			// The secondary password is surfaced ONCE here — it is generate-once and
			// never synced from the login password (NTLM cannot derive from bcrypt).
			setRevealedPassword(res.password)
			if (res.provisioned) toast.success(t('files-samba-user.provisioned'))
			else toast.error(t('files-samba-user.provision-failed'))
		},
		onError: (error) => toast.error(error.message),
	})

	const handleToggle = (enabled: boolean) => {
		// Guard the BREAKING cutover behind an explicit confirm — existing SMB clients
		// on the shared account must re-authenticate as their own livos-<username>.
		if (enabled && !window.confirm(t('files-samba-user.migration-confirm'))) return
		setAuthMut.mutate({enabled})
	}

	const handleProvision = () => {
		if (!selectedUsername) return
		setRevealedPassword(null)
		provisionMut.mutate({username: selectedUsername})
	}

	return (
		<div className='space-y-4 border-t border-border-default pt-6'>
			<div className='flex items-start gap-2'>
				<TbUserShield className='mt-0.5 h-5 w-5 shrink-0 text-text-tertiary' />
				<div>
					<h3 className='text-base font-medium text-text-primary'>{t('files-samba-user.title')}</h3>
					<p className='text-body-sm text-text-secondary'>{t('files-samba-user.description')}</p>
				</div>
			</div>

			{/* Opt-in, breaking per-user-auth migration toggle */}
			<div className='space-y-2 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex items-center justify-between gap-3'>
					<div className='min-w-0'>
						<div className='text-body-sm font-medium text-text-primary'>{t('files-samba-user.migration-label')}</div>
						<div className='text-caption text-text-tertiary'>{t('files-samba-user.migration-hint')}</div>
					</div>
					<Switch
						checked={perUserAuth}
						onCheckedChange={handleToggle}
						disabled={setAuthMut.isPending || perUserAuthQ.isLoading}
					/>
				</div>
				<div className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-yellow-500' />
					<p className='text-caption text-text-secondary'>{t('files-samba-user.migration-warning')}</p>
				</div>
			</div>

			{/* Per-user secondary password (generate-once, shown once) */}
			<div className='space-y-2 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='text-body-sm font-medium text-text-primary'>{t('files-samba-user.password-label')}</div>
				<p className='text-caption text-text-tertiary'>{t('files-samba-user.password-hint')}</p>
				<div className='flex items-center gap-2'>
					<Select
						value={selectedUsername}
						onValueChange={(v) => {
							setSelectedUsername(v)
							setRevealedPassword(null)
						}}
					>
						<SelectTrigger className='flex-1'>
							<SelectValue placeholder={t('files-samba-user.select-user')} />
						</SelectTrigger>
						<SelectContent>
							{allUsers.map((u) => (
								<SelectItem key={u.id} value={u.username}>
									{u.display_name} (@{u.username})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant='primary'
						size='sm'
						className='h-11'
						onClick={handleProvision}
						disabled={!selectedUsername || provisionMut.isPending}
					>
						{provisionMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : <TbKey className='h-4 w-4' />}
						{t('files-samba-user.generate')}
					</Button>
				</div>

				{revealedPassword && (
					<div className='space-y-2 rounded-radius-md border border-brand/40 bg-brand/5 p-3'>
						<div className='flex items-center gap-2 text-caption text-brand'>
							<TbAlertTriangle className='h-4 w-4 shrink-0' />
							{t('files-samba-user.password-once-warning')}
						</div>
						<div className='flex items-center gap-2'>
							<code
								className={cn(
									'flex-1 select-all break-all rounded-radius-sm bg-surface-1 px-3 py-2',
									'font-mono text-body-sm text-text-primary',
								)}
							>
								{revealedPassword}
							</code>
							<Button
								variant='default'
								size='sm'
								title={t('files-samba-user.copy-password')}
								onClick={() => {
									copyToClipboard(revealedPassword)
									toast.success(t('files-samba-user.password-copied'))
								}}
							>
								<TbCopy className='h-4 w-4' />
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 338-03 (RECYCLE-01) — SMB recycle-bin soft-delete policy
// ─────────────────────────────────────────────────────────────────────────────
// A small settings card over system.recycleGetConfig / recycleSetConfig (both
// adminProcedure, server-gated — this UI is a convenience surface, never the authz
// boundary). Toggle + retention-days input + behaviour hints. No browse/restore
// controls (D-338-4: SMB-only restore in v1), no maxsize input (constant in v1).

function RecyclePolicyPanel() {
	const utils = trpcReact.useUtils()
	const configQ = trpcReact.system.recycleGetConfig.useQuery()
	const [enabled, setEnabled] = useState(false)
	const [purgeDays, setPurgeDays] = useState('30')

	// Seed local state from the server value once it loads (and re-seed after a save
	// invalidation so the fields reflect the persisted policy).
	useEffect(() => {
		if (configQ.data) {
			setEnabled(configQ.data.enabled)
			setPurgeDays(String(configQ.data.purgeDays))
		}
	}, [configQ.data])

	const saveMut = trpcReact.system.recycleSetConfig.useMutation({
		onSuccess: () => {
			utils.system.recycleGetConfig.invalidate()
			toast.success(t('files-recycle.saved'))
		},
		onError: (error) => toast.error(error.message),
	})

	const handleSave = () => {
		// Clamp to the server-enforced 1..3650 bound (defense-in-depth; the route
		// re-validates). A non-numeric field falls back to the default retention.
		const parsed = Number.parseInt(purgeDays, 10)
		const bounded = Number.isFinite(parsed) ? Math.min(3650, Math.max(1, parsed)) : 30
		saveMut.mutate({enabled, purgeDays: bounded})
	}

	return (
		<div className='space-y-4 border-t border-border-default pt-6'>
			<div className='flex items-start gap-2'>
				<TbTrash className='mt-0.5 h-5 w-5 shrink-0 text-text-tertiary' />
				<div>
					<h3 className='text-base font-medium text-text-primary'>{t('files-recycle.title')}</h3>
					<p className='text-body-sm text-text-secondary'>{t('files-recycle.description')}</p>
				</div>
			</div>

			<div className='space-y-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='flex items-center justify-between gap-3'>
					<div className='min-w-0'>
						<div className='text-body-sm font-medium text-text-primary'>{t('files-recycle.toggle')}</div>
						<div className='text-caption text-text-tertiary'>{t('files-recycle.toggle-hint')}</div>
					</div>
					<Switch checked={enabled} onCheckedChange={setEnabled} disabled={configQ.isLoading || saveMut.isPending} />
				</div>

				<div className='space-y-2'>
					<label className='text-caption text-text-secondary'>{t('files-recycle.retention-label')}</label>
					<Input
						type='number'
						min={1}
						max={3650}
						value={purgeDays}
						onValueChange={setPurgeDays}
						disabled={!enabled || configQ.isLoading || saveMut.isPending}
						className='w-40'
					/>
					<p className='text-caption text-text-tertiary'>{t('files-recycle.retention-hint')}</p>
				</div>

				<Button
					variant='primary'
					size='sm'
					className='h-11'
					onClick={handleSave}
					disabled={configQ.isLoading || saveMut.isPending}
				>
					{saveMut.isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : null}
					{t('files-recycle.save')}
				</Button>
			</div>

			<div className='space-y-1.5 rounded-radius-md bg-surface-1 p-3'>
				<p className='text-caption text-text-secondary'>{t('files-recycle.maxsize-hint')}</p>
				<p className='text-caption text-text-secondary'>{t('files-recycle.smb-only-note')}</p>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 338-03 (PROTO-01) — SFTP connection-info card
// ─────────────────────────────────────────────────────────────────────────────
// Informational only (mirrors the always-render WebDAV instructions — there is no
// WebDAV enable/disable toggle UI to clone, so no SFTP on/off toggle is invented in
// v1; the wrapper flip enables the service). Shows the address template (host / port
// 2022 / per-user credentials) + explicit LAN-only / not-tunnel-published messaging.

function SftpInfoPanel() {
	const [, copyToClipboard] = useCopyToClipboard()
	const address = 'sftp://<your-box-lan-ip>:2022'

	return (
		<div className='space-y-4 border-t border-border-default pt-6'>
			<div className='flex items-start gap-2'>
				<TbServer2 className='mt-0.5 h-5 w-5 shrink-0 text-text-tertiary' />
				<div>
					<h3 className='text-base font-medium text-text-primary'>{t('sftp.title')}</h3>
					<p className='text-body-sm text-text-secondary'>{t('sftp.description')}</p>
				</div>
			</div>

			<div className='space-y-3 rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div className='space-y-2'>
					<label className='text-caption text-text-secondary'>{t('sftp.address-hint')}</label>
					<div className='flex items-center gap-2'>
						<code className='flex-1 select-all break-all rounded-radius-sm bg-surface-1 px-3 py-2 font-mono text-body-sm text-text-primary'>
							{address}
						</code>
						<Button
							variant='default'
							size='sm'
							onClick={() => {
								copyToClipboard(address)
								toast.success(t('sftp.address-copied'))
							}}
						>
							<TbCopy className='h-4 w-4' />
						</Button>
					</div>
				</div>

				<p className='text-caption text-text-secondary'>{t('sftp.credentials-note')}</p>

				<div className='flex items-start gap-2 rounded-radius-md bg-surface-1 p-3'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-yellow-500' />
					<p className='text-caption text-text-secondary'>{t('sftp.lan-only-note')}</p>
				</div>

				<div className='space-y-1.5'>
					<p className='text-caption text-text-tertiary'>{t('sftp.windows-step')}</p>
					<p className='text-caption text-text-tertiary'>{t('sftp.macos-step')}</p>
					<p className='text-caption text-text-tertiary'>{t('sftp.linux-step')}</p>
				</div>
			</div>
		</div>
	)
}
