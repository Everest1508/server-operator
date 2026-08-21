import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, GripVertical } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  title?: string;
  size?: 'sm' | 'md';
  reorderable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  reorderIgnoreValues?: string[];
}

export function Select({
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  containerClassName = '',
  title,
  size = 'md',
  reorderable = false,
  onReorder,
  reorderIgnoreValues = [],
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dropdownEl, setDropdownEl] = useState<HTMLDivElement | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [armedDragIdx, setArmedDragIdx] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ignoredReorderValues = new Set(reorderIgnoreValues);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen || !dropdownEl || !triggerRef.current) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const dropdownRect = dropdownEl.getBoundingClientRect();

      let top = rect.bottom + 4;
      let left = rect.left;

      // Vertical overflow check
      if (top + dropdownRect.height > window.innerHeight && rect.top - dropdownRect.height - 4 > 0) {
        top = rect.top - dropdownRect.height - 4;
      }

      // Horizontal overflow check
      if (left + dropdownRect.width > window.innerWidth) {
        left = window.innerWidth - dropdownRect.width - 8;
      }
      left = Math.max(8, left);

      setCoords({ top, left, width: rect.width });
    };

    updatePosition();

    // Re-verify position right after render state settles
    const rafId = requestAnimationFrame(updatePosition);

    const handleMouseDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownEl.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
    };
  }, [isOpen, dropdownEl]);

  return (
    <div className={`relative inline-block min-w-0 ${containerClassName || 'w-full'}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        title={title}
        className={`w-full flex items-center justify-between gap-2 bg-bg-primary/50 border border-border/30 text-xs text-text-primary font-sans text-left transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed select-none ${
          size === 'sm' ? 'px-2.5 py-1 rounded-lg' : 'px-3.5 py-2 rounded-xl'
        } ${className}`}
      >
        <span className="truncate flex-1">
          {selectedOption ? selectedOption.label : ''}
        </span>
        <ChevronDown
          size={size === 'sm' ? 12 : 14}
          className={`text-text-secondary shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent' : ''}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={setDropdownEl}
          className="fixed z-[99999] overflow-hidden rounded-xl border border-border/40 bg-bg-tertiary/95 shadow-2xl backdrop-blur-md font-sans p-1"
          style={{
            top: coords ? `${coords.top}px` : '0px',
            left: coords ? `${coords.left}px` : '0px',
            width: coords ? `${coords.width}px` : 'auto',
            minWidth: '160px',
            opacity: coords ? 1 : 0,
            transform: coords ? 'none' : 'scale(0.97) translateY(-4px)',
            animation: coords ? 'select-dropdown-enter 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
          }}
        >
          <div className="max-h-60 overflow-y-auto py-0.5 flex flex-col gap-0.5 scrollbar-vs">
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const canReorder = reorderable && !ignoredReorderValues.has(opt.value);
              const isDragSource = draggingIdx === idx;
              return (
                <div
                  key={opt.value}
                  draggable={canReorder && armedDragIdx === idx}
                  onDragStart={(e) => {
                    if (!canReorder) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', opt.value);
                    setDraggingIdx(idx);
                  }}
                  onDragOver={(e) => {
                    if (draggingIdx === null || !canReorder) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (draggingIdx === null) return;
                    e.preventDefault();
                    if (canReorder && onReorder && draggingIdx !== idx) {
                      onReorder(draggingIdx, idx);
                    }
                    setDraggingIdx(null);
                    setArmedDragIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggingIdx(null);
                    setArmedDragIdx(null);
                  }}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs cursor-pointer select-none rounded-lg transition-colors duration-100 ${
                    isSelected
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-primary hover:bg-bg-primary/60'
                  } ${isDragSource ? 'opacity-40' : draggingIdx !== null ? 'opacity-70' : ''}`}
                >
                  {canReorder && (
                    <span
                      onMouseDown={() => {
                        setArmedDragIdx(idx);
                      }}
                      onMouseUp={() => setArmedDragIdx(null)}
                      onClick={(e) => e.stopPropagation()}
                      title="Drag to rearrange"
                      className="shrink-0 cursor-grab text-text-muted hover:text-text-primary active:cursor-grabbing transition-colors"
                    >
                      <GripVertical size={12} />
                    </span>
                  )}
                  <span className="truncate flex-1">{opt.label}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-accent" />}
                </div>
              );
            })}
          </div>
          <style>{`
            @keyframes select-dropdown-enter {
              from {
                opacity: 0;
                transform: scale(0.97) translateY(-4px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
            .scrollbar-vs::-webkit-scrollbar {
              width: 5px;
            }
            .scrollbar-vs::-webkit-scrollbar-track {
              background: transparent;
            }
            .scrollbar-vs::-webkit-scrollbar-thumb {
              background: var(--color-border);
              border-radius: 3px;
            }
            .scrollbar-vs::-webkit-scrollbar-thumb:hover {
              background: var(--color-text-secondary);
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
