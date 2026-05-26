import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [active, setActive] = useState(false);

  const showTooltip = () => setActive(true);
  const hideTooltip = () => setActive(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <div
      className="relative flex items-center inline-block min-w-0"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {active && (
        <div
          className={`absolute ${positionClasses[position]} z-[100] w-max max-w-[200px] bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] text-[10px] px-2 py-1 rounded shadow-xl pointer-events-none whitespace-normal break-words leading-tight animate-fade-in`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
