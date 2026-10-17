import * as React from 'react';
import { cn } from '@/lib/utils';

type CardTone = 'primary' | 'secondary';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  hoverable?: boolean;
}

const TONE_CLASSES: Record<CardTone, string> = {
  primary: 'bg-card',
  secondary: 'bg-bg-secondary/35',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'primary', hoverable, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-border text-card-foreground',
        TONE_CLASSES[tone],
        hoverable && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
);
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-sm font-semibold tracking-tight', className)} {...props} />
);
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />
);
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
);
export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center border-t border-border p-4 px-5', className)} {...props} />
);
