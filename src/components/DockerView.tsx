import { useState, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Box, RefreshCw, Loader2, FileText, RotateCw, X, Play, Square, MoreVertical, Pause, Trash2, Zap, Terminal, Database, AlertCircle, Copy, Check, Search } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerConnection, ProxySettings } from '../types';
import type { DockerContainer } from '../types';
import { Tooltip } from './Tooltip';
import { FloatingMenu } from './FloatingMenu';
import { confirmDialog } from '../utils/confirm';

const TAB_ALL = '__all__';
const LOG_TAIL = 200;
const ALL_CONTAINER_LOG_PREFIX = 'all:';

function logKey(composePath: string, service: string) {
  return `${composePath}\0${service}`;
}

function allContainerLogKey(containerId: string) {
  return `${ALL_CONTAINER_LOG_PREFIX}${containerId}`;
}

function isComposeFilePath(p: string): boolean {
  const lower = (p || '').toLowerCase();
  return lower.endsWith('.yml') || lower.endsWith('.yaml');
}

function isLocalWorkspaceConnection(server: ServerConnection | null | undefined): boolean {
  if (!server) return false;
  if (server.connectionType === 'local') return true;
  if (server.id === 'dummy') return true;
  if (server.host && String(server.host).trim() === 'dummy') return true;
  return false;
}

// Local commands on Windows run through cmd.exe, which does not understand
// POSIX single-quote escaping ('...\'...'). Remote SSH targets are always a
// POSIX shell regardless of host OS, so only switch quoting for local+Windows.
function usesWindowsShell(server: ServerConnection | null | undefined): boolean {
  return isLocalWorkspaceConnection(server) && window.serverOperator?.platform === 'win32';
}

function quoteShellArg(s: string, windowsShell: boolean): string {
  const str = s || '';
  return windowsShell ? `"${str.replace(/"/g, '\\"')}"` : `'${str.replace(/'/g, "'\\''")}'`;
}

interface DockerViewProps {
  currentServer: ServerConnection;
  proxy: ProxySettings;
  onOpenLogs: () => void;
  onOpenTerminalAndRun?: (command: string, label?: string) => void;
  composePaths?: string[];
  containers?: DockerContainer[];
  loading?: boolean;
  error?: string | null;
  setError?: (error: string | null) => void;
  servicesByPath?: Record<string, string[]>;
  servicesLoading?: boolean;
  onRefresh?: () => void;
}

