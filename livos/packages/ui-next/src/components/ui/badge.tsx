import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'error' | 'outline';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-neutral-100 text-text-secondary border border-border',
  brand: 'bg-brand-surface text-brand border border-brand/15',
  success: 'bg-success-surface text-success border border-success/15',
  warning: 'bg-warning-surface text-warning border border-warning/15',
  error: 'bg-error-surface text-error border border-error/15',
  outline: 'border border-border-emphasis text-text-secondary bg-transparent',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-caption font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeProps };
