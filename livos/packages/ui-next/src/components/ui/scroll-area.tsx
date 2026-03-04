'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('overflow-auto hide-scrollbar', className)}
      {...props}
    >
      {children}
    </div>
  ),
);

ScrollArea.displayName = 'ScrollArea';
export { ScrollArea };
