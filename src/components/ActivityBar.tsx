import StackIcon from './icons/StackIcon';
import FolderIcon from './icons/FolderIcon';
import DockerIcon from './icons/DockerIcon';
import CloudUploadIcon from './icons/CloudUploadIcon';
import FileDescriptionIcon from './icons/FileDescriptionIcon';
import { PanelLeftClose, PanelBottomClose, LogOut, Activity, Database, Terminal, Lock, Settings } from 'lucide-react';
import type { ViewId, ServerConnection, FeatureFlags } from '../types';
import { Tooltip } from './Tooltip';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';

const items = [
  { id: 'servers' as const, icon: StackIcon, label: 'Servers' },
  { id: 'files' as const, icon: FolderIcon, label: 'Files' },
  { id: 'docker' as const, icon: DockerIcon, label: 'Docker' },
  { id: 'database' as const, icon: Database, label: 'Database' },
  { id: 'deploy' as const, icon: CloudUploadIcon, label: 'Deploy' },
  { id: 'monitoring' as const, icon: Activity, label: 'Monitoring' },
  { id: 'notes' as const, icon: FileDescriptionIcon, label: 'Notes & Debug' },
  { id: 'snippets' as const, icon: Terminal, label: 'Snippets Library' },
];

const flagMapping: Record<string, keyof FeatureFlags> = {
  servers: 'servers',
  files: 'files',
  docker: 'docker',
  deploy: 'deployModule',
  monitoring: 'serverAdmin',
  notes: 'notes',
  snippets: 'snippetLibrary',
};

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
  const { flags } = useFeatureFlags();

  return (
    <div className="flex flex-col w-12 bg-[var(--bg-activity)] border-r border-[var(--border)] shrink-0">
      <div className="flex flex-col items-center py-2 gap-1">
        {items.map(({ id, icon: Icon, label }) => {
          const flagKey = flagMapping[id];
          const isEnabled = flagKey ? !!flags[flagKey] : true;

          if (!isEnabled) {
            if (flags.sidebarUx === 'hidden') {
              return null;
            }
            // 'disabled' behavior: show grayed out, locked
            return (
              <Tooltip key={id} content={`[Locked] ${label} (Enable in Settings)`} position="right">
                <button
                  type="button"
                  disabled
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--text-muted)] opacity-40 cursor-not-allowed relative"
                >
                  <Icon size={22} strokeWidth={1.8} />
                  <div className="absolute bottom-0 right-0 bg-[var(--bg-activity)] border border-[var(--border)] rounded-full p-[1px] text-[var(--error)] flex items-center justify-center">
                    <Lock size={8} strokeWidth={2.5} />
                  </div>
                </button>
              </Tooltip>
            );
          }

          return (
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
          );
        })}
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
        <Tooltip content="Feature Settings" position="right">
          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-150 ${
              activeView === 'settings'
                ? 'bg-[var(--bg-secondary)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings size={20} strokeWidth={1.8} />
          </button>
        </Tooltip>

        {/* Forged branding and copyright */}
        <div className="flex flex-col items-center justify-center pt-2 mt-1 border-t border-[var(--border)] w-full select-none pointer-events-none opacity-40">
          <span className="text-[7px] font-bold tracking-widest text-[var(--text-secondary)] uppercase scale-90 origin-center leading-none">Forged</span>
          <span className="text-[7px] font-extrabold text-[var(--accent)] tracking-wider leading-none mt-0.5">BeForth</span>
        </div>
      </div>
    </div>
  );
}
