import StackIcon from './icons/StackIcon';
import FolderIcon from './icons/FolderIcon';
import DockerIcon from './icons/DockerIcon';
import CloudUploadIcon from './icons/CloudUploadIcon';
import FileDescriptionIcon from './icons/FileDescriptionIcon';
import { PanelLeftClose, PanelBottomClose, LogOut } from 'lucide-react';
import type { ViewId, ServerConnection } from '../types';
import { Tooltip } from './Tooltip';

const items = [
  { id: 'servers' as const, icon: StackIcon, label: 'Servers' },
  { id: 'files' as const, icon: FolderIcon, label: 'Files' },
  { id: 'docker' as const, icon: DockerIcon, label: 'Docker' },
  { id: 'deploy' as const, icon: CloudUploadIcon, label: 'Deploy' },
  { id: 'notes' as const, icon: FileDescriptionIcon, label: 'Notes & Debug' },
];

interface ActivityBarProps {
  activeView: ViewId;
  onViewChange: (v: ViewId) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  panelOpen: boolean;
  onPanelToggle: () => void;
  currentServer?: ServerConnection | null;
  onDisconnect?: () => void;
}

export function ActivityBar({
  activeView,
  onViewChange,
  sidebarOpen,
  onSidebarToggle,
  panelOpen,
  onPanelToggle,
  currentServer,
  onDisconnect,
}: ActivityBarProps) {
  return (
    <div className="flex flex-col w-12 bg-[var(--bg-activity)] border-r border-[var(--border)] shrink-0">
      <div className="flex flex-col items-center py-2 gap-1">
        {items.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id} content={label} position="right">
            <button
              type="button"
              onClick={() => onViewChange(id)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-150 ${
                activeView === id
                  ? 'bg-[var(--bg-secondary)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={22} strokeWidth={1.8} />
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center pb-2 border-t border-[var(--border)] pt-2 gap-1">
        {currentServer && onDisconnect && (
          <Tooltip content={`Disconnect from ${currentServer.name}`} position="right">
            <button
              type="button"
              onClick={onDisconnect}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--error)] hover:bg-[var(--error)]/15 transition-colors duration-150"
            >
              <LogOut size={20} />
            </button>
          </Tooltip>
        )}
        <Tooltip content={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="w-10 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
          >
            <PanelLeftClose size={20} />
          </button>
        </Tooltip>
        <Tooltip content={panelOpen ? 'Close panel' : 'Open panel'} position="right">
          <button
            type="button"
            onClick={onPanelToggle}
            className="w-10 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
          >
            <PanelBottomClose size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
