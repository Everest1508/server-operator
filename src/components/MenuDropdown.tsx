import type { ReactNode, Ref } from 'react';
import { Dropdown } from './Dropdown';

export interface MenuDropdownItem {
  id: string;
  label: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  hidden?: boolean;
  shortcut?: string;
}

interface MenuDropdownProps {
  label: string;
  items: MenuDropdownItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MenuDropdown({ label, items, open, onOpenChange }: MenuDropdownProps) {
  const visibleItems = items.filter((item) => !item.hidden);

  return (
    <Dropdown
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      minWidth={208}
      panelClassName="py-1"
      trigger={({ ref, onClick, ...aria }) => (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          {...aria}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className={`px-2.5 py-1 rounded-md hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-150 ${
            open ? 'bg-bg-tertiary text-text-primary font-semibold' : ''
          }`}
        >
          {label}
        </button>
      )}
    >
      {visibleItems.map((item, index) => {
        const prev = visibleItems[index - 1];
        const showDivider = item.tone === 'danger' && prev && prev.tone !== 'danger';
        return (
          <div key={item.id}>
            {showDivider && <div className="h-px bg-border/30 my-1 mx-2" />}
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                onOpenChange(false);
              }}
              className={`w-full px-3 py-1.5 text-left flex justify-between items-center gap-3 transition-colors text-xs disabled:opacity-40 ${
                item.tone === 'danger'
                  ? 'text-error hover:bg-error/10 font-semibold'
                  : 'text-text-primary hover:bg-accent/10 hover:text-accent'
              }`}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="text-[10px] text-text-muted">{item.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </Dropdown>
  );
}
