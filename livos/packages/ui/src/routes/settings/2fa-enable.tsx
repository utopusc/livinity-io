import {motion} from 'framer-motion'
import {ReactNode, useEffect, useState} from 'react'
import QRCode from 'react-qr-code'
import {useCopyToClipboard} from 'react-use'

import {CopyableField} from '@/components/ui/copyable-field'
import {Loading} from '@/components/ui/loading'
import {PinInput} from '@/components/ui/pin-input'
import {Button} from '@/shadcn-components/ui/button'
import {use2fa} from '@/hooks/use-2fa'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {
	Dialog,
	DialogDescription,
	DialogHeader,
	DialogScrollableContent,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerScroller,
	DrawerTitle,
} from '@/shadcn-components/ui/drawer'
import {Separator} from '@/shadcn-components/ui/separator'
import {t} from '@/utils/i18n'
import {tw} from '@/utils/tw'

export default function TwoFactorEnableDialog() {
	const title = t('2fa.enable.title')
	const scanThisMessage = t('2fa.enable.scan-this')

	const isMobile = useIsMobile()
	const dialogProps = useSettingsDialogProps()

	// const dialogProps = useDialogOpenProps('2fa-enable')
	const {enable, totpUri, generateTotpUri, recoveryCodes, confirmEnrolled} = use2fa(() =>
		dialogProps.onOpenChange(false),
	)
	useEffect(generateTotpUri, [generateTotpUri])

	// IDENT-05: once the DB enrol returns one-time recovery codes, swap the
	// QR/PinInput body for the codes panel (shown ONCE). Dialog title/description
	// track the phase so a recovery panel never sits under "scan this QR code".
	const showRecovery = !!(recoveryCodes && recoveryCodes.length)

	// WR-04 (anti-lockout): while the one-time recovery codes are on screen the
	// panel must NOT be dismissible by ESC / overlay click / close button — only
	// the explicit "I've saved them" button (confirmEnrolled, which closes via the
	// raw dialogProps closure captured by use2fa above) may close it. Radix Dialog
	// AND vaul Drawer funnel every implicit dismissal through onOpenChange(false),
	// so gating it here blocks all escape routes with a single guard.
	const guardedDialogProps = {
		...dialogProps,
		onOpenChange: (open: boolean) => {
			if (!open && showRecovery) return
			dialogProps.onOpenChange(open)
		},
	}

	if (isMobile) {
		return (
			<Drawer {...guardedDialogProps}>
				<DrawerContent fullHeight>
					<DrawerHeader>
						<DrawerTitle>{showRecovery ? t('2fa.recovery.title') : title}</DrawerTitle>
						<DrawerDescription>{showRecovery ? t('2fa.recovery.sub') : t('2fa-description')}</DrawerDescription>
					</DrawerHeader>
					<DrawerScroller>
						{showRecovery ? (
							<RecoveryCodesPanel codes={recoveryCodes ?? []} onDone={confirmEnrolled} />
						) : (
							<>
								<p className={paragraphClass}>{scanThisMessage}</p>
								<div className='flex flex-col items-center gap-5'>
									{/* NOTE: keep this small so that the pin input is visible within the viewport */}
									<Inner qrCodeSize={150} totpUri={totpUri} onCodeCheck={enable} />
									<div className='mb-4' />
								</div>
							</>
						)}
					</DrawerScroller>
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<Dialog {...guardedDialogProps}>
			<DialogScrollableContent>
				<div className='flex flex-col items-center gap-5 p-8'>
					<DialogHeader>
						<DialogTitle>{showRecovery ? t('2fa.recovery.title') : title}</DialogTitle>
						<DialogDescription>{showRecovery ? t('2fa.recovery.sub') : scanThisMessage}</DialogDescription>
					</DialogHeader>
					{showRecovery ? (
						<RecoveryCodesPanel codes={recoveryCodes ?? []} onDone={confirmEnrolled} />
					) : (
						<Inner totpUri={totpUri} onCodeCheck={enable} />
					)}
				</div>
			</DialogScrollableContent>
		</Dialog>
	)
}

// One-time recovery-codes panel (IDENT-05). Rendered ONCE right after enrol —
// there is no query to re-read the codes (they are DEK-encrypted at rest). The
// title/sub are supplied by the enclosing Dialog/Drawer/inline header, so this
// panel renders only the codes grid + copy/download + note + done affordances.
function RecoveryCodesPanel({codes, onDone}: {codes: string[]; onDone: () => void}) {
	const [, copyToClipboard] = useCopyToClipboard()
	const [copied, setCopied] = useState(false)

	function copyAll() {
		copyToClipboard(codes.join('\n'))
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}

	function downloadCodes() {
		const blob = new Blob([codes.join('\n') + '\n'], {type: 'text/plain'})
		const url = window.URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'recovery-codes.txt'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		setTimeout(() => window.URL.revokeObjectURL(url), 0)
	}

	return (
		<div className='flex w-full flex-col gap-4'>
			<div className='grid grid-cols-2 gap-2 rounded-radius-md border border-border-default bg-surface-base p-4 font-mono text-body-sm'>
				{codes.map((code) => (
					<span key={code} className='select-all text-center tracking-wider'>
						{code}
					</span>
				))}
			</div>
			<div className='flex flex-wrap justify-center gap-2'>
				<Button variant='default' size='sm' onClick={copyAll}>
					{copied ? t('clipboard.copied') : t('2fa.recovery.copy')}
				</Button>
				<Button variant='default' size='sm' onClick={downloadCodes}>
					{t('2fa.recovery.download')}
				</Button>
			</div>
			<p className='text-center text-caption text-text-secondary'>{t('2fa.recovery.lost-device-note')}</p>
			<Button variant='primary' size='dialog' onClick={onDone}>
				{t('2fa.recovery.done')}
			</Button>
		</div>
	)
}

const paragraphClass = tw`text-left text-body-sm font-normal leading-tight -tracking-2 text-text-secondary`

function Inner({
	qrCodeSize = 240,
	totpUri,
	onCodeCheck,
}: {
	qrCodeSize?: number
	totpUri: string
	onCodeCheck: (code: string) => Promise<boolean>
}) {
	return (
		<>
			<AnimateInQr size={qrCodeSize} animateIn={!!totpUri}>
				<QRCode
					size={256}
					style={{height: 'auto', maxWidth: '100%', width: '100%', opacity: totpUri ? 1 : 0}}
					value={totpUri}
					viewBox={`0 0 256 256`}
				/>
			</AnimateInQr>
			<div className='w-full space-y-2 text-center'>
				<p className='text-body-sm font-normal leading-tight -tracking-2 text-text-secondary'>{t('2fa.enable.or-paste')}</p>
				<CopyableField value={totpUri} />
			</div>
			<Separator />
			<p className='text-center text-sm font-normal leading-tight -tracking-2'>{t('2fa.enter-code')}</p>
			<PinInput length={6} onCodeCheck={onCodeCheck} />
		</>
	)
}

const AnimateInQr = ({children, size, animateIn}: {children: ReactNode; size: number; animateIn?: boolean}) => (
	<div
		className='relative mx-auto'
		style={{
			perspective: '300px',
			width: size + 'px',
		}}
	>
		<motion.div
			className='rounded-radius-sm bg-white p-3'
			initial={{
				opacity: 0,
				rotateX: 20,
				rotateY: 10,
				rotateZ: 0,
				scale: 0.5,
			}}
			animate={
				animateIn && {
					opacity: 1,
					rotateX: 0,
					rotateY: 0,
					rotateZ: 0,
					scale: 1,
				}
			}
			transition={{duration: 0.15, ease: 'easeOut'}}
		>
			{children}
		</motion.div>
		{!animateIn && (
			<div className='absolute inset-0 grid place-items-center'>
				<Loading />
			</div>
		)}
	</div>
)

// Inline version for settings panel (no Dialog wrapper)
export function TwoFactorEnableInline({
	onComplete,
	onRecoveryVisibleChange,
}: {
	onComplete: () => void
	// WR-04: reports when the one-time recovery codes are on screen so the parent
	// can hide its "Back to 2FA" escape hatch until the user acknowledges them.
	onRecoveryVisibleChange?: (visible: boolean) => void
}) {
	const {enable, totpUri, generateTotpUri, recoveryCodes, confirmEnrolled} = use2fa(onComplete)
	useEffect(generateTotpUri, [generateTotpUri])

	const showRecovery = !!(recoveryCodes && recoveryCodes.length)
	useEffect(() => {
		onRecoveryVisibleChange?.(showRecovery)
	}, [showRecovery, onRecoveryVisibleChange])

	return (
		<div className='flex w-full flex-col items-center gap-4'>
			<h3 className='text-body-lg font-semibold'>{showRecovery ? t('2fa.recovery.title') : t('2fa.enable.title')}</h3>
			<p className='text-body-sm text-text-secondary text-center'>
				{showRecovery ? t('2fa.recovery.sub') : t('2fa.enable.scan-this')}
			</p>
			{showRecovery ? (
				<RecoveryCodesPanel codes={recoveryCodes ?? []} onDone={confirmEnrolled} />
			) : (
				<Inner qrCodeSize={180} totpUri={totpUri} onCodeCheck={enable} />
			)}
		</div>
	)
}
