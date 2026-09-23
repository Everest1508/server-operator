import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex-1 p-6 flex flex-col items-center justify-center gap-4 text-text-secondary text-xs select-none ${className}`}>
      {Icon && <Icon size={28} className="text-text-muted" />}
      <p className="text-text-muted text-center max-w-sm">{message}</p>
      {action}
    </div>
  );
}
