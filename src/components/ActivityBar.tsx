import StackIcon from './icons/StackIcon';
import FolderIcon from './icons/FolderIcon';
import DockerIcon from './icons/DockerIcon';
import CloudUploadIcon from './icons/CloudUploadIcon';
import FileDescriptionIcon from './icons/FileDescriptionIcon';
import { PanelLeftClose, PanelBottomClose, LogOut, Activity, Database, Terminal, Lock, Settings, BookOpen } from 'lucide-react';
import type { ViewId, ServerConnection, FeatureFlags } from '../types';
import { Tooltip } from './Tooltip';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';

const items = [
  { id: 'servers' as const, icon: StackIcon, label: 'Servers' },
  { id: 'files' as const, icon: FolderIcon, label: 'Files' },
  { id: 'docker' as const, icon: DockerIcon, label: 'Docker' },
  { id: 'database' as const, icon: Database, label: 'Database' },
  { id: 'deploy' as const, icon: CloudUploadIcon, label: 'Deploy' },
  { id: 'notes' as const, icon: FileDescriptionIcon, label: 'Notes & Debug' },
  { id: 'guide' as const, icon: BookOpen, label: 'Feature Guide' },
];

const flagMapping: Record<string, keyof FeatureFlags> = {
  servers: 'servers',
  files: 'files',
  docker: 'docker',
  database: 'database',
  deploy: 'deployModule',
  notes: 'notes',
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
    <div className="flex flex-col w-12 bg-bg-activity/30 border-r border-border/20 shrink-0">
      <div className="flex flex-col items-center py-3 gap-1.5">
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
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-text-muted opacity-30 cursor-not-allowed relative"
                >
                  <Icon size={20} strokeWidth={1.8} />
                  <div className="absolute bottom-0 right-0 bg-bg-activity border border-border/40 rounded-full p-[2px] text-error flex items-center justify-center">
                    <Lock size={7} strokeWidth={2.5} />
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
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 relative ${
                  activeView === id
                    ? 'bg-bg-tertiary/60 text-accent'
                    : 'text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
                }`}
              >
                {activeView === id && (
                  <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r bg-accent" />
                )}
                <Icon size={20} strokeWidth={1.8} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-center pb-3 border-t border-border/20 pt-3 gap-1.5">
        {currentServer && onDisconnect && (
          <Tooltip content={`Disconnect from ${currentServer.name}`} position="right">
            <button
              type="button"
              onClick={onDisconnect}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-error/80 hover:bg-error/8 hover:text-error transition-all duration-200"
            >
              <LogOut size={18} />
            </button>
          </Tooltip>
        )}
        <Tooltip content={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} position="right">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="w-9 h-9 flex items-center justify-center text-text-secondary hover:bg-bg-tertiary/40 hover:text-text-primary rounded-md transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
        </Tooltip>
        <Tooltip content={panelOpen ? 'Close panel' : 'Open panel'} position="right">
          <button
            type="button"
            onClick={onPanelToggle}
            className="w-9 h-9 flex items-center justify-center text-text-secondary hover:bg-bg-tertiary/40 hover:text-text-primary rounded-md transition-colors"
          >
            <PanelBottomClose size={18} />
          </button>
        </Tooltip>
        <Tooltip content="Feature Settings" position="right">
          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 relative ${
              activeView === 'settings'
                ? 'bg-bg-tertiary/60 text-accent'
                : 'text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            {activeView === 'settings' && (
              <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r bg-accent" />
            )}
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </Tooltip>

        {/* Forged branding and copyright */}
        <div className="flex flex-col items-center justify-center pt-2 mt-1 border-t border-border/20 w-full select-none pointer-events-none opacity-25">
          <span className="text-[6.5px] font-bold tracking-widest text-text-secondary uppercase scale-90 origin-center leading-none">Forged</span>
          <span className="text-[6.5px] font-extrabold text-accent tracking-wider leading-none mt-0.5">BeForth</span>
        </div>
      </div>
    </div>
  );
}
