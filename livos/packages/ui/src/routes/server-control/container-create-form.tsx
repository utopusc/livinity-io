import {useState} from 'react'
import {IconPlus, IconX, IconLoader2} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {Switch} from '@/shadcn-components/ui/switch'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/shadcn-components/ui/tabs'
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/shadcn-components/ui/select'
import {Separator} from '@/shadcn-components/ui/separator'

interface ContainerCreateFormProps {
	open: boolean
	onClose: () => void
	onSuccess: () => void
}

type PortRow = {hostPort: string; containerPort: string; protocol: 'tcp' | 'udp'}
type VolumeRow = {type: 'bind' | 'volume' | 'tmpfs'; hostPath: string; volumeName: string; containerPath: string; readOnly: boolean}
type KVRow = {key: string; value: string}

const initialForm = () => ({
	name: '',
	image: '',
	command: '',
	entrypoint: '',
	workingDir: '',
	user: '',
	hostname: '',
	tty: false,
	openStdin: false,
	pullImage: true,
	autoStart: true,
	ports: [] as PortRow[],
	volumes: [] as VolumeRow[],
	env: [] as KVRow[],
	labels: [] as KVRow[],
	restartPolicy: 'no' as 'no' | 'always' | 'on-failure' | 'unless-stopped',
	maxRetries: 0,
	memoryLimitMB: '',
	cpuLimit: '',
	cpuShares: '',
	healthCheckTest: '',
	healthCheckInterval: '',
	healthCheckTimeout: '',
	healthCheckRetries: '',
	healthCheckStartPeriod: '',
	networkMode: 'bridge',
	dns: '',
	extraHosts: '',
})

