// Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:2799-3307
// (deleted Phase 27-02).
//
// Full-page overlay (absolute inset-0 z-50) that handles BOTH new-stack
// deploy and edit-stack flows. Three tabs in deploy mode:
//   - YAML  : paste compose YAML (legacy default).
//   - Git   : Plan 21-02 GitOps — clone repo + branch + composePath +
//             optional credential, surfaces webhook URL + secret after
//             successful deploy. Form stays open until Done.
//   - AI    : Phase 23 AID-03 — natural-language prompt → Kimi-generated
//             compose YAML preview → "Use this YAML" pipes back to YAML tab.
// Edit mode is YAML-only (v1) — switching a stack between YAML / git would
// need backend support in editStack.
//
// `hasValue` on env vars is UI-only — signals "this row holds a stored
// secret with the value redacted by the server; leaving the value blank on
// submit means KEEP existing". `secret` flags a value that the backend
// must encrypt to Redis (never written to .env on disk).
//
// Cross-import: ./ai-compose-tab + ./add-git-credential-dialog (this dir).

import {useEffect, useState} from 'react'
import {IconCheck, IconCopy, IconLock, IconPlus, IconRefresh, IconX} from '@tabler/icons-react'

import {useStacks} from '@/hooks/use-stacks'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

import {AddGitCredentialDialog} from './add-git-credential-dialog'
import {AiComposeTab} from './ai-compose-tab'

