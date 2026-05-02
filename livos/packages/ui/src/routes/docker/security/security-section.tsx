// Phase 46 Plan 46-04 — SecuritySection (FR-F2B-01..06).
//
// Section root for the LIVINITY_docker > Security panel. Composes:
//   - listJailsQuery / getJailStatusQuery (5s polling — pitfall W-02)
//   - 4-state service-state banner (binary-missing / service-inactive /
//     no-jails / running) — FR-F2B-01 + pitfall W-04
//   - Tabs across discovered jails (auto-discover; pitfall W-03 — never
//     hardcode 'sshd')
//   - JailStatusCard (per-jail counts + banned IP table)
//   - "Ban an IP" button → BanIpModal (FR-F2B-03 + B-02 / B-03)
//   - UnbanModal (FR-F2B-02 + B-01)
//   - 'Audit log' tab (FR-F2B-04)
//   - "I'm on cellular" toggle (FR-F2B-05 + B-19) — session-scoped, NOT
//     persisted
//   - Manual Refresh button — invalidates ['fail2ban'] queries (failsafe
//     against the polling cadence)
//
// IP self-ban detection (FR-F2B-05):
//   v29.4 simplification — IPs are surfaced AFTER the backend rejects with
//   CONFLICT 'self_ban' (cause.adminIps). The cellular toggle in the modal
//   suppresses the self-ban check entirely. No upfront IP-detection query
//   exists in v29.4; v30+ may add `fail2ban.detectAdminIps` for proactive
//   display.
//
// Transient errors (pitfall B-05): listJails returns `transient: true` when
// fail2ban is mid-restart. We render a small "Fail2ban restarting…" badge
// and continue showing last-known data faded — no crash.

import {useMemo, useState} from 'react'
import {IconShieldLock} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'
import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'

import {AuditLogTab} from './audit-log-tab'
import {BanIpModal, type BanIpInput} from './ban-ip-modal'
import {JailStatusCard, type JailStatus} from './jail-status-card'
import {SshSessionsTab} from './ssh-sessions-tab'
import {UnbanModal} from './unban-modal'

const POLL_INTERVAL_MS = 5_000
const STALE_TIME_MS = 2_500

interface UnbanContext {
	jail: string
	ip: string
	lastAttemptedUser?: string | null
	lastAttemptedAt?: string | null
}

