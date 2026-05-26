import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [active, setActive] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [bubbleEl, setBubbleEl] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = () => {
    setActive(true);
  };

  const hide = () => {
    setActive(false);
  };

  useEffect(() => {
    if (!active || !bubbleEl || !triggerRef.current) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const bubbleRect = bubbleEl.getBoundingClientRect();

      let top = 0;
      let left = 0;
      let arrowLeft: number | undefined;
      let arrowTop: number | undefined;

      const gap = 6; // gap between trigger and bubble

      if (position === 'top') {
        top = rect.top - bubbleRect.height - gap;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;

        const minLeft = 8;
        const maxLeft = window.innerWidth - bubbleRect.width - 8;
        const adjustedLeft = Math.max(minLeft, Math.min(left, maxLeft));
        left = adjustedLeft;

        const triggerCenter = rect.left + rect.width / 2;
        arrowLeft = triggerCenter - adjustedLeft - 3; // 3px is half of w-1.5 (6px)
        arrowLeft = Math.max(8, Math.min(arrowLeft, bubbleRect.width - 14));
      } else if (position === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - bubbleRect.width / 2;

        const minLeft = 8;
        const maxLeft = window.innerWidth - bubbleRect.width - 8;
        const adjustedLeft = Math.max(minLeft, Math.min(left, maxLeft));
        left = adjustedLeft;

        const triggerCenter = rect.left + rect.width / 2;
        arrowLeft = triggerCenter - adjustedLeft - 3;
        arrowLeft = Math.max(8, Math.min(arrowLeft, bubbleRect.width - 14));
      } else if (position === 'left') {
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.left - bubbleRect.width - gap;

        const minTop = 8;
        const maxTop = window.innerHeight - bubbleRect.height - 8;
        const adjustedTop = Math.max(minTop, Math.min(top, maxTop));
        top = adjustedTop;

        const triggerCenterY = rect.top + rect.height / 2;
        arrowTop = triggerCenterY - adjustedTop - 3;
        arrowTop = Math.max(8, Math.min(arrowTop, bubbleRect.height - 14));
      } else if (position === 'right') {
        top = rect.top + rect.height / 2 - bubbleRect.height / 2;
        left = rect.right + gap;

        const minTop = 8;
        const maxTop = window.innerHeight - bubbleRect.height - 8;
        const adjustedTop = Math.max(minTop, Math.min(top, maxTop));
        top = adjustedTop;

        const triggerCenterY = rect.top + rect.height / 2;
        arrowTop = triggerCenterY - adjustedTop - 3;
        arrowTop = Math.max(8, Math.min(arrowTop, bubbleRect.height - 14));
      }

      setCoords({ top, left });
      setArrowStyle({
        left: arrowLeft !== undefined ? `${arrowLeft}px` : undefined,
        top: arrowTop !== undefined ? `${arrowTop}px` : undefined,
      });
    };

    updatePosition();

    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);

    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [active, bubbleEl, position]);

  // Rotated square arrows matching position
  const arrow: Record<string, string> = {
    top:    'bottom-[-4px] border-r border-b',
    bottom: 'top-[-4px] border-l border-t',
    left:   'right-[-4px] border-r border-t',
    right:  'left-[-4px] border-l border-b',
  };

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center min-w-0 shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {active && createPortal(
        <div
          ref={setBubbleEl}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: coords ? `${coords.top}px` : '0px',
            left: coords ? `${coords.left}px` : '0px',
            opacity: coords ? 1 : 0,
            animation: coords ? 'tooltip-fade-in 0.08s ease-out both' : 'none',
          }}
        >
          {/* Bubble */}
          <div className="relative w-max max-w-[280px] px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border)] text-[10px] leading-tight text-[var(--text-primary)] shadow-xl font-sans whitespace-normal break-words">
            {content}
            {/* Arrow */}
            {coords && (
              <div
                style={arrowStyle}
                className={`absolute w-1.5 h-1.5 rotate-45 bg-[var(--bg-tertiary)] border-[var(--border)] ${arrow[position]}`}
              />
            )}
          </div>
        </div>,
        document.body
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

