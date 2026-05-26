import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Loader2 } from 'lucide-react';
import { attachXtermClipboardKeys } from '../utils/xtermClipboardKeys';
import type { ServerConnection, ProxySettings } from '../types';

export interface ProjectTerminalProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
  /** Project path to cd into when shell opens (e.g. selected project from dropdown) */
  projectPath: string;
  /** Called when terminal is ready; pass a function that sends a command to this terminal */
  onReady: (runCommand: (cmd: string) => void) => void;
  /** When terminal is closed or unavailable */
  onUnready: () => void;
}

export function ProjectTerminal({ currentServer, proxy, projectPath, onReady, onUnready }: ProjectTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellIdRef = useRef<string | null>(null);
  const [shellId, setShellId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const api = window.serverOperator;
    api
      .openShell({ connection: currentServer, proxy })
      .then((res) => {
        setConnecting(false);
        if (!res.ok || !res.shellId) {
          setError(res.error || 'Failed to open shell');
          onUnreadyRef.current();
          return;
        }
        shellIdRef.current = res.shellId;
        setShellId(res.shellId);
        onReadyRef.current(runCommand);
      })
      .catch((e) => {
        setConnecting(false);
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
    const sid = shellId;
    term.onData((data) => {
      if (window.serverOperator && sid) {
        window.serverOperator.shellWrite({ shellId: sid, data });
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
    const handler = (e: CustomEvent<{ shellId: string; data: string }>) => {
      if (e.detail.shellId === sid) term.write(e.detail.data);
    };
    window.addEventListener('shell-output', handler as EventListener);
    return () => {
      ro.disconnect();
      window.removeEventListener('shell-output', handler as EventListener);
      term.dispose();
    };
  }, [shellId]);

  if (!currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-[var(--text-muted)] text-sm">
        Select a server.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-[var(--error)] text-sm">
        {error}
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 p-4 text-[var(--text-muted)] text-sm">
        <Loader2 size={18} className="animate-spin" />
        Connecting…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={containerRef} className="flex-1 min-h-0 w-full" style={{ minHeight: 120 }} />
    </div>
  );
}
