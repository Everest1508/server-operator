import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Server, HardDrive, Shield, Cloud } from 'lucide-react';
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
  servers?: ServerConnection[];
  onSelectServer?: (server: ServerConnection) => void;
}

export function MultiServerBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenAddServer,
  servers = [],
  onSelectServer,
}: MultiServerBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const getServerIcon = (type?: string) => {
    switch (type) {
      case 'local':
        return <HardDrive size={12} className="text-accent shrink-0" />;
      case 'cloudflare':
        return <Cloud size={12} className="text-warning shrink-0" />;
      case 'ec2':
        return <Shield size={12} className="text-success shrink-0" />;
      default:
        return <Server size={12} className="text-text-muted shrink-0" />;
    }
  };

  return (
    <div className="flex items-center gap-1.5 select-none relative z-40" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto max-w-[400px] no-scrollbar py-0.5">
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
                className={`flex items-center gap-2 px-2.5 py-1 rounded-lg cursor-pointer shrink-0 max-w-[180px] min-w-0 group border transition-all duration-150 text-[11px] font-mono ${
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
        </div>
      )}

      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-sans font-medium transition-all duration-150 shrink-0 cursor-pointer shadow-sm ${
            dropdownOpen
              ? 'bg-bg-tertiary border-accent/50 text-accent ring-1 ring-accent/20'
              : 'bg-bg-tertiary/50 hover:bg-bg-tertiary border-border/40 text-text-secondary hover:text-accent'
          }`}
          title="Select a server connection to open in a tab"
        >
          <Plus size={13} className="text-accent" />
          <span>New Tab</span>
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full mt-2 w-64 bg-bg-secondary border border-border/60 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in duration-150">
            {servers.length > 0 && (
              <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-text-muted uppercase font-mono border-b border-border/20 mb-1">
                Select Server
              </div>
            )}

            <div className="max-h-60 overflow-y-auto no-scrollbar">
              {servers.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted italic">
                  No saved servers found
                </div>
              ) : (
                servers.map((s) => {
                  const isAlreadyOpen = tabs.some((t) => t.server.id === s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        if (onSelectServer) {
                          onSelectServer(s);
                        } else {
                          onOpenAddServer();
                        }
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-bg-tertiary transition-colors text-xs cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {getServerIcon(s.connectionType)}
                        <div className="min-w-0 flex-1 truncate">
                          <div className="font-medium text-text-primary group-hover:text-accent truncate">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-text-muted font-mono truncate">
                            {s.host}
                          </div>
                        </div>
                      </div>
                      {isAlreadyOpen && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0 font-medium">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="my-1 border-t border-border/30" />

            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                onOpenAddServer();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-tertiary text-accent font-medium text-xs cursor-pointer transition-colors"
            >
              <Plus size={13} />
              <span>Connect / Add Server...</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

