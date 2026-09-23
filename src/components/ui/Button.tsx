import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'solid' | 'subtle' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  solid: 'bg-accent text-white hover:bg-accent-hover',
  subtle: 'bg-accent/15 text-accent hover:bg-accent/25',
  outline: 'border border-border/30 bg-bg-secondary text-text-primary hover:border-border/60 hover:bg-bg-tertiary',
  danger: 'bg-error/15 text-error hover:bg-error/25',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 rounded-lg text-[10px] gap-1',
  md: 'px-3.5 py-2 rounded-lg text-xs gap-1.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'solid', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});
