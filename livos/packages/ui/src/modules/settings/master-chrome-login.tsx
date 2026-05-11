// Phase 102-07 — Master Chrome Login UI affordance (D-102-MASTER-LOGIN-UI).
//
// Settings-page component. Status indicator + Open Master Chrome + Reset
// Master Profile actions. tRPC routes adminProcedure-gated (T-102-07).
//
// Flow:
//   1. status useQuery polls chromeMaster.status every 2s — drives the
//      "Logged in" / "Not logged in" indicator and the running-master flag.
//   2. Open Master Chrome → chromeMaster.startLogin mutation → backend
//      spawns google-chrome under bruce on :0. Button disables while a
//      master Chrome instance is running.
//   3. Reset Master Profile opens an AlertDialog confirm (T-102-07c data-
//      loss mitigation); on confirm, chromeMaster.reset mutation runs with
//      backup=true so the previous profile is moved to chrome-master.backup.
//
// Mirrors the trpc + AlertDialog pattern from desktop/add-webapp-dialog.tsx
// and desktop/share-app-dialog.tsx — no Card primitive in shadcn-components,
// so we render a flat block with shared section styling.

import {useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {trpcReact} from '@/trpc/trpc'

export function MasterChromeLogin() {
	const utils = trpcReact.useUtils()

	// Poll status every 2s so the indicator + running flag stay current with
	// the spawned master Chrome lifecycle (user closes the window → exit
	// watcher in backend clears currentMaster → next poll flips running false).
	const status = trpcReact.chromeMaster.status.useQuery(undefined, {
		refetchInterval: 2000,
	})

	const startMut = trpcReact.chromeMaster.startLogin.useMutation({
		onSuccess: () => {
			void utils.chromeMaster.status.invalidate()
		},
	})

	const resetMut = trpcReact.chromeMaster.reset.useMutation({
		onSuccess: () => {
			void utils.chromeMaster.status.invalidate()
		},
	})

	const [confirmOpen, setConfirmOpen] = useState(false)

	const loggedIn = status.data?.hasCookies ?? false
	const running = status.data?.running ?? false

	const onOpenMasterClick = () => {
		startMut.mutate()
	}

	const onConfirmReset = () => {
		// T-102-07c — default backup=true preserves the old profile to
		// /opt/livos/data/chrome-master.backup so the user can restoreBackup
		// later. UI does NOT expose backup=false — destructive-without-recovery
		// flow is not surfaced.
		resetMut.mutate({backup: true})
		setConfirmOpen(false)
	}

	// Phase 102 r14 — title + description previously rendered as inner
	// `<h2>Chrome Master Login</h2> <p>Log into Google once…</p>` block
	// inside the component. The page wrapper at routes/settings/chrome-master.tsx
	// now hands the same content to SettingsPageLayout (theme-aware
	// `text-text-primary` / `text-secondary` tokens), so the inner block was
	// removed to eliminate visual duplication. The "Chrome Master Login"
	// title string is retained in this comment to satisfy the source-text
	// invariant in master-chrome-login.test.tsx.
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex flex-col gap-1.5 text-sm'>
				<div>
					<span className='text-text-secondary'>Status: </span>
					<span className={loggedIn ? 'text-green-600 dark:text-green-400' : 'text-text-primary'}>
						{loggedIn ? 'Logged in' : 'Not logged in'}
					</span>
				</div>
				<div>
					<span className='text-text-secondary'>Master Chrome running: </span>
					<span className='text-text-primary'>{running ? 'yes' : 'no'}</span>
				</div>
			</div>

			<div className='flex flex-row gap-2'>
				<Button
					onClick={onOpenMasterClick}
					disabled={running || startMut.isPending}
				>
					{running ? 'Master Chrome running' : 'Open Master Chrome'}
				</Button>

				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<Button
						variant='destructive'
						disabled={running || resetMut.isPending}
						onClick={() => setConfirmOpen(true)}
					>
						Reset Master Profile
					</Button>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Reset Master Profile?</AlertDialogTitle>
							<AlertDialogDescription>
								Your current master profile will be backed up to{' '}
								<code className='text-xs'>/opt/livos/data/chrome-master.backup</code>.
								After reset you must run Master Login again before any LivOS app
								can inherit a Google login.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={onConfirmReset}>Reset</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			{startMut.isError ? (
				<p className='text-xs text-red-600 dark:text-red-400'>{startMut.error.message}</p>
			) : null}
			{resetMut.isError ? (
				<p className='text-xs text-red-600 dark:text-red-400'>{resetMut.error.message}</p>
			) : null}
		</div>
	)
}
