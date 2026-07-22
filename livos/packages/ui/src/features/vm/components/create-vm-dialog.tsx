// Phase 352-03 (VMAPP-02/03) — Create-VM modal.
//
// Consumes the shipped `vm.createOptions` payload (351) and drives `vm.create`.
// The add-webapp-dialog composition idiom: a Dialog + local useState form +
// mutation.isPending + inline mutation.error?.message + reset-on-close.
//
// Honesty invariants this modal is required to hold (352-03 threat model):
//   - The Windows BYO-license notice is rendered VERBATIM from
//     optionsQ.data.byoLicenseNotice — NEVER re-hardcoded in this source or in
//     i18n (the guard test asserts a distinctive backend substring is ABSENT
//     here; only a generic wrapping label is translated).  (T-352-03-02)
//   - gpu.status is a HARDCODED 'unsupported' — so NO toggle control is ever
//     rendered, at most a plain info line. Never a fake "coming soon" affordance.
//     (T-352-03-01)
//   - The EULA-excluded desktop OS is ABSENT everywhere — the OS picker iterates
//     ONLY the API's os.windows / os.linux records, plus a format-agnostic
//     custom-image path. (T-352-03-03)
//   - Host capacity is DISPLAY-ONLY labels — never a client-side hard block; the
//     server re-validates on create and its refusal surfaces verbatim inline +
//     toast (BAD_REQUEST resource reasons, CONFLICT "...already in progress").
//     (T-352-03-04 / -05)
import {Monitor} from 'lucide-react'
import {useState} from 'react'
import {TbLoader2} from 'react-icons/tb'
import {toast} from 'sonner'

import {Loading} from '@/components/ui/loading'
import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input, Labeled} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'
import {useCurrentUser} from '@/hooks/use-current-user'
import {t} from '@/utils/i18n'

import {OsIcon} from './os-icon'

type Resources = {cpus: number; ramMiB: number; diskGiB: number}

// A sensible starting point before any OS is picked — pre-filled from the chosen
// OS's per-OS defaults on selection (all fields stay editable regardless).
const BASE_RESOURCES: Resources = {cpus: 2, ramMiB: 2048, diskGiB: 16}

const GIB = 1024 * 1024 * 1024
const toGiB = (bytes: number) => Math.round(bytes / GIB)
const num = (v: string) => {
	const n = Number(v)
	return Number.isFinite(n) && n > 0 ? n : 0
}

