// Security & Sessions section (SYSTEM) — v36 LivOS Design Port.
//
// Relocates the fail2ban ban-list (view + unban) into Settings, alongside the
// Security-panel visibility toggle (moved out of AdvancedSection), a read-only
// session-timeout row, and a "sign out (this device)" action.
//
// Composition mirrors `routes/docker/security/security-section.tsx`:
//   - fail2ban.listJails (5s poll) → 4-state service banner
//   - fail2ban.getJailStatus (enabled when a jail is selected)
//   - reused JailStatusCard + UnbanModal leaves
//
// SHAPE NOTE: getJailStatus returns `bannedIps: string[]` + a separate
// `lastAttemptedUsers: Record<string, string | null>` map, but JailStatusCard
// expects `bannedIps: BannedIp[]`. We reshape before passing.
//
// DEFERRED (no backend): per-session list + per-session revoke. We surface a
// muted "coming soon" note in the sessions card rather than faking it.

import {useMemo, useState} from 'react'
import {Loader2} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {Button} from '@/shadcn-components/ui/button'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'

import {SettingsPageHeader} from '@/components/settings-page-header'
import {FieldCard, FieldRow} from '@/components/field-card'

import {SecurityToggleRow} from '@/routes/settings/_components/security-toggle-row'
import {JailStatusCard, type JailStatus, type BannedIp} from '@/routes/docker/security/jail-status-card'
import {UnbanModal} from '@/routes/docker/security/unban-modal'

const POLL_INTERVAL_MS = 5_000
const STALE_TIME_MS = 2_500

// ── SEC-01 audit-log viewer/export helpers ─────────────────────────────────
// The audit rows come from audit.listAdminAuditEvents (admin-only). The viewer
// renders / exports only category / action / success / error — never a hash or
// any secret (rows were already redacted at write-time by Plan 01).
const AUDIT_PAGE_SIZE = 50

const AUDIT_CATEGORY_LABELS: Record<string, string> = {
	'admin-action': 'Admin action',
	'auth-login': 'Login',
	'fail2ban-host': 'Intrusion',
	'api-keys-system': 'API key',
}

function auditCategoryLabel(deviceId: string): string {
	return AUDIT_CATEGORY_LABELS[deviceId] ?? deviceId
}

// The subset of an audit row this viewer is allowed to surface.
interface AuditViewRow {
	id: string
	deviceId: string
	toolName: string
	success: boolean
	error: string | null
	timestamp: string | Date
}

