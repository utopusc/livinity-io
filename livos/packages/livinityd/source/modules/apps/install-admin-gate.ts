/**
 * WS-C (Phase 256-03) — install pipeline admin gate (LIVOS-007/013 residual, SC5).
 *
 * Restricts the privileged install surface to admin/verified-only:
 *   - apps that pull in the operator's AI credentials
 *     (`requiresLocalAiClis` OR `requiresAiProvider`) — a non-admin must not be
 *     able to install an app that rides the operator's paid subscription /
 *     mounted host CLIs (information disclosure / ToS).
 *   - install of a NEW non-builtin community-repo app (`isGeneratedTemplate ===
 *     false`) — a non-admin cannot introduce a new untrusted compose at all
 *     (LIVOS-007). Builtin + platform-DB apps stay installable by members.
 *
 * The matching route-level gate (`addRepository`/`removeRepository` →
 * adminProcedure) lives in routes.ts.
 *
 * Legacy single-user mode (no resolved currentUser) is treated as admin at the
 * call site (`isAdmin` defaults true), consistent with existing behaviour; WS-D
 * (256-04) tightens the no-currentUser case separately.
 */

export class InstallForbidden extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'InstallForbidden'
	}
}

type GateInput = {
	isAdmin: boolean
	isGeneratedTemplate: boolean
	manifest: {requiresLocalAiClis?: boolean; requiresAiProvider?: boolean} | null | undefined
	// Phase 349 (VM-01 security review): the app runs a KVM VM (devices:/dev/kvm
	// + cap_add:NET_ADMIN). Kernel-facing device access → admin-only, even though
	// it's a builtin (isGeneratedTemplate=true) and carries no AI creds.
	requiresKvm?: boolean
}

/**
 * Throws `InstallForbidden` when a non-admin caller attempts a privileged
 * install (cred-bearing app, a new non-builtin community app, or a VM app with
 * kernel-facing device access). No-op for admins and for member installs of
 * plain builtin/platform apps.
 */
export function assertInstallAllowed({isAdmin, isGeneratedTemplate, manifest, requiresKvm}: GateInput): void {
	if (isAdmin) return

	const usesOperatorCreds =
		manifest?.requiresLocalAiClis === true || manifest?.requiresAiProvider === true
	if (usesOperatorCreds) {
		throw new InstallForbidden(
			'This app requires admin privileges to install (uses operator AI credentials)',
		)
	}

	// Phase 349 (VM-01): VM apps grant /dev/kvm + NET_ADMIN — admin-only.
	if (requiresKvm === true) {
		throw new InstallForbidden(
			'This app requires admin privileges to install (runs a virtual machine with hardware device access)',
		)
	}

	if (!isGeneratedTemplate) {
		throw new InstallForbidden(
			'This app requires admin privileges to install (non-builtin community app)',
		)
	}
}
