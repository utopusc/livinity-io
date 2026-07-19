import {Close, DialogDescription} from '@radix-ui/react-dialog'
import {useMemo, useState} from 'react'
import {TbAlertTriangle, TbArrowsExchange, TbDownload, TbLoader2, TbTrash} from 'react-icons/tb'
import {arrayIncludes} from 'ts-extras'

import {AppIcon} from '@/components/app-icon'
import {appStateToString} from '@/components/cmdk'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useQueryParams} from '@/hooks/use-query-params'
import {useApps, useUserApp} from '@/providers/apps'
import {useAllAvailableApps} from '@/providers/available-apps'
import {Button} from '@/shadcn-components/ui/button'
import {Progress} from '@/shadcn-components/ui/progress'
import {formatBytes} from '@/utils/pretty-bytes'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {installedStates, progressStates, RegistryApp, trpcReact, UserApp} from '@/trpc/trpc'
import {useDialogOpenProps} from '@/utils/dialog'
import {t} from '@/utils/i18n'

import {SelectDependencies} from '../select-dependencies-dialog'
import {EnvironmentOverridesSection} from './environment-overrides-section'
import {GpuAccessSection} from './gpu-access-section'
import {ImmichPhotoBackupSection} from './immich-photo-backup-section'
import {JellyfinSetupSection} from './jellyfin-setup-section'
import {OidcSsoSection} from './oidc-sso-section'
import {AppProtectionSection} from './app-protection-section'
import {PublicAccessSection} from './public-access-section'
import {ResourceLimitsSection} from './resource-limits-section'
import {ResilienceSection} from './resilience-section'
import {UpdatePolicySection} from './update-policy-section'

export function AppSettingsDialog() {
	const {params} = useQueryParams()
	const appId = params.get('app-settings-for')
	const dependencyId = params.get('app-settings-dependency') ?? undefined

	const {isLoading, app} = useUserApp(appId)
	const {userApps, userAppsKeyed} = useApps()
	const {apps: availableApps} = useAllAvailableApps()

	if (isLoading || !app || !userApps || !userAppsKeyed || !availableApps) {
		return null
	}

	return (
		<AppSettingsDialogForApp
			app={app}
			userApps={userApps}
			userAppsKeyed={userAppsKeyed}
			availableApps={availableApps}
			openDependency={dependencyId}
		/>
	)
}

function areSelectionsEqual(a?: Record<string, string>, b?: Record<string, string>) {
	if (a === b) return true
	const keys1 = Object.keys((a ||= {}))
	const keys2 = Object.keys((b ||= {}))
	if (keys1.length !== keys2.length) return false
	for (const key of keys1) {
		if (b[key] !== a[key]) return false
	}
	return true
}

