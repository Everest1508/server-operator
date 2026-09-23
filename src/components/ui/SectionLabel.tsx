import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider text-text-muted ${className}`}>
      {children}
    </span>
  );
}