function imageLooksLike(img: string, ...keywords: string[]): boolean {
  const lower = (img || '').toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

const hasServerOperator = typeof window !== 'undefined' && typeof window.serverOperator?.getDockerPs === 'function';

function shortName(path: string): string {
  return path.split('/').pop() || path;
}


type RowAction = { id: string; label: string; icon: ReactNode; run: () => void; danger?: boolean };
type Tone = 'running' | 'paused' | 'stopped' | 'unknown';

const TONE_STYLE: Record<Tone, { dot: string; chip: string }> = {
  running: { dot: 'bg-success', chip: 'text-success bg-success/10' },
  paused: { dot: 'bg-warning', chip: 'text-warning bg-warning/10' },
  stopped: { dot: 'bg-text-muted/60', chip: 'text-text-secondary bg-bg-tertiary' },
  unknown: { dot: 'bg-text-muted/40', chip: 'text-text-secondary bg-bg-tertiary' },
};

const iconBtn = 'p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer';

function LogPanel({ title, content, preRef, onClose }: { title: string; content: string; preRef: RefObject<HTMLPreElement>; onClose: () => void }) {
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const q = filter.trim().toLowerCase();
  const shown = q ? content.split('\n').filter((l) => l.toLowerCase().includes(q)).join('\n') || '(no lines match)' : content;
  return (
    <div className="border-t border-border/30 bg-bg-primary/80">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30">
        <span className="text-xs font-medium text-text-secondary truncate mr-auto">Logs for {title}</span>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter lines"
            aria-label="Filter log lines"
            className="w-36 pl-7 pr-2 py-1 rounded-md bg-bg-tertiary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <Tooltip content={copied ? 'Copied' : 'Copy logs'} position="top">
          <button
            type="button"
            aria-label="Copy logs"
            className={iconBtn}
            onClick={() => {
              navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          </button>
        </Tooltip>
        <Tooltip content="Close logs" position="top">
          <button type="button" aria-label="Close logs" className={iconBtn} onClick={onClose}>
            <X size={13} />
          </button>
        </Tooltip>
      </div>
      <pre
        ref={preRef}
        className="p-3 font-mono text-[11px] leading-relaxed text-text-primary whitespace-pre-wrap break-words overflow-auto max-h-[320px] min-h-[120px] select-text"
      >
        {shown}
      </pre>
    </div>
  );
}

/** One container or compose service: status, the common actions inline, the rest in a menu, logs underneath. */
function DockerRow({
  name, subtitle, tone, statusText, primary, menu, busyId, disabled,
  logsOpen, logsLoading, onToggleLogs, menuId, openKey, setOpenKey, menuRef, logs,
}: {
  name: string;
  subtitle?: string;
  tone: Tone;
  statusText?: string;
  primary: RowAction[];
  menu: (RowAction | 'sep')[];
  busyId: string | null;
  disabled: boolean;
  logsOpen: boolean;
  logsLoading: boolean;
  onToggleLogs: () => void;
  menuId: string;
  openKey: string | null;
  setOpenKey: (fn: (k: string | null) => string | null) => void;
  menuRef: RefObject<HTMLDivElement>;
  logs: ReactNode;
}) {
  const open = openKey === menuId;
  const style = TONE_STYLE[tone];
  const spinner = <Loader2 size={14} className="animate-spin text-accent" />;
  return (
    <div className="rounded-xl border border-border/30 bg-bg-secondary/40 overflow-hidden hover:border-border/60 transition-colors">
      <div className="flex items-center gap-3 p-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate" title={name}>{name}</p>
          {subtitle && <p className="text-xs font-mono text-text-muted truncate mt-0.5" title={subtitle}>{subtitle}</p>}
        </div>
        {statusText && <span className={`hidden sm:inline-block shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.chip}`}>{statusText}</span>}
        <div className="flex items-center gap-0.5 shrink-0">
          {primary.map((a) => (
            <Tooltip key={a.id} content={a.label} position="top">
              <button type="button" aria-label={a.label} disabled={disabled} onClick={a.run} className={iconBtn}>
                {busyId === a.id ? spinner : a.icon}
              </button>
            </Tooltip>
          ))}
          <Tooltip content={logsOpen ? 'Hide logs' : 'Show logs'} position="top">
            <button
              type="button"
              aria-label={logsOpen ? 'Hide logs' : 'Show logs'}
              aria-pressed={logsOpen}
              onClick={onToggleLogs}
              className={`${iconBtn} ${logsOpen ? 'text-accent bg-accent/10' : ''}`}
            >
              {logsLoading ? spinner : <FileText size={14} />}
            </button>
          </Tooltip>
          {menu.length > 0 && (
            <div className="relative" ref={open ? menuRef : undefined}>
              <Tooltip content="More actions" position="top">
                <button
                  type="button"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  disabled={disabled}
                  onClick={(e) => { e.stopPropagation(); setOpenKey((k) => (k === menuId ? null : menuId)); }}
                  className={iconBtn}
                >
                  <MoreVertical size={14} />
                </button>
              </Tooltip>
              {open && (
                <FloatingMenu anchorRef={menuRef} className="min-w-[170px] rounded-xl border border-border/40 popover-surface shadow-2xl overflow-y-auto flex flex-col p-1 gap-0.5 max-h-[70vh]">
                  {menu.map((item, i) =>
                    item === 'sep' ? (
                      <div key={`sep-${i}`} role="separator" className="border-t border-border/30 my-1" />
                    ) : (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={(e) => { e.stopPropagation(); setOpenKey(() => null); item.run(); }}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                          item.danger ? 'text-error hover:bg-error/10' : 'text-text-primary hover:bg-bg-primary/65'
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    )
                  )}
                </FloatingMenu>
              )}
            </div>
          )}
        </div>
      </div>
      {logsOpen && logs}
    </div>
  );
}

export function DockerView({
  currentServer,
  proxy,
  onOpenLogs,
  onOpenTerminalAndRun,
  composePaths = [],
  containers: containersProp = [],
  loading: loadingProp = false,
  error: errorProp = null,
  setError: setErrorProp,
  servicesByPath: servicesByPathProp = {},
  servicesLoading: servicesLoadingProp = false,
  onRefresh,
}: DockerViewProps) {
  const [activeTab, setActiveTab] = useState<string>(TAB_ALL);
  const [containerAction, setContainerAction] = useState<string | null>(null);
  const [composeServiceAction, setComposeServiceAction] = useState<string | null>(null);
  const [restartAllInProgress, setRestartAllInProgress] = useState(false);
  const [expandedLogsKey, setExpandedLogsKey] = useState<string | null>(null);
  const [openActionsKey, setOpenActionsKey] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string>('');
  const [loadingContainerLogs, setLoadingContainerLogs] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };
  const logStreamIdRef = useRef<string | null>(null);
  const logPreRef = useRef<HTMLPreElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openActionsKey) return;
    const close = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) setOpenActionsKey(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openActionsKey]);

  const containers = containersProp;
  const loading = loadingProp;
  const error = errorProp;
  const setError = setErrorProp ?? (() => {});
  const servicesByPath = servicesByPathProp;
  const loadingServicesForPath = servicesLoadingProp ? activeTab : null;

  type ComposeActionType = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill';
  const runComposeServiceAction = async (
    composePath: string,
    service: string,
    action: ComposeActionType
  ) => {
    if (!window.serverOperator || !currentServer) return;
    const key = `${logKey(composePath, service)}-${action}`;
    setComposeServiceAction(key);
    const win = usesWindowsShell(currentServer);
    const pathQ = quoteShellArg(composePath, win);
    const serviceQ = quoteShellArg(service, win);
    const flag = isComposeFilePath(composePath)
      ? `-f ${pathQ}`
      : `--project-directory ${pathQ}`;
    const cmd = `docker compose ${flag} ${action} ${serviceQ}`;
    try {
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: cmd,
        proxy,
      });
      if (!res.ok) setError(res.error || res.stderr || `${action} failed`);
      else {
        onRefresh?.();
        if (action === 'start' || action === 'restart') openAndLoadLogsForService(composePath, service);
      }
    } finally {
      setComposeServiceAction(null);
    }
  };

  const runRestartAll = async () => {
    if (!window.serverOperator || !currentServer) return;
    setRestartAllInProgress(true);
    try {
      const win = usesWindowsShell(currentServer);
      if (activeTab === TAB_ALL) {
        const idsRes = await window.serverOperator.runCommand({
          connection: currentServer,
          command: 'docker ps -q',
          proxy,
        });
        if (!idsRes.ok) {
          setError(idsRes.error || idsRes.stderr || 'Restart all failed');
          return;
        }
        const ids = (idsRes.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (!ids.length) {
          onRefresh?.();
          return;
        }
        const cmd = `docker restart ${ids.map((id) => quoteShellArg(id, win)).join(' ')}`;
        const res = await window.serverOperator.runCommand({
          connection: currentServer,
          command: cmd,
          proxy,
        });
        if (!res.ok) setError(res.error || res.stderr || 'Restart all failed');
        else onRefresh?.();
      } else if (activeTab) {
        const pathQ = quoteShellArg(activeTab, win);
        const flag = isComposeFilePath(activeTab) ? `-f ${pathQ}` : `--project-directory ${pathQ}`;
        const res = await window.serverOperator.runCommand({
          connection: currentServer,
          command: `docker compose ${flag} restart`,
          proxy,
        });
        if (!res.ok) setError(res.error || res.stderr || 'Restart all failed');
        else onRefresh?.();
      }
    } finally {
      setRestartAllInProgress(false);
    }
  };

  const runComposeServiceRemove = async (composePath: string, service: string) => {
    if (!window.serverOperator || !currentServer) return;
    const logK = logKey(composePath, service);
    setComposeServiceAction(`${logK}-remove`);
    const win = usesWindowsShell(currentServer);
    const pathQ = quoteShellArg(composePath, win);
    const serviceQ = quoteShellArg(service, win);
    const flag = isComposeFilePath(composePath)
      ? `-f ${pathQ}`
      : `--project-directory ${pathQ}`;
    const cmd = `docker compose ${flag} stop ${serviceQ} && docker compose ${flag} rm -f ${serviceQ}`;
    try {
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: cmd,
        proxy,
      });
      if (!res.ok) setError(res.error || res.stderr || 'Remove failed');
      else onRefresh?.();
    } finally {
      setComposeServiceAction(null);
    }
  };

  type ContainerActionType = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill' | 'remove';
  const runContainerAction = async (
    containerId: string,
    containerKey: string,
    action: ContainerActionType
  ) => {
    if (!window.serverOperator || !currentServer) return;
    setContainerAction(`${containerKey}-${action}`);
    const idQ = quoteShellArg(containerId, usesWindowsShell(currentServer));
    let cmd: string;
    if (action === 'restart') cmd = `docker restart ${idQ}`;
    else if (action === 'remove') cmd = `docker rm -f ${idQ}`;
    else if (action === 'unpause') cmd = `docker unpause ${idQ}`;
    else cmd = `docker ${action} ${idQ}`;
    try {
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: cmd,
        proxy,
      });
      if (!res.ok) setError(res.error || res.stderr || `${action} failed`);
      else {
        onRefresh?.();
        if (action === 'start' || action === 'restart') openAndLoadLogsForContainer(containerId);
      }
    } finally {
      setContainerAction(null);
    }
  };

  const openAndLoadLogsForContainer = (containerId: string) => {
    if (logStreamIdRef.current) {
      window.serverOperator?.stopComposeLogsStream({ streamId: logStreamIdRef.current });
      logStreamIdRef.current = null;
    }
    const key = allContainerLogKey(containerId);
    setExpandedLogsKey(key);
    setLogContent('Loading…');
    setLoadingContainerLogs(containerId);
    const idQ = quoteShellArg(containerId, usesWindowsShell(currentServer));
    window.serverOperator
      ?.runCommand({
        connection: currentServer,
        command: `docker logs --tail ${LOG_TAIL} ${idQ} 2>&1`,
        proxy,
      })
      .then((res) => {
        const text = res.ok ? (res.stdout || '') + (res.stderr || '') : `[Error: ${res.error || res.stderr || 'Failed to fetch logs'}]\n`;
        setLogContent(text.trim() || '(no output)');
      })
      .catch((err) => {
        setLogContent(`[Error: ${err}]\n`);
      })
      .finally(() => setLoadingContainerLogs(null));
  };

  const toggleLogsForContainer = (containerId: string) => {
    const key = allContainerLogKey(containerId);
    if (expandedLogsKey === key) {
      setExpandedLogsKey(null);
      setLogContent('');
      return;
    }
    openAndLoadLogsForContainer(containerId);
  };

  const openAndLoadLogsForService = (composePath: string, service: string) => {
    if (logStreamIdRef.current) {
      window.serverOperator?.stopComposeLogsStream({ streamId: logStreamIdRef.current });
      logStreamIdRef.current = null;
    }
    const key = logKey(composePath, service);
    setExpandedLogsKey(key);
    setLogContent('Connecting…');
    const streamId = `docker-view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    logStreamIdRef.current = streamId;
    window.serverOperator
      ?.startComposeLogsStream({
        streamId,
        connection: currentServer,
        composePath,
        service,
        tail: LOG_TAIL,
        proxy,
      })
      .then((res) => {
        if (!res.ok) setLogContent((prev) => prev + (prev === 'Connecting…' ? '' : '\n') + `[Error: ${res.error}]\n`);
      })
      .catch((err) => {
        setLogContent((prev) => prev + (prev === 'Connecting…' ? '' : '\n') + `[Error: ${err}]\n`);
      });
  };

  const toggleLogs = (composePath: string, service: string) => {
    const key = logKey(composePath, service);
    if (expandedLogsKey === key) {
      const id = logStreamIdRef.current;
      if (id) window.serverOperator?.stopComposeLogsStream({ streamId: id });
      logStreamIdRef.current = null;
      setExpandedLogsKey(null);
      setLogContent('');
      return;
    }
    openAndLoadLogsForService(composePath, service);
  };

  useEffect(() => {
    if (!expandedLogsKey || expandedLogsKey.startsWith(ALL_CONTAINER_LOG_PREFIX)) return;
    const onData = (e: CustomEvent<{ streamId: string; data: string }>) => {
      if (e.detail.streamId !== logStreamIdRef.current) return;
      setLogContent((prev) => (prev === 'Connecting…' ? '' : prev) + e.detail.data);
    };
    const onEnd = (e: CustomEvent<{ streamId: string }>) => {
      if (e.detail.streamId !== logStreamIdRef.current) return;
      setLogContent((prev) => prev + '\n[Stream ended]');
    };
    window.addEventListener('compose-logs-data', onData as EventListener);
    window.addEventListener('compose-logs-stream-ended', onEnd as EventListener);
    return () => {
      window.removeEventListener('compose-logs-data', onData as EventListener);
      window.removeEventListener('compose-logs-stream-ended', onEnd as EventListener);
    };
  }, [expandedLogsKey]);

  useEffect(() => {
    if (logPreRef.current) logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
  }, [logContent]);

  useEffect(() => {
    return () => {
      if (logStreamIdRef.current) {
        window.serverOperator?.stopComposeLogsStream({ streamId: logStreamIdRef.current });
      }
    };
  }, []);

  if (!hasServerOperator) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary text-text-secondary p-8 text-center">
        <Box size={48} className="mb-4 opacity-50" />
        <p className="font-medium text-text-primary">Docker view</p>
        <p className="text-sm mt-2 max-w-md">Run the app in Electron to connect to servers and see containers. This URL is for development only.</p>
      </div>
    );
  }

  const showAllContainers = activeTab === TAB_ALL;
  const currentServices = activeTab !== TAB_ALL ? (servicesByPath[activeTab] ?? []) : [];
  const loadingServices = activeTab !== TAB_ALL && loadingServicesForPath === activeTab;
  const isDockerPermissionError = typeof error === 'string' && (
    error.toLowerCase().includes('permission denied') &&
    error.toLowerCase().includes('docker.sock')
  );
  const busyOf = (current: string | null, key: string) => (current && current.startsWith(`${key}-`) ? current.slice(key.length + 1) : null);
  const confirmThen = (message: string, confirmLabel: string, run: () => void) => async () => { if (await confirmDialog(message, { confirmLabel })) run(); };
  const runningCount = containers.filter((c) => {
    const st = (c.Status || c.State || '').toLowerCase();
    return st.startsWith('up') && !st.includes('paused');
  }).length;

  const tabCls = (active: boolean) =>
    `shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors truncate max-w-[180px] ${
      active ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40'
    }`;
  const toolBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary border border-border/30 transition-colors disabled:opacity-50 cursor-pointer';

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-bg-secondary/30 shrink-0">
        <div role="tablist" className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1 p-0.5 scrollbar-none">
          <button type="button" role="tab" aria-selected={showAllContainers} onClick={() => setActiveTab(TAB_ALL)} className={tabCls(showAllContainers)}>
            Containers
          </button>
          {composePaths.map((p) => (
            <Tooltip key={p} content={p} position="bottom">
              <button type="button" role="tab" aria-selected={activeTab === p} onClick={() => setActiveTab(p)} className={tabCls(activeTab === p)}>
                {shortName(p)}
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <Tooltip content={activeTab === TAB_ALL ? 'Restart all running containers' : 'Restart all services in this compose project'} position="bottom">
            <button
              type="button"
              onClick={confirmThen(activeTab === TAB_ALL ? 'Restart all running containers?' : 'Restart every service in this compose project?', 'Restart all', runRestartAll)}
              disabled={restartAllInProgress || loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className={toolBtn}
            >
              {restartAllInProgress ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
              Restart all
            </button>
          </Tooltip>
          <Tooltip content="Reload the list" position="bottom">
            <button
              type="button"
              onClick={() => onRefresh?.()}
              disabled={loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className={toolBtn}
            >
              {(loading || loadingServices) ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {showAllContainers && (
          <>
            {error && (
              isDockerPermissionError ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-xl border border-error/20 bg-error/5 flex flex-col gap-4 text-xs"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="text-error shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text-primary text-sm">Docker permission denied</h3>
                      <p className="text-text-secondary mt-1 font-mono text-[11px] whitespace-pre-wrap break-all bg-bg-primary/50 p-3 rounded-lg border border-border/30 select-text">{error}</p>
                    </div>
                  </div>
                  <div className="border-t border-border/30 pt-4">
                    <h4 className="font-semibold text-text-primary mb-2">How to fix it</h4>
                    <p className="text-xs text-text-secondary mb-3">
                      Add your user to the <code className="text-text-primary bg-bg-tertiary px-1 py-0.5 rounded">docker</code> group by running these in a terminal on the server:
                    </p>
                    <div className="space-y-2">
                      {[['sudo usermod -aG docker $USER', 'cmd1'], ['newgrp docker', 'cmd2']].map(([cmd, id]) => (
                        <div key={id} className="flex items-center justify-between gap-3 p-2 bg-bg-tertiary/40 rounded-lg border border-border/20">
                          <code className="text-[11px] font-mono text-text-primary select-all">{cmd}</code>
                          <button type="button" aria-label={`Copy ${cmd}`} onClick={() => copyToClipboard(cmd, id)} className={iconBtn}>
                            {copiedCmd === id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onRefresh?.()}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 text-xs cursor-pointer"
                    >
                      {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                      Try again
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div role="alert" className="rounded-xl border border-error/20 bg-error/5 text-error px-4 py-3 text-xs flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words select-text flex-1">{error}</span>
                  <button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="text-error/70 hover:text-error cursor-pointer shrink-0"><X size={13} /></button>
                </div>
              )
            )}
            {!error && containers.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Box size={36} className="mb-3 text-text-muted opacity-60" />
                <p className="font-semibold text-text-primary text-sm">No containers yet</p>
                <p className="text-xs text-text-secondary mt-1 max-w-sm">Run <code className="font-mono text-text-primary">docker compose up -d</code> in your project, then select Refresh. If you have a compose file, add its folder in the Logs panel to manage its services here.</p>
              </div>
            )}
            {!error && containers.length > 0 && (
              <>
                <p className="text-xs text-text-secondary">
                  {runningCount} running, {containers.length - runningCount} stopped
                </p>
                <div className="space-y-2">
                  {containers.map((c: DockerContainer, i: number) => {
                    const containerId = c.ID || c.Names || '';
                    const containerKey = `all-${containerId}-${i}`;
                    const status = (c.Status || c.State || '').toLowerCase();
                    const isPaused = status.includes('paused');
                    const isRunning = status.startsWith('up') && !isPaused;
                    const label = c.Names || c.ID || 'container';
                    const act = (action: ContainerActionType) => () => runContainerAction(containerId, containerKey, action);
                    const idQ = quoteShellArg(containerId, usesWindowsShell(currentServer));
                    const term = (cmd: string, suffix = '') => () => onOpenTerminalAndRun?.(cmd, `${label}${suffix}`);
                    const image = c.Image || '';

                    const primary: RowAction[] = isRunning
                      ? [
                          { id: 'restart', label: 'Restart', icon: <RotateCw size={14} />, run: act('restart') },
                          { id: 'stop', label: 'Stop', icon: <Square size={14} />, run: act('stop') },
                        ]
                      : isPaused
                        ? [{ id: 'unpause', label: 'Unpause', icon: <Play size={14} />, run: act('unpause') }]
                        : [{ id: 'start', label: 'Start', icon: <Play size={14} />, run: act('start') }];
                    const menu: (RowAction | 'sep')[] = [
                      ...(isRunning ? [
                        { id: 'pause', label: 'Pause', icon: <Pause size={12} className="text-warning" />, run: act('pause') },
                        { id: 'kill', label: 'Kill', icon: <Zap size={12} />, danger: true, run: confirmThen(`Kill ${label}? This stops it immediately.`, 'Kill', act('kill')) },
                      ] : []),
                      { id: 'remove', label: 'Remove', icon: <Trash2 size={12} />, danger: true, run: confirmThen(`Remove ${label}? This force-removes the container.`, 'Remove', act('remove')) },
                      ...(onOpenTerminalAndRun ? ([
                        'sep',
                        { id: 'shell', label: 'Open shell', icon: <Terminal size={12} className="text-text-secondary" />, run: term(`docker exec -it ${idQ} sh`) },
                        ...(imageLooksLike(image, 'redis') ? [{ id: 'redis', label: 'Redis CLI', icon: <Database size={12} className="text-text-secondary" />, run: term(`docker exec -it ${idQ} redis-cli`, ' · redis') }] : []),
                        ...(imageLooksLike(image, 'mysql', 'mariadb') ? [{ id: 'mysql', label: 'MySQL client', icon: <Database size={12} className="text-text-secondary" />, run: term(`docker exec -it ${idQ} mysql -u root -p`, ' · mysql') }] : []),
                        ...(imageLooksLike(image, 'postgres') ? [{ id: 'psql', label: 'Postgres client', icon: <Database size={12} className="text-text-secondary" />, run: term(`docker exec -it ${idQ} psql -U postgres`, ' · postgres') }] : []),
                      ] as (RowAction | 'sep')[]) : []),
                    ];
                    const logsKey = allContainerLogKey(containerId);
                    return (
                      <DockerRow
                        key={c.ID || c.Names || i}
                        name={label}
                        subtitle={image || undefined}
                        tone={isRunning ? 'running' : isPaused ? 'paused' : 'stopped'}
                        statusText={c.Status || c.State || 'unknown'}
                        primary={primary}
                        menu={menu}
                        busyId={busyOf(containerAction, containerKey)}
                        disabled={!!containerAction}
                        logsOpen={expandedLogsKey === logsKey}
                        logsLoading={loadingContainerLogs === containerId}
                        onToggleLogs={() => toggleLogsForContainer(containerId)}
                        menuId={`all:${containerKey}`}
                        openKey={openActionsKey}
                        setOpenKey={setOpenActionsKey}
                        menuRef={actionsMenuRef}
                        logs={<LogPanel title={label} content={logContent} preRef={logPreRef} onClose={() => toggleLogsForContainer(containerId)} />}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
        {!showAllContainers && activeTab && (
          <>
            {loadingServices ? (
              <div className="flex items-center gap-2 py-8 text-text-secondary text-xs">
                <Loader2 size={16} className="animate-spin shrink-0 text-accent" />
                <span>Loading services…</span>
              </div>
            ) : (
              <>
                <p className="text-xs font-mono text-text-muted truncate" title={activeTab}>{activeTab}</p>
                {currentServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Box size={36} className="mb-3 text-text-muted opacity-60" />
                    <p className="text-sm font-semibold text-text-primary">No services found</p>
                    <p className="text-xs text-text-secondary mt-1 max-w-sm">Check that this folder has a docker-compose.yml or compose.yaml.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentServices.map((svc: string) => {
                      const key = logKey(activeTab, svc);
                      const win = usesWindowsShell(currentServer);
                      const execBase = `docker compose ${isComposeFilePath(activeTab) ? '-f' : '--project-directory'} ${quoteShellArg(activeTab, win)} exec ${quoteShellArg(svc, win)}`;
                      const lower = svc.toLowerCase();
                      const act = (action: ComposeActionType) => () => runComposeServiceAction(activeTab, svc, action);
                      const term = (cmd: string, suffix = '') => () => onOpenTerminalAndRun?.(cmd, `${svc}${suffix}`);
                      const primary: RowAction[] = [
                        { id: 'start', label: 'Start', icon: <Play size={14} />, run: act('start') },
                        { id: 'restart', label: 'Restart', icon: <RotateCw size={14} />, run: act('restart') },
                        { id: 'stop', label: 'Stop', icon: <Square size={14} />, run: act('stop') },
                      ];
                      const menu: (RowAction | 'sep')[] = [
                        { id: 'pause', label: 'Pause', icon: <Pause size={12} className="text-warning" />, run: act('pause') },
                        { id: 'unpause', label: 'Unpause', icon: <Play size={12} className="text-success" />, run: act('unpause') },
                        { id: 'kill', label: 'Kill', icon: <Zap size={12} />, danger: true, run: confirmThen(`Kill ${svc}? This stops it immediately.`, 'Kill', act('kill')) },
                        { id: 'remove', label: 'Remove', icon: <Trash2 size={12} />, danger: true, run: confirmThen(`Stop and remove ${svc}?`, 'Remove', () => runComposeServiceRemove(activeTab, svc)) },
                        ...(onOpenTerminalAndRun ? ([
                          'sep',
                          { id: 'shell', label: 'Open shell', icon: <Terminal size={12} className="text-text-secondary" />, run: term(`${execBase} sh`) },
                          ...(lower.includes('redis') ? [{ id: 'redis', label: 'Redis CLI', icon: <Database size={12} className="text-text-secondary" />, run: term(`${execBase} redis-cli`, ' · redis') }] : []),
                          ...(lower.includes('mysql') || lower.includes('mariadb') || lower.includes('db') ? [{ id: 'mysql', label: 'MySQL client', icon: <Database size={12} className="text-text-secondary" />, run: term(`${execBase} mysql -u root -p`, ' · mysql') }] : []),
                          ...(lower.includes('postgres') || lower.includes('psql') ? [{ id: 'psql', label: 'Postgres client', icon: <Database size={12} className="text-text-secondary" />, run: term(`${execBase} psql -U postgres`, ' · postgres') }] : []),
                        ] as (RowAction | 'sep')[]) : []),
                      ];
                      return (
                        <DockerRow
                          key={svc}
                          name={svc}
                          tone="unknown"
                          primary={primary}
                          menu={menu}
                          busyId={busyOf(composeServiceAction, key)}
                          disabled={!!composeServiceAction}
                          logsOpen={expandedLogsKey === key}
                          logsLoading={false}
                          onToggleLogs={() => toggleLogs(activeTab, svc)}
                          menuId={`compose:${key}`}
                          openKey={openActionsKey}
                          setOpenKey={setOpenActionsKey}
                          menuRef={actionsMenuRef}
                          logs={<LogPanel title={svc} content={logContent} preRef={logPreRef} onClose={() => toggleLogs(activeTab, svc)} />}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-border/30 bg-bg-secondary/40 flex items-center gap-2 text-xs text-text-secondary shrink-0">
        <FileText size={13} className="text-text-muted" />
        <span>Live compose logs are also in the bottom panel.</span>
        <button type="button" onClick={onOpenLogs} className="text-accent hover:text-accent-hover font-semibold transition-colors cursor-pointer">
          Open logs
        </button>
      </div>
    </div>
  );
}
