import {Markdown} from '@/components/markdown'
import {useGlobalSystemState} from '@/providers/global-system-state/index'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {ScrollArea} from '@/shadcn-components/ui/scroll-area'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

export function SoftwareUpdateConfirmDialog() {
	const {update} = useGlobalSystemState()
	const latestVersionQ = trpcReact.system.checkUpdate.useQuery()
	const dialogProps = useSettingsDialogProps()

	if (latestVersionQ.isLoading) {
		return null
	}

	return (
		<Dialog {...dialogProps}>
			<DialogContent className='px-0'>
				<DialogHeader className='px-4 sm:px-8'>
					<DialogTitle>
						{latestVersionQ.data?.version
							? `Update to ${latestVersionQ.data.version}`
							: latestVersionQ.data?.shortSha
								? `Update to ${latestVersionQ.data.shortSha}`
								: 'Software Update'}
					</DialogTitle>
				</DialogHeader>
				<ScrollArea className='flex max-h-[500px] flex-col gap-5 px-4 sm:px-8'>
					<Markdown>{latestVersionQ.data?.message ?? ''}</Markdown>
					{latestVersionQ.data && (
						<p className='mt-2 text-xs text-text-tertiary'>
							By {latestVersionQ.data.author} — {latestVersionQ.data.committedAt}
						</p>
					)}
				</ScrollArea>
				<DialogFooter className='px-4 sm:px-8'>
					<Button
						variant='primary'
						size='dialog'
						onClick={() => {
							dialogProps.onOpenChange(false)
							update()
						}}
					>
						{t('software-update.install-now')}
					</Button>
					<Button size='dialog' onClick={() => dialogProps.onOpenChange(false)}>
						{t('cancel')}
					</Button>
					{/* <DialogAction variant='destructive' className='px-6' onClick={logout}>
						{t('logout.confirm.submit')}
					</DialogAction>
					<DialogCancel>{t('cancel')}</DialogCancel> */}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// const sampleMarkdownReleaseNotes = `
// # What's new

// Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam,
// quisquam. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam, quisquam. Quisquam,

// ## New features

// ### More support:

// - Added support for the Raspberry Pi 4 and 400
// - Added support for the Raspberry Pi 5 and 500
// - Added support for the Raspberry Pi 6 and 600
// - Added support for the Raspberry Pi 7 and 700
// - Added support for the Raspberry Pi 8 and 800

// ### Improvements

// [Lorem ipsum dolor](https://livinity.com) sit amet consectetur adipisicing elit. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam,
// quisquam. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam, quisquam. Quisquam,

// ### Fixes

// Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quam. Quam, quisquam. Quisquam, quam. Quam,
// `
