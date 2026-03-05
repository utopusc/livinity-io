'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border border-border bg-white px-3 py-2',
          'text-body text-text placeholder:text-text-tertiary',
          'transition-colors duration-fast resize-none',
          'hover:border-border-emphasis',
          'focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50',
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
export { Textarea };
