// Avatar primitive for ai-chat-suna module
// Self-contained implementation (no @radix-ui/react-avatar dependency)

import * as React from 'react'
import {cn} from '@/shadcn-lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {}
interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}
interface AvatarFallbackProps extends React.HTMLAttributes<HTMLSpanElement> {}

function Avatar({className, children, ...props}: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

function AvatarImage({className, src, alt, ...props}: AvatarImageProps) {
  const [error, setError] = React.useState(false)
  if (!src || error) return null
  return (
    <img
      data-slot="avatar-image"
      src={src}
      alt={alt}
      onError={() => setError(true)}
      className={cn('aspect-square size-full object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({className, children, ...props}: AvatarFallbackProps) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        'bg-muted flex size-full items-center justify-center rounded-full text-sm font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export {Avatar, AvatarImage, AvatarFallback}