export function CreateVmDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	// Phase 359 (VMUSER-01): the installing user's own username is the Windows guest
	// default (prefilled, still editable) — a purely client-side prefill (no extra
	// backend for it; the server re-validates the regex on create).
	const {isAdmin, username: myUsername} = useCurrentUser()
	const utils = trpcReact.useUtils()

	// The dialog only ever renders inside the admin-gated surface; gate the query
	// too for consistency (never fire an adminProcedure as a non-admin).
	const optionsQ = trpcReact.vm.createOptions.useQuery(undefined, {enabled: isAdmin})

	// Form state. `osValue` encodes the single OS choice: 'win:<edition>',
	// 'linux:<distro>', or 'custom' (a URL/local-path image, linux kind).
	const [name, setName] = useState('')
	const [osValue, setOsValue] = useState('')
	const [customMode, setCustomMode] = useState<'url' | 'localPath'>('url')
	const [customValue, setCustomValue] = useState('')
	const [resources, setResources] = useState<Resources>(BASE_RESOURCES)
	// Phase 359 (VMUSER-01): the Windows guest username. Empty until a Windows OS is
	// selected, then prefilled with the installing user's username (still editable).
	const [username, setUsername] = useState('')

	const createMut = trpcReact.vm.create.useMutation({
		onSuccess: () => {
			utils.vm.list.invalidate()
			handleOpenChange(false)
		},
		onError: (error) => toast.error(error.message), // BAD_REQUEST / CONFLICT verbatim
	})

	const resetState = () => {
		setName('')
		setOsValue('')
		setCustomMode('url')
		setCustomValue('')
		setResources(BASE_RESOURCES)
		setUsername('')
	}

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next)
		if (!next) {
			resetState()
			createMut.reset()
		}
	}

	// Selecting an OS pre-fills resources from that entry's defaults (editable).
	const handleOsChange = (val: string) => {
		setOsValue(val)
		const opts = optionsQ.data
		if (!opts) return
		if (val.startsWith('win:')) {
			const key = val.slice('win:'.length)
			const entry = opts.os.windows[key as keyof typeof opts.os.windows]
			if (entry) setResources({...entry.defaults})
			// Phase 359 (VMUSER-01): prefill the guest username with the installing
			// user's own name — but only if untouched, so a re-pick never clobbers an
			// edit (mirrors the resources-defaults prefill idiom).
			if (!username) setUsername(myUsername ?? '')
		} else if (val.startsWith('linux:')) {
			const key = val.slice('linux:'.length)
			const entry = opts.os.linux[key as keyof typeof opts.os.linux]
			if (entry) setResources({...entry.defaults})
		}
		// 'custom' keeps the current resources (no per-OS defaults exist for it).
	}

	const isWindows = osValue.startsWith('win:')
	const isCustom = osValue === 'custom'

	const osChosen = osValue !== ''
	const customOk = isCustom ? customValue.trim().length > 0 : true
	const resourcesOk = resources.cpus > 0 && resources.ramMiB > 0 && resources.diskGiB > 0
	const canSubmit = name.trim().length > 0 && osChosen && customOk && resourcesOk && !createMut.isPending

	const handleSubmit = () => {
		if (!canSubmit) return
		const trimmedName = name.trim()
		if (osValue.startsWith('win:')) {
			const edition = osValue.slice('win:'.length)
			// Phase 359 (VMUSER-01): thread a non-empty username onto os.username; an
			// empty one is OMITTED so the server default applies. Windows-only — the
			// linux/custom branches carry no username (no account injection).
			const trimmedUser = username.trim()
			createMut.mutate({
				name: trimmedName,
				kind: 'windows',
				resources,
				os: {edition: edition as never, ...(trimmedUser ? {username: trimmedUser} : {})},
			})
			return
		}
		if (osValue.startsWith('linux:')) {
			const distro = osValue.slice('linux:'.length)
			createMut.mutate({name: trimmedName, kind: 'linux', resources, os: {distro: distro as never}})
			return
		}
		// custom image — URL or local path, mutually exclusive by construction.
		const value = customValue.trim()
		const customImage = customMode === 'url' ? {url: value} : {localPath: value}
		createMut.mutate({name: trimmedName, kind: 'linux', resources, os: {customImage}})
	}

	const opts = optionsQ.data

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('vm.create.title')}</DialogTitle>
					</DialogHeader>

					{optionsQ.isLoading || !opts ? (
						<div className='flex items-center justify-center py-8'>
							<Loading />
						</div>
					) : (
						<div className='flex flex-col gap-4'>
							<Labeled label={t('vm.create.name-label')}>
								<Input value={name} onValueChange={setName} autoFocus />
							</Labeled>

							<div className='flex flex-col gap-1.5'>
								<span className='text-caption text-text-secondary'>{t('vm.create.os-label')}</span>
								<Select value={osValue} onValueChange={handleOsChange}>
									<SelectTrigger>
										<SelectValue placeholder={t('vm.create.os-label')} />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel>Windows</SelectLabel>
											{Object.entries(opts.os.windows).map(([key, entry]) => (
												<SelectItem key={`win:${key}`} value={`win:${key}`}>
													<span className='flex items-center gap-2'>
														<OsIcon kind='windows' edition={key} className='h-4 w-4' />
														{entry.label}
													</span>
												</SelectItem>
											))}
										</SelectGroup>
										<SelectGroup>
											<SelectLabel>Linux</SelectLabel>
											{Object.entries(opts.os.linux).map(([key, entry]) => (
												<SelectItem key={`linux:${key}`} value={`linux:${key}`}>
													<span className='flex items-center gap-2'>
														<OsIcon kind='linux' distro={key} className='h-4 w-4' />
														{entry.label}
													</span>
												</SelectItem>
											))}
										</SelectGroup>
										<SelectGroup>
											<SelectItem value='custom'>
												<span className='flex items-center gap-2'>
													<Monitor className='h-4 w-4' aria-hidden='true' />
													{t('vm.create.os-custom')}
												</span>
											</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>

							{/* Custom-image sub-mode: URL or local path, mutually exclusive. */}
							{isCustom ? (
								<div className='flex flex-col gap-2 rounded-radius-md border border-border-default bg-surface-1 p-3'>
									<div className='flex gap-2'>
										<Button
											size='sm'
											variant={customMode === 'url' ? 'primary' : 'ghost'}
											onClick={() => setCustomMode('url')}
										>
											{t('vm.create.custom-url-label')}
										</Button>
										<Button
											size='sm'
											variant={customMode === 'localPath' ? 'primary' : 'ghost'}
											onClick={() => setCustomMode('localPath')}
										>
											{t('vm.create.custom-localpath-label')}
										</Button>
									</div>
									<Input
										value={customValue}
										onValueChange={setCustomValue}
										placeholder={
											customMode === 'url'
												? t('vm.create.custom-url-label')
												: t('vm.create.custom-localpath-label')
										}
									/>
								</div>
							) : null}

							{/* Windows BYO-license notice — VERBATIM from the query, never hardcoded. */}
							{isWindows ? (
								<div className='flex flex-col gap-1 rounded-radius-md border border-border-default bg-surface-1 p-3'>
									<span className='text-caption font-medium text-text-secondary'>
										{t('vm.create.license-notice-label')}
									</span>
									<span className='text-caption text-text-tertiary'>{opts.byoLicenseNotice}</span>
								</div>
							) : null}

							{/* Phase 359 (VMUSER-01): Windows-only guest username, prefilled with the
							    installing user's name (editable). For a Linux/custom image there is NO
							    account injection upstream — render an HONEST note, never a fake field. */}
							{isWindows ? (
								<Labeled label={t('vm.create.username-label')}>
									<Input value={username} onValueChange={setUsername} />
									<p className='mt-1 text-caption text-text-tertiary'>{t('vm.create.username-hint')}</p>
								</Labeled>
							) : osChosen ? (
								<p className='text-caption text-text-tertiary'>{t('vm.create.username-linux-note')}</p>
							) : null}

							{/* Resources — pre-filled from the OS defaults, editable, shown against
							    DISPLAY-ONLY host capacity (never a client hard block). */}
							<div className='grid grid-cols-3 gap-2'>
								<Labeled label={t('vm.create.cpus-label')}>
									<Input
										type='number'
										value={String(resources.cpus)}
										onValueChange={(v) => setResources((r) => ({...r, cpus: num(v)}))}
									/>
								</Labeled>
								<Labeled label={t('vm.create.ram-label')}>
									<Input
										type='number'
										value={String(resources.ramMiB)}
										onValueChange={(v) => setResources((r) => ({...r, ramMiB: num(v)}))}
									/>
								</Labeled>
								<Labeled label={t('vm.create.disk-label')}>
									<Input
										type='number'
										value={String(resources.diskGiB)}
										onValueChange={(v) => setResources((r) => ({...r, diskGiB: num(v)}))}
									/>
								</Labeled>
							</div>
							<p className='text-caption text-text-tertiary'>
								{t('vm.create.host-capacity-hint', {
									cpu: opts.hostCapacity.cpuCount,
									ram: toGiB(opts.hostCapacity.totalMemBytes),
									disk: toGiB(opts.hostCapacity.diskFreeBytes),
								})}
							</p>

							{/* GPU: gpu.status is a HARDCODED 'unsupported' → NO toggle, just an
							    honest info line. Never a disabled fake toggle control. */}
							{opts.gpu.status === 'unsupported' ? (
								<p className='text-caption text-text-tertiary'>{t('vm.create.gpu-unsupported')}</p>
							) : null}

							{/* Server refusal surfaces verbatim inline (in addition to the toast) so
							    a resource-named BAD_REQUEST stays visible without dismissing. */}
							{createMut.isError ? (
								<p className='text-caption text-destructive2'>{createMut.error?.message}</p>
							) : null}
						</div>
					)}

					<DialogFooter>
						<Button size='dialog' onClick={() => handleOpenChange(false)} disabled={createMut.isPending}>
							{t('cancel')}
						</Button>
						<Button size='dialog' variant='primary' onClick={handleSubmit} disabled={!canSubmit}>
							{createMut.isPending ? (
								<span className='flex items-center gap-1.5'>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									{t('vm.create.submitting')}
								</span>
							) : (
								t('vm.create.submit')
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
