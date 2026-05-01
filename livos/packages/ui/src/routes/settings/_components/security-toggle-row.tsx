// Phase 46 Plan 46-04 — SecurityToggleRow (FR-F2B-06).
//
// Settings row that persists `user_preferences.security_panel_visible` (default ON).
// When toggled OFF, the LIVINITY_docker > Security sidebar entry hides — but
// the underlying tRPC routes remain available, fail2ban stays running, and an
// already-open Security section continues working until the user navigates
// away (sub-issue #4 — non-destructive backout per pitfall W-18).
//
// The visibility check itself lives in `livos/packages/ui/src/routes/docker/sidebar.tsx`
// (filters SECTION_IDS via `useMemo`). This file is the WRITE side; sidebar is the READ side.

import {trpcReact} from '@/trpc/trpc'

import {SettingsToggleRow} from './settings-toggle-row'

const PREF_KEY = 'security_panel_visible'

export function SecurityToggleRow() {
	const utils = trpcReact.useUtils()
	const prefsQuery = trpcReact.preferences.get.useQuery({keys: [PREF_KEY]})
	const setPrefMutation = trpcReact.preferences.set.useMutation({
		onSuccess: () => {
			// Re-read so sidebar.tsx (which also calls preferences.get) updates.
			utils.preferences.get.invalidate()
			utils.preferences.getAll.invalidate()
		},
	})

	// Default ON: undefined / null / true → checked; only explicit `false` is OFF.
	const rawValue = prefsQuery.data?.[PREF_KEY]
	const checked = rawValue !== false

	function handleChange(next: boolean) {
		setPrefMutation.mutate({key: PREF_KEY, value: next})
	}

	return (
		<SettingsToggleRow
			title='Security panel'
			description='Show the Security sidebar entry inside Server Management. Toggling off hides the panel without uninstalling fail2ban.'
			checked={checked}
			onCheckedChange={handleChange}
			disabled={prefsQuery.isLoading || setPrefMutation.isPending}
		/>
	)
}
