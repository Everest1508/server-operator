import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

export interface DropdownTriggerProps {
  ref: Ref<HTMLElement>;
  onClick: () => void;
  open: boolean;
  'aria-expanded': boolean;
  'aria-haspopup': boolean;
}

export interface DropdownProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: (props: DropdownTriggerProps) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  matchTriggerWidth?: boolean;
  minWidth?: number;
  panelClassName?: string;
  closeOnScroll?: boolean;
  disabled?: boolean;
}

export function Dropdown({
  open: controlledOpen,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  matchTriggerWidth = false,
  minWidth = 160,
  panelClassName = '',
  closeOnScroll = false,
  disabled = false,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    const gap = 6;
    const margin = 8;

    let top = rect.bottom + gap;
    if (top + panelRect.height > window.innerHeight - margin && rect.top - panelRect.height - gap > margin) {
      top = rect.top - panelRect.height - gap;
    }

    const width = matchTriggerWidth ? rect.width : Math.max(minWidth, panelRect.width);
    let left = align === 'end' ? rect.right - width : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    setCoords({ top, left, width });
  }, [align, matchTriggerWidth, minWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollResize = () => {
      if (closeOnScroll) setOpen(false);
      else updatePosition();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
    };
  }, [open, setOpen, updatePosition, closeOnScroll]);

  const toggle = () => {
    if (disabled) return;
    setOpen(!open);
  };

  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
  };

  const panel = open
    ? createPortal(
        <>
          <div className="fixed inset-0 z-[99998]" aria-hidden onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className={`fixed z-[99999] overflow-hidden rounded-xl border border-border/50 bg-[#121820]/98 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl dropdown-panel-enter ${panelClassName}`}
            style={
              coords
                ? { top: coords.top, left: coords.left, width: coords.width, visibility: 'visible' as const }
                : { top: -9999, left: -9999, width: minWidth, visibility: 'hidden' as const }
            }
          >
            {children}
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <>
      {trigger({
        ref: setTriggerRef,
        onClick: toggle,
        open,
        'aria-expanded': open,
        'aria-haspopup': true,
      })}
      {panel}
    </>
  );
}
