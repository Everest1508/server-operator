import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as TerminalIcon, FileText, Loader2, RefreshCw, Plus, Trash2, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { attachXtermClipboardKeys } from '../utils/xtermClipboardKeys';
import type { ServerConnection, ProxySettings } from '../types';

interface PanelProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
  panelTab: 'logs' | 'terminal';
  onTabChange: (tab: 'logs' | 'terminal') => void;
  composePaths?: string[];
  onAddComposePath?: (path: string) => void;
  onRemoveComposePath?: (path: string) => void;
  pendingTerminalCommand?: string | null;
  pendingTerminalLabel?: string | null;
  onClearPendingTerminalCommand?: () => void;
}

interface TerminalTab {
  id: string;
  shellId: string | null;
  serverId: string;
  label: string;
  connecting: boolean;
  error: string | null;
  pendingCommand?: string;
}

export function Panel({ currentServer, proxy, panelTab, onTabChange, composePaths = [], onAddComposePath, onRemoveComposePath, pendingTerminalCommand = null, pendingTerminalLabel = null, onClearPendingTerminalCommand }: PanelProps) {
  const [newComposePath, setNewComposePath] = useState('');
  const [servicesByPath, setServicesByPath] = useState<Record<string, string[]>>({});
  const [loadingServicesForPath, setLoadingServicesForPath] = useState<string | null>(null);
  const [logTabs, setLogTabs] = useState<Array<{ id: string; composePath: string; service: string; label: string }>>([]);
  const [activeLogTabId, setActiveLogTabId] = useState<string | null>(null);
  const [logContentByTabId, setLogContentByTabId] = useState<Record<string, string>>({});
  const logPreRef = useRef<HTMLPreElement>(null);
  const [tail, setTail] = useState<number | ''>(200);

  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<string | null>(null);
  const [terminalStripWidth, setTerminalStripWidth] = useState(176);
  const [resizingTerminalStrip, setResizingTerminalStrip] = useState(false);
  const terminalStripResizeStart = useRef({ x: 0, w: 0 });
  const terminalContainerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const xtermByTabIdRef = useRef<Map<string, { term: Terminal; fitAddon: FitAddon; ro: ResizeObserver }>>(new Map());

  const TERMINAL_STRIP_MIN = 100;
  const TERMINAL_STRIP_MAX = 420;

  useEffect(() => {
    if (!resizingTerminalStrip) return;
    const onMove = (e: MouseEvent) => {
      const { x, w } = terminalStripResizeStart.current;
      const delta = e.clientX - x;
      const newW = Math.min(TERMINAL_STRIP_MAX, Math.max(TERMINAL_STRIP_MIN, w + delta));
      setTerminalStripWidth(newW);
      terminalStripResizeStart.current = { x: e.clientX, w: newW };
    };
    const onUp = () => setResizingTerminalStrip(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizingTerminalStrip]);

  // When pending command arrives: add a new terminal tab and open a shell for it
  useEffect(() => {
    if (!currentServer || !window.serverOperator || panelTab !== 'terminal' || !pendingTerminalCommand) return;
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const label = (pendingTerminalLabel && pendingTerminalLabel.trim()) || 'Shell';
    const tab: TerminalTab = {
      id,
      shellId: null,
      serverId: currentServer.id,
      label,
      connecting: true,
      error: null,
      pendingCommand: pendingTerminalCommand.trim(),
    };
    onClearPendingTerminalCommand?.();
    setTerminalTabs((prev) => [...prev, tab]);
    setActiveTerminalTabId(id);
    window.serverOperator
      .openShell({ connection: currentServer, proxy })
      .then((res) => {
        if (res.ok && res.shellId) {
          setTerminalTabs((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, shellId: res.shellId!, connecting: false } : t
            )
          );
          const cmd = (tab.pendingCommand || '').trim() + '\n';
          if (cmd.trim()) {
            setTimeout(() => {
              window.serverOperator?.shellWrite({ shellId: res.shellId!, data: cmd });
            }, 300);
          }
        } else {
          setTerminalTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, connecting: false, error: res.error || 'Failed to open shell' } : t))
          );
        }
      })
      .catch((e) => {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
        setTerminalTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, connecting: false, error: msg } : t))
        );
      });
  }, [pendingTerminalCommand, panelTab, currentServer?.id]);

  // Create or remove xterm instances per tab when tabs or active tab change
  useEffect(() => {
    if (panelTab !== 'terminal') return;
    const containerMap = terminalContainerRefs.current;
    const xtermMap = xtermByTabIdRef.current;
    terminalTabs.forEach((tab) => {
      if (!tab.shellId) return;
      const container = containerMap.get(tab.id);
      if (!container) return;
      if (xtermMap.has(tab.id)) return;
      const term = new Terminal({
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#0078d4',
          cursorAccent: '#1e1e1e',
          selectionBackground: 'rgba(0, 120, 212, 0.3)',
        },
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      attachXtermClipboardKeys(term);
      term.open(container);
      fitAddon.fit();
      const currentShellId = tab.shellId;
      term.onData((data) => {
        if (window.serverOperator && currentShellId) {
          window.serverOperator.shellWrite({ shellId: currentShellId, data });
        }
      });
      let rafId: number | null = null;
      const ro = new ResizeObserver(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          fitAddon.fit();
        });
      });
      ro.observe(container);
      xtermMap.set(tab.id, { term, fitAddon, ro });
    });
    const tabIds = new Set(terminalTabs.map((t) => t.id));
    xtermMap.forEach((v, tabId) => {
      if (!tabIds.has(tabId)) {
        v.ro.disconnect();
        v.term.dispose();
        xtermMap.delete(tabId);
      }
    });
  }, [panelTab, terminalTabs]);

  // Fit active tab's xterm when switching or when terminal panel is visible
  useEffect(() => {
    if (panelTab !== 'terminal' || !activeTerminalTabId) return;
    const entry = xtermByTabIdRef.current.get(activeTerminalTabId);
    if (entry) {
      requestAnimationFrame(() => entry.fitAddon.fit());
    }
  }, [panelTab, activeTerminalTabId, terminalTabs]);

  // Forward shell output to the correct tab's xterm
  useEffect(() => {
    const handler = (e: CustomEvent<{ shellId: string; data: string }>) => {
      const shellId = e.detail.shellId;
      const tab = terminalTabs.find((t) => t.shellId === shellId);
      if (!tab) return;
      const entry = xtermByTabIdRef.current.get(tab.id);
      if (entry) entry.term.write(e.detail.data);
    };
    window.addEventListener('shell-output', handler as EventListener);
    return () => window.removeEventListener('shell-output', handler as EventListener);
  }, [terminalTabs]);

  // Listen for paste snippet requests
  useEffect(() => {
    const handlePaste = (e: Event) => {
      const customEvent = e as CustomEvent<{ command: string }>;
      const cmdText = customEvent.detail.command;
      if (!cmdText) return;

      const activeTab = terminalTabs.find((t) => t.id === activeTerminalTabId);
      if (activeTab && activeTab.shellId) {
        // Paste into active terminal PTY
        window.serverOperator?.shellWrite({ shellId: activeTab.shellId, data: cmdText });
      } else {
        // No active terminal tab, spawn a new one with the command
        if (!currentServer || !window.serverOperator) return;
        const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const tab: TerminalTab = {
          id,
          shellId: null,
          serverId: currentServer.id,
          label: 'Shell',
          connecting: true,
          error: null,
          pendingCommand: cmdText,
        };
        setTerminalTabs((prev) => [...prev, tab]);
        setActiveTerminalTabId(id);
        window.serverOperator
          .openShell({ connection: currentServer, proxy })
          .then((res) => {
            if (res.ok && res.shellId) {
              setTerminalTabs((prev) =>
                prev.map((t) => (t.id === id ? { ...t, shellId: res.shellId!, connecting: false } : t))
              );
              // Wait slightly for connection to stabilize before writing command
              setTimeout(() => {
                window.serverOperator?.shellWrite({ shellId: res.shellId!, data: cmdText });
              }, 400);
            } else {
              setTerminalTabs((prev) =>
                prev.map((t) => (t.id === id ? { ...t, connecting: false, error: res.error || 'Failed to open shell' } : t))
              );
            }
          })
          .catch((err) => {
            const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
            setTerminalTabs((prev) =>
              prev.map((t) => (t.id === id ? { ...t, connecting: false, error: msg } : t))
            );
          });
      }
    };

    window.addEventListener('paste-to-active-terminal', handlePaste as EventListener);
    return () => {
      window.removeEventListener('paste-to-active-terminal', handlePaste as EventListener);
    };
  }, [terminalTabs, activeTerminalTabId, currentServer, proxy]);

  const closeTerminalTab = useCallback((tabId: string) => {
    const tab = terminalTabs.find((t) => t.id === tabId);
    if (tab?.shellId) window.serverOperator?.closeShell({ shellId: tab.shellId });
    const entry = xtermByTabIdRef.current.get(tabId);
    if (entry) {
      entry.ro.disconnect();
      entry.term.dispose();
      xtermByTabIdRef.current.delete(tabId);
    }
    setTerminalTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTerminalTabId === tabId && next.length) setActiveTerminalTabId(next[0].id);
      else if (activeTerminalTabId === tabId) setActiveTerminalTabId(null);
      return next;
    });
  }, [terminalTabs, activeTerminalTabId]);

  const addTerminalTab = useCallback(() => {
    if (!currentServer || !window.serverOperator || panelTab !== 'terminal') return;
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab: TerminalTab = {
      id,
      shellId: null,
      serverId: currentServer.id,
      label: 'Shell',
      connecting: true,
      error: null,
    };
    setTerminalTabs((prev) => [...prev, tab]);
    setActiveTerminalTabId(id);
    window.serverOperator
      .openShell({ connection: currentServer, proxy })
      .then((res) => {
        if (res.ok && res.shellId) {
          setTerminalTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, shellId: res.shellId!, connecting: false } : t))
          );
        } else {
          setTerminalTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, connecting: false, error: res.error || 'Failed to open shell' } : t))
          );
        }
      })
      .catch((e) => {
        const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
        setTerminalTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, connecting: false, error: msg } : t))
        );
      });
  }, [currentServer, proxy, panelTab]);

  const addComposePathLocal = () => {
    const path = newComposePath.trim();
    if (!path || composePaths.includes(path)) return;
    setNewComposePath('');
    onAddComposePath?.(path);
    if (!window.serverOperator || !currentServer) return;
    setLoadingServicesForPath(path);
    window.serverOperator
      .getDockerComposeServices({ connection: currentServer, composePath: path, proxy })
      .then((res) => {
        setServicesByPath((prev) => ({
          ...prev,
          [path]: res.ok && res.services ? res.services : [],
        }));
      })
      .finally(() => setLoadingServicesForPath(null));
  };

  const removeComposePathLocal = (path: string) => {
    const tabsToRemove = logTabs.filter((t) => t.composePath === path);
    tabsToRemove.forEach((t) => window.serverOperator?.stopComposeLogsStream({ streamId: t.id }));
    onRemoveComposePath?.(path);
    setServicesByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setLogTabs((prev) => prev.filter((t) => t.composePath !== path));
    setLogContentByTabId((prev) => {
      const next = { ...prev };
      tabsToRemove.forEach((t) => delete next[t.id]);
      return next;
    });
    if (tabsToRemove.some((t) => t.id === activeLogTabId)) {
      setActiveLogTabId(logTabs.filter((t) => t.composePath !== path)[0]?.id ?? null);
    }
  };

  const addComposePath = addComposePathLocal;
  const removeComposePath = removeComposePathLocal;

  const refreshServicesForPath = (path: string) => {
    if (!window.serverOperator || !currentServer) return;
    setLoadingServicesForPath(path);
    window.serverOperator
      .getDockerComposeServices({ connection: currentServer, composePath: path, proxy })
      .then((res) => {
        setServicesByPath((prev) => ({
          ...prev,
          [path]: res.ok && res.services ? res.services : [],
        }));
      })
      .finally(() => setLoadingServicesForPath(null));
  };

  const openLogTab = useCallback(
    (composePath: string, service: string) => {
      if (!currentServer || !window.serverOperator) return;
      const label = service ? `${composePath.split('/').pop() || composePath} · ${service}` : `${composePath.split('/').pop() || composePath} · all`;
      const id = `log-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setLogTabs((prev) => [...prev, { id, composePath, service, label }]);
      setLogContentByTabId((prev) => ({ ...prev, [id]: '' }));
      setActiveLogTabId(id);
      window.serverOperator
        .startComposeLogsStream({
          streamId: id,
          connection: currentServer,
          composePath,
          service: service || undefined,
          tail: tail === '' ? 200 : tail,
          proxy,
        })
        .then((res) => {
          if (!res.ok) {
            setLogContentByTabId((prev) => ({ ...prev, [id]: (prev[id] || '') + `\n[Error: ${res.error}]\n` }));
          }
        })
        .catch((err) => {
          setLogContentByTabId((prev) => ({ ...prev, [id]: (prev[id] || '') + `\n[Error: ${err}]\n` }));
        });
    },
    [currentServer, proxy, tail]
  );

  const closeLogTab = useCallback((tabId: string) => {
    window.serverOperator?.stopComposeLogsStream({ streamId: tabId });
    setLogTabs((prev) => prev.filter((t) => t.id !== tabId));
    setLogContentByTabId((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    setActiveLogTabId((current) => (current === tabId ? null : current));
  }, []);

  useEffect(() => {
    if (logPreRef.current) {
      logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
    }
  }, [logContentByTabId, activeLogTabId]);

  useEffect(() => {
    const onData = (e: CustomEvent<{ streamId: string; data: string }>) => {
      const { streamId, data } = e.detail;
      setLogContentByTabId((prev) => ({ ...prev, [streamId]: (prev[streamId] ?? '') + data }));
    };
    const onEnd = (e: CustomEvent<{ streamId: string }>) => {
      setLogContentByTabId((prev) => ({ ...prev, [e.detail.streamId]: (prev[e.detail.streamId] ?? '') + '\n[Stream ended]\n' }));
    };
    window.addEventListener('compose-logs-data', onData as EventListener);
    window.addEventListener('compose-logs-stream-ended', onEnd as EventListener);
    return () => {
      window.removeEventListener('compose-logs-data', onData as EventListener);
      window.removeEventListener('compose-logs-stream-ended', onEnd as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      logTabs.forEach((t) => window.serverOperator?.stopComposeLogsStream({ streamId: t.id }));
    };
  }, [currentServer?.id]);

  const prevServerIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = currentServer?.id ?? null;
    if (prevServerIdRef.current !== id) {
      prevServerIdRef.current = id;
      setLogTabs([]);
      setLogContentByTabId({});
      setActiveLogTabId(null);
      if (id != null && composePaths.length > 0 && currentServer && window.serverOperator) {
        composePaths.forEach((p) => {
          window.serverOperator
            .getDockerComposeServices({ connection: currentServer, composePath: p, proxy })
            .then((res) => {
              setServicesByPath((prev) => ({
                ...prev,
                [p]: res.ok && res.services ? res.services : [],
              }));
            });
        });
      } else {
        setServicesByPath({});
      }
    }
  }, [currentServer?.id, composePaths]);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t border-border/20 bg-bg-secondary/35 select-none">
      <div className="flex items-center justify-between border-b border-border/20 bg-bg-secondary/45 px-3 py-1.5 gap-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTabChange('logs')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border duration-150 cursor-pointer ${
              panelTab === 'logs'
                ? 'bg-bg-primary border-border/40 text-accent shadow-sm'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            <FileText size={13} />
            Logs
          </button>
          <button
            type="button"
            onClick={() => onTabChange('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border duration-150 cursor-pointer ${
              panelTab === 'terminal'
                ? 'bg-bg-primary border-border/40 text-accent shadow-sm'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            <TerminalIcon size={13} />
            Terminal
          </button>
        </div>
        {panelTab === 'logs' && currentServer && composePaths && composePaths.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Tail:</span>
            <input
              type="number"
              value={tail}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setTail('');
                } else {
                  const num = parseInt(val, 10);
                  setTail(isNaN(num) ? '' : Math.max(0, num));
                }
              }}
              onBlur={() => {
                if (tail === '') {
                  setTail(200);
                }
              }}
              className="w-14 px-2 py-0.5 rounded-lg bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-center font-mono"
              title="Tail lines for new streams"
            />
          </div>
        )}
        {panelTab === 'terminal' && currentServer && (
          <div className="text-[10px] font-bold text-text-muted font-mono tracking-wide uppercase">
            {currentServer.username || 'erp'}@{currentServer.host || 'hrms'}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto min-h-0 flex flex-col">
        {panelTab === 'logs' && (
          <>
            {currentServer && (
              <div className="shrink-0 border-b border-border/20 p-3 space-y-3 bg-bg-secondary/20">
                <div className="flex items-center gap-2 flex-wrap max-w-3xl">
                  <input
                    type="text"
                    value={newComposePath}
                    onChange={(e) => setNewComposePath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addComposePath()}
                    placeholder="Compose file path (e.g. docker-compose.yml)"
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={addComposePath}
                    disabled={!newComposePath.trim() || loadingServicesForPath !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-tertiary border border-border/30 text-text-primary hover:border-accent/40 hover:text-accent disabled:opacity-50 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Plus size={13} />
                    Add Path
                  </button>
                </div>
                {composePaths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Registered Compose Projects</p>
                    <div className="flex flex-wrap gap-3">
                      {composePaths.map((p) => {
                        const services = servicesByPath[p] ?? [];
                        const isLoading = loadingServicesForPath === p;
                        const shortName = p.split('/').pop() || p;
                        return (
                          <div
                            key={p}
                            className="flex items-center gap-3 rounded-xl border border-border/20 bg-bg-primary/50 px-3.5 py-2 shadow-sm backdrop-blur-sm"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 max-w-[240px]">
                              <span className="text-xs font-bold text-text-primary truncate" title={p}>
                                {shortName}
                              </span>
                              <span className="text-[10px] text-text-muted truncate font-mono" title={p}>
                                {p}
                              </span>
                              <span className="text-[9px] font-semibold text-text-secondary mt-0.5">
                                {isLoading ? 'fetching services…' : `${services.length} active service${services.length !== 1 ? 's' : ''}`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => openLogTab(p, '')}
                                className="px-2.5 py-0.5 rounded-lg bg-bg-tertiary border border-border/30 text-[10px] text-text-primary hover:border-accent hover:text-accent font-semibold transition-all duration-150 cursor-pointer"
                              >
                                All Logs
                              </button>
                              {services.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => openLogTab(p, s)}
                                  className="px-2.5 py-0.5 rounded-lg bg-bg-tertiary border border-border/30 text-[10px] text-text-primary hover:border-accent hover:text-accent font-semibold transition-all duration-150 cursor-pointer"
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-0.5 border-l border-border/20 pl-2 ml-1">
                              <button
                                type="button"
                                onClick={() => refreshServicesForPath(p)}
                                disabled={loadingServicesForPath !== null}
                                className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent disabled:opacity-50 cursor-pointer transition-colors"
                                title="Refresh service list"
                              >
                                {loadingServicesForPath === p ? <Loader2 size={12} className="animate-spin text-accent" /> : <RefreshCw size={12} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeComposePath(p)}
                                className="p-1 rounded-md text-text-secondary hover:bg-error/15 hover:text-error cursor-pointer transition-colors"
                                title="Remove compose file"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {currentServer && logTabs.length > 0 && (
              <>
                <div className="shrink-0 flex items-center gap-1.5 border-b border-border/20 bg-bg-secondary/35 px-2 py-1.5 overflow-x-auto">
                  {logTabs.map((t) => (
                    <div
                      key={t.id}
                      role="tab"
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer shrink-0 max-w-[200px] min-w-0 group border transition-all duration-150 text-xs ${
                        activeLogTabId === t.id
                          ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                          : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
                      }`}
                      onClick={() => setActiveLogTabId(t.id)}
                      title={t.label}
                    >
                      <FileText size={12} className="shrink-0" />
                      <span className="truncate min-w-0 flex-1 font-sans">{t.label}</span>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-all duration-100 shrink-0 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeLogTab(t.id);
                        }}
                        aria-label="Close tab"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg-primary">
                  <pre
                    ref={logPreRef}
                    className="flex-1 p-4 font-mono text-xs text-text-primary whitespace-pre-wrap break-words overflow-auto min-h-0 select-text selection:bg-accent/30 selection:text-white"
                  >
                    {activeLogTabId ? (logContentByTabId[activeLogTabId] ?? 'Connecting log stream…') : '(Select a log tab above)'}
                  </pre>
                </div>
              </>
            )}
            {currentServer && logTabs.length === 0 && (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-text-secondary text-xs text-center max-w-md mx-auto gap-1">
                <p className="text-text-muted">
                  {composePaths.length === 0
                    ? 'Register a docker-compose.yml file above to begin scanning and streaming microservice container outputs.'
                    : 'Select a microservice or the entire compose recipe above to open a live stream logs tab.'}
                </p>
              </div>
            )}
            {!currentServer && panelTab === 'logs' && (
              <div className="flex-1 p-6 flex items-center justify-center text-text-secondary text-xs">
                Select a server to view Docker Compose logs.
              </div>
            )}
          </>
        )}
        {panelTab === 'terminal' && (
          <div className="flex flex-col h-full min-h-0 flex-1 flex">
            {!currentServer ? (
              <div className="flex-1 p-6 flex items-center justify-center text-xs text-text-secondary">
                <p>Select a server to open an SSH shell terminal.</p>
              </div>
            ) : (
              <>
                <div className={`flex-1 flex min-h-0 ${resizingTerminalStrip ? 'select-none cursor-col-resize' : ''}`}>
                  {/* Terminal content area - one container per tab, only active visible */}
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#1e1e1e]">
                    {terminalTabs.length === 0 ? (
                      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4 text-text-secondary text-xs select-none bg-bg-primary">
                        <p className="text-text-muted text-center max-w-sm">No active terminal session. Spawn a remote SSH command shell or container debug console.</p>
                        <button
                          type="button"
                          onClick={addTerminalTab}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/30 bg-bg-secondary text-text-primary font-semibold hover:border-border/60 hover:bg-bg-tertiary transition-all cursor-pointer shadow-sm"
                        >
                          <Plus size={14} />
                          New Shell Session
                        </button>
                      </div>
                    ) : (
                      <>
                        {terminalTabs.map((t) => (
                          <div
                            key={t.id}
                            className="flex-1 min-h-0 flex flex-col p-2"
                            style={{
                              minHeight: 120,
                              display: activeTerminalTabId === t.id ? 'flex' : 'none',
                            }}
                          >
                            {t.error ? (
                              <div className="p-4 text-error text-xs font-mono">{t.error}</div>
                            ) : t.connecting ? (
                              <div className="flex items-center gap-2 p-4 text-xs font-mono">
                                <Loader2 size={13} className="animate-spin text-accent" />
                                <span className="text-text-secondary">Establishing secure SSH stream…</span>
                              </div>
                            ) : null}
                            <div
                              ref={(el) => {
                                  if (el) terminalContainerRefs.current.set(t.id, el);
                                  else terminalContainerRefs.current.delete(t.id);
                                }}
                              className="flex-1 min-h-0 w-full"
                              style={{ display: t.shellId ? 'block' : 'none' }}
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  {/* Resize handle for terminal tabs strip */}
                  {terminalTabs.length > 0 && (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/40 active:bg-accent transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        terminalStripResizeStart.current = { x: e.clientX, w: terminalStripWidth };
                        setResizingTerminalStrip(true);
                      }}
                      title="Drag to resize terminal tabs"
                    />
                  )}
                  {/* Terminal tabs on the right - VS Code style box tabs */}
                  {terminalTabs.length > 0 && (
                    <div
                      className="shrink-0 flex flex-col gap-1.5 py-3 pr-3 pl-1.5 border-l border-border/20 bg-bg-secondary/45 min-w-0"
                      style={{ width: terminalStripWidth }}
                    >
                      {terminalTabs.map((t) => (
                        <div
                          key={t.id}
                          role="tab"
                          tabIndex={0}
                          onClick={() => setActiveTerminalTabId(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveTerminalTabId(t.id);
                            }
                          }}
                          className={`flex items-center gap-1.5 w-full min-w-0 px-2.5 py-2 rounded-xl border text-left group transition-all duration-200 cursor-pointer overflow-hidden ${
                            activeTerminalTabId === t.id
                              ? 'border-accent/35 bg-accent/8 text-accent font-semibold shadow-sm'
                              : 'border-transparent hover:bg-bg-tertiary/40 text-text-secondary hover:text-text-primary'
                          }`}
                          title={t.label}
                        >
                          <TerminalIcon size={13} className="shrink-0" />
                          <span className="text-xs truncate min-w-0 flex-1 font-sans">{t.label}</span>
                          <button
                            type="button"
                            className="shrink-0 flex items-center justify-center w-5 h-5 opacity-0 group-hover:opacity-100 rounded-lg hover:bg-bg-tertiary transition-all cursor-pointer text-text-muted hover:text-text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeTerminalTab(t.id);
                            }}
                            aria-label="Close terminal"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addTerminalTab}
                        className="flex items-center justify-center w-full py-2.5 rounded-xl border border-dashed border-border/30 text-text-muted hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
                        title="New terminal"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
