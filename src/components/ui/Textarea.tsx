import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type TextareaSize = 'sm' | 'md';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: TextareaSize;
}

const SIZE_CLASSES: Record<TextareaSize, string> = {
  sm: 'px-2.5 py-1.5 text-[10px]',
  md: 'px-3 py-2 text-xs',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', className = '', ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-xl bg-bg-primary/40 border border-border/20 font-mono text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
});
