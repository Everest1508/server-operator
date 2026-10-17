import * as React from 'react';
import { cn } from '@/lib/utils';

// befui field styling on Serop tokens (border-border instead of befui's border-input, which is a translucent fill here).
export const fieldClass =
  'w-full rounded-xl border border-border bg-input text-foreground outline-none transition-[border,box-shadow] placeholder:text-text-muted/65 hover:border-muted-foreground/40 focus-visible:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15';

const SIZES = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2.5 text-xs' };

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: keyof typeof SIZES;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', className, leftIcon, rightSlot, ...props },
  ref,
) {
  const input = (
    <input ref={ref} className={cn(fieldClass, SIZES[size], leftIcon && 'pl-9', rightSlot && 'pr-12', className)} {...props} />
  );
  if (!leftIcon && !rightSlot) return input;
  return (
    <div className="relative flex items-center">
      {leftIcon && <span className="pointer-events-none absolute left-3 text-muted-foreground [&_svg]:size-4">{leftIcon}</span>}
      {input}
      {rightSlot && <span className="absolute right-2 flex items-center">{rightSlot}</span>}
    </div>
  );
});
