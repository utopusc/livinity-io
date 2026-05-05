// Skeleton primitive for ai-chat-suna module

import {cn} from '@/shadcn-lib/utils'

function Skeleton({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export {Skeleton}
