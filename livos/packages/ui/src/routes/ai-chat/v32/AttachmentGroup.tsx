// AttachmentGroup — renders selected attachments as a horizontal chip row
// above the MessageInput textarea. Shows filename + human-readable size + remove X.
//
// Pattern: adapted from Suna attachment-group.tsx (inline layout only — no grid).
// All colors use liv-* tokens; Lucide icons replaced with @tabler/icons-react.

import {AnimatePresence, motion} from 'framer-motion'
import {IconFile, IconFileText, IconPhoto, IconCode, IconX} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import type {Attachment} from './types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return IconPhoto
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'css', 'html', 'json'].includes(ext)) return IconCode
  if (['txt', 'md', 'markdown', 'log'].includes(ext)) return IconFileText
  return IconFile
}

interface AttachmentChipProps {
  attachment: Attachment
  onRemove: () => void
}

function AttachmentChip({attachment, onRemove}: AttachmentChipProps) {
  const Icon = getFileIcon(attachment.name)

  return (
    <motion.div
      layout
      initial={{opacity: 0, scale: 0.85}}
      animate={{opacity: 1, scale: 1}}
      exit={{opacity: 0, scale: 0.85}}
      transition={{duration: 0.15}}
      className='group relative flex items-center gap-2 rounded-xl border border-liv-border bg-liv-muted px-3 py-2 text-sm'
      aria-label={`Attachment: ${attachment.name}`}
    >
      {attachment.localUrl && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(
        attachment.name.split('.').pop()?.toLowerCase() ?? '',
      ) ? (
        <img
          src={attachment.localUrl}
          alt={attachment.name}
          className='h-6 w-6 rounded object-cover'
        />
      ) : (
        <Icon size={16} className='flex-shrink-0 text-liv-muted-foreground' aria-hidden='true' />
      )}

      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium text-liv-foreground' style={{maxWidth: '140px'}}>
          {attachment.name}
        </p>
        <p className='text-xs text-liv-muted-foreground'>{formatBytes(attachment.size)}</p>
      </div>

      <button
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className='ml-1 flex-shrink-0 rounded-full p-0.5 text-liv-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring'
      >
        <IconX size={12} aria-hidden='true' />
      </button>
    </motion.div>
  )
}

interface AttachmentGroupProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
  className?: string
}

export function AttachmentGroup({attachments, onRemove, className}: AttachmentGroupProps) {
  if (attachments.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{opacity: 0, height: 0}}
        animate={{opacity: 1, height: 'auto'}}
        exit={{opacity: 0, height: 0}}
        className={cn('flex flex-wrap gap-2 px-1 pb-2', className)}
      >
        {attachments.map((att) => (
          <AttachmentChip key={att.id} attachment={att} onRemove={() => onRemove(att.id)} />
        ))}
      </motion.div>
    </AnimatePresence>
  )
}