// RFC-4180 cell escaping: quote when the value holds a comma/quote/newline.
function csvCell(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// Sanitized projection shared by both exporters — action/category/success/error
// only, so no hashed digest ever reaches the downloaded file.
function toExportRows(events: AuditViewRow[]) {
	return events.map((e) => ({
		timestamp: new Date(e.timestamp).toISOString(),
		category: auditCategoryLabel(e.deviceId),
		action: e.toolName,
		success: e.success,
		error: e.error ?? null,
	}))
}

// Client-side Blob download of the already-authenticated tRPC result — NO new
// REST route (mirrors ui/src/utils/logs.ts#downloadLogs), so the admin gate is
// not duplicated outside tRPC.
function downloadAuditBlob(content: string, mime: string, ext: 'json' | 'csv') {
	const blob = new Blob([content], {type: mime})
	const url = window.URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `audit-log-${Date.now()}.${ext}`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

function exportAuditJson(events: AuditViewRow[]) {
	downloadAuditBlob(JSON.stringify(toExportRows(events), null, 2), 'application/json', 'json')
}

function exportAuditCsv(events: AuditViewRow[]) {
	const header = 'timestamp,category,action,success,error'
	const lines = toExportRows(events).map((r) =>
		[r.timestamp, r.category, r.action, r.success ? 'success' : 'fail', r.error ?? '']
			.map((cell) => csvCell(String(cell)))
			.join(','),
	)
	downloadAuditBlob([header, ...lines].join('\r\n'), 'text/csv', 'csv')
}

// Raw shape returned by fail2ban.getJailStatus — bannedIps is a string[] plus a
// separate lastAttemptedUsers map (unlike JailStatusCard's BannedIp[]).
interface RawJailStatus {
	currentlyFailed: number
	totalFailed: number
	currentlyBanned: number
	totalBanned: number
	bannedIps: string[]
	lastAttemptedUsers?: Record<string, string | null>
}

interface UnbanContext {
	jail: string
	ip: string
	lastAttemptedUser?: string | null
	lastAttemptedAt?: string | null
}

export function SecuritySessionsSection() {
	const utils = trpcReact.useUtils()

	const [selectedJail, setSelectedJail] = useState<string | null>(null)
	const [unbanCtx, setUnbanCtx] = useState<UnbanContext | null>(null)
	const [signOutOpen, setSignOutOpen] = useState(false)
	const [revokeTarget, setRevokeTarget] = useState<{id: string; label: string} | null>(null)
	const [auditPage, setAuditPage] = useState(0)

	// SEC-01 admin audit-log viewer — paginated over the reused device_audit_log
	// (sentinel-filtered server-side). Admin-only query; the section is adminOnly.
	const auditQuery = trpcReact.audit.listAdminAuditEvents.useQuery(
		{limit: AUDIT_PAGE_SIZE, offset: auditPage * AUDIT_PAGE_SIZE},
		{staleTime: 10_000},
	)
	const auditEvents: AuditViewRow[] = auditQuery.data?.events ?? []
	const auditTotal = auditQuery.data?.total ?? 0

	// The operator's own active login sessions (multi-user only). hasDb=false in
	// legacy single-user mode → we fall back to the static "this device" row.
	const sessionsQuery = trpcReact.user.listSessions.useQuery(undefined, {staleTime: 10_000})
	const revokeSessionMut = trpcReact.user.revokeSession.useMutation({
		onSuccess: () => {
			setRevokeTarget(null)
			void sessionsQuery.refetch()
		},
	})

	// 5s polling cadence; staleTime = half-interval so React Query flips
	// cached→fresh ~once/cycle (mirrors docker SecuritySection).
	const listJailsQuery = trpcReact.fail2ban.listJails.useQuery(undefined, {
		refetchInterval: POLL_INTERVAL_MS,
		staleTime: STALE_TIME_MS,
		retry: false,
	})

	const jails = useMemo<string[]>(() => {
		const data: any = listJailsQuery.data
		const j = data?.jails
		return Array.isArray(j) ? j : []
	}, [listJailsQuery.data])

	const serviceState = useMemo<string>(() => {
		const data: any = listJailsQuery.data
		return typeof data?.state === 'string' ? data.state : 'running'
	}, [listJailsQuery.data])

	const transient = useMemo<boolean>(() => {
		const data: any = listJailsQuery.data
		return data?.transient === true
	}, [listJailsQuery.data])

	// Auto-select first jail when jails arrive / change (never hardcode 'sshd').
	const effectiveJail = useMemo(() => {
		if (selectedJail && jails.includes(selectedJail)) return selectedJail
		return jails[0] ?? null
	}, [jails, selectedJail])

	// Per-jail status — gated on a real jail being selected.
	const jailStatusQuery = trpcReact.fail2ban.getJailStatus.useQuery(
		{jail: effectiveJail ?? ''},
		{
			enabled: !!effectiveJail,
			refetchInterval: POLL_INTERVAL_MS,
			staleTime: STALE_TIME_MS,
			retry: false,
		},
	)

	const unbanMutation = trpcReact.fail2ban.unbanIp.useMutation({
		onSuccess: () => {
			utils.fail2ban.invalidate()
			setUnbanCtx(null)
		},
	})

	const logoutMutation = trpcReact.user.logout.useMutation({
		onSuccess: () => {
			window.location.href = '/login'
		},
	})

	// Reshape: getJailStatus → JailStatusCard's expected BannedIp[].
	const jailStatus = useMemo<JailStatus | null>(() => {
		const raw = jailStatusQuery.data as RawJailStatus | undefined
		if (!raw) return null
		const bannedIps: BannedIp[] = (raw.bannedIps ?? []).map((ip) => ({
			ip,
			lastAttemptedUser: raw.lastAttemptedUsers?.[ip] ?? null,
			lastAttemptedAt: null,
		}))
		return {
			currentlyFailed: raw.currentlyFailed,
			totalFailed: raw.totalFailed,
			currentlyBanned: raw.currentlyBanned,
			totalBanned: raw.totalBanned,
			bannedIps,
		}
	}, [jailStatusQuery.data])

	function handleUnbanClick(
		ip: string,
		lastAttemptedUser?: string | null,
		lastAttemptedAt?: string | null,
	) {
		if (!effectiveJail) return
		setUnbanCtx({jail: effectiveJail, ip, lastAttemptedUser, lastAttemptedAt})
	}

	function handleUnbanConfirm(addToWhitelist: boolean) {
		if (!unbanCtx) return
		unbanMutation.mutate({jail: unbanCtx.jail, ip: unbanCtx.ip, addToWhitelist})
	}

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow='Security'
				title='Security &'
				titleAccent='sessions.'
				sub='Review banned IPs, manage access, and sign out.'
			/>

			{/* ── Fail2ban ban list ──────────────────────────────────────────── */}
			<div className='flex flex-col gap-3'>
				<div className='flex items-baseline gap-2'>
					<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
						Intrusion prevention
					</span>
					{transient ? (
						<span className='text-[11px] text-[color:var(--fg-faint)]'>· fail2ban restarting…</span>
					) : null}
				</div>

				{/* Service-state banners — 3 error states + happy path */}
				{serviceState === 'binary-missing' ? (
					<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-3 text-[13px] text-[color:var(--fg-mute)]'>
						<strong className='text-[color:var(--fg)]'>Fail2ban not installed.</strong> Intrusion-prevention
						bans are unavailable on this host.
					</div>
				) : null}
				{serviceState === 'service-inactive' ? (
					<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-3 text-[13px] text-[color:var(--fg-mute)]'>
						<strong className='text-[color:var(--fg)]'>Fail2ban is not running on this host.</strong>{' '}
						Intrusion-prevention bans are disabled. This is expected on single-user home servers — SSH
						brute-force protection is handled at the network edge. The panel will populate automatically
						if fail2ban is enabled.
					</div>
				) : null}
				{serviceState === 'no-jails' ? (
					<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-3 text-[13px] text-[color:var(--fg-mute)]'>
						<strong className='text-[color:var(--fg)]'>Fail2ban running but no jails configured.</strong>{' '}
						No banned IPs to display.
					</div>
				) : null}

				{/* Initial load (subsequent polls don't block) */}
				{listJailsQuery.isLoading && !listJailsQuery.data ? (
					<div className='flex items-center justify-center gap-2 rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-6 text-[13px] text-[color:var(--fg-mute)]'>
						<Loader2 className='h-4 w-4 animate-spin' />
						Loading jails…
					</div>
				) : null}

				{/* Error state (e.g., RBAC fail) — distinct from service-state banners */}
				{listJailsQuery.isError ? (
					<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-3 text-[13px] text-[color:var(--fg-mute)]'>
						Error loading jails: {listJailsQuery.error?.message ?? 'unknown'}
					</div>
				) : null}

				{/* Happy-path body — running with jails */}
				{serviceState === 'running' ? (
					jails.length === 0 ? (
						<div className='rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] px-4 py-6 text-center text-[13px] text-[color:var(--fg-mute)]'>
							No jails configured.
						</div>
					) : (
						<div className='flex flex-col gap-3'>
							{/* Jail selector (auto-discover) */}
							<div className='flex flex-wrap gap-2'>
								{jails.map((j) => (
									<Button
										key={j}
										variant={effectiveJail === j ? 'primary' : 'default'}
										size='sm'
										onClick={() => setSelectedJail(j)}
									>
										{j}
									</Button>
								))}
							</div>

							{/* Per-jail status card */}
							{effectiveJail && jailStatus ? (
								<JailStatusCard
									jail={effectiveJail}
									status={jailStatus}
									onUnbanClick={handleUnbanClick}
								/>
							) : jailStatusQuery.isLoading ? (
								<div className='flex items-center justify-center gap-2 py-4 text-[13px] text-[color:var(--fg-mute)]'>
									<Loader2 className='h-4 w-4 animate-spin' />
									Loading jail status…
								</div>
							) : jailStatusQuery.isError ? (
								<div className='py-4 text-[13px] text-[color:var(--fg-mute)]'>
									Error: {jailStatusQuery.error?.message ?? 'unknown'}
								</div>
							) : (
								<div className='py-4 text-[13px] text-[color:var(--fg-mute)]'>Select a jail above.</div>
							)}
						</div>
					)
				) : null}
			</div>

			{/* ── Security-panel toggle (relocated from AdvancedSection) ─────────── */}
			<FieldCard>
				<SecurityToggleRow />
			</FieldCard>

			{/* ── Sessions ──────────────────────────────────────────────────────── */}
			<div className='flex flex-col gap-2'>
				<FieldCard>
					<FieldRow
						label='Session timeout'
						value={
							<span className='flex items-baseline gap-2'>
								<span>7 days</span>
								<span className='text-[12px] text-[color:var(--fg-faint)]'>(fixed)</span>
							</span>
						}
					/>
					{sessionsQuery.isLoading ? (
						<div className='flex items-center justify-center py-4'>
							<Loader2 className='size-4 animate-spin text-[color:var(--fg-mute)]' />
						</div>
					) : sessionsQuery.data?.hasDb && sessionsQuery.data.sessions.length > 0 ? (
						sessionsQuery.data.sessions.map((s) => {
							const device = s.deviceName ?? 'Unknown device'
							const meta = [s.ipAddress, `signed in ${new Date(s.createdAt).toLocaleDateString()}`]
								.filter(Boolean)
								.join(' · ')
							return (
								<FieldRow
									key={s.id}
									label={device}
									value={
										<span className='flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--fg-mute)]'>
											{s.current ? (
												<span className='rounded-full bg-[color:var(--bg-2)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--fg)]'>
													This device
												</span>
											) : null}
											<span>{meta}</span>
										</span>
									}
									trailing={
										s.current ? (
											<Button
												variant='destructive'
												size='sm'
												onClick={() => setSignOutOpen(true)}
												disabled={logoutMutation.isPending}
											>
												{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
											</Button>
										) : (
											<Button
												variant='destructive'
												size='sm'
												onClick={() => setRevokeTarget({id: s.id, label: device})}
												disabled={revokeSessionMut.isPending}
											>
												Revoke
											</Button>
										)
									}
								/>
							)
						})
					) : (
						<FieldRow
							label='This device'
							value={<span className='text-[color:var(--fg-mute)]'>You are signed in on this device.</span>}
							trailing={
								<Button
									variant='destructive'
									size='sm'
									onClick={() => setSignOutOpen(true)}
									disabled={logoutMutation.isPending}
								>
									{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
								</Button>
							}
						/>
					)}
				</FieldCard>
			</div>

			{/* ── Audit log (admin actions & logins) — SEC-01 viewer + export ────── */}
			<div className='flex flex-col gap-2'>
				<FieldCard>
					<div className='flex flex-wrap items-center justify-between gap-2'>
						<div className='flex flex-col gap-0.5'>
							<span className='text-[13px] font-medium text-[color:var(--fg)]'>Audit log</span>
							<span className='text-[12px] text-[color:var(--fg-mute)]'>Admin actions &amp; logins</span>
						</div>
						<div className='flex items-center gap-2'>
							<Button
								variant='default'
								size='sm'
								onClick={() => exportAuditJson(auditEvents)}
								disabled={auditEvents.length === 0}
							>
								Export JSON
							</Button>
							<Button
								variant='default'
								size='sm'
								onClick={() => exportAuditCsv(auditEvents)}
								disabled={auditEvents.length === 0}
							>
								Export CSV
							</Button>
						</div>
					</div>

					{auditQuery.isLoading && !auditQuery.data ? (
						<div className='flex items-center justify-center gap-2 py-6 text-[13px] text-[color:var(--fg-mute)]'>
							<Loader2 className='h-4 w-4 animate-spin' />
							Loading audit log…
						</div>
					) : auditQuery.isError ? (
						<div className='py-4 text-[13px] text-[color:var(--fg-mute)]'>
							Error loading audit log: {auditQuery.error?.message ?? 'unknown'}
						</div>
					) : auditEvents.length === 0 ? (
						<div className='py-6 text-center text-[13px] text-[color:var(--fg-mute)]'>No audit events yet.</div>
					) : (
						<div className='flex flex-col'>
							{auditEvents.map((e) => (
								<div
									key={e.id}
									className='flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-[12px] last:border-b-0'
								>
									<span className='min-w-[150px] text-[color:var(--fg-mute)]'>
										{new Date(e.timestamp).toLocaleString()}
									</span>
									<span className='rounded-full bg-[color:var(--bg-2)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--fg)]'>
										{auditCategoryLabel(e.deviceId)}
									</span>
									<span className='font-mono text-[color:var(--fg)]'>{e.toolName}</span>
									{e.success ? (
										<span className='rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600'>
											OK
										</span>
									) : (
										<span className='rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600'>
											Fail
										</span>
									)}
									{e.error ? <span className='text-[color:var(--fg-faint)]'>{e.error}</span> : null}
								</div>
							))}
						</div>
					)}

					{/* Pagination — bounded by total; page size AUDIT_PAGE_SIZE. */}
					<div className='flex items-center justify-between pt-1'>
						<span className='text-[12px] text-[color:var(--fg-faint)]'>
							{auditTotal > 0
								? `${auditPage * AUDIT_PAGE_SIZE + 1}–${Math.min(
										(auditPage + 1) * AUDIT_PAGE_SIZE,
										auditTotal,
								  )} of ${auditTotal}`
								: '0 events'}
						</span>
						<div className='flex items-center gap-2'>
							<Button
								variant='default'
								size='sm'
								onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
								disabled={auditPage === 0}
							>
								Prev
							</Button>
							<Button
								variant='default'
								size='sm'
								onClick={() => setAuditPage((p) => p + 1)}
								disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal}
							>
								Next
							</Button>
						</div>
					</div>
				</FieldCard>
			</div>

			{/* Revoke a non-current session — confirm before killing it. */}
			<AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke this session?</AlertDialogTitle>
						<AlertDialogDescription>
							This session will be signed out on its next request and cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant='destructive'
							onClick={(e) => {
								e.preventDefault()
								if (revokeTarget) revokeSessionMut.mutate({sessionId: revokeTarget.id})
							}}
							disabled={revokeSessionMut.isPending}
						>
							{revokeSessionMut.isPending ? 'Revoking…' : 'Revoke'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Unban confirm (reused leaf) */}
			{unbanCtx ? (
				<UnbanModal
					open={!!unbanCtx}
					onOpenChange={(o) => {
						if (!o) setUnbanCtx(null)
					}}
					ip={unbanCtx.ip}
					jail={unbanCtx.jail}
					lastAttemptedUser={unbanCtx.lastAttemptedUser}
					lastAttemptedAt={unbanCtx.lastAttemptedAt}
					onConfirm={handleUnbanConfirm}
					isUnbanning={unbanMutation.isPending}
				/>
			) : null}

			{/* Sign-out confirm */}
			<AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Sign out of this device?</AlertDialogTitle>
						<AlertDialogDescription>
							You will be returned to the login screen and will need to sign in again to access LivOS on
							this device.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							onClick={() => logoutMutation.mutate()}
							disabled={logoutMutation.isPending}
						>
							{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
						</AlertDialogAction>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
