// FileAttachment — drag-drop area with visual feedback + file picker fallback.
//
// Design:
//   - Drag-and-drop target: the entire ChatComposer Card (wired via onDragOver/onDrop
//     props passed down from ChatComposer). This component is the trigger for opening
//     the <input type="file"> picker.
//   - Shows a dashed border overlay on dragover (dragActive state).
//   - Accepted types: any file (server filters after upload; no client-side MIME block).
//
// Pattern: adapted from Suna chat-input/file-upload-handler.tsx pattern.
// Icons: @tabler/icons-react (IconPaperclip replaces Lucide Paperclip).

import {useRef} from 'react'
import {IconPaperclip} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import type {Attachment} from './types'

function generateId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function fileListToAttachments(files: FileList | File[]): Attachment[] {
  return Array.from(files).map((f) => ({
    id: generateId(),
    name: f.name,
    size: f.size,
    mimeType: f.type || 'application/octet-stream',
    localUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
  }))
}

interface FileAttachmentButtonProps {
  onFilesSelected: (attachments: Attachment[]) => void
  disabled?: boolean
  className?: string
}

export function FileAttachmentButton({onFilesSelected, disabled, className}: FileAttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const attachments = fileListToAttachments(e.target.files)
    onFilesSelected(attachments)
    // Reset so the same file can be re-picked
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        multiple
        aria-label='Attach files'
        className='sr-only'
        tabIndex={-1}
        onChange={handleInputChange}
      />
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label='Attach files'
        title='Attach files'
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-liv-muted-foreground transition-colors',
          'hover:bg-liv-accent hover:text-liv-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
      >
        <IconPaperclip size={18} aria-hidden='true' />
      </button>
    </>
  )
}

// Drag-drop overlay — rendered inside ChatComposer when isDraggingOver is true.
export function DragOverlay() {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-liv-secondary/60 bg-liv-background/80 backdrop-blur-sm'
    >
      <IconPaperclip size={28} className='text-liv-secondary' />
      <p className='text-sm font-medium text-liv-secondary'>Drop files to attach</p>
    </div>
  )
}
