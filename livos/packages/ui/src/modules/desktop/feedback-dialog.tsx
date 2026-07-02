import {useEffect, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {CheckCircle2} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {AnimatedInputError, Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {t} from '@/utils/i18n'

// Feedback report dialog — opened from the TopBar Bug button. Mirrors the
// ChangeNamePopup shadcn-Dialog structure (Dialog → DialogPortal → DialogContent
// → DialogHeader/DialogTitle/DialogFooter + Button) so it sits visually with the
// other desktop dialogs. The submit payload matches the feedback contract that
// flows UI → livinityd `feedback.submit` → platform `/api/feedback`.

type FeedbackType = 'bug' | 'feedback' | 'request' | 'question'
type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical'

const AREA_OPTIONS = ['Desktop', 'Apps', 'Files', 'Liv AI', 'Settings', 'Billing', 'Other'] as const

// Shared styling for the segmented type control + raw textareas so they read as
// the same family as the shadcn Input/Select used elsewhere in this dialog.
const textareaClass =
	'flex w-full rounded-radius-md border border-border-default bg-surface-base px-3 py-2.5 text-body text-text-primary placeholder:text-text-tertiary transition-colors hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-40'

const fieldLabelClass = 'mb-1.5 px-[5px] text-caption -tracking-2 text-text-secondary'

export function FeedbackDialog({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
	const [type, setType] = useState<FeedbackType>('bug')
	const [title, setTitle] = useState('')
	const [area, setArea] = useState<string>('Desktop')
	const [severity, setSeverity] = useState<FeedbackSeverity>('medium')
	const [message, setMessage] = useState('')
	const [steps, setSteps] = useState('')
	const [contact, setContact] = useState('')
	const [formError, setFormError] = useState('')
	const [sent, setSent] = useState(false)

	const typeOptions: Array<{value: FeedbackType; label: string}> = [
		{value: 'bug', label: t('feedback.type.bug', {defaultValue: 'Bug'})},
		{value: 'feedback', label: t('feedback.type.feedback', {defaultValue: 'Feedback'})},
		{value: 'request', label: t('feedback.type.request', {defaultValue: 'Request'})},
		{value: 'question', label: t('feedback.type.question', {defaultValue: 'Question'})},
	]
	const severityOptions: Array<{value: FeedbackSeverity; label: string}> = [
		{value: 'low', label: t('feedback.severity.low', {defaultValue: 'Low'})},
		{value: 'medium', label: t('feedback.severity.medium', {defaultValue: 'Medium'})},
		{value: 'high', label: t('feedback.severity.high', {defaultValue: 'High'})},
		{value: 'critical', label: t('feedback.severity.critical', {defaultValue: 'Critical'})},
	]

	// Best-effort app version (used as app_version in the payload). Never blocks
	// the form — defaults to empty string if the query has not resolved.
	const versionQ = trpcReact.system.version.useQuery(undefined, {staleTime: Infinity})
	const appVersion = versionQ.data?.version ?? ''

	const submitMutation = trpcReact.feedback.submit.useMutation()
	const isPending = submitMutation.isPending

	// Reset all fields + transient state whenever the dialog is (re)opened so a
	// previous send/error never leaks into a fresh report.
	useEffect(() => {
		if (open) {
			setType('bug')
			setTitle('')
			setArea('Desktop')
			setSeverity('medium')
			setMessage('')
			setSteps('')
			setContact('')
			setFormError('')
			setSent(false)
			submitMutation.reset()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

	const isBug = type === 'bug'

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setFormError('')
		const trimmed = message.trim()
		if (!trimmed) {
			setFormError(t('feedback.error.message-required', {defaultValue: 'Please describe the problem or your request.'}))
			return
		}

		const payload = {
			type,
			title: title.trim() || undefined,
			area: area || undefined,
			// Severity is only meaningful for bugs.
			severity: isBug ? severity : undefined,
			message: trimmed,
			steps: isBug && steps.trim() ? steps.trim() : undefined,
			contact: contact.trim() || undefined,
			app_version: appVersion || undefined,
			user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
			page_url: typeof location !== 'undefined' ? location.href : undefined,
		}

		submitMutation.mutate(payload, {
			onSuccess: () => {
				setSent(true)
				// Brief thank-you, then close + reset (the open-effect re-resets).
				window.setTimeout(() => onOpenChange(false), 1400)
			},
			onError: (err) => {
				setFormError(
					err?.message ||
						t('feedback.error.submit-failed', {defaultValue: 'Could not send your report. Please try again.'}),
				)
			},
		})
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent asChild>
					{/* Feedback 4a53d267: cap height to the viewport and scroll the
					    body so the Submit button is always reachable on low-res
					    screens (previously the form overflowed off-screen and could
					    only be submitted after zooming the whole page out). */}
					<form onSubmit={handleSubmit} className='max-h-[90dvh] overflow-y-auto'>
						<DialogHeader>
							<DialogTitle>
								{t('feedback.title', {defaultValue: 'Report a problem or share feedback'})}
							</DialogTitle>
							<DialogDescription>
								{t('feedback.description', {
									defaultValue: 'Tell us what went wrong or what you would like to see. Every language is welcome.',
								})}
							</DialogDescription>
						</DialogHeader>

						<AnimatePresence mode='wait'>
							{sent ? (
								<motion.div
									key='sent'
									initial={{opacity: 0, y: 6}}
									animate={{opacity: 1, y: 0}}
									exit={{opacity: 0}}
									className='flex flex-col items-center gap-3 py-8 text-center'
								>
									<CheckCircle2 className='h-10 w-10 text-brand' />
									<p className='text-body-lg font-semibold text-text-primary'>
										{t('feedback.thanks.title', {defaultValue: 'Thank you!'})}
									</p>
									<p className='text-body-sm text-text-secondary'>
										{t('feedback.thanks.body', {defaultValue: 'Your report has been sent.'})}
									</p>
								</motion.div>
							) : (
								<motion.fieldset
									key='form'
									initial={false}
									disabled={isPending}
									className='flex flex-col gap-4'
								>
									{/* Type — small segmented control. */}
									<div>
										<div className={fieldLabelClass}>{t('feedback.field.type', {defaultValue: 'Type'})}</div>
										<div
											role='radiogroup'
											aria-label={t('feedback.field.type', {defaultValue: 'Type'})}
											className='grid grid-cols-4 gap-1 rounded-radius-md border border-border-default bg-surface-base p-1'
										>
											{typeOptions.map((opt) => {
												const active = type === opt.value
												return (
													<button
														key={opt.value}
														type='button'
														role='radio'
														aria-checked={active}
														onClick={() => setType(opt.value)}
														className={cn(
															'rounded-radius-sm px-2 py-1.5 text-body-sm font-medium transition-colors',
															active
																? 'bg-brand text-white'
																: 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
														)}
													>
														{opt.label}
													</button>
												)
											})}
										</div>
									</div>

									{/* Title — optional. */}
									<div>
										<div className={fieldLabelClass}>
											{t('feedback.field.title', {defaultValue: 'Title (optional)'})}
										</div>
										<Input
											sizeVariant='short-square'
											placeholder={t('feedback.field.title-placeholder', {defaultValue: 'A short summary'})}
											value={title}
											onValueChange={setTitle}
											dir='auto'
										/>
									</div>

									{/* Area + Severity (severity only for bugs). */}
									<div className='flex flex-col gap-4 sm:flex-row'>
										<div className='flex-1'>
											<div className={fieldLabelClass}>{t('feedback.field.area', {defaultValue: 'Area'})}</div>
											<Select value={area} onValueChange={setArea}>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{AREA_OPTIONS.map((a) => (
														<SelectItem key={a} value={a}>
															{a}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										{isBug && (
											<div className='flex-1'>
												<div className={fieldLabelClass}>
													{t('feedback.field.severity', {defaultValue: 'Severity'})}
												</div>
												<Select value={severity} onValueChange={(v) => setSeverity(v as FeedbackSeverity)}>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{severityOptions.map((s) => (
															<SelectItem key={s.value} value={s.value}>
																{s.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										)}
									</div>

									{/* Message — required, any language (dir=auto, no charset restriction). */}
									<div>
										<div className={fieldLabelClass}>
											{t('feedback.field.message', {defaultValue: 'Message'})}
										</div>
										<textarea
											dir='auto'
											rows={5}
											className={cn(textareaClass, 'min-h-[120px] resize-y')}
											placeholder={t('feedback.field.message-placeholder', {
												defaultValue: 'Describe the problem or your request — any language is fine',
											})}
											value={message}
											onChange={(e) => setMessage(e.target.value)}
											aria-invalid={Boolean(formError)}
											aria-required
										/>
									</div>

									{/* Steps to reproduce — bug only, optional. */}
									{isBug && (
										<div>
											<div className={fieldLabelClass}>
												{t('feedback.field.steps', {defaultValue: 'Steps to reproduce (optional)'})}
											</div>
											<textarea
												dir='auto'
												rows={3}
												className={cn(textareaClass, 'min-h-[80px] resize-y')}
												placeholder={t('feedback.field.steps-placeholder', {
													defaultValue: '1. Open … 2. Click … 3. See …',
												})}
												value={steps}
												onChange={(e) => setSteps(e.target.value)}
											/>
										</div>
									)}

									{/* Contact email — optional. */}
									<div>
										<div className={fieldLabelClass}>
											{t('feedback.field.contact', {defaultValue: 'Contact email (optional)'})}
										</div>
										<Input
											sizeVariant='short-square'
											type='email'
											placeholder={t('feedback.field.contact-placeholder', {defaultValue: 'you@example.com'})}
											value={contact}
											onValueChange={setContact}
											dir='auto'
										/>
									</div>

									<div className='-my-2'>
										<AnimatedInputError>{formError}</AnimatedInputError>
									</div>

									<DialogFooter>
										<Button type='submit' size='dialog' variant='primary' disabled={isPending}>
											{isPending
												? t('feedback.submitting', {defaultValue: 'Sending…'})
												: t('feedback.submit', {defaultValue: 'Send report'})}
										</Button>
										<Button type='button' size='dialog' onClick={() => onOpenChange(false)} disabled={isPending}>
											{t('cancel', {defaultValue: 'Cancel'})}
										</Button>
									</DialogFooter>
								</motion.fieldset>
							)}
						</AnimatePresence>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
