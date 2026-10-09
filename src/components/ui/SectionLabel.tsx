import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <span className={`text-xs font-semibold text-text-secondary ${className}`}>
      {children}
    </span>
  );
}
