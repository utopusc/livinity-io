import {Button as UiKitButton, Input as UiKitInput} from '@livinity/ui-kit'

import {useUserName} from '@/hooks/use-user-name'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {AnimatedInputError} from '@/shadcn-components/ui/input'
import {t} from '@/utils/i18n'

export default function ChangeNameDialog() {
	const title = t('change-name')
	const dialogProps = useSettingsDialogProps()

	const {name, setName, handleSubmit, formError, isLoading} = useUserName({
		onSuccess: () => dialogProps.onOpenChange(false),
	})

	return (
		<Dialog {...dialogProps}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleSubmit}>
						<fieldset disabled={isLoading} className='flex flex-col gap-5'>
							<DialogHeader>
								<DialogTitle>{title}</DialogTitle>
							</DialogHeader>
							{/* Phase 120-03: ui-kit <Input> swap. shadcn onValueChange → standard onChange adapter; setName call preserved verbatim. */}
							<UiKitInput
								placeholder={t('change-name.input-placeholder')}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							<div className='-my-2.5'>
								<AnimatedInputError>{formError}</AnimatedInputError>
							</div>
							<DialogFooter>
								{/* Phase 120-03: ui-kit <Button> swap. shadcn variant='primary'/size='dialog' → ui-kit variant='solid'/size='md'. */}
								<UiKitButton type='submit' size='md' variant='solid' loading={isLoading}>
									{t('confirm')}
								</UiKitButton>
								<UiKitButton type='button' size='md' variant='ghost' onClick={() => dialogProps.onOpenChange(false)}>
									{t('cancel')}
								</UiKitButton>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
