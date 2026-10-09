import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  /** Short heading. Say what is missing. */
  title?: string;
  /** One sentence on what to do next. */
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex-1 p-6 flex flex-col items-center justify-center gap-3 text-center select-none ${className}`}>
      {Icon && <Icon size={28} className="text-text-muted" />}
      <div className="max-w-sm">
        {title && <p className="text-sm font-semibold text-text-primary">{title}</p>}
        <p className={`text-xs text-text-secondary ${title ? 'mt-1' : ''}`}>{message}</p>
      </div>
      {action}
    </div>
  );
}
