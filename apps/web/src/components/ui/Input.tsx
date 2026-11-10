import React from 'react';
import { cn } from '@claimboard/ui';
import { CalendarIcon } from './icon';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-zinc-800 bg-[#121317] px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-40',
          type === 'datetime-local' && '[color-scheme:dark]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface DeadlineInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  compact?: boolean;
}

export const DeadlineInput = React.forwardRef<HTMLInputElement, DeadlineInputProps>(
  ({ className, compact, ...props }, ref) => {
    const localRef = React.useRef<HTMLInputElement | null>(null);

    const assignRef = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    const openPicker = () => {
      const el = localRef.current;
      if (!el) return;
      try {
        if (typeof (el as any).showPicker === 'function') {
          (el as any).showPicker();
        } else {
          el.focus();
        }
      } catch {
        el.focus();
      }
    };

    return (
      <div className="relative flex items-center">
        <input
          type="datetime-local"
          ref={assignRef}
          className={cn(
            'flex w-full rounded-lg border border-zinc-800 bg-[#121317] font-mono text-zinc-100 placeholder:text-zinc-500 shadow-sm transition-colors [color-scheme:dark] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none',
            compact ? 'h-7 pl-2 pr-7 text-[11px] bg-zinc-950 border-zinc-700' : 'h-9 pl-3 pr-9 py-1.5 text-xs',
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label="Open calendar date & time picker"
          title="Open calendar picker"
          className={cn(
            'absolute right-1 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors',
            compact ? 'h-5 w-5' : 'h-7 w-7'
          )}
        >
          <CalendarIcon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      </div>
    );
  }
);
DeadlineInput.displayName = 'DeadlineInput';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[84px] w-full rounded-lg border border-zinc-800 bg-[#121317] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 leading-relaxed',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