export function ContainerCreateForm({open, onClose, onSuccess}: ContainerCreateFormProps) {
	const [form, setForm] = useState(initialForm)
	const [errors, setErrors] = useState<{name?: string; image?: string}>({})

	const createMutation = trpcReact.docker.createContainer.useMutation({
		onSuccess: () => {
			onSuccess()
			onClose()
			setForm(initialForm())
			setErrors({})
		},
	})

	if (!open) return null

	const set = <K extends keyof ReturnType<typeof initialForm>>(key: K, value: ReturnType<typeof initialForm>[K]) => {
		setForm((prev) => ({...prev, [key]: value}))
	}

	// --- Dynamic row helpers ---
	const addPort = () => set('ports', [...form.ports, {hostPort: '', containerPort: '', protocol: 'tcp'}])
	const removePort = (i: number) => set('ports', form.ports.filter((_, idx) => idx !== i))
	const updatePort = (i: number, field: keyof PortRow, value: string) => {
		const next = [...form.ports]
		next[i] = {...next[i], [field]: value}
		set('ports', next)
	}

	const addVolume = () =>
		set('volumes', [...form.volumes, {type: 'bind', hostPath: '', volumeName: '', containerPath: '', readOnly: false}])
	const removeVolume = (i: number) => set('volumes', form.volumes.filter((_, idx) => idx !== i))
	const updateVolume = (i: number, field: keyof VolumeRow, value: string | boolean) => {
		const next = [...form.volumes]
		next[i] = {...next[i], [field]: value}
		set('volumes', next)
	}

	const addEnv = () => set('env', [...form.env, {key: '', value: ''}])
	const removeEnv = (i: number) => set('env', form.env.filter((_, idx) => idx !== i))
	const updateEnv = (i: number, field: keyof KVRow, value: string) => {
		const next = [...form.env]
		next[i] = {...next[i], [field]: value}
		set('env', next)
	}

	const addLabel = () => set('labels', [...form.labels, {key: '', value: ''}])
	const removeLabel = (i: number) => set('labels', form.labels.filter((_, idx) => idx !== i))
	const updateLabel = (i: number, field: keyof KVRow, value: string) => {
		const next = [...form.labels]
		next[i] = {...next[i], [field]: value}
		set('labels', next)
	}

	// --- Submit ---
	const handleSubmit = () => {
		const newErrors: typeof errors = {}
		if (!form.name.trim()) newErrors.name = 'Name is required'
		if (!form.image.trim()) newErrors.image = 'Image is required'
		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors)
			return
		}
		setErrors({})

		const splitNonEmpty = (s: string, sep: string | RegExp = /\s+/) =>
			s
				.trim()
				.split(sep)
				.filter((x) => x.length > 0)

		const splitComma = (s: string) =>
			s
				.split(',')
				.map((x) => x.trim())
				.filter((x) => x.length > 0)

		// Build mutation input
		const input: Record<string, unknown> = {
			name: form.name.trim(),
			image: form.image.trim(),
			pullImage: form.pullImage,
			autoStart: form.autoStart,
		}

		if (form.command.trim()) input.command = splitNonEmpty(form.command)
		if (form.entrypoint.trim()) input.entrypoint = splitNonEmpty(form.entrypoint)
		if (form.workingDir.trim()) input.workingDir = form.workingDir.trim()
		if (form.user.trim()) input.user = form.user.trim()
		if (form.hostname.trim()) input.hostname = form.hostname.trim()
		if (form.tty) input.tty = true
		if (form.openStdin) input.openStdin = true

		// Ports
		const ports = form.ports
			.filter((p) => p.hostPort && p.containerPort)
			.map((p) => ({
				hostPort: parseInt(p.hostPort, 10),
				containerPort: parseInt(p.containerPort, 10),
				protocol: p.protocol,
			}))
		if (ports.length > 0) input.ports = ports

		// Volumes
		const volumes = form.volumes
			.filter((v) => v.containerPath)
			.map((v) => ({
				type: v.type,
				containerPath: v.containerPath,
				readOnly: v.readOnly,
				...(v.type === 'bind' && v.hostPath ? {hostPath: v.hostPath} : {}),
				...(v.type === 'volume' && v.volumeName ? {volumeName: v.volumeName} : {}),
			}))
		if (volumes.length > 0) input.volumes = volumes

		// Env
		const env = form.env.filter((e) => e.key.trim())
		if (env.length > 0) input.env = env

		// Labels
		const labels = form.labels.filter((l) => l.key.trim())
		if (labels.length > 0) input.labels = labels

		// Restart policy
		if (form.restartPolicy !== 'no') {
			input.restartPolicy = {
				name: form.restartPolicy,
				...(form.restartPolicy === 'on-failure' && form.maxRetries > 0 ? {maximumRetryCount: form.maxRetries} : {}),
			}
		}

		// Resources
		const resources: Record<string, number> = {}
		if (form.memoryLimitMB && parseFloat(form.memoryLimitMB) > 0) {
			resources.memoryLimit = Math.round(parseFloat(form.memoryLimitMB) * 1024 * 1024)
		}
		if (form.cpuLimit && parseFloat(form.cpuLimit) > 0) {
			resources.cpuLimit = parseFloat(form.cpuLimit)
		}
		if (form.cpuShares && parseInt(form.cpuShares, 10) > 0) {
			resources.cpuShares = parseInt(form.cpuShares, 10)
		}
		if (Object.keys(resources).length > 0) input.resources = resources

		// Health check
		const healthCheck: Record<string, unknown> = {}
		if (form.healthCheckTest.trim()) {
			healthCheck.test = ['CMD-SHELL', form.healthCheckTest.trim()]
		}
		if (form.healthCheckInterval && parseFloat(form.healthCheckInterval) > 0) {
			healthCheck.interval = Math.round(parseFloat(form.healthCheckInterval) * 1e9)
		}
		if (form.healthCheckTimeout && parseFloat(form.healthCheckTimeout) > 0) {
			healthCheck.timeout = Math.round(parseFloat(form.healthCheckTimeout) * 1e9)
		}
		if (form.healthCheckRetries && parseInt(form.healthCheckRetries, 10) > 0) {
			healthCheck.retries = parseInt(form.healthCheckRetries, 10)
		}
		if (form.healthCheckStartPeriod && parseFloat(form.healthCheckStartPeriod) > 0) {
			healthCheck.startPeriod = Math.round(parseFloat(form.healthCheckStartPeriod) * 1e9)
		}
		if (Object.keys(healthCheck).length > 0) input.healthCheck = healthCheck

		// Network
		if (form.networkMode && form.networkMode !== 'bridge') {
			input.networkMode = form.networkMode
		}
		const dns = splitComma(form.dns)
		if (dns.length > 0) input.dns = dns
		const extraHosts = splitComma(form.extraHosts)
		if (extraHosts.length > 0) input.extraHosts = extraHosts

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		createMutation.mutate(input as any)
	}

	return (
		<div className='absolute inset-0 z-50 flex flex-col bg-surface-base'>
			{/* Header */}
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-6 py-4'>
				<h2 className='text-lg font-semibold text-text-primary'>Create Container</h2>
				<button
					onClick={onClose}
					className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-primary'
				>
					<IconX size={18} />
				</button>
			</div>

			{/* Tabbed form */}
			<Tabs defaultValue='general' className='flex min-h-0 flex-1 flex-col'>
				<div className='shrink-0 border-b border-border-default px-6 pt-2'>
					<TabsList className='bg-transparent'>
						<TabsTrigger value='general'>General</TabsTrigger>
						<TabsTrigger value='network'>Network</TabsTrigger>
						<TabsTrigger value='volumes'>Volumes</TabsTrigger>
						<TabsTrigger value='environment'>Environment</TabsTrigger>
						<TabsTrigger value='resources'>Resources</TabsTrigger>
						<TabsTrigger value='healthcheck'>Health Check</TabsTrigger>
					</TabsList>
				</div>

				<div className='min-h-0 flex-1 overflow-auto px-6 py-4'>
					{/* ==================== General Tab ==================== */}
					<TabsContent value='general' className='mt-0'>
						<div className='space-y-5'>
							{/* Name + Image */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>
										Name <span className='text-red-400'>*</span>
									</Label>
									<Input
										sizeVariant='short-square'
										placeholder='my-container'
										value={form.name}
										onValueChange={(v) => set('name', v)}
										variant={errors.name ? 'destructive' : undefined}
									/>
									{errors.name && <p className='mt-1 text-xs text-red-400'>{errors.name}</p>}
								</div>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>
										Image <span className='text-red-400'>*</span>
									</Label>
									<Input
										sizeVariant='short-square'
										placeholder='nginx:latest'
										value={form.image}
										onValueChange={(v) => set('image', v)}
										variant={errors.image ? 'destructive' : undefined}
									/>
									{errors.image && <p className='mt-1 text-xs text-red-400'>{errors.image}</p>}
								</div>
							</div>

							{/* Toggles row */}
							<div className='flex items-center gap-6'>
								<div className='flex items-center gap-2'>
									<Switch checked={form.pullImage} onCheckedChange={(v) => set('pullImage', v)} />
									<Label className='text-text-secondary'>Always pull image</Label>
								</div>
								<div className='flex items-center gap-2'>
									<Switch checked={form.autoStart} onCheckedChange={(v) => set('autoStart', v)} />
									<Label className='text-text-secondary'>Auto start</Label>
								</div>
							</div>

							{/* Command + Entrypoint */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Command</Label>
									<Input
										sizeVariant='short-square'
										placeholder="e.g. /bin/sh -c 'echo hello'"
										value={form.command}
										onValueChange={(v) => set('command', v)}
									/>
								</div>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Entrypoint</Label>
									<Input
										sizeVariant='short-square'
										placeholder='e.g. /docker-entrypoint.sh'
										value={form.entrypoint}
										onValueChange={(v) => set('entrypoint', v)}
									/>
								</div>
							</div>

							{/* Working dir + User */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Working Directory</Label>
									<Input
										sizeVariant='short-square'
										placeholder='/app'
										value={form.workingDir}
										onValueChange={(v) => set('workingDir', v)}
									/>
								</div>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>User</Label>
									<Input
										sizeVariant='short-square'
										placeholder='e.g. root or 1000:1000'
										value={form.user}
										onValueChange={(v) => set('user', v)}
									/>
								</div>
							</div>

							{/* Hostname */}
							<div className='max-w-sm'>
								<Label className='mb-1.5 block text-text-secondary'>Hostname</Label>
								<Input
									sizeVariant='short-square'
									placeholder='container-hostname'
									value={form.hostname}
									onValueChange={(v) => set('hostname', v)}
								/>
							</div>

							{/* Console toggles */}
							<div>
								<Label className='mb-2 block text-text-secondary'>Console</Label>
								<div className='flex items-center gap-6'>
									<div className='flex items-center gap-2'>
										<Switch checked={form.tty} onCheckedChange={(v) => set('tty', v)} />
										<Label className='text-text-secondary'>TTY</Label>
									</div>
									<div className='flex items-center gap-2'>
										<Switch checked={form.openStdin} onCheckedChange={(v) => set('openStdin', v)} />
										<Label className='text-text-secondary'>Open stdin</Label>
									</div>
								</div>
							</div>

							{/* Restart Policy */}
							<div>
								<Label className='mb-1.5 block text-text-secondary'>Restart Policy</Label>
								<div className='flex items-center gap-3'>
									<Select
										value={form.restartPolicy}
										onValueChange={(v: typeof form.restartPolicy) => set('restartPolicy', v)}
									>
										<SelectTrigger className='h-10 w-56'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='no'>No</SelectItem>
											<SelectItem value='always'>Always</SelectItem>
											<SelectItem value='on-failure'>On failure</SelectItem>
											<SelectItem value='unless-stopped'>Unless stopped</SelectItem>
										</SelectContent>
									</Select>
									{form.restartPolicy === 'on-failure' && (
										<div className='flex items-center gap-2'>
											<Label className='whitespace-nowrap text-text-secondary'>Max retries</Label>
											<Input
												sizeVariant='short-square'
												type='number'
												className='w-20'
												min={0}
												value={form.maxRetries}
												onValueChange={(v) => set('maxRetries', parseInt(v, 10) || 0)}
											/>
										</div>
									)}
								</div>
							</div>
						</div>
					</TabsContent>

					{/* ==================== Network Tab ==================== */}
					<TabsContent value='network' className='mt-0'>
						<div className='space-y-5'>
							{/* Network mode */}
							<div className='max-w-sm'>
								<Label className='mb-1.5 block text-text-secondary'>Network Mode</Label>
								<Select value={form.networkMode} onValueChange={(v) => set('networkMode', v)}>
									<SelectTrigger className='h-10'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='bridge'>Bridge</SelectItem>
										<SelectItem value='host'>Host</SelectItem>
										<SelectItem value='none'>None</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* DNS */}
							<div className='max-w-md'>
								<Label className='mb-1.5 block text-text-secondary'>DNS Servers</Label>
								<Input
									sizeVariant='short-square'
									placeholder='8.8.8.8, 8.8.4.4'
									value={form.dns}
									onValueChange={(v) => set('dns', v)}
								/>
								<p className='mt-1 text-xs text-text-tertiary'>Comma-separated</p>
							</div>

							{/* Extra Hosts */}
							<div className='max-w-md'>
								<Label className='mb-1.5 block text-text-secondary'>Extra Hosts</Label>
								<Input
									sizeVariant='short-square'
									placeholder='host1:192.168.1.1, host2:10.0.0.1'
									value={form.extraHosts}
									onValueChange={(v) => set('extraHosts', v)}
								/>
								<p className='mt-1 text-xs text-text-tertiary'>Comma-separated, format: host:ip</p>
							</div>

							{/* Port Mappings */}
							<div>
								<Label className='mb-2 block text-text-secondary'>Port Mappings</Label>
								<div className='space-y-2'>
									{form.ports.map((port, i) => (
										<div key={i} className='flex items-center gap-2'>
											<Input
												sizeVariant='short-square'
												type='number'
												className='w-28'
												placeholder='Host port'
												value={port.hostPort}
												onValueChange={(v) => updatePort(i, 'hostPort', v)}
											/>
											<span className='text-text-tertiary'>:</span>
											<Input
												sizeVariant='short-square'
												type='number'
												className='w-28'
												placeholder='Container port'
												value={port.containerPort}
												onValueChange={(v) => updatePort(i, 'containerPort', v)}
											/>
											<Select
												value={port.protocol}
												onValueChange={(v) => updatePort(i, 'protocol', v)}
											>
												<SelectTrigger className='h-10 w-24'>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='tcp'>TCP</SelectItem>
													<SelectItem value='udp'>UDP</SelectItem>
												</SelectContent>
											</Select>
											<button
												onClick={() => removePort(i)}
												className='rounded p-1 text-text-tertiary transition-colors hover:text-red-500'
											>
												<IconX size={14} />
											</button>
										</div>
									))}
								</div>
								<button
									onClick={addPort}
									className='mt-2 flex items-center gap-1.5 text-sm text-brand transition-colors hover:text-brand/80'
								>
									<IconPlus size={14} />
									Add Port Mapping
								</button>
							</div>
						</div>
					</TabsContent>

					{/* ==================== Volumes Tab ==================== */}
					<TabsContent value='volumes' className='mt-0'>
						<div className='space-y-5'>
							<div>
								<Label className='mb-2 block text-text-secondary'>Volume Mounts</Label>
								<div className='space-y-2'>
									{form.volumes.map((vol, i) => (
										<div key={i} className='flex items-center gap-2'>
											<Select
												value={vol.type}
												onValueChange={(v) => updateVolume(i, 'type', v)}
											>
												<SelectTrigger className='h-10 w-28'>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value='bind'>Bind</SelectItem>
													<SelectItem value='volume'>Volume</SelectItem>
													<SelectItem value='tmpfs'>Tmpfs</SelectItem>
												</SelectContent>
											</Select>
											{vol.type === 'bind' && (
												<Input
													sizeVariant='short-square'
													className='w-44'
													placeholder='Host path'
													value={vol.hostPath}
													onValueChange={(v) => updateVolume(i, 'hostPath', v)}
												/>
											)}
											{vol.type === 'volume' && (
												<Input
													sizeVariant='short-square'
													className='w-44'
													placeholder='Volume name'
													value={vol.volumeName}
													onValueChange={(v) => updateVolume(i, 'volumeName', v)}
												/>
											)}
											{vol.type === 'tmpfs' && <div className='w-44' />}
											<Input
												sizeVariant='short-square'
												className='w-44'
												placeholder='Container path'
												value={vol.containerPath}
												onValueChange={(v) => updateVolume(i, 'containerPath', v)}
											/>
											<div className='flex items-center gap-1.5'>
												<Switch
													checked={vol.readOnly}
													onCheckedChange={(v) => updateVolume(i, 'readOnly', v)}
												/>
												<span className='text-xs text-text-tertiary'>RO</span>
											</div>
											<button
												onClick={() => removeVolume(i)}
												className='rounded p-1 text-text-tertiary transition-colors hover:text-red-500'
											>
												<IconX size={14} />
											</button>
										</div>
									))}
								</div>
								<button
									onClick={addVolume}
									className='mt-2 flex items-center gap-1.5 text-sm text-brand transition-colors hover:text-brand/80'
								>
									<IconPlus size={14} />
									Add Volume
								</button>
							</div>
						</div>
					</TabsContent>

					{/* ==================== Environment Tab ==================== */}
					<TabsContent value='environment' className='mt-0'>
						<div className='space-y-5'>
							{/* Env vars */}
							<div>
								<Label className='mb-2 block text-text-secondary'>Environment Variables</Label>
								<div className='space-y-2'>
									{form.env.map((e, i) => (
										<div key={i} className='flex items-center gap-2'>
											<Input
												sizeVariant='short-square'
												className='w-48'
												placeholder='KEY'
												value={e.key}
												onValueChange={(v) => updateEnv(i, 'key', v)}
											/>
											<span className='text-text-tertiary'>=</span>
											<Input
												sizeVariant='short-square'
												className='flex-1'
												placeholder='value'
												value={e.value}
												onValueChange={(v) => updateEnv(i, 'value', v)}
											/>
											<button
												onClick={() => removeEnv(i)}
												className='rounded p-1 text-text-tertiary transition-colors hover:text-red-500'
											>
												<IconX size={14} />
											</button>
										</div>
									))}
								</div>
								<button
									onClick={addEnv}
									className='mt-2 flex items-center gap-1.5 text-sm text-brand transition-colors hover:text-brand/80'
								>
									<IconPlus size={14} />
									Add Variable
								</button>
							</div>

							<Separator />

							{/* Labels */}
							<div>
								<Label className='mb-2 block text-text-secondary'>Labels</Label>
								<div className='space-y-2'>
									{form.labels.map((l, i) => (
										<div key={i} className='flex items-center gap-2'>
											<Input
												sizeVariant='short-square'
												className='w-48'
												placeholder='Key'
												value={l.key}
												onValueChange={(v) => updateLabel(i, 'key', v)}
											/>
											<span className='text-text-tertiary'>=</span>
											<Input
												sizeVariant='short-square'
												className='flex-1'
												placeholder='Value'
												value={l.value}
												onValueChange={(v) => updateLabel(i, 'value', v)}
											/>
											<button
												onClick={() => removeLabel(i)}
												className='rounded p-1 text-text-tertiary transition-colors hover:text-red-500'
											>
												<IconX size={14} />
											</button>
										</div>
									))}
								</div>
								<button
									onClick={addLabel}
									className='mt-2 flex items-center gap-1.5 text-sm text-brand transition-colors hover:text-brand/80'
								>
									<IconPlus size={14} />
									Add Label
								</button>
							</div>
						</div>
					</TabsContent>

					{/* ==================== Resources Tab ==================== */}
					<TabsContent value='resources' className='mt-0'>
						<div className='space-y-5'>
							<div className='max-w-sm'>
								<Label className='mb-1.5 block text-text-secondary'>Memory Limit</Label>
								<div className='flex items-center gap-2'>
									<Input
										sizeVariant='short-square'
										type='number'
										placeholder='512'
										value={form.memoryLimitMB}
										onValueChange={(v) => set('memoryLimitMB', v)}
									/>
									<span className='text-sm text-text-tertiary'>MB</span>
								</div>
							</div>

							<div className='max-w-sm'>
								<Label className='mb-1.5 block text-text-secondary'>CPU Limit</Label>
								<Input
									sizeVariant='short-square'
									type='number'
									placeholder='1000000000'
									value={form.cpuLimit}
									onValueChange={(v) => set('cpuLimit', v)}
								/>
								<p className='mt-1 text-xs text-text-tertiary'>In units of nanoCPUs. 1000000000 = 1 CPU core</p>
							</div>

							<div className='max-w-sm'>
								<Label className='mb-1.5 block text-text-secondary'>CPU Shares</Label>
								<Input
									sizeVariant='short-square'
									type='number'
									placeholder='1024'
									value={form.cpuShares}
									onValueChange={(v) => set('cpuShares', v)}
								/>
								<p className='mt-1 text-xs text-text-tertiary'>Relative weight. Default: 1024</p>
							</div>
						</div>
					</TabsContent>

					{/* ==================== Health Check Tab ==================== */}
					<TabsContent value='healthcheck' className='mt-0'>
						<div className='space-y-5'>
							<div>
								<Label className='mb-1.5 block text-text-secondary'>Test Command</Label>
								<Input
									sizeVariant='short-square'
									placeholder='curl -f http://localhost/ || exit 1'
									value={form.healthCheckTest}
									onValueChange={(v) => set('healthCheckTest', v)}
								/>
								<p className='mt-1 text-xs text-text-tertiary'>Wrapped in CMD-SHELL automatically</p>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Interval</Label>
									<div className='flex items-center gap-2'>
										<Input
											sizeVariant='short-square'
											type='number'
											placeholder='30'
											value={form.healthCheckInterval}
											onValueChange={(v) => set('healthCheckInterval', v)}
										/>
										<span className='text-sm text-text-tertiary'>seconds</span>
									</div>
								</div>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Timeout</Label>
									<div className='flex items-center gap-2'>
										<Input
											sizeVariant='short-square'
											type='number'
											placeholder='30'
											value={form.healthCheckTimeout}
											onValueChange={(v) => set('healthCheckTimeout', v)}
										/>
										<span className='text-sm text-text-tertiary'>seconds</span>
									</div>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Retries</Label>
									<Input
										sizeVariant='short-square'
										type='number'
										placeholder='3'
										value={form.healthCheckRetries}
										onValueChange={(v) => set('healthCheckRetries', v)}
									/>
								</div>
								<div>
									<Label className='mb-1.5 block text-text-secondary'>Start Period</Label>
									<div className='flex items-center gap-2'>
										<Input
											sizeVariant='short-square'
											type='number'
											placeholder='0'
											value={form.healthCheckStartPeriod}
											onValueChange={(v) => set('healthCheckStartPeriod', v)}
										/>
										<span className='text-sm text-text-tertiary'>seconds</span>
									</div>
								</div>
							</div>
						</div>
					</TabsContent>
				</div>
			</Tabs>

			{/* Footer */}
			<div className='shrink-0 border-t border-border-default px-6 py-4'>
				{createMutation.error && (
					<div className='mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400'>
						{createMutation.error.message}
					</div>
				)}
				<div className='flex items-center justify-end gap-3'>
					<button
						onClick={onClose}
						className='rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-1'
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={createMutation.isPending}
						className='flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50'
					>
						{createMutation.isPending && <IconLoader2 size={14} className='animate-spin' />}
						Create
					</button>
				</div>
			</div>
		</div>
	)
}
