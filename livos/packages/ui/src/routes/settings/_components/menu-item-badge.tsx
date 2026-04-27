// Phase 33 Plan 33-03 — UX-04 sidebar menu badge.
//
// Renders a small brand-color dot on the Settings sidebar's "Software
// Update" menu row when an update is available AND the user is NOT
// currently on the Software Update page.
//
// Visibility contract (per Plan 33-03 frontmatter must_haves + O-05 LOCK):
//
//   1. itemId !== 'software-update'         → render null
//      (Only the Software Update row gets the badge.)
//
//   2. activeSection === 'software-update'  → render null  [O-05 LOCK]
//      (User is already on the page; badge served its purpose.)
//
//   3. state !== 'update-available'         → render null
//      (Nothing to notify about — they're already current.)
//
//   4. otherwise                            → render the dot
//
// Theme: `bg-brand` is a Tailwind token wired to a CSS variable that
// flips automatically between light and dark themes (R-09 verified via
// software-update-list-row.tsx + mobile/software-update.tsx existing usage).
//
// Performance note: useSoftwareUpdate() is called once per visible menu
// item. React Query dedupes the query by key, so the actual GitHub API
// hit is shared across all subscribers (R-07).

import {useSoftwareUpdate} from '@/hooks/use-software-update'

export type MenuItemBadgeProps = {
	itemId: string
	// activeSection passed from SettingsContent — when user is ON the
	// software-update page, hide the badge per Phase 33 O-05 LOCK / R-08:
	// the badge is a notification, not a duplicate page indicator.
	activeSection: string
}

export function MenuItemBadge({itemId, activeSection}: MenuItemBadgeProps) {
	const {state} = useSoftwareUpdate()
	if (itemId !== 'software-update') return null
	if (activeSection === 'software-update') return null
	if (state !== 'update-available') return null
	return (
		<span
			className='absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-brand'
			aria-label='Update available'
		/>
	)
}
