import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// befui button. `solid`/`subtle`/`danger` are the legacy Serop names, kept so existing call sites don't change.
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold cursor-pointer transition-[background,box-shadow,transform,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-accent-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border border-border bg-card text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90',
        soft: 'bg-primary/15 text-primary hover:bg-primary/25',
        softDestructive: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
        link: 'h-auto p-0 text-primary hover:underline underline-offset-4',
        solid: 'bg-primary text-primary-foreground shadow-sm hover:bg-accent-hover',
        subtle: 'bg-primary/15 text-primary hover:bg-primary/25',
        danger: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
      },
      size: {
        sm: 'px-2.5 py-1 rounded-lg text-[11px]',
        md: 'px-3.5 py-2 rounded-lg text-xs',
        lg: 'h-10 px-5 rounded-lg text-sm',
        icon: 'size-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'solid', size, asChild, loading, children, disabled, type = 'button', ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type })}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? children : (<>{loading && <Loader2 size={14} className="animate-spin" />}{children}</>)}
    </Comp>
  );
});