function AppSettingsDialogForApp({
	app,
	userApps,
	userAppsKeyed,
	availableApps,
	openDependency,
}: {
	app: UserApp
	userApps: UserApp[]
	userAppsKeyed: Record<string, UserApp>
	availableApps: RegistryApp[]
	openDependency?: string
}) {
	const dialogProps = useDialogOpenProps('app-settings')
	const [selectedDependencies, setSelectedDependencies] = useState(app.selectedDependencies)
	const [hadChanges, setHadChanges] = useState(false)
	const utils = trpcReact.useUtils()
	const setSelectedDependenciesMut = trpcReact.apps.setSelectedDependencies.useMutation({
		onSuccess() {
			utils.apps.state.invalidate({appId: app.id})
			utils.apps.list.invalidate()
		},
	})

	const getAppsImplementing = (dependencyId: string) =>
		availableApps
			.filter((registryApp) => {
				const isCommunityApp = registryApp.appStoreId !== 'livinity-app-store'
				return !isCommunityApp || userAppsKeyed[registryApp.id]
			})
			.map((registryApp) => userAppsKeyed?.[registryApp.id] ?? registryApp)
			.filter((applicableApp) => applicableApp.implements?.includes(dependencyId))
			.map((implementingApp) => implementingApp.id)

	const dependencies = useMemo(
		() =>
			(app.dependencies ?? []).map((dependencyId) =>
				[dependencyId, ...getAppsImplementing(dependencyId)].map((appId) => ({
					dependencyId,
					appId,
				})),
			),
		[app.dependencies],
	)

	const areAllDependenciesInstalled = dependencies.every((alternatives) =>
		alternatives.some((alternative) =>
			userApps.some(
				(installedApp) =>
					installedApp.id === selectedDependencies[alternative.dependencyId] &&
					arrayIncludes(installedStates, installedApp.state),
			),
		),
	)

	function onSelectionChange(selectedDependencies: Record<string, string>) {
		setSelectedDependencies(selectedDependencies)
		if (!areSelectionsEqual(app.selectedDependencies, selectedDependencies)) {
			setHadChanges(true)
		}
	}

	function onSubmit() {
		if (areAllDependenciesInstalled) {
			setSelectedDependenciesMut.mutate({
				appId: app.id,
				dependencies: selectedDependencies,
			})
		}
	}

	const inProgress = arrayIncludes(progressStates, app.state)
	const hasChanges = !areSelectionsEqual(app.selectedDependencies, selectedDependencies)

	// 316-06 (GPU-02): render the GPU section ONLY for apps whose manifest requests
	// the GPU. `permissions`/`gpuAccess` are surfaced by apps.list (316-06 backend).
	// The initial toggle mirrors patchComposeFile's server rule: an explicit
	// per-app override wins, else fall back to the manifest default.
	const gpuPermissions = app.permissions ?? []
	const appRequestsGpu = gpuPermissions.includes('GPU') || gpuPermissions.includes('GPU-NVIDIA')
	const gpuInitiallyEnabled = app.gpuAccess ?? appRequestsGpu

	// 322-07 (IDENT-02): render the "Enable SSO" section ONLY for oidcNative apps
	// (the 4 OIDC-native apps). `oidcNative` is the manifest visibility flag
	// surfaced by apps.list (322-05). Default OFF — NO permissions-based fallback
	// (unlike GPU); the per-app override `oidcEnabled` wins when present.
	const appRequestsOidc = app.oidcNative ?? false
	const oidcInitiallyEnabled = app.oidcEnabled ?? false

	return (
		<Dialog {...dialogProps}>
			<DialogPortal>
				<DialogContent
					onOpenAutoFocus={(e) => {
						e.preventDefault()
					}}
				>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<AppIcon src={app.icon} size={24} className='rounded-radius-sm' />
							{t('app-settings.title')}
						</DialogTitle>
					</DialogHeader>
					<DialogDescription className='-mb-3 text-body-sm text-text-secondary'>
						{t('app-settings.connected-to', {appName: app.name})}
					</DialogDescription>
					{dependencies.length ? (
						<SelectDependencies
							dependencies={dependencies}
							selectedDependencies={selectedDependencies}
							setSelectedDependencies={onSelectionChange}
							onInstallClick={() => dialogProps.onOpenChange(false)}
							highlightDependency={openDependency}
						/>
					) : null}
					{/* Public Access Section */}
					<div className='border-t border-border-default pt-4 mt-4'>
						<PublicAccessSection appId={app.id} appName={app.name} appPort={app.port || 80} />
					</div>
					{/* GPU Access Section — 316-06 (GPU-02), only for apps that request the GPU */}
					{appRequestsGpu && (
						<div className='border-t border-border-default pt-4 mt-4'>
							<GpuAccessSection appId={app.id} appName={app.name} initialEnabled={gpuInitiallyEnabled} />
						</div>
					)}
					{/* OIDC SSO Section — 322-07 (IDENT-02), only for oidcNative apps */}
					{appRequestsOidc && (
						<div className='border-t border-border-default pt-4 mt-4'>
							<OidcSsoSection
								appId={app.id}
								appName={app.name}
								initialEnabled={oidcInitiallyEnabled}
								immichApiKeySet={app.immichApiKeySet ?? false}
								lastProvision={app.oidcLastProvision ?? undefined}
							/>
						</div>
					)}
					{/* Configure Section â 326-04 (APPS-01), only for apps whose manifest
					    declares environmentOverrides. Reopens the exact install-time
					    validated form, prefilled with the app's persisted values. */}
					{/* Protection Section — 332 (WAF-01/02). Per-app IP/CIDR ban + UA block +
					    abuse-ban at the stock-Caddy layer. Non-native apps only (they have an
					    exposed subdomain to protect; native apps proxy through the gateway). */}
					{!app.native ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<AppProtectionSection appId={app.id} appName={app.name} />
						</div>
					) : null}
					{app.installOptions?.environmentOverrides?.length ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<EnvironmentOverridesSection
								appId={app.id}
								appName={app.name}
								overrides={app.installOptions.environmentOverrides}
								initialValues={app.environmentOverrides ?? {}}
							/>
						</div>
					) : null}
					{/* Resource Limits Section â 326-04 (APPS-03), only for non-native
					    (store/docker) apps â native apps have no container to limit. */}
					{!app.native ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<ResourceLimitsSection
								appId={app.id}
								appName={app.name}
								initialCpuLimit={app.cpuLimit}
								initialMemoryLimit={app.memoryLimit}
								initialCpuSet={app.cpuSet}
							/>
						</div>
					) : null}
					{/* Resilience Section — 343-03 (RESIL-01/02), only for non-native
					    (store/docker) apps — native apps have no container to self-heal/debug.
					    OOM self-heal switch (default ON) + debug-mode enter/exit. */}
					{!app.native ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<ResilienceSection
								appId={app.id}
								appName={app.name}
								initialOomSelfHeal={app.oomSelfHeal}
								debugMode={app.debugMode}
							/>
						</div>
					) : null}
					{/* Move to another box (344-04 XFER-01) - non-native GLOBAL apps only (D-344-7).
						    Export -> download bundle; warns about the brief stop, non-portable
						    secrets and the plaintext bundle. */}
						{!app.native ? (
							<div className='border-t border-border-default pt-4 mt-4'>
								<MoveToBoxSection appId={app.id} appName={app.name} />
							</div>
						) : null}
						{/* Auto-update Policy Section — 326-06 (APPS-02), only for non-native
					    (store/docker) apps. Toggles auto/manual policy + shows/clears the version pin (both adminProcedure). */}
					{!app.native ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<UpdatePolicySection
								appId={app.id}
								appName={app.name}
								initialPolicy={app.autoUpdatePolicy ?? 'manual'}
								ignoredVersion={app.ignoredVersion}
								initialWindow={app.updateWindow}
							/>
						</div>
					) : null}
					{/* Immich Photo-Backup Section — 326-09 (MEDIA-01), only for the Immich
					    app while the onboarding card has not been dismissed. QR of the plain
					    HTTPS instance URL + store links; dismissal persists per-app. */}
					{app.id === 'immich' && !app.immichCardDismissed ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<ImmichPhotoBackupSection
								appId={app.id}
								appName={app.name}
								host={'host' in app ? app.host : undefined}
								subdomain={app.subdomain}
							/>
						</div>
					) : null}
					{/* Jellyfin Setup Section — 329-11 (MEDIA-02, D-23), only for the Jellyfin
					    app while the onboarding card has not been dismissed. Guides hwaccel
					    verification + library pick (no /Startup/* automation); dismissal persists per-app. */}
					{app.id === 'jellyfin' && !app.jellyfinCardDismissed ? (
						<div className='border-t border-border-default pt-4 mt-4'>
							<JellyfinSetupSection appId={app.id} appName={app.name} />
						</div>
					) : null}
					{hadChanges && (
						<DialogFooter>
							<Close asChild>
								<Button
									variant='primary'
									size='dialog'
									disabled={!areAllDependenciesInstalled || dependencies.length === 0 || inProgress || !hasChanges}
									onClick={() => onSubmit()}
								>
									{inProgress ? appStateToString(app.state) + '...' : t('app-settings.save-changes')}
								</Button>
							</Close>
							<Close asChild>
								<Button size='dialog'>{t('cancel')}</Button>
							</Close>
						</DialogFooter>
					)}
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

