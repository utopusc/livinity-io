// Phase 84 V32-MCP — ConfigDialog (per-server install form).
//
// Renders inside BrowseDialog when the user clicks "Configure" on a server
// card. Two sections:
//   1. Credentials form — driven by server.configSchema. Each property
//      becomes an input (text or password if isSecret). Required fields
//      are validated; submit disabled until satisfied.
//   2. Tool selection — checkbox list of all tools the server exposes.
//      Default: all checked. Tools marked `required: true` are locked
//      checked.
//
// Submit calls mcp.installToAgent. On success: parent's onInstalled fires,
// which closes both dialogs.

import {useEffect, useMemo, useState} from 'react'
import {IconAlertCircle, IconLoader2, IconPlugConnected} from '@tabler/icons-react'
import {toast} from 'sonner'

import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {cn} from '@/shadcn-lib/utils'

import {useInstallMcpToAgent, useMcpServer} from './mcp-api'
import type {McpRegistryServer} from './types'

interface ConfigDialogProps {
	server: McpRegistryServer
	agentId: string
	onInstalled: () => void
	onCancel: () => void
}

export function ConfigDialog({server: initialServer, agentId, onInstalled, onCancel}: ConfigDialogProps) {
	// Search results sometimes lack the full configSchema + tools list (the
	// Official registry API returns a slimmer record at search time). Re-
	// fetch the full server detail so the form has everything it needs.
	const detailQuery = useMcpServer({
		serverId: initialServer.qualifiedName ?? initialServer.name,
		source: initialServer.source,
		enabled: true,
	})

	const server = (detailQuery.data ?? initialServer) as McpRegistryServer

	const installMutation = useInstallMcpToAgent()

	// Credential state — keyed by configSchema property name
	const schemaProperties = server.configSchema?.properties ?? {}
	const requiredKeys = useMemo(() => server.configSchema?.required ?? [], [server.configSchema])
	const [credentials, setCredentials] = useState<Record<string, string>>({})

	// Initialize credential keys when the schema loads. This guards against
	// remounts swallowing the user's typed values: we only seed missing
	// keys, never overwrite typed input.
	useEffect(() => {
		setCredentials((prev) => {
			const next = {...prev}
			for (const key of Object.keys(schemaProperties)) {
				if (!(key in next)) next[key] = ''
			}
			return next
		})
	}, [schemaProperties])

	// Tool selection state — Set<toolName> of enabled tools
	const allTools = useMemo(() => server.tools ?? [], [server.tools])
	const [enabledTools, setEnabledTools] = useState<Set<string>>(() => new Set(allTools.map((t) => t.name)))

	// Re-seed enabled set whenever the tool list changes (e.g. detail loads)
	useEffect(() => {
		setEnabledTools(new Set(allTools.map((t) => t.name)))
	}, [allTools])

	const missingRequired = useMemo(() => {
		return requiredKeys.filter((k) => !credentials[k] || credentials[k].trim().length === 0)
	}, [credentials, requiredKeys])

	const handleToggleTool = (toolName: string, required: boolean | undefined) => {
		if (required) return // locked
		setEnabledTools((prev) => {
			const next = new Set(prev)
			if (next.has(toolName)) next.delete(toolName)
			else next.add(toolName)
			return next
		})
	}

	const handleInstall = () => {
		if (missingRequired.length > 0) {
			toast.error(`Missing required field: ${missingRequired[0]}`)
			return
		}

		// Filter blank optional credentials so we don't store empty strings
		const filteredCreds: Record<string, string> = {}
		for (const [k, v] of Object.entries(credentials)) {
			if (v && v.trim().length > 0) filteredCreds[k] = v.trim()
		}

		installMutation.mutate(
			{
				agentId,
				serverId: server.qualifiedName ?? server.name,
				source: server.source,
				credentials: Object.keys(filteredCreds).length > 0 ? filteredCreds : undefined,
				enabledTools: Array.from(enabledTools),
			},
			{
				onSuccess: () => {
					toast.success(`Installed ${server.displayName ?? server.name}`)
					onInstalled()
				},
				onError: (err) => {
					toast.error(`Install failed: ${err.message}`)
				},
			},
		)
	}

	const handleOpenChange = (open: boolean) => {
		if (!open) onCancel()
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className='flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0'
				data-testid='mcp-config-dialog'
			>
				<DialogHeader className='border-b border-liv-border px-6 py-4'>
					<div className='flex items-start gap-3'>
						<div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-liv-primary/20 to-liv-secondary/20'>
							{server.iconUrl ? (
								<img src={server.iconUrl} alt='' className='h-6 w-6 rounded' />
							) : (
								<IconPlugConnected size={18} className='text-liv-primary' />
							)}
						</div>
						<div className='min-w-0 flex-1'>
							<DialogTitle>{server.displayName ?? server.name}</DialogTitle>
							{server.description && (
								<DialogDescription className='mt-1 line-clamp-2'>
									{server.description}
								</DialogDescription>
							)}
						</div>
					</div>
				</DialogHeader>

				<div className='flex-1 overflow-y-auto px-6 py-5'>
					{detailQuery.isLoading ? (
						<div className='flex h-32 items-center justify-center text-liv-muted-foreground'>
							<IconLoader2 size={24} className='animate-spin' />
						</div>
					) : (
						<>
							{/* Credentials section */}
							{Object.keys(schemaProperties).length > 0 && (
								<section className='mb-6'>
									<h4 className='mb-3 text-xs font-semibold uppercase tracking-wide text-liv-muted-foreground'>
										Credentials
									</h4>
									<div className='space-y-4'>
										{Object.entries(schemaProperties).map(([key, prop]) => {
											const isRequired = requiredKeys.includes(key)
											const isSecret = prop.isSecret === true
											return (
												<div key={key}>
													<Label
														htmlFor={`cred-${key}`}
														className='mb-1.5 block text-xs font-medium text-liv-foreground'
													>
														{key}
														{isRequired && <span className='ml-1 text-liv-destructive'>*</span>}
													</Label>
													<Input
														id={`cred-${key}`}
														type={isSecret ? 'password' : 'text'}
														value={credentials[key] ?? ''}
														onChange={(e) =>
															setCredentials((prev) => ({...prev, [key]: e.target.value}))
														}
														placeholder={prop.description ?? ''}
														className='font-mono text-sm'
														data-testid={`mcp-cred-${key}`}
													/>
													{prop.description && (
														<p className='mt-1 text-xs text-liv-muted-foreground'>
															{prop.description}
														</p>
													)}
												</div>
											)
										})}
									</div>
								</section>
							)}

							{/* Tool selection section */}
							<section>
								<h4 className='mb-3 text-xs font-semibold uppercase tracking-wide text-liv-muted-foreground'>
									Tools{' '}
									<span className='text-liv-muted-foreground/70'>
										({enabledTools.size}/{allTools.length})
									</span>
								</h4>

								{allTools.length === 0 ? (
									<p className='rounded-lg border border-dashed border-liv-border bg-liv-muted/30 px-4 py-6 text-center text-xs text-liv-muted-foreground'>
										No tool list available from registry. All tools will be enabled by
										default once the server is connected.
									</p>
								) : (
									<div className='space-y-1.5'>
										{allTools.map((tool) => {
											const checked = enabledTools.has(tool.name)
											const locked = tool.required === true
											return (
												<label
													key={tool.name}
													className={cn(
														'flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-liv-muted/50',
														locked && 'cursor-not-allowed opacity-80',
													)}
												>
													<Checkbox
														checked={checked}
														onCheckedChange={() => handleToggleTool(tool.name, locked)}
														disabled={locked}
														className='mt-0.5'
														data-testid={`mcp-tool-${tool.name}`}
													/>
													<div className='min-w-0 flex-1'>
														<p className='font-mono text-xs text-liv-foreground'>
															{tool.name}
															{locked && (
																<span className='ml-2 text-[10px] uppercase text-liv-muted-foreground'>
																	required
																</span>
															)}
														</p>
														{tool.description && (
															<p className='mt-0.5 text-xs text-liv-muted-foreground'>
																{tool.description}
															</p>
														)}
													</div>
												</label>
											)
										})}
									</div>
								)}
							</section>

							{missingRequired.length > 0 && (
								<div className='mt-4 flex items-start gap-2 rounded-md bg-liv-destructive/10 px-3 py-2 text-xs text-liv-destructive'>
									<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
									<span>
										Required fields missing: {missingRequired.join(', ')}
									</span>
								</div>
							)}
						</>
					)}
				</div>

				<DialogFooter className='border-t border-liv-border bg-liv-card px-6 py-3'>
					<Button variant='default' onClick={onCancel} disabled={installMutation.isPending}>
						Cancel
					</Button>
					<Button
						onClick={handleInstall}
						disabled={
							installMutation.isPending ||
							detailQuery.isLoading ||
							missingRequired.length > 0
						}
						data-testid='mcp-install-submit'
					>
						{installMutation.isPending ? (
							<>
								<IconLoader2 size={14} className='mr-1.5 animate-spin' />
								Installing…
							</>
						) : (
							'Install to Agent'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
