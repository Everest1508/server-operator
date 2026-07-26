import React from 'react';
import { Plus, X } from 'lucide-react';
import type { ServerConnection } from '../types';

export interface ServerTabSession {
  tabId: string;
  server: ServerConnection;
}

interface MultiServerBarProps {
  tabs: ServerTabSession[];
  activeTabId: string | null;
  onSelectTab: (tab: ServerTabSession) => void;
  onCloseTab: (tabId: string) => void;
  onOpenAddServer: () => void;
}

export function MultiServerBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenAddServer,
}: MultiServerBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto max-w-full no-scrollbar py-0.5 select-none" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {tabs.map((t) => {
        const isActive = activeTabId === t.tabId;
        const s = t.server;
        return (
          <div
            key={t.tabId}
            role="button"
            tabIndex={0}
            onClick={() => onSelectTab(t)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab(t);
            }}
            title={`${s.name} (${s.host})`}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg cursor-pointer shrink-0 max-w-[190px] min-w-0 group border transition-all duration-150 text-[11px] font-mono ${
              isActive
                ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                : 'bg-bg-tertiary/40 border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-success shadow-[0_0_8px_rgba(78,201,176,0.8)] animate-pulse' : 'bg-text-muted/60'}`} />
            <span className="truncate min-w-0 flex-1 font-sans font-medium">{s.name}</span>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-bg-tertiary text-text-muted hover:text-error transition-all duration-100 shrink-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(t.tabId);
              }}
              title="Close server tab"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onOpenAddServer}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-tertiary/30 hover:bg-bg-tertiary border border-border/20 text-text-muted hover:text-accent text-[11px] font-sans font-medium transition-all duration-150 shrink-0 cursor-pointer"
        title="Open another server connection tab"
      >
        <Plus size={12} />
        <span>New Tab</span>
      </button>
    </div>
  );
}
