import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Element the menu hangs from (usually the button's wrapper). */
  anchorRef: RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}

/**
 * A dropdown that renders on document.body so parents with overflow-hidden, transforms or
 * backdrop-filter cannot clip it. It sits under the anchor, flips above it when there is no room,
 * and stays inside the window.
 */
export function FloatingMenu({ anchorRef, align = 'right', className = '', children }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const a = anchor.getBoundingClientRect();
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      const gap = 6;
      const margin = 8;
      let top = a.bottom + gap;
      if (top + h > window.innerHeight - margin) top = Math.max(margin, a.top - gap - h);
      let left = align === 'right' ? a.right - w : a.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - w - margin);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, align]);

  return createPortal(
    <div
      ref={menuRef}
      // Keep outside-click handlers on the anchor from closing the menu before an item is clicked.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className={`z-[99999] ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
