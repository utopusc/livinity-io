// livos/packages/ui/src/features/local-setup/types.ts
// Phase 104 plan 104-05 — Discriminated-union state machine for the Local
// Access wizard. Mirrors the WizardStep pattern in routes/settings/domain-setup.tsx.

export type SelectedMode = 'cloud' | 'local-lan' | 'hybrid'

export type WizardStep =
	| 'mode-pick'
	// local-lan branch
	| 'local-lan-config' // collect tld + hostIp + subdomain
	| 'local-lan-qr' // show QR + download CA cert link
	| 'local-lan-trust' // per-platform install instructions
	// hybrid branch
	| 'hybrid-config' // collect Cloudflare token + hostIp
	| 'hybrid-dns-records' // walk Cloudflare TXT challenge
	| 'hybrid-verify' // poll local.getHybridStatus
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

export const HYBRID_STEPS: WizardStep[] = [
	'mode-pick',
	'hybrid-config',
	'hybrid-dns-records',
	'hybrid-verify',
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
	hybrid: {
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
	hybrid: {cloudflareApiToken: '', hostIp: '', subdomain: '', zoneId: ''},
}