export function SecuritySection() {
	const utils = trpcReact.useUtils()

	// State — selected jail tab, top-level tab (jails / audit / ssh-sessions),
	// modal state, cellular toggle (session-scoped per FR-F2B-05). Phase 48
	// Plan 48-02 widens topTab union to include 'ssh-sessions' and adds
	// `banModalIp` so SshSessionsTab can lift up an IP into BanIpModal.
	const [topTab, setTopTab] = useState<'jails' | 'audit' | 'ssh-sessions'>('jails')
	const [selectedJail, setSelectedJail] = useState<string | null>(null)
	const [isCellular, setIsCellular] = useState<boolean>(false)
	const [banModalOpen, setBanModalOpen] = useState<boolean>(false)
	const [banModalIp, setBanModalIp] = useState<string>('')
	const [unbanCtx, setUnbanCtx] = useState<UnbanContext | null>(null)

	// Pitfall W-02 — 5s polling cadence; staleTime=half-interval mirrors Plan
	// 25-01 / 28-02 precedent so React Query flips cached→fresh ~once/cycle.
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

	// Auto-select first jail when jails arrive / change (pitfall W-03 — never
	// hardcode 'sshd').
	const effectiveJail = useMemo(() => {
		if (selectedJail && jails.includes(selectedJail)) return selectedJail
		return jails[0] ?? null
	}, [jails, selectedJail])

	// Per-jail status query — gated on a real jail being selected.
	const jailStatusQuery = trpcReact.fail2ban.getJailStatus.useQuery(
		// `effectiveJail` is null-checked via `enabled`, but tRPC's input type
		// requires {jail: string}, so coerce to '' when null.
		{jail: effectiveJail ?? ''},
		{
			enabled: !!effectiveJail,
			refetchInterval: POLL_INTERVAL_MS,
			staleTime: STALE_TIME_MS,
			retry: false,
		},
	)

	// Mutations.
	const unbanMutation = trpcReact.fail2ban.unbanIp.useMutation({
		onSuccess: () => {
			// Invalidate the whole fail2ban router so jail status + audit log refresh.
			utils.fail2ban.invalidate()
			setUnbanCtx(null)
		},
	})
	// banMutation is invoked via mutateAsync from the modal's handleSubmit so
	// the modal can intercept the CONFLICT 'self_ban' error and re-render Stage 2.
	const banMutation = trpcReact.fail2ban.banIp.useMutation({
		onSuccess: () => {
			utils.fail2ban.invalidate()
			setBanModalOpen(false)
		},
	})

	function handleRefresh() {
		utils.fail2ban.invalidate()
	}

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
		unbanMutation.mutate({
			jail: unbanCtx.jail,
			ip: unbanCtx.ip,
			addToWhitelist,
		})
	}

	async function handleBanSubmit(input: BanIpInput) {
		// Throws on TRPC errors so the modal can detect CONFLICT 'self_ban'.
		await banMutation.mutateAsync(input)
	}

	const jailStatus: JailStatus | null = useMemo(() => {
		const data = jailStatusQuery.data as JailStatus | undefined
		return data ?? null
	}, [jailStatusQuery.data])

	return (
		<div className='flex h-full min-h-0 flex-col'>
			{/* Sticky header */}
			<div className='shrink-0 border-b border-border-default bg-surface-base'>
				<div className='flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3'>
					<div className='flex items-center gap-2'>
						<IconShieldLock size={18} className='text-text-secondary' />
						<h2 className='text-body font-semibold text-text-primary'>Security</h2>
						{transient ? (
							<Badge variant='outline' className='ml-2'>
								Fail2ban restarting…
							</Badge>
						) : null}
					</div>
					<div className='flex items-center gap-3'>
						{/* FR-F2B-05 — session-scoped cellular toggle */}
						<label className='flex cursor-pointer items-center gap-2'>
							<Checkbox
								checked={isCellular}
								onCheckedChange={(checked) => setIsCellular(checked === true)}
							/>
							<span className='text-caption text-text-secondary'>I'm on cellular</span>
						</label>
						<Button variant='default' size='sm' onClick={handleRefresh}>
							Refresh
						</Button>
						<Button
							variant='destructive'
							size='sm'
							onClick={() => setBanModalOpen(true)}
							disabled={serviceState !== 'running' || jails.length === 0}
						>
							Ban an IP
						</Button>
					</div>
				</div>
			</div>

			{/* Body — service-state banner + tabs */}
			<div className='min-h-0 flex-1 overflow-y-auto'>
				{/* Service-state banners — 3 distinct error states + happy path */}
				{serviceState === 'binary-missing' ? (
					<div className='m-4 rounded-radius-md border border-destructive2/40 bg-destructive2/10 px-4 py-3 text-body-sm text-destructive2'>
						<strong>Fail2ban not installed.</strong> Run <span className='font-mono'>/opt/livos/install.sh</span>{' '}
						on Mini PC. Phase 46 install button deferred to Settings — see audit log.
					</div>
				) : null}
				{serviceState === 'service-inactive' ? (
					<div className='m-4 rounded-radius-md border border-amber-200 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
						<strong>Fail2ban service is stopped.</strong> Run{' '}
						<span className='font-mono'>systemctl start fail2ban</span> on Mini PC.
					</div>
				) : null}
				{serviceState === 'no-jails' ? (
					<div className='m-4 rounded-radius-md border border-amber-200 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
						<strong>Fail2ban running but no jails configured.</strong> See{' '}
						<a
							href='https://www.fail2ban.org/wiki/index.php/MANUAL_0_8.5#Jail_Options'
							target='_blank'
							rel='noopener noreferrer'
							className='underline'
						>
							fail2ban jail options docs
						</a>
						.
					</div>
				) : null}

				{/* Loading state — initial fetch only (subsequent polls don't block) */}
				{listJailsQuery.isLoading && !listJailsQuery.data ? (
					<div className='p-6 text-center text-body-sm text-text-secondary'>Loading…</div>
				) : null}

				{/* Error state — distinct from service-state banners (e.g., RBAC fail) */}
				{listJailsQuery.isError ? (
					<div className='m-4 rounded-radius-md border border-destructive2/40 bg-destructive2/10 px-4 py-3 text-body-sm text-destructive2'>
						Error loading jails: {listJailsQuery.error?.message ?? 'unknown'}
					</div>
				) : null}

				{/* Happy-path body — running with jails: tabs + cards */}
				{serviceState === 'running' ? (
					<div className='p-4'>
						<Tabs value={topTab} onValueChange={(v) => setTopTab(v as 'jails' | 'audit' | 'ssh-sessions')}>
							<TabsList>
								<TabsTrigger value='jails'>Jails</TabsTrigger>
								<TabsTrigger value='audit'>Audit log</TabsTrigger>
								<TabsTrigger value='ssh-sessions'>SSH Sessions</TabsTrigger>
							</TabsList>
							<TabsContent value='jails'>
								{jails.length === 0 ? (
									// 'no-jails' state already covered above; this is a defensive
									// branch for the edge case where state='running' but jails=[].
									<div className='py-6 text-center text-body-sm text-text-secondary'>
										No jails configured.
									</div>
								) : (
									<>
										{/* Jail tabs (auto-discover — pitfall W-03) */}
										<div className='mb-4 flex flex-wrap gap-2'>
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
											<div className='py-4 text-body-sm text-text-secondary'>
												Loading jail status…
											</div>
										) : jailStatusQuery.isError ? (
											<div className='py-4 text-body-sm text-destructive2'>
												Error: {jailStatusQuery.error?.message ?? 'unknown'}
											</div>
										) : (
											<div className='py-4 text-body-sm text-text-secondary'>
												Select a jail above.
											</div>
										)}
									</>
								)}
							</TabsContent>
							<TabsContent value='audit'>
								<AuditLogTab />
							</TabsContent>
							<TabsContent value='ssh-sessions'>
								{/* Phase 48 Plan 48-02 — SSH-Sessions tab opens a /ws/ssh-sessions stream
								   and lifts click-to-ban IP up to this section so BanIpModal can
								   pre-populate via `initialIp`. */}
								<SshSessionsTab
									onBanIp={(ip) => {
										setBanModalIp(ip)
										setBanModalOpen(true)
									}}
								/>
							</TabsContent>
						</Tabs>
					</div>
				) : null}
			</div>

			{/* Modals */}
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

			<BanIpModal
				open={banModalOpen}
				onOpenChange={(o) => {
					setBanModalOpen(o)
					// Phase 48 Plan 48-02 — reset lifted-up IP on close so the next
					// header "Ban an IP" click (no IP context) starts with empty input.
					if (!o) setBanModalIp('')
				}}
				jails={jails}
				onSubmit={handleBanSubmit}
				// v29.4: HTTP-source IP and active SSH IPs are surfaced post-detection
				// (in Stage 2 of the modal via cause.adminIps). v30+ may add a
				// `fail2ban.detectAdminIps` query for upfront display in Stage 1.
				currentHttpIp={null}
				activeSshIps={[]}
				isCellular={isCellular}
				setIsCellular={setIsCellular}
				isBanning={banMutation.isPending}
				// Phase 48 Plan 48-02 — pre-populate the IP input when the user
				// clicked "Ban" on a row inside SshSessionsTab. Empty string
				// preserves the original Phase 46 header-button flow.
				initialIp={banModalIp}
			/>
		</div>
	)
}
