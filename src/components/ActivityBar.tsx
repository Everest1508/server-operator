import { Server, FolderOpen, Box, Rocket, PanelLeftClose, PanelBottomClose, StickyNote } from 'lucide-react';
import type { ViewId } from '../types';

const items: { id: ViewId; icon: typeof Server; label: string }[] = [
  { id: 'servers', icon: Server, label: 'Servers' },
  { id: 'files', icon: FolderOpen, label: 'Files' },
  { id: 'docker', icon: Box, label: 'Docker' },
  { id: 'deploy', icon: Rocket, label: 'Deploy' },
  { id: 'notes', icon: StickyNote, label: 'Notes & Debug' },
];

interface ActivityBarProps {
  activeView: ViewId;
  onViewChange: (v: ViewId) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  panelOpen: boolean;
  onPanelToggle: () => void;
}

export function ActivityBar({
  activeView,
  onViewChange,
  sidebarOpen,
  onSidebarToggle,
  panelOpen,
  onPanelToggle,
}: ActivityBarProps) {
  return (
    <div className="flex flex-col w-12 bg-[var(--bg-activity)] border-r border-[var(--border)] shrink-0">
      <div className="flex flex-col items-center py-2 gap-1">
        {items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            title={label}
            className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
              activeView === id
                ? 'bg-[var(--bg-tertiary)] text-[var(--accent)] border-l-2 border-[var(--accent)] -ml-[2px]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={22} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center pb-2 border-t border-[var(--border)] pt-2">
        <button
          type="button"
          onClick={onSidebarToggle}
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          className="w-10 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
        >
          <PanelLeftClose size={20} />
        </button>
        <button
          type="button"
          onClick={onPanelToggle}
          title={panelOpen ? 'Close panel' : 'Open panel'}
          className="w-10 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
        >
          <PanelBottomClose size={20} />
        </button>
      </div>
    </div>
  );
}