export function DeployStackForm({
	open,
	onClose,
	editStackName,
	onDeploySuccess,
}: {
	open: boolean
	onClose: () => void
	editStackName: string | null
	onDeploySuccess: () => void
}) {
	const [stackName, setStackName] = useState('')
	const [composeYaml, setComposeYaml] = useState('')
	// `hasValue` is client-side only — signals "this is a pre-loaded stored secret;
	// leaving `value` blank means KEEP existing". `secret` flags a value that must
	// never touch disk (sent to server, server encrypts to Redis).
	const [envVars, setEnvVars] = useState<
		Array<{key: string; value: string; secret?: boolean; hasValue?: boolean}>
	>([])
	const [nameError, setNameError] = useState('')

	// Plan 21-02: Source-of-stack tab state ('yaml' = paste compose, 'git' = clone repo).
	// Plan 23-01 (AID-03): adds 'ai' = generate from natural-language prompt.
	const [tab, setTab] = useState<'yaml' | 'git' | 'ai'>('yaml')
	const [aiPrompt, setAiPrompt] = useState('')
	const [gitUrl, setGitUrl] = useState('')
	const [gitBranch, setGitBranch] = useState('main')
	const [gitComposePath, setGitComposePath] = useState('docker-compose.yml')
	const [gitCredentialId, setGitCredentialId] = useState<string | null>(null)
	const [showCredentialDialog, setShowCredentialDialog] = useState(false)

	const isEditMode = !!editStackName
	// Edit mode is YAML-only in v1. Switching a stack between YAML and git would
	// require backend support in editStack (out of scope for 21-02; v28 follow-up).
	const showGitTab = !isEditMode

	// Fetch existing compose YAML and env vars when editing
	const {data: composeData, isLoading: isLoadingCompose} = trpcReact.docker.getStackCompose.useQuery(
		{name: editStackName!},
		{enabled: isEditMode && open},
	)
	const {data: envData, isLoading: isLoadingEnv} = trpcReact.docker.getStackEnv.useQuery(
		{name: editStackName!},
		{enabled: isEditMode && open},
	)

	// Fetch git credentials list (only when form is open; refetched on demand from
	// the inline AddGitCredentialDialog).
	const credentialsQuery = trpcReact.docker.listGitCredentials.useQuery(undefined, {
		enabled: open && !isEditMode,
	})
	const credentials = (credentialsQuery.data ?? []) as Array<{id: string; name: string; type: string}>

	const {deployStack, isDeploying, editStack, isEditing, lastDeployResult, clearLastDeployResult} = useStacks()
	const isBusy = isDeploying || isEditing
	// Show webhook URL panel after a successful git deploy. The form stays open
	// until the user clicks Done — otherwise the secret would be lost on close.
	const showWebhookPanel = Boolean(lastDeployResult?.webhookSecret) && tab === 'git'

	// Populate form when edit data loads
	useEffect(() => {
		if (isEditMode && composeData) {
			setComposeYaml(composeData.yaml)
			setStackName(editStackName)
		}
	}, [composeData, isEditMode, editStackName])

	useEffect(() => {
		if (isEditMode && envData) {
			// Server returns {key, value, secret, hasValue}. Secret rows come
			// back with value='' (redacted) — the form treats blank + hasValue
			// as "keep existing" on submit.
			setEnvVars(
				envData.envVars.length > 0
					? envData.envVars.map((e: any) => ({
							key: e.key,
							value: e.value ?? '',
							secret: Boolean(e.secret),
							hasValue: Boolean(e.hasValue),
						}))
					: [],
			)
		}
	}, [envData, isEditMode])

	// Reset form when closing
	useEffect(() => {
		if (!open) {
			setStackName('')
			setComposeYaml('')
			setEnvVars([])
			setNameError('')
			// Plan 21-02: also reset git tab state + clear any lingering deploy result.
			setTab('yaml')
			setAiPrompt('')
			setGitUrl('')
			setGitBranch('main')
			setGitComposePath('docker-compose.yml')
			setGitCredentialId(null)
			setShowCredentialDialog(false)
			clearLastDeployResult()
		}
	}, [open, clearLastDeployResult])

	if (!open) return null

	// Show loading state when fetching edit data
	if (isEditMode && (isLoadingCompose || isLoadingEnv)) {
		return (
			<div className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-base'>
				<IconRefresh size={32} className='animate-spin text-text-tertiary' />
				<p className='mt-3 text-sm text-text-tertiary'>Loading stack configuration...</p>
			</div>
		)
	}

	const addEnvVar = () => setEnvVars([...envVars, {key: '', value: '', secret: false}])
	const removeEnvVar = (i: number) => setEnvVars(envVars.filter((_, idx) => idx !== i))
	const updateEnvVar = (i: number, field: 'key' | 'value' | 'secret', val: string | boolean) => {
		setEnvVars((prev) => prev.map((e, idx) => (idx === i ? {...e, [field]: val} : e)))
	}

	const handleSubmit = () => {
		// Validate name
		if (!isEditMode) {
			if (!stackName.trim()) {
				setNameError('Stack name is required')
				return
			}
			if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(stackName.trim())) {
				setNameError('Must start with alphanumeric and contain only [a-zA-Z0-9_.-]')
				return
			}
		}
		setNameError('')

		// Strip UI-only `hasValue`; keep {key, value, secret} for tRPC.
		// Blank-value secret rows with hasValue=true are kept as-is so the backend
		// `editStack` can recognise them as "keep existing stored secret".
		const filteredEnv = envVars
			.filter((e) => e.key.trim())
			.map((e) => ({key: e.key, value: e.value, secret: Boolean(e.secret)}))
		const baseInput = {
			name: isEditMode ? (editStackName as string) : stackName.trim(),
			envVars: filteredEnv.length > 0 ? filteredEnv : undefined,
		}

		// Plan 21-02 git path: deploy from a remote repo. Form stays open after
		// success so the webhook URL + secret panel can be shown; the user closes
		// it via the Done button (which calls onDeploySuccess + onClose).
		if (tab === 'git' && !isEditMode) {
			if (!gitUrl.trim()) return
			deployStack({
				...baseInput,
				git: {
					url: gitUrl.trim(),
					branch: gitBranch.trim() || 'main',
					credentialId: gitCredentialId,
					composePath: gitComposePath.trim() || 'docker-compose.yml',
				},
			})
			return
		}

		// YAML path (unchanged behavior).
		if (!composeYaml.trim()) return
		const input = {...baseInput, composeYaml}
		if (isEditMode) {
			editStack(input)
		} else {
			deployStack(input)
		}
		onDeploySuccess()
		onClose()
	}

	return (
		<div className='absolute inset-0 z-50 flex flex-col bg-surface-base'>
			{/* Header */}
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-6 py-4'>
				<div>
					<h2 className='text-lg font-semibold text-text-primary'>
						{isEditMode ? `Edit Stack: ${editStackName}` : 'Deploy Stack'}
					</h2>
					{isEditMode && (
						<p className='mt-0.5 text-xs text-text-tertiary'>Update compose configuration and redeploy</p>
					)}
				</div>
				<button
					onClick={onClose}
					className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-primary'
				>
					<IconX size={18} />
				</button>
			</div>

			{/* Body */}
			<div className='flex-1 overflow-y-auto px-6 py-5 space-y-5'>
				{/* Stack Name */}
				<div className='space-y-1.5'>
					<Label htmlFor='stack-name'>Stack Name</Label>
					<Input
						id='stack-name'
						value={stackName}
						onChange={(e) => {
							setStackName(e.target.value)
							setNameError('')
						}}
						placeholder='my-stack'
						disabled={isEditMode}
						className={cn(isEditMode && 'opacity-60 cursor-not-allowed')}
					/>
					{nameError && <p className='text-xs text-red-500'>{nameError}</p>}
				</div>

				{/* Compose source — Plan 21-02 wraps Compose YAML in a Tabs primitive
				    with a new "Deploy from Git" tab. Edit mode is YAML-only (v1). */}
				{showGitTab ? (
					<Tabs value={tab} onValueChange={(v) => setTab(v as 'yaml' | 'git' | 'ai')}>
						<TabsList className='mb-3'>
							<TabsTrigger value='yaml'>Deploy from YAML</TabsTrigger>
							<TabsTrigger value='git'>Deploy from Git</TabsTrigger>
							<TabsTrigger value='ai'>Generate from prompt</TabsTrigger>
						</TabsList>

						<TabsContent value='yaml'>
							<div className='space-y-1.5'>
								<Label htmlFor='compose-yaml'>Docker Compose YAML</Label>
								<textarea
									id='compose-yaml'
									value={composeYaml}
									onChange={(e) => setComposeYaml(e.target.value)}
									placeholder={`version: '3.8'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped`}
									className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
									style={{
										fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
										fontSize: '13px',
										minHeight: '400px',
										lineHeight: '1.6',
										resize: 'vertical',
										tabSize: 2,
									}}
									spellCheck={false}
								/>
							</div>
						</TabsContent>

						<TabsContent value='git'>
							<div className='space-y-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='git-url'>Git Repository URL</Label>
									<Input
										id='git-url'
										value={gitUrl}
										onChange={(e) => setGitUrl(e.target.value)}
										placeholder='https://github.com/foo/bar.git or git@github.com:foo/bar.git'
										className='font-mono text-sm'
									/>
								</div>
								<div className='grid grid-cols-2 gap-3'>
									<div className='space-y-1.5'>
										<Label htmlFor='git-branch'>Branch</Label>
										<Input
											id='git-branch'
											value={gitBranch}
											onChange={(e) => setGitBranch(e.target.value)}
											placeholder='main'
										/>
									</div>
									<div className='space-y-1.5'>
										<Label htmlFor='git-compose-path'>Compose File Path</Label>
										<Input
											id='git-compose-path'
											value={gitComposePath}
											onChange={(e) => setGitComposePath(e.target.value)}
											placeholder='docker-compose.yml'
											className='font-mono text-xs'
										/>
									</div>
								</div>
								<div className='space-y-1.5'>
									<Label>Credential (optional — leave empty for public repos)</Label>
									<div className='flex gap-2'>
										<select
											value={gitCredentialId ?? ''}
											onChange={(e) => setGitCredentialId(e.target.value || null)}
											className='flex-1 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-sm'
										>
											<option value=''>— None (public repo) —</option>
											{credentials.map((c) => (
												<option key={c.id} value={c.id}>
													{c.name} ({c.type})
												</option>
											))}
										</select>
										<Button
											type='button'
											variant='outline'
											size='sm'
											onClick={() => setShowCredentialDialog(true)}
										>
											<IconPlus size={14} className='mr-1' /> Add credential
										</Button>
									</div>
								</div>

								{/* Webhook URL + secret panel — shown after a successful git deploy.
								    Form deliberately stays open until the user clicks Done so the
								    secret can be copied (it isn't retrievable later via the API). */}
								{showWebhookPanel && lastDeployResult?.webhookSecret && (
									<div className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2'>
										<div className='flex items-center gap-2'>
											<IconCheck size={16} className='text-emerald-500' />
											<span className='text-sm font-medium text-emerald-400'>Stack deployed</span>
										</div>
										<p className='text-xs text-text-secondary'>
											Configure your git provider with this webhook URL to redeploy on push:
										</p>
										<div className='flex gap-2'>
											<Input
												readOnly
												value={`${window.location.origin}/api/webhooks/git/${lastDeployResult.name}`}
												className='font-mono text-xs flex-1'
												onFocus={(e) => e.currentTarget.select()}
											/>
											<Button
												size='sm'
												variant='outline'
												onClick={() => {
													navigator.clipboard.writeText(
														`${window.location.origin}/api/webhooks/git/${lastDeployResult.name}`,
													)
												}}
											>
												<IconCopy size={14} />
											</Button>
										</div>
										<p className='text-xs text-text-secondary'>
											Webhook secret (use in <code>X-Hub-Signature-256</code>):
										</p>
										<div className='flex gap-2'>
											<Input
												readOnly
												type='password'
												value={lastDeployResult.webhookSecret}
												className='font-mono text-xs flex-1'
											/>
											<Button
												size='sm'
												variant='outline'
												onClick={() => {
													if (lastDeployResult.webhookSecret) {
														navigator.clipboard.writeText(lastDeployResult.webhookSecret)
													}
												}}
											>
												<IconCopy size={14} />
											</Button>
										</div>
										<Button
											size='sm'
											onClick={() => {
												clearLastDeployResult()
												onDeploySuccess()
												onClose()
											}}
										>
											Done
										</Button>
									</div>
								)}
							</div>
						</TabsContent>

						{/* Plan 23-01 (AID-03): natural-language compose generator via Kimi. */}
						<TabsContent value='ai'>
							<AiComposeTab
								prompt={aiPrompt}
								setPrompt={setAiPrompt}
								onUseYaml={(yaml) => {
									setComposeYaml(yaml)
									setTab('yaml')
								}}
							/>
						</TabsContent>
					</Tabs>
				) : (
					<div className='space-y-1.5'>
						<Label htmlFor='compose-yaml'>Docker Compose YAML</Label>
						<textarea
							id='compose-yaml'
							value={composeYaml}
							onChange={(e) => setComposeYaml(e.target.value)}
							placeholder={`version: '3.8'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped`}
							className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
							style={{
								fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
								fontSize: '13px',
								minHeight: '400px',
								lineHeight: '1.6',
								resize: 'vertical',
								tabSize: 2,
							}}
							spellCheck={false}
						/>
					</div>
				)}

				{/* Environment Variables */}
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<Label>Environment Variables</Label>
						<button
							type='button'
							onClick={addEnvVar}
							className='flex items-center gap-1 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
						>
							<IconPlus size={12} />
							Add Variable
						</button>
					</div>
					{envVars.length === 0 ? (
						<p className='text-xs text-text-tertiary'>No environment variables. Click "Add Variable" to add one.</p>
					) : (
						<div className='space-y-2'>
							{envVars.map((env, i) => (
								<div
									key={i}
									className={cn(
										'flex items-center gap-2',
										env.secret && 'border-l-2 border-amber-500/40 pl-2',
									)}
								>
									<Input
										value={env.key}
										onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
										placeholder='KEY'
										className='flex-1 font-mono text-sm'
									/>
									<span className='text-text-tertiary'>=</span>
									<Input
										type={env.secret ? 'password' : 'text'}
										value={env.value}
										onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
										placeholder={
											env.secret && env.hasValue && !env.value
												? '•••••••• (stored, re-enter to change)'
												: 'value'
										}
										className='flex-1 font-mono text-sm'
									/>
									<label
										className='flex shrink-0 cursor-pointer items-center gap-1 px-1 text-xs text-text-secondary'
										title='Stored encrypted in Redis; never written to .env on disk'
									>
										<input
											type='checkbox'
											checked={!!env.secret}
											onChange={(e) => updateEnvVar(i, 'secret', e.target.checked)}
											className='accent-brand'
										/>
										<IconLock size={12} />
										secret
									</label>
									<button
										type='button'
										onClick={() => removeEnvVar(i)}
										className='shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-red-500/20 hover:text-red-500'
									>
										<IconX size={14} />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className='shrink-0 flex items-center justify-end gap-3 border-t border-border-default px-6 py-4'>
				<Button variant='outline' onClick={onClose} disabled={isBusy}>
					Cancel
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={
						isBusy ||
						(tab === 'git' && !isEditMode
							? !gitUrl.trim() || showWebhookPanel
							: !composeYaml.trim())
					}
				>
					{isBusy ? (isEditMode ? 'Redeploying...' : 'Deploying...') : isEditMode ? 'Redeploy' : 'Deploy'}
				</Button>
			</div>

			{/* Inline credential creation — Plan 21-02. Lets a user add an HTTPS
			    PAT or SSH key without leaving the deploy flow. */}
			<AddGitCredentialDialog
				open={showCredentialDialog}
				onClose={() => setShowCredentialDialog(false)}
				onCreated={(id) => {
					setGitCredentialId(id)
					credentialsQuery.refetch()
				}}
			/>
		</div>
	)
}
