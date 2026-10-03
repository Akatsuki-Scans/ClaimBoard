import React from 'react';
import { cn } from '@claimboard/ui';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const baseStyles =
    'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md tracking-tight transition-colors';

  const variants = {
    default: 'bg-zinc-800 text-zinc-300 border border-zinc-700/50',
    success: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    warning: 'bg-amber-950/60 text-amber-400 border border-amber-800/60',
    danger: 'bg-rose-950/60 text-rose-400 border border-rose-800/60',
    info: 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/60',
    outline: 'border border-zinc-800 text-zinc-400',
  };

  return (
    <span className={cn(baseStyles, variants[variant], className)} {...props}>
      {children}
    </span>
  );
}
