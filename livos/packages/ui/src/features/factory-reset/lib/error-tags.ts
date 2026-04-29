// Phase 38 Plan 01 — D-RT-02 error-tag → user-facing message mapping.
//
// The 4 Phase 37 error tags + the null fallback get rendered VERBATIM on the
// factory-reset failure page (D-RT-02 spec lines). The strings here MUST stay
// in sync with `.planning/phases/38-ui-factory-reset/38-CONTEXT.md` D-RT-02.
//
// Hard rule: user-facing strings refer ONLY to the public hostname
// `livinity.io`. Internal infra hostnames are never surfaced in messages.
// The `server5-unreachable` tag name is internal-only — its rendered string
// says "Cannot reach the install server (livinity.io)".

import type {FactoryResetErrorTag} from './types'

export interface ErrorMessageContext {
	/** Mirrors the JSON event row's install_sh_exit_code field (number | null). */
	install_sh_exit_code?: number | null
}

export function mapErrorTagToMessage(
	tag: FactoryResetErrorTag | null,
	ctx: ErrorMessageContext = {},
): string {
	switch (tag) {
		case 'api-key-401':
			return 'Your Livinity API key was rejected (HTTP 401). The key may have been revoked. Log into livinity.io and re-issue, then try again.'
		case 'server5-unreachable':
			return 'Cannot reach the install server (livinity.io). Try again in a few minutes.'
		case 'install-sh-failed': {
			const code =
				typeof ctx.install_sh_exit_code === 'number' ? ctx.install_sh_exit_code : '?'
			return `The reinstall script failed (exit code: ${code}). Check the event log for details.`
		}
		case 'install-sh-unreachable':
			return 'Cannot fetch install.sh (live URL and cache both unavailable). Manual recovery required.'
		case null:
		default:
			return 'Reinstall failed for an unspecified reason. Check the event log.'
	}
}
