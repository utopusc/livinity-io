import {Button as UiKitButton, PasswordInput as UiKitPasswordInput} from '@livinity/ui-kit'

import {usePassword} from '@/hooks/use-password'
import {ChangePasswordWarning, useSettingsDialogProps} from '@/routes/settings/_components/shared'
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

export default function ChangePasswordDialog() {
	const title = t('change-password')

	const dialogProps = useSettingsDialogProps()

	const {
		password,
		setPassword,
		newPassword,
		setNewPassword,
		newPasswordRepeat,
		setNewPasswordRepeat,
		handleSubmit,
		fieldErrors,
		formError,
		isLoading,
	} = usePassword({
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
							<ChangePasswordWarning />
							{/* Phase 120-03: ui-kit <PasswordInput> swap. shadcn onValueChange → standard onChange adapter; setter calls preserved verbatim. fieldErrors mapping preserved. */}
							<UiKitPasswordInput
								label={t('change-password.current-password')}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								error={fieldErrors.oldPassword}
							/>
							<UiKitPasswordInput
								label={t('change-password.new-password')}
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								error={fieldErrors.newPassword}
							/>
							<UiKitPasswordInput
								label={t('change-password.repeat-password')}
								value={newPasswordRepeat}
								onChange={(e) => setNewPasswordRepeat(e.target.value)}
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
