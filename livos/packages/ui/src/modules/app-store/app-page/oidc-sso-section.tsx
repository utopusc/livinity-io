// Phase 322 (IDENT-02, D-322-6) — clone of gpu-access-section.tsx. Admin-gated Switch → apps.setOidcEnabled. Two OIDC-specific states: no-domain disabled (RESEARCH domain-gating) + Immich first-run notice (Pitfall 7). Copy via t('oidc-sso.*').
import {useState} from 'react'
import {TbKey, TbInfoCircle, TbLoader2, TbCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface OidcSsoSectionProps {
	appId: string
	appName: string
	/**
	 * The effective initial toggle state, computed by the caller from the app's
	 * persisted per-app override (`app.oidcEnabled ?? false`) — default OFF, with
	 * NO manifest-permission fallback (unlike GPU). Mirrors the server default.
	 */
	initialEnabled: boolean
	/**
	 * Pitfall 7 — PRESENCE of the DEK-encrypted Immich admin key (apps.list
	 * `immichApiKeySet`). The stored ciphertext NEVER reaches the client; this
	 * boolean only flips the paste field into its "key saved" state. Write-only.
	 */
	immichApiKeySet?: boolean
	/**
	 * 331-02 (FIX-02) — the last SSO provisioning outcome persisted server-side
	 * (`oidcLastProvision` via apps.list). When it exists and is neither ok nor
	 * deferred, the section shows an honest "activation could not be confirmed"
	 * warning instead of silently trusting the toggle (322-06 audit gap).
	 * `reason` is secret-redacted server-side before it is ever stored.
	 */
	lastProvision?: {ok: boolean; deferred?: boolean; reason?: string; at: number}
}

/**
 * Phase 322-07 (IDENT-02, D-322-6) — the per-app "Enable SSO" section for the
 * app settings dialog. Clone of gpu-access-section.tsx: a Switch row bound to
 * `apps.setOidcEnabled`, disabled for non-admins (the real gate is the
 * setOidcEnabled adminProcedure — the UI cannot bypass it, T-322-15).
 *
 * Two OIDC-specific states are surfaced honestly rather than as silent failures
 * (T-322-16):
 *   (a) NO-DOMAIN — the Switch is disabled with an explanatory note when the box
 *       has no active main domain (the server also fails closed with
 *       PRECONDITION_FAILED; this is the friendly pre-empt, mirroring how per-app
 *       subdomain registration is domain-gated).
 *   (b) IMMICH — a first-run onboarding notice (Pitfall 7 ordering) PLUS a
 *       WRITE-ONLY admin API-key paste field (the producer UI). The key is saved
 *       via `apps.setImmichApiKey`; its presence is read back only via the
 *       `immichApiKeySet` boolean — the stored key is NEVER rendered into the DOM.
 *
 * All copy flows through `t('oidc-sso.*')` against public/locales/{en,tr}.json.
 */
export function OidcSsoSection({appId, appName, initialEnabled, immichApiKeySet, lastProvision}: OidcSsoSectionProps) {
	const utils = trpcReact.useUtils()
	const [enabled, setEnabled] = useState(initialEnabled)
	// Local-only paste buffer for the Immich key. Cleared on a successful save —
	// never seeded from a stored value (write-only field, Pitfall 7 / T-322-16).
	const [immichKey, setImmichKey] = useState('')

	// T-322-15: `apps.setOidcEnabled` (and `apps.setImmichApiKey`) are
	// adminProcedure — enabling SSO is host-affecting. Mirror the
	// gpu-access-section posture: a non-admin SEES the section (so it still
	// explains SSO) but the host-mutating controls are disabled with a note,
	// rather than rendering a toggle that would 403 on click.
	const {isAdmin} = useCurrentUser()

	// No-domain gate: the server fails closed (PRECONDITION_FAILED) when no main
	// domain is active. Pre-empt it in the UI by reading the same active-domain
	// signal (domain.getStatus.active) the public-access flow gates on.
	const domainStatusQuery = trpcReact.domain.getStatus.useQuery()
	const hasDomain = domainStatusQuery.data?.active ?? false

	const setOidcMut = trpcReact.apps.setOidcEnabled.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
		},
		// WR-05 (322-review): handleToggle flips the local `enabled` switch optimistically
		// BEFORE the mutation resolves. Without this rollback the Switch (bound to local
		// state, not server data) stays stuck in the wrong position on failure — the
		// isError banner shows, but the toggle never self-corrects until the dialog is
		// closed and reopened. Revert to the pre-toggle value on error.
		onError: (_err, variables) => {
			setEnabled(!variables.enabled)
		},
	})

	// Pitfall 7 producer UI — WRITE-ONLY. On success we invalidate apps.list so
	// `immichApiKeySet` flips to true, and clear the local buffer. The route
	// never echoes the key back; there is no read path for the ciphertext.
	const setImmichApiKeyMut = trpcReact.apps.setImmichApiKey.useMutation({
		onSuccess: () => {
			utils.apps.list.invalidate()
			setImmichKey('')
		},
	})

	const handleToggle = (next: boolean) => {
		setEnabled(next)
		setOidcMut.mutate({appId, enabled: next})
	}

	const handleSaveKey = () => {
		const key = immichKey.trim()
		if (!key) return
		// appId is the literal 'immich' here (this block only renders for Immich);
		// pass the literal so the z.literal('immich') input type is satisfied.
		setImmichApiKeyMut.mutate({appId: 'immich', apiKey: key})
	}

	const isImmich = appId === 'immich'

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbKey className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('oidc-sso.title')}</span>
			</div>

			{/* Admin + domain-gated toggle. Disabled for non-admins (T-322-15) and
			    when no domain is active (T-322-16 — server also PRECONDITION_FAILED). */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-3'>
					<Switch
						checked={enabled}
						onCheckedChange={handleToggle}
						disabled={setOidcMut.isPending || !isAdmin || !hasDomain}
					/>
					<p className='text-caption text-text-tertiary'>{t('oidc-sso.description', {app: appName})}</p>
				</div>
				{setOidcMut.isPending ? (
					<TbLoader2 className='h-4 w-4 animate-spin text-text-secondary' />
				) : (
					<span className='text-caption text-text-tertiary'>
						{enabled ? t('oidc-sso.enabled') : t('oidc-sso.disabled')}
					</span>
				)}
			</div>

			{/* T-322-15 — enabling SSO is host-affecting, so only an admin can toggle it. */}
			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('oidc-sso.admin-only')}</p> : null}

			{/* No-domain honest disabled state (T-322-16). */}
			{!hasDomain ? (
				<div className='rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
						<p className='text-caption text-text-secondary'>{t('oidc-sso.no-domain')}</p>
					</div>
				</div>
			) : null}

			{setOidcMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setOidcMut.error?.message ?? t('oidc-sso.error')}
				</p>
			) : null}

			{/* 331-02 (FIX-02) — honest activation state: the last server-side
			    provisioning attempt failed (not deferred), so SSO may look enabled
			    while the app never activated it. Never a silent trust. */}
			{enabled && lastProvision && !lastProvision.ok && !lastProvision.deferred ? (
				<div className='rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
						<p role='alert' className='text-caption text-text-secondary'>
							{t('oidc-sso.provision-unconfirmed', {app: appName})}
							{lastProvision.reason ? ` (${lastProvision.reason})` : ''}
						</p>
					</div>
				</div>
			) : null}

			{/* Immich first-run onboarding notice (Pitfall 7 order) + WRITE-ONLY
			    admin API-key paste field. Rendered ONLY for Immich. */}
			{isImmich ? (
				<div className='space-y-3 rounded-radius-sm border border-border-default bg-surface-base p-4'>
					<div className='flex items-start gap-3'>
						<TbInfoCircle className='mt-0.5 h-5 w-5 text-yellow-400' />
						<p className='text-caption text-text-secondary'>{t('oidc-sso.immich-onboarding')}</p>
					</div>

					{immichApiKeySet ? (
						<div className='flex items-center gap-2'>
							<TbCheck className='h-4 w-4 text-green-400' />
							<p className='text-caption text-text-tertiary'>{t('oidc-sso.immich-key-set')}</p>
						</div>
					) : (
						<div className='space-y-2'>
							<label className='text-caption text-text-secondary'>{t('oidc-sso.immich-key-label')}</label>
							<div className='flex items-center gap-2'>
								<Input
									type='password'
									value={immichKey}
									onChange={(e) => setImmichKey(e.target.value)}
									disabled={!isAdmin || setImmichApiKeyMut.isPending}
									autoComplete='off'
								/>
								<Button
									size='sm'
									variant='default'
									onClick={handleSaveKey}
									disabled={!isAdmin || !immichKey.trim() || setImmichApiKeyMut.isPending}
								>
									{setImmichApiKeyMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
									{t('oidc-sso.immich-key-save')}
								</Button>
							</div>
						</div>
					)}

					{setImmichApiKeyMut.isError ? (
						<p role='alert' className='text-caption text-red-400'>
							{setImmichApiKeyMut.error?.message ?? t('oidc-sso.error')}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	)
}