/**
 * Phase 344-04 (XFER-01 UI half) — "Move to another box" export card.
 *
 * Drives the 344-03 `appMigration` routes: exportApp (adminProcedure, stop -> tar ->
 * start; non-destructive), migrationStatus (polled while a flight runs), listBundles +
 * deleteBundle, and the raw admin download route GET /api/app-migration/download.
 *
 * Honest disclosure (D-344-3/5/6): the card warns the app stops briefly (and is only
 * restarted if it WAS running), that box-local secrets can't move and must be re-entered
 * on the new box (the export returns `strippedSecrets` to list them), and that the bundle
 * is PLAINTEXT (contains the app's data unencrypted) — handle it with care.
 *
 * exportApp is adminProcedure server-side; non-admins see a disabled control + note
 * (defense-in-depth over the server gate).
 */
function MoveToBoxSection({appId, appName}: {appId: string; appName: string}) {
	const {isAdmin} = useCurrentUser()

	// Poll the shared single-flight progress ONLY while a migration runs (export OR import).
	const statusQ = trpcReact.appMigration.migrationStatus.useQuery(undefined, {
		refetchInterval: (query) => (query.state.data?.running ? 1000 : false),
	})
	const running = statusQ.data?.running ?? false
	const statusError = typeof statusQ.data?.error === 'string' ? statusQ.data.error : null

	const bundlesQ = trpcReact.appMigration.listBundles.useQuery()
	const [summary, setSummary] = useState<{
		bundleFile: string
		bytes: number
		strippedSecrets: string[]
	} | null>(null)

	const exportMut = trpcReact.appMigration.exportApp.useMutation({
		onSuccess(res) {
			setSummary({bundleFile: res.bundleFile, bytes: res.bytes, strippedSecrets: res.strippedSecrets})
			statusQ.refetch()
			bundlesQ.refetch()
		},
		onSettled() {
			statusQ.refetch()
		},
	})
	const deleteMut = trpcReact.appMigration.deleteBundle.useMutation({
		onSuccess() {
			bundlesQ.refetch()
		},
	})

	const busy = running || exportMut.isPending
	const bundles = bundlesQ.data ?? []

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbArrowsExchange className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-migration.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('app-migration.description', {app: appName})}</p>

			{/* Honest warnings: brief stop (restart only if running), non-portable secrets,
			    plaintext bundle. */}
			<div className='space-y-2 rounded-radius-sm border border-border-default bg-surface-base p-3'>
				<p className='text-caption text-text-tertiary'>{t('app-migration.stop-warning', {app: appName})}</p>
				<p className='text-caption text-text-tertiary'>{t('app-migration.secrets-warning')}</p>
				<div className='flex items-start gap-2'>
					<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-400' />
					<p className='text-caption text-amber-400'>{t('app-migration.plaintext-warning')}</p>
				</div>
			</div>

			<Button
				size='sm'
				variant='default'
				onClick={() => {
					setSummary(null)
					exportMut.mutate({appId})
				}}
				disabled={!isAdmin || busy}
			>
				{busy ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
				{busy ? t('app-migration.exporting') : t('app-migration.export-button')}
			</Button>

			{/* Live progress while the flight runs — description + bar. */}
			{running ? (
				<div className='space-y-2'>
					<p className='text-caption text-text-tertiary'>{statusQ.data?.description || t('app-migration.exporting')}</p>
					<Progress value={statusQ.data?.progress ?? 0} />
				</div>
			) : null}

			{/* Export failure — either the mutation threw or the shared status carries an error. */}
			{exportMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{exportMut.error?.message === '[migration-in-progress]'
						? t('app-migration.in-progress')
						: (exportMut.error?.message ?? t('app-migration.export-failed'))}
				</p>
			) : !running && statusError ? (
				<p role='alert' className='text-caption text-red-400'>
					{statusError}
				</p>
			) : null}

			{/* Just-produced bundle — stripped-secrets list + download. */}
			{summary ? (
				<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-3'>
					{summary.strippedSecrets.length > 0 ? (
						<div className='space-y-1'>
							<p className='text-caption text-text-tertiary'>{t('app-migration.stripped-secrets')}</p>
							<ul className='list-disc space-y-0.5 pl-5'>
								{summary.strippedSecrets.map((s) => (
									<li key={s} className='text-caption text-text-secondary'>
										{s}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<a
						href={`/api/app-migration/download?file=${encodeURIComponent(summary.bundleFile)}`}
						download={summary.bundleFile}
						className='inline-flex items-center gap-1.5 text-body-sm font-medium text-brand hover:underline'
					>
						<TbDownload className='h-4 w-4' />
						{t('app-migration.download-button')} · {formatBytes(summary.bytes)}
					</a>
				</div>
			) : null}

			{/* Previously produced bundles (newest-first) — download or delete. */}
			{bundles.length > 0 ? (
				<div className='space-y-2'>
					<p className='text-caption text-text-tertiary'>{t('app-migration.bundles-title')}</p>
					<ul className='space-y-1.5'>
						{bundles.map((b) => (
							<li
								key={b.file}
								className='flex items-center justify-between gap-2 rounded-radius-sm border border-border-default bg-surface-base px-3 py-2'
							>
								<div className='min-w-0'>
									<a
										href={`/api/app-migration/download?file=${encodeURIComponent(b.file)}`}
										download={b.file}
										className='block truncate text-caption text-text-secondary hover:text-brand hover:underline'
									>
										{b.file}
									</a>
									<span className='text-caption-sm text-text-tertiary'>{formatBytes(b.bytes)}</span>
								</div>
								<Button
									size='sm'
									variant='destructive'
									onClick={() => deleteMut.mutate({file: b.file})}
									disabled={!isAdmin || busy || deleteMut.isPending}
									aria-label={t('app-migration.delete')}
								>
									<TbTrash className='h-4 w-4' />
								</Button>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-migration.admin-only')}</p> : null}
		</div>
	)
}
