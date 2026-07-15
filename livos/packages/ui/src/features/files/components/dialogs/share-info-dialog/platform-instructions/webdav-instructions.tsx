import {AnimatePresence, motion} from 'framer-motion'
import {ChevronDown, ChevronUp} from 'lucide-react'
import {useState} from 'react'

import {InlineCopyableField} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/inline-copyable-field'
import {
	InstructionContainer,
	InstructionItem,
} from '@/features/files/components/dialogs/share-info-dialog/platform-instructions/instruction'
import {t} from '@/utils/i18n'

/**
 * Phase 329-10 (FILES-05) — WebDAV connect instructions for the share-info dialog.
 *
 * WebDAV is an ALTERNATIVE to SMB sharing: it serves each user's own home over
 * HTTPS through the stock Caddy reverse_proxy → SFTPGo webdavd (329-04/329-05),
 * authenticated per-user against the existing LivOS login (the PG bcrypt table is
 * the single source of truth — 329-05). So the instructions deliberately do NOT
 * reuse the shared SMB `livinity` account: users sign in with their OWN LivOS
 * username + password.
 *
 * Collapsible so it stays out of the way of the primary SMB flow. Per-platform
 * connect steps + the Windows MAX_PATH (260) caveat + the "HTTPS via stock Caddy,
 * no registry tweak needed" note (D-06/D-07). All copy via `t('webdav.*')`.
 */
export function WebDAVInstructions() {
	const [open, setOpen] = useState(false)
	// HTTPS WebDAV endpoint served through the stock Caddy reverse_proxy.
	const webdavUrl = `https://${window.location.hostname}/webdav/`

	return (
		<div className='space-y-3'>
			<button
				onClick={() => setOpen((v) => !v)}
				className='flex w-full items-center justify-between text-xs font-medium text-brand-lightest transition-opacity duration-300 hover:opacity-80'
			>
				{t('webdav.toggle')}
				{open ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
			</button>

			<AnimatePresence>
				{open && (
					<motion.div
						initial={{height: 0, opacity: 0}}
						animate={{height: 'auto', opacity: 1}}
						exit={{height: 0, opacity: 0}}
						transition={{duration: 0.3}}
						className='overflow-hidden'
					>
						<div className='space-y-4'>
							<p className='text-12 text-text-tertiary'>{t('webdav.description')}</p>

							<InstructionContainer>
								<InstructionItem>
									<span className='flex items-center gap-2'>
										{t('webdav.url-label')}
										<InlineCopyableField value={webdavUrl} />
									</span>
								</InstructionItem>
							</InstructionContainer>

							<p className='text-12 text-text-tertiary'>{t('webdav.credentials-note')}</p>
							<p className='text-12 text-text-tertiary'>{t('webdav.https-note')}</p>

							{/* Windows */}
							<div className='space-y-1'>
								<span className='text-12 font-medium text-text-secondary'>{t('webdav.windows-heading')}</span>
								<InstructionContainer>
									<InstructionItem>{t('webdav.windows-step')}</InstructionItem>
									<InstructionItem>{t('webdav.windows-maxpath')}</InstructionItem>
								</InstructionContainer>
							</div>

							{/* macOS */}
							<div className='space-y-1'>
								<span className='text-12 font-medium text-text-secondary'>{t('webdav.macos-heading')}</span>
								<InstructionContainer>
									<InstructionItem>{t('webdav.macos-step')}</InstructionItem>
								</InstructionContainer>
							</div>

							{/* Linux / other */}
							<div className='space-y-1'>
								<span className='text-12 font-medium text-text-secondary'>{t('webdav.linux-heading')}</span>
								<InstructionContainer>
									<InstructionItem>{t('webdav.linux-step')}</InstructionItem>
								</InstructionContainer>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
