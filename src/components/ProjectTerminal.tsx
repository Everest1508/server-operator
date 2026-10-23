import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useThemeKey } from '../hooks/useAppTheme';
import type { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Loader2 } from 'lucide-react';
import { createTerminal, xtermThemeFromApp } from '../utils/terminalSetup';
import type { ServerConnection, ProxySettings } from '../types';
import { Button } from './ui/Button';

export interface ProjectTerminalProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
  /** Project path to cd into when shell opens (e.g. selected project from dropdown) */
  projectPath: string;
  /** Called when terminal is ready; pass a function that sends a command to this terminal */
  onReady: (runCommand: (cmd: string) => void, shellId: string) => void;
  /** When terminal is closed or unavailable */
  onUnready: () => void;
  disabled?: boolean;
}

export function ProjectTerminal({ currentServer, proxy, projectPath, onReady, onUnready, disabled = false }: ProjectTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellIdRef = useRef<string | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const appTheme = useThemeKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const xtermTheme = useMemo(() => xtermThemeFromApp(), [appTheme]);
  const [shellId, setShellId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>('connecting');

  const onReadyRef = useRef(onReady);
  const onUnreadyRef = useRef(onUnready);
  onReadyRef.current = onReady;
  onUnreadyRef.current = onUnready;

  const runCommand = useCallback((cmd: string) => {
    const id = shellIdRef.current;
    if (id && window.serverOperator && cmd.trim()) {
      window.serverOperator.shellWrite({ shellId: id, data: cmd.trim() + '\n' });
    }
  }, []);

  useEffect(() => {
    if (!currentServer || !window.serverOperator) {
      onUnreadyRef.current();
      return;
    }
    setConnecting(true);
    setError(null);
    setStatus('connecting');
    const api = window.serverOperator;
    api
      .openShell({ connection: currentServer, proxy })
      .then((res) => {
        setConnecting(false);
        if (!res.ok || !res.shellId) {
          setStatus('closed');
          setError(res.error || 'Failed to open shell');
          onUnreadyRef.current();
          return;
        }
        shellIdRef.current = res.shellId;
        setShellId(res.shellId);
        setStatus('connected');
        onReadyRef.current(runCommand, res.shellId);
      })
      .catch((e) => {
        setConnecting(false);
        setStatus('closed');
        setError(e?.message || 'Failed to open shell');
        onUnreadyRef.current();
      });
    return () => {
      const id = shellIdRef.current;
      if (id) {
        try {
          api.closeShell({ shellId: id });
        } catch (_) {}
        shellIdRef.current = null;
        setShellId(null);
      }
      onUnreadyRef.current();
    };
  }, [currentServer?.id, proxy?.enabled, runCommand]);

  // When projectPath changes and we already have a shell, cd to the new path
  useEffect(() => {
    if (!shellId || !projectPath.trim()) return;
    const pathEsc = `"${String(projectPath).replace(/"/g, '\\"')}"`;
    window.serverOperator?.shellWrite({ shellId, data: `cd ${pathEsc}\n` });
  }, [projectPath, shellId]);

  useEffect(() => {
    if (!containerRef.current || !shellId) return;
    const container = containerRef.current;
    const sid = shellId;
    const handle = createTerminal(container, {
      theme: xtermTheme,
      onData: (data) => {
        if (window.serverOperator && sid && !disabled) window.serverOperator.shellWrite({ shellId: sid, data });
      },
      onResize: (cols, rows) => void window.serverOperator?.shellResize?.({ shellId: sid, cols, rows }),
    });
    const term = handle.term;
    termRef.current = term;
    // the shell opened at a default size: tell it the real one
    void window.serverOperator?.shellResize?.({ shellId: sid, cols: term.cols, rows: term.rows });
    const handler = (e: CustomEvent<{ shellId: string; data: string }>) => {
      if (e.detail.shellId === sid) term.write(e.detail.data);
    };
    window.addEventListener('shell-output', handler as EventListener);
    return () => {
      window.removeEventListener('shell-output', handler as EventListener);
      termRef.current = null;
      handle.dispose();
    };
  }, [shellId]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme;
  }, [xtermTheme]);

  // Track when the underlying shell disconnects (network drop, crash, etc.)
  useEffect(() => {
    const handler = (e: CustomEvent<{ shellId: string; status: string }>) => {
      if (e.detail.status === 'closed' && e.detail.shellId === shellIdRef.current) {
        setStatus('closed');
        setConnecting(false);
        onUnreadyRef.current();
      }
    };
    window.addEventListener('shell-status', handler as EventListener);
    return () => window.removeEventListener('shell-status', handler as EventListener);
  }, []);

  const reconnect = useCallback(() => {
    if (!currentServer || !window.serverOperator) return;
    setConnecting(true);
    setError(null);
    setStatus('connecting');
    window.serverOperator
      .openShell({ connection: currentServer, proxy })
      .then((res) => {
        setConnecting(false);
        if (!res.ok || !res.shellId) {
          setStatus('closed');
          setError(res.error || 'Failed to reconnect');
          onUnreadyRef.current();
          return;
        }
        shellIdRef.current = res.shellId;
        setShellId(res.shellId);
        setStatus('connected');
        onReadyRef.current(runCommand, res.shellId);
      })
      .catch((e) => {
        setConnecting(false);
        setStatus('closed');
        setError(e?.message || 'Failed to reconnect');
        onUnreadyRef.current();
      });
  }, [currentServer, proxy, runCommand]);

  if (!currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-text-muted text-xs font-mono select-none">
        Select a server to initialize terminal session.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-error text-xs font-mono select-none">
        <div className="text-center break-all max-w-full">{error}</div>
        <Button variant="outline"
          onClick={reconnect}
        >
          Retry Connection
        </Button>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 p-6 text-text-secondary text-xs font-mono select-none">
        <Loader2 size={14} className="animate-spin text-accent" />
        Connecting pipeline terminal…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border/20 bg-bg-secondary/40 text-[10px] font-mono select-none shrink-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            status === 'connected'
              ? 'bg-success'
              : status === 'connecting'
                ? 'bg-warning animate-pulse'
                : 'bg-error'
          }`}
        />
        <span className="text-text-secondary font-bold uppercase tracking-wide">
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </span>
        {status === 'closed' && (
          <Button variant="outline" className="ml-auto"
            onClick={reconnect}
          >
            Reconnect
          </Button>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 w-full" style={{ minHeight: 120 }} />
    </div>
  );
}
