import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

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
  title?: string;
}

export function Select({ value, onChange, options, disabled = false, className = '', title }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dropdownEl, setDropdownEl] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    <div className="relative inline-block w-full min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        title={title}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-sans text-left transition-all duration-150 focus:outline-none focus:border-[var(--accent)] hover:border-[var(--border-hover,var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed select-none ${className}`}
      >
        <span className="truncate flex-1">
          {selectedOption ? selectedOption.label : ''}
        </span>
        <ChevronDown
          size={16}
          className={`text-[var(--text-secondary)] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--accent)]' : ''}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={setDropdownEl}
          className="fixed z-[99999] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] shadow-2xl font-sans"
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
          <div className="max-h-60 overflow-y-auto py-1 scrollbar-vs">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer select-none transition-colors duration-100 ${
                    isSelected
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                      : 'text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white'
                  }`}
                >
                  <span className="truncate flex-1">{opt.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
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
              width: 6px;
            }
            .scrollbar-vs::-webkit-scrollbar-track {
              background: transparent;
            }
            .scrollbar-vs::-webkit-scrollbar-thumb {
              background: var(--border);
              border-radius: 3px;
            }
            .scrollbar-vs::-webkit-scrollbar-thumb:hover {
              background: var(--text-secondary);
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
