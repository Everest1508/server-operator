import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './Input';

const SIZES = { sm: 'px-2.5 py-1.5 text-[10px]', md: 'px-3 py-2 text-xs' };

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: keyof typeof SIZES;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'md', className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldClass, 'min-h-20 resize-y font-mono leading-relaxed', SIZES[size], className)} {...props} />;
});
