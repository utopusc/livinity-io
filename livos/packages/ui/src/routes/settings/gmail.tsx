import {Loader2} from 'lucide-react'
import {useState, useEffect} from 'react'
import {
	TbMail,
	TbPlugConnected,
	TbPlugConnectedX,
	TbExternalLink,
	TbAlertCircle,
	TbCircleCheck,
	TbLoader2,
	TbKey,
} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

// ─────────────────────────────────────────────────────────────────────────────
// Gmail Settings Content (used by settings-content.tsx lazy import)
// ─────────────────────────────────────────────────────────────────────────────

export function GmailContent() {
	const [connectUrl, setConnectUrl] = useState<string | null>(null)
	const [clientId, setClientId] = useState('')
	const [clientSecret, setClientSecret] = useState('')

	const statusQ = trpcReact.ai.getGmailStatus.useQuery(undefined, {
		refetchInterval: 10000, // Poll every 10s (user may be in OAuth flow)
	})
	const utils = trpcReact.useUtils()

	const saveCredentialsMutation = trpcReact.ai.saveGmailCredentials.useMutation({
		onSuccess: () => {
			setClientId('')
			setClientSecret('')
			utils.ai.getGmailStatus.invalidate()
		},
	})

	const startOAuthMutation = trpcReact.ai.startGmailOauth.useMutation({
		onSuccess: (data) => {
			if (data.url) {
				window.open(data.url, '_blank', 'noopener,noreferrer')
				setConnectUrl(data.url)
			}
		},
	})

	const disconnectMutation = trpcReact.ai.disconnectGmail.useMutation({
		onSuccess: () => {
			setConnectUrl(null)
			utils.ai.getGmailStatus.invalidate()
		},
	})

	// Check for ?gmail= query param on mount (redirect from OAuth callback)
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const gmailParam = params.get('gmail')
		if (gmailParam) {
			// Clean up URL and refresh status
			const url = new URL(window.location.href)
			url.searchParams.delete('gmail')
			url.searchParams.delete('message')
			window.history.replaceState({}, '', url.toString())
			utils.ai.getGmailStatus.invalidate()
		}
	}, [])

	const status = statusQ.data

	const handleConnect = () => {
		startOAuthMutation.mutate()
	}

	const handleDisconnect = () => {
		if (!confirm('Disconnect Gmail? This will stop email polling and clear stored tokens.')) return
		disconnectMutation.mutate()
	}

	if (statusQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='size-6 animate-spin text-text-tertiary' />
			</div>
		)
	}

	return (
		<div className='max-w-lg space-y-6'>
			{/* Header */}
			<div className='space-y-2'>
				<h3 className='text-body font-medium text-text-primary'>Gmail Integration</h3>
				<p className='text-body-sm text-text-secondary'>
					Connect your Gmail account to let the AI agent receive and process emails.
					The agent will poll for new unread emails and forward them to your inbox.
				</p>
			</div>

			{/* Status Card */}
			<div
				className={`rounded-radius-md border p-4 ${
					status?.connected
						? 'border-green-500/30 bg-green-500/10'
						: status?.configured
							? 'border-red-500/30 bg-red-500/10'
							: 'border-amber-500/30 bg-amber-500/10'
				}`}
			>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbMail className='h-6 w-6 text-red-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>Gmail</div>
						<div className='text-caption text-text-secondary'>
							{status?.connected
								? `Connected as ${status.email}`
								: status?.configured
									? 'Credentials configured — not connected'
									: 'Enter your Google OAuth credentials to get started'}
						</div>
					</div>
					{status?.connected ? (
						<div className='flex items-center gap-2 text-caption text-green-400'>
							<TbPlugConnected className='h-4 w-4' /> Connected
						</div>
					) : (
						<div className='flex items-center gap-2 text-caption text-red-400'>
							<TbPlugConnectedX className='h-4 w-4' /> Disconnected
						</div>
					)}
				</div>

				{status?.error && (
					<div className='mt-3 flex items-start gap-2 text-caption text-amber-400'>
						<TbAlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
						<span>{status.error}</span>
					</div>
				)}

				{status?.lastMessage && (
					<div className='mt-2 text-caption text-text-tertiary'>
						Last email check: {new Date(status.lastMessage).toLocaleString()}
					</div>
				)}
			</div>

			{/* Actions */}
			{!status?.configured ? (
				/* Not configured — show credential input form */
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-4'>
					<div className='flex items-center gap-2'>
						<TbKey className='h-4 w-4 text-text-secondary' />
						<div className='text-body font-medium'>Google OAuth Credentials</div>
					</div>
					<div className='text-body-sm text-text-secondary'>
						Create OAuth 2.0 credentials in the Google Cloud Console, then paste them here.
					</div>
					<div className='space-y-3'>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>Client ID</label>
							<input
								type='text'
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
								placeholder='123456789-abc.apps.googleusercontent.com'
								className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none'
							/>
						</div>
						<div className='space-y-1.5'>
							<label className='text-caption text-text-secondary'>Client Secret</label>
							<input
								type='password'
								value={clientSecret}
								onChange={(e) => setClientSecret(e.target.value)}
								placeholder='GOCSPX-...'
								className='w-full rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none'
							/>
						</div>
					</div>
					<div className='flex items-center gap-3'>
						<Button
							variant='primary'
							size='sm'
							onClick={() => saveCredentialsMutation.mutate({clientId, clientSecret})}
							disabled={!clientId.trim() || !clientSecret.trim() || saveCredentialsMutation.isPending}
						>
							{saveCredentialsMutation.isPending ? (
								<><TbLoader2 className='h-4 w-4 animate-spin' /> Saving...</>
							) : (
								'Save Credentials'
							)}
						</Button>
						<a
							href='https://console.cloud.google.com/apis/credentials'
							target='_blank'
							rel='noopener noreferrer'
							className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
						>
							<TbExternalLink className='h-3.5 w-3.5' />
							Google Cloud Console
						</a>
					</div>
					{saveCredentialsMutation.isError && (
						<p className='text-caption text-red-400'>{saveCredentialsMutation.error.message}</p>
					)}
					<div className='text-caption text-text-tertiary space-y-1'>
						<p>1. Go to Google Cloud Console &gt; APIs &amp; Services &gt; Credentials</p>
						<p>2. Create an OAuth 2.0 Client ID (Web application)</p>
						<p>3. Add your callback URL as an authorized redirect URI</p>
					</div>
				</div>
			) : status?.connected ? (
				/* Connected — show disconnect */
				<div className='space-y-3'>
					<div className='flex items-center gap-2 text-body-sm text-green-400'>
						<TbCircleCheck className='h-4 w-4' />
						Gmail is connected and polling for new emails
					</div>
					<Button
						variant='destructive'
						size='sm'
						onClick={handleDisconnect}
						disabled={disconnectMutation.isPending}
					>
						{disconnectMutation.isPending ? (
							<>
								<TbLoader2 className='h-4 w-4 animate-spin' /> Disconnecting...
							</>
						) : (
							'Disconnect Gmail'
						)}
					</Button>
					{disconnectMutation.isError && (
						<p className='text-caption text-red-400'>{disconnectMutation.error.message}</p>
					)}
				</div>
			) : (
				/* Configured but not connected — show connect button */
				<div className='space-y-3'>
					<Button
						variant='primary'
						size='sm'
						onClick={handleConnect}
						disabled={startOAuthMutation.isPending}
					>
						{startOAuthMutation.isPending ? (
							<>
								<TbLoader2 className='h-4 w-4 animate-spin' /> Opening...
							</>
						) : (
							<>
								<TbExternalLink className='h-4 w-4' />
								Connect Gmail
							</>
						)}
					</Button>

					{startOAuthMutation.isError && (
						<p className='text-caption text-red-400'>{startOAuthMutation.error.message}</p>
					)}

					{connectUrl && (
						<div className='rounded-radius-sm bg-surface-2 p-3 space-y-2'>
							<p className='text-caption text-text-secondary'>
								A new tab should have opened with the Google consent screen.
								<br />
								After authorizing, you will be redirected back automatically.
							</p>
							<a
								href={connectUrl}
								target='_blank'
								rel='noopener noreferrer'
								className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
							>
								<TbExternalLink className='h-3.5 w-3.5' />
								Re-open consent screen
							</a>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
