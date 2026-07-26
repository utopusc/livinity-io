import {useState} from 'react'

import TwoFactorDisableDialog from '@/routes/settings/2fa-disable'
import TwoFactorEnableDialog from '@/routes/settings/2fa-enable'
import {trpcReact} from '@/trpc/trpc'

export function TwoFactorDialog() {
	// Phase 368.8-11 — read the flag DIRECTLY, exactly as settings-content.tsx:1307
	// already does, instead of through use2fa. This is the only consumer of the hook
	// that ever read `isEnabled`, and leaving the query inside the shared hook meant
	// every OTHER consumer subscribed to it too — including onboarding's
	// account-step.tsx, which mounts use2fa() while still UNAUTHENTICATED. Now that
	// user.is2faEnabled is a privateProcedure, that pre-auth fetch would 401 four
	// times (React Query's default retries) on every fresh-box onboarding. This
	// route is reached only from post-auth Settings, so the query belongs here.
	const isEnabled = trpcReact.user.is2faEnabled.useQuery().data

	// Need to do this because when the child component `isEnabled` changes, the other dialog will appear for a split second before the dialog closes
	const [mountEnabled] = useState(isEnabled)

	if (mountEnabled) {
		return <TwoFactorDisableDialog />
	} else {
		return <TwoFactorEnableDialog />
	}
}
