import { useState, useEffect, useRef } from 'react';
import { Minus, Square, X, ExternalLink, RefreshCw, Terminal, Info, ChevronDown } from 'lucide-react';
import type { ServerConnection } from '../types';

interface TitleBarProps {
  currentServer: ServerConnection | null;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
}

export function TitleBar({ currentServer, sidebarOpen, onSidebarToggle }: TitleBarProps) {
  const [activeMenu, setActiveMenu] = useState<'file' | 'edit' | 'view' | 'help' | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isElectron = typeof window !== 'undefined' && !!window.serverOperator;
  const platform = window.serverOperator?.platform || 'web';
  const isMac = platform === 'darwin';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    const interval = setInterval(async () => {
      if (window.serverOperator?.isWindowMaximized) {
        const max = await window.serverOperator.isWindowMaximized();
        setIsMaximized(max);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isElectron]);

  const handleMinimize = () => {
    window.serverOperator?.minimizeWindow?.();
  };

  const handleMaximize = async () => {
    await window.serverOperator?.maximizeWindow?.();
    if (window.serverOperator?.isWindowMaximized) {
      const max = await window.serverOperator.isWindowMaximized();
      setIsMaximized(max);
    }
  };

  const handleClose = () => {
    window.serverOperator?.closeWindow?.();
  };

  const triggerMenuAction = (action: string) => {
    setActiveMenu(null);
    switch (action) {
      // File actions
      case 'reload-window':
        window.location.reload();
        break;
      case 'toggle-devtools':
        window.serverOperator?.openDevTools?.();
        break;
      case 'exit':
        window.serverOperator?.closeWindow?.();
        break;

      // Edit actions
      case 'undo':
        document.execCommand('undo');
        break;
      case 'redo':
        document.execCommand('redo');
        break;
      case 'cut':
        document.execCommand('cut');
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'paste':
        document.execCommand('paste');
        break;

      // View actions
      case 'toggle-sidebar':
        onSidebarToggle?.();
        break;
      case 'toggle-fullscreen':
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        break;

      // Help actions
      case 'github':
        if (isElectron) {
          // If in Electron, open link in external browser
          window.serverOperator?.openReleasePage?.('https://github.com/everest1508/server-operator');
        } else {
          window.open('https://github.com/everest1508/server-operator', '_blank');
        }
        break;
      case 'about':
        alert(
          '⚡ Server Operator ⚡\n\nVersion: 1.0.0\nForged by: BeForth\nA premium, high-performance desktop server manager and deployment environment built on Electron, React, and TypeScript.'
        );
        break;
      default:
        break;
    }
  };

  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className={`h-10 shrink-0 bg-bg-secondary/40 border-b border-border/30 backdrop-blur-md flex items-center justify-between select-none relative z-50 ${
        isMac ? 'pl-[80px]' : 'pl-3'
      }`}
    >
      {/* Left Area: Logo & Menus */}
      <div className="flex items-center gap-1.5 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} ref={menuRef}>
        <img src="logo.png" alt="Serop Logo" className="h-4.5 w-auto object-contain mr-1.5 shrink-0 pointer-events-none opacity-90" />
        
        {/* Menu Bar */}
        <div className="flex items-center gap-1 text-[11px] text-text-secondary font-sans">
          {/* File Menu */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
              className={`px-2.5 py-1 rounded-md hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-150 ${
                activeMenu === 'file' ? 'bg-bg-tertiary text-text-primary font-semibold' : ''
              }`}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div className="absolute top-[110%] left-0 w-52 bg-bg-tertiary/95 border border-border/50 shadow-2xl rounded-lg py-1 flex flex-col z-50 text-text-primary font-sans backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-100">
                <button
                  onClick={() => triggerMenuAction('reload-window')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Reload Window</span>
                  <span className="text-[10px] text-text-muted">Ctrl+R</span>
                </button>
                <button
                  onClick={() => triggerMenuAction('toggle-devtools')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Developer Tools</span>
                  <span className="text-[10px] text-text-muted">F12</span>
                </button>
                <div className="h-[1px] bg-border/40 my-1" />
                <button
                  onClick={() => triggerMenuAction('exit')}
                  className="px-3 py-1.5 hover:bg-error/15 hover:text-error text-left flex justify-between items-center w-full transition-colors text-xs font-semibold"
                >
                  <span>Exit</span>
                  <span className="text-[10px] text-text-muted group-hover:text-error/70">Alt+F4</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
              className={`px-2.5 py-1 rounded-md hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-150 ${
                activeMenu === 'edit' ? 'bg-bg-tertiary text-text-primary font-semibold' : ''
              }`}
            >
              Edit
            </button>
            {activeMenu === 'edit' && (
              <div className="absolute top-[110%] left-0 w-48 bg-bg-tertiary/95 border border-border/50 shadow-2xl rounded-lg py-1 flex flex-col z-50 text-text-primary font-sans backdrop-blur-md">
                <button
                  onClick={() => triggerMenuAction('undo')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Undo</span>
                  <span className="text-[10px] text-text-muted">Ctrl+Z</span>
                </button>
                <button
                  onClick={() => triggerMenuAction('redo')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Redo</span>
                  <span className="text-[10px] text-text-muted">Ctrl+Y</span>
                </button>
                <div className="h-[1px] bg-border/40 my-1" />
                <button
                  onClick={() => triggerMenuAction('cut')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Cut</span>
                  <span className="text-[10px] text-text-muted">Ctrl+X</span>
                </button>
                <button
                  onClick={() => triggerMenuAction('copy')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Copy</span>
                  <span className="text-[10px] text-text-muted">Ctrl+C</span>
                </button>
                <button
                  onClick={() => triggerMenuAction('paste')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Paste</span>
                  <span className="text-[10px] text-text-muted">Ctrl+V</span>
                </button>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
              className={`px-2.5 py-1 rounded-md hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-150 ${
                activeMenu === 'view' ? 'bg-bg-tertiary text-text-primary font-semibold' : ''
              }`}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div className="absolute top-[110%] left-0 w-52 bg-bg-tertiary/95 border border-border/50 shadow-2xl rounded-lg py-1 flex flex-col z-50 text-text-primary font-sans backdrop-blur-md">
                <button
                  onClick={() => triggerMenuAction('toggle-sidebar')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>{sidebarOpen ? 'Hide' : 'Show'} Sidebar</span>
                  <span className="text-[10px] text-text-muted">Ctrl+B</span>
                </button>
                <button
                  onClick={() => triggerMenuAction('toggle-fullscreen')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span>Toggle Fullscreen</span>
                  <span className="text-[10px] text-text-muted">F11</span>
                </button>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
              className={`px-2.5 py-1 rounded-md hover:bg-bg-tertiary/50 hover:text-text-primary transition-all duration-150 ${
                activeMenu === 'help' ? 'bg-bg-tertiary text-text-primary font-semibold' : ''
              }`}
            >
              Help
            </button>
            {activeMenu === 'help' && (
              <div className="absolute top-[110%] left-0 w-48 bg-bg-tertiary/95 border border-border/50 shadow-2xl rounded-lg py-1 flex flex-col z-50 text-text-primary font-sans backdrop-blur-md">
                <button
                  onClick={() => triggerMenuAction('github')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    View on GitHub
                    <ExternalLink className="h-3 w-3 opacity-80" />
                  </span>
                </button>
                <button
                  onClick={() => triggerMenuAction('about')}
                  className="px-3 py-1.5 hover:bg-accent/10 hover:text-accent text-left flex justify-between items-center w-full transition-colors text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    About Server Operator
                    <Info className="h-3 w-3 opacity-80" />
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Area: App Title & Connected Server Status */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 max-w-[40%] truncate pointer-events-none">
        {currentServer ? (
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-bg-tertiary/60 border border-border/40 text-[11px] font-mono font-medium max-w-full truncate shadow-inner backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-success/80 shadow-[0_0_8px_rgba(78,201,176,0.6)] animate-pulse shrink-0" />
            <span className="text-text-primary truncate">{currentServer.name}</span>
            <span className="text-text-muted text-[9px] hidden md:inline truncate opacity-90">({currentServer.host})</span>
          </div>
        ) : (
          <span className="text-[10px] font-sans font-bold text-text-muted tracking-widest opacity-85">
            SERVER OPERATOR
          </span>
        )}
      </div>

      {/* Right Area: Window Controls (Windows/Linux only) */}
      {!isMac && (
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Minimize */}
          <button
            onClick={handleMinimize}
            title="Minimize"
            className="w-11 h-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          
          {/* Maximize / Restore */}
          <button
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            className="w-11 h-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          
          {/* Close */}
          <button
            onClick={handleClose}
            title="Close"
            className="w-11 h-full flex items-center justify-center text-text-secondary hover:text-white hover:bg-error transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
