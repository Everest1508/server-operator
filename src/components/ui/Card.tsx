import type { HTMLAttributes } from 'react';

type CardTone = 'primary' | 'secondary';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const TONE_CLASSES: Record<CardTone, string> = {
  primary: 'bg-bg-primary',
  secondary: 'bg-bg-secondary/35',
};

export function Card({ tone = 'primary', className = '', ...props }: CardProps) {
  return <div className={`rounded-xl border border-border ${TONE_CLASSES[tone]} ${className}`} {...props} />;
}
