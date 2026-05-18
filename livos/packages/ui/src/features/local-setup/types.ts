// livos/packages/ui/src/features/local-setup/types.ts
// Phase 104 plan 104-05 — Discriminated-union state machine for the Local
// Access wizard. Mirrors the WizardStep pattern in routes/settings/domain-setup.tsx.
// Phase 142-02 — `hybrid` renamed → `portal` (user-facing).
// Phase 142-01 (next commit) — `local-lan` retired.
// Phase 142-03 (next commit) — `cloud` Coming Soon (visible but disabled).

export type SelectedMode = 'cloud' | 'local-lan' | 'portal'

export type WizardStep =
	| 'mode-pick'
	// local-lan branch (Phase 142-01 retires this — to be removed in 142-01 commit)
	| 'local-lan-config' // collect tld + hostIp + subdomain
	| 'local-lan-qr' // show QR + download CA cert link
	| 'local-lan-trust' // per-platform install instructions
	// portal branch (was: hybrid)
	| 'portal-config' // collect Cloudflare token + hostIp
	| 'portal-dns-records' // walk Cloudflare TXT challenge
	| 'portal-verify' // poll local.getPortalStatus
	// cloud branch (informational — directs user to existing /settings/domain-setup)
	| 'cloud-redirect'
	// shared
	| 'verify' // final ping
	| 'done'

export const LOCAL_LAN_STEPS: WizardStep[] = [
	'mode-pick',
	'local-lan-config',
	'local-lan-qr',
	'local-lan-trust',
	'verify',
	'done',
]

export const PORTAL_STEPS: WizardStep[] = [
	'mode-pick',
	'portal-config',
	'portal-dns-records',
	'portal-verify',
	'verify',
	'done',
]

export const CLOUD_STEPS: WizardStep[] = ['mode-pick', 'cloud-redirect']

export interface WizardState {
	step: WizardStep
	mode: SelectedMode | null
	// Per-mode form state — kept loose; downstream steps Pick the slice they need.
	localLan: {
		tld: string // e.g., "livinity.local"
		hostIp: string // detected via local.getStatus
		subdomain: string // e.g., "bruce" (per-user)
	}
	portal: {
		cloudflareApiToken: string
		hostIp: string
		subdomain: string
		zoneId: string
	}
}

export const initialWizardState: WizardState = {
	step: 'mode-pick',
	mode: null,
	localLan: {tld: 'livinity.local', hostIp: '', subdomain: ''},
	portal: {cloudflareApiToken: '', hostIp: '', subdomain: '', zoneId: ''},
}
