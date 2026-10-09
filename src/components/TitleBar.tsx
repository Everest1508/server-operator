import { useState, useEffect, useRef } from 'react';
import { Minus, Square, Copy, X, ExternalLink } from 'lucide-react';
import packageJson from '../../package.json';
import { alertDialog } from '../utils/confirm';
import type { ServerConnection, ViewId } from '../types';
import { MultiServerBar, type ServerTabSession } from './MultiServerBar';
import { ProfileMenu } from './ProfileMenu';

interface TitleBarProps {
  currentServer: ServerConnection | null;
  serverTabs?: ServerTabSession[];
  activeTabId?: string | null;
  onSelectTab?: (tab: ServerTabSession) => void;
  onCloseTab?: (tabId: string) => void;
  onOpenAddServer?: () => void;
  servers?: ServerConnection[];
  onSelectServer?: (server: ServerConnection) => void;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  onViewChange?: (view: ViewId) => void;
}

export function TitleBar({
  currentServer,
  serverTabs = [],
  activeTabId = null,
  onSelectTab,
  onCloseTab,
  onOpenAddServer,
  servers = [],
  onSelectServer,
  sidebarOpen,
  onSidebarToggle,
  onViewChange,
}: TitleBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isElectron = typeof window !== 'undefined' && !!window.serverOperator;
  const platform = window.serverOperator?.platform || 'web';
  const isMac = platform === 'darwin';

  const triggerMenuActionRef = useRef<(action: string) => void>(() => {});

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      // Reload Window and Toggle Sidebar are custom app actions with no native
      // menu accelerator on Windows/Linux, so they need CmdOrCtrl handling here.
      // Quit and Open Local Folder already have a native accelerator on those
      // platforms (electron/main.js), so only macOS's Cmd chord triggers them below.
      if (!isMac && event.ctrlKey) {
        if (key === 'r') {
          event.preventDefault();
          triggerMenuActionRef.current('reload-window');
          return;
        }
        if (key === 'b') {
          event.preventDefault();
          triggerMenuActionRef.current('toggle-sidebar');
          return;
        }
      }
      if (!isMac) return;
      if (!event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const inInput =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.xterm-helper-textarea') !== null);
      switch (key) {
        case 'q':
          event.preventDefault();
          window.serverOperator?.quitApp?.();
          return;
        case 'r':
          event.preventDefault();
          triggerMenuActionRef.current('reload-window');
          return;
        case 'b':
          event.preventDefault();
          triggerMenuActionRef.current('toggle-sidebar');
          return;
        case 'o':
          event.preventDefault();
          triggerMenuActionRef.current('open-local-folder');
          return;
      }
      if (inInput) {
        switch (key) {
          case 'c':
            event.preventDefault();
            document.execCommand('copy');
            return;
          case 'x':
            event.preventDefault();
            document.execCommand('cut');
            return;
          case 'v':
            event.preventDefault();
            document.execCommand('paste');
            return;
          case 'a':
            event.preventDefault();
            document.execCommand('selectAll');
            return;
          case 'z':
            event.preventDefault();
            document.execCommand(event.shiftKey ? 'redo' : 'undo');
            return;
          case 'y':
            event.preventDefault();
            document.execCommand('redo');
            return;
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMac]);

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      case 'open-local-folder':
        window.serverOperator?.pickLocalFolder?.().then((res) => {
          if (res?.ok && !res.canceled && res.folderPath) {
            window.dispatchEvent(new CustomEvent('open-local-folder', { detail: { folderPath: res.folderPath } }));
          }
        });
        break;
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
        void alertDialog(`Version ${packageJson.version}\nBuilt by BeForth with Electron, React and TypeScript.`, 'Server Operator');
        break;
      default:
        break;
    }
  };

  triggerMenuActionRef.current = triggerMenuAction;

  const mod = isMac ? '⌘' : 'Ctrl+';
  type MenuItem = { label: string; action: string; shortcut?: string; external?: boolean; danger?: boolean } | 'sep';
  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open Local Folder…', action: 'open-local-folder', shortcut: `${mod}O` },
        'sep',
        { label: 'Reload Window', action: 'reload-window', shortcut: `${mod}R` },
        { label: 'Developer Tools', action: 'toggle-devtools', shortcut: 'F12' },
        'sep',
        { label: 'Exit', action: 'exit', shortcut: isMac ? '⌘Q' : 'Alt+F4', danger: true },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Undo', action: 'undo', shortcut: `${mod}Z` },
        { label: 'Redo', action: 'redo', shortcut: `${mod}${isMac ? '⇧Z' : 'Y'}` },
        'sep',
        { label: 'Cut', action: 'cut', shortcut: `${mod}X` },
        { label: 'Copy', action: 'copy', shortcut: `${mod}C` },
        { label: 'Paste', action: 'paste', shortcut: `${mod}V` },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: `${sidebarOpen ? 'Hide' : 'Show'} Sidebar`, action: 'toggle-sidebar', shortcut: `${mod}B` },
        { label: 'Toggle Fullscreen', action: 'toggle-fullscreen', shortcut: 'F11' },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'View on GitHub', action: 'github', external: true },
        { label: 'About Server Operator', action: 'about' },
      ],
    },
  ];

  const winBtn = 'w-11 h-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors';

  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className={`h-10 shrink-0 bg-bg-secondary/40 border-b border-border/30 backdrop-blur-md flex items-center justify-between select-none relative z-50 ${
        isMac ? 'pl-[80px]' : 'pl-3'
      }`}
    >
      {/* Left: logo + menu bar */}
      <div className="flex items-center gap-1 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} ref={menuRef}>
        <img src="logo.png" alt="" className="h-5 w-auto object-contain mr-2 shrink-0 pointer-events-none" />
        <div className="flex items-center gap-0.5 text-xs text-text-secondary" role="menubar">
          {menus.map((menu) => {
            const open = activeMenu === menu.id;
            return (
              <div key={menu.id} className="relative">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => setActiveMenu(open ? null : menu.id)}
                  // Once a menu is open, hovering a sibling switches to it, like a native menu bar.
                  onMouseEnter={() => activeMenu && setActiveMenu(menu.id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    open ? 'bg-bg-tertiary text-text-primary' : 'hover:bg-bg-tertiary/50 hover:text-text-primary'
                  }`}
                >
                  {menu.label}
                </button>
                {open && (
                  <div
                    role="menu"
                    className="absolute top-[calc(100%+2px)] left-0 min-w-56 popover-surface border border-border/50 shadow-2xl rounded-xl p-1 flex flex-col z-50 text-text-primary backdrop-blur-md"
                  >
                    {menu.items.map((item, i) =>
                      item === 'sep' ? (
                        <div key={i} role="separator" className="h-px bg-border/40 my-1" />
                      ) : (
                        <button
                          key={item.action}
                          type="button"
                          role="menuitem"
                          onClick={() => triggerMenuAction(item.action)}
                          className={`px-2.5 py-1.5 rounded-lg text-left flex justify-between items-center gap-6 w-full transition-colors text-xs ${
                            item.danger ? 'hover:bg-error/15 hover:text-error' : 'hover:bg-accent/12 hover:text-accent'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {item.label}
                            {item.external && <ExternalLink className="h-3 w-3 opacity-70" />}
                          </span>
                          {item.shortcut && <span className="text-[11px] text-text-muted">{item.shortcut}</span>}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: open server tabs */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-30">
        {onOpenAddServer ? (
          <MultiServerBar
            tabs={serverTabs}
            activeTabId={activeTabId}
            onSelectTab={onSelectTab || (() => {})}
            onCloseTab={onCloseTab || (() => {})}
            onOpenAddServer={onOpenAddServer}
            servers={servers}
            onSelectServer={onSelectServer}
          />
        ) : (
          <span className="text-xs font-semibold text-text-muted">Server Operator</span>
        )}
      </div>

      {/* Right: profile + window controls (Windows/Linux) */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center h-full pr-2">
          <ProfileMenu onViewChange={onViewChange} />
        </div>
        {!isMac && (
          <>
            <button type="button" onClick={handleMinimize} aria-label="Minimize" title="Minimize" className={winBtn}>
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={handleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'} title={isMaximized ? 'Restore' : 'Maximize'} className={winBtn}>
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-2.5 h-2.5" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              title="Close"
              className="w-11 h-full flex items-center justify-center text-text-secondary hover:text-white hover:bg-error transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
