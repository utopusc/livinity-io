import {PinInput} from '@/components/ui/pin-input'
import {use2fa} from '@/hooks/use-2fa'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Drawer, DrawerContent, DrawerHeader, DrawerTitle} from '@/shadcn-components/ui/drawer'
import {Separator} from '@/shadcn-components/ui/separator'
import {t} from '@/utils/i18n'

export default function TwoFactorDisableDialog() {
	const title = t('2fa.disable.title')

	const isMobile = useIsMobile()
	const dialogProps = useSettingsDialogProps()

	const {disable} = use2fa(() => dialogProps.onOpenChange(false))

	if (isMobile) {
		return (
			<Drawer {...dialogProps}>
				<DrawerContent fullHeight>
					<DrawerHeader>
						<DrawerTitle>{title}</DrawerTitle>
					</DrawerHeader>
					<Inner onCodeCheck={disable} />
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<Dialog {...dialogProps}>
			<DialogContent className='flex flex-col items-center gap-5'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<Inner onCodeCheck={disable} />
			</DialogContent>
		</Dialog>
	)
}

function Inner({onCodeCheck}: {onCodeCheck: (code: string) => Promise<boolean>}) {
	return (
		<>
			<Separator />
			<p className='text-17 font-normal leading-tight -tracking-2'>{t('2fa.enter-code')}</p>
			<PinInput autoFocus length={6} onCodeCheck={onCodeCheck} />
		</>
	)
}

// Inline version for settings panel (no Dialog wrapper)
export function TwoFactorDisableInline({onComplete}: {onComplete: () => void}) {
	const {disable} = use2fa(onComplete)

	return (
		<div className='flex flex-col items-center gap-4'>
			<h3 className='text-16 font-semibold'>{t('2fa.disable.title')}</h3>
			<p className='text-13 text-white/60 text-center'>{t('2fa.enter-code')}</p>
			<PinInput autoFocus length={6} onCodeCheck={disable} />
		</div>
	)
}
