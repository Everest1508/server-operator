import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type InputSize = 'sm' | 'md';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
}

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2.5 text-xs',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', className = '', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
});
