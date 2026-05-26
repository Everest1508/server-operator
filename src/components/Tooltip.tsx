import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [active, setActive] = useState(false);

  const show = () => setActive(true);
  const hide = () => setActive(false);

  // Tooltip bubble positions relative to trigger element
  const bubble: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Rotated square arrows matching background, border, and position
  const arrow: Record<string, string> = {
    top:    'bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b',
    bottom: 'top-[-4px] left-1/2 -translate-x-1/2 border-l border-t',
    left:   'right-[-4px] top-1/2 -translate-y-1/2 border-r border-t',
    right:  'left-[-4px] top-1/2 -translate-y-1/2 border-l border-b',
  };

  return (
    <div
      className="relative flex items-center min-w-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {active && (
        <div
          className={`absolute ${bubble[position]} z-[200] pointer-events-none`}
          style={{ animation: 'tooltip-fade-in 0.1s ease-out both' }}
        >
          {/* Bubble */}
          <div className="relative w-max max-w-[220px] px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border)] text-[10px] leading-tight text-[var(--text-primary)] shadow-xl font-sans whitespace-nowrap">
            {content}
            {/* Arrow */}
            <div className={`absolute w-1.5 h-1.5 rotate-45 bg-[var(--bg-tertiary)] border-[var(--border)] ${arrow[position]}`} />
          </div>
        </div>
      )}
      <style>{`
        @keyframes tooltip-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

