import { useState, useEffect, useRef } from 'react';
import { Box, RefreshCw, Loader2, FileText, RotateCw, X, Play, Square, MoreVertical, Pause, Trash2, Zap, Terminal, Database, AlertCircle, Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerConnection, ProxySettings } from '../types';
import type { DockerContainer } from '../types';
import { Tooltip } from './Tooltip';

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

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0">
      {/* Header View Tabs */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-bg-secondary/30 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 flex-1 p-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab(TAB_ALL)}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
              showAllContainers
                ? 'bg-bg-tertiary text-text-primary shadow-md shadow-black/10 border border-border/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40'
            }`}
          >
            All Containers
          </button>
          {composePaths.map((p) => (
            <Tooltip key={p} content={p} position="bottom">
              <button
                type="button"
                onClick={() => setActiveTab(p)}
                className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 truncate max-w-[160px] ${
                  activeTab === p
                    ? 'bg-bg-tertiary text-text-primary shadow-md shadow-black/10 border border-border/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40'
                }`}
              >
                {shortName(p)}
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <Tooltip content={activeTab === TAB_ALL ? 'Restart all running containers' : 'Restart all services in this compose project'} position="bottom">
            <button
              type="button"
              onClick={runRestartAll}
              disabled={restartAllInProgress || loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-accent border border-border/30 hover:border-accent/30 bg-bg-primary/20 transition-all duration-150 disabled:opacity-50"
            >
              {restartAllInProgress ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
              Restart All
            </button>
          </Tooltip>
          <Tooltip content="Refresh status" position="bottom">
            <button
              type="button"
              onClick={() => onRefresh?.()}
              disabled={loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-accent border border-border/30 hover:border-accent/30 bg-bg-primary/20 transition-all duration-150 disabled:opacity-50"
            >
              {(loading || loadingServices) ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {showAllContainers && (
          <>
            {error && (
              isDockerPermissionError ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-xl border border-error/20 bg-error/5 flex flex-col gap-4 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-error/10 text-error shrink-0">
                      <AlertCircle size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text-primary text-sm">Docker Permission Error</h3>
                      <p className="text-text-secondary mt-1 font-mono text-[11px] whitespace-pre-wrap break-all bg-bg-primary/50 p-3 rounded-lg border border-border/30">{error}</p>
                    </div>
                  </div>

                  <div className="border-t border-border/30 pt-4">
                    <h4 className="font-semibold text-text-primary mb-2">How to fix:</h4>
                    <p className="text-[11px] text-text-secondary mb-3">
                      Add your user to the <code className="text-text-primary bg-bg-tertiary px-1 py-0.5 rounded">docker</code> group by running these commands in your server terminal:
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 p-2 bg-bg-tertiary/40 rounded-lg border border-border/20">
                        <code className="text-[11px] font-mono text-text-primary select-all">sudo usermod -aG docker $USER</code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('sudo usermod -aG docker $USER', 'cmd1')}
                          className="p-1.5 rounded-md text-text-secondary hover:bg-bg-primary hover:text-accent transition-colors flex items-center justify-center shrink-0"
                        >
                          {copiedCmd === 'cmd1' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between gap-3 p-2 bg-bg-tertiary/40 rounded-lg border border-border/20">
                        <code className="text-[11px] font-mono text-text-primary select-all">newgrp docker</code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('newgrp docker', 'cmd2')}
                          className="p-1.5 rounded-md text-text-secondary hover:bg-bg-primary hover:text-accent transition-colors flex items-center justify-center shrink-0"
                        >
                          {copiedCmd === 'cmd2' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onRefresh?.()}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-accent/10 text-xs"
                    >
                      {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                      Retry Connection
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="rounded-xl border border-error/20 bg-error/5 text-error px-4 py-3 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )
            )}
            {!error && containers.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-text-secondary text-center">
                <Box size={40} className="mb-3 opacity-30 text-text-muted" />
                <p className="font-medium text-text-primary text-sm">No containers found</p>
                <p className="text-xs text-text-muted mt-1 max-w-sm">Start containers via docker compose or log into a server running active Docker daemons.</p>
              </div>
            )}
            {!error && containers.length > 0 && (
              <div className="space-y-2">
                {containers.map((c: DockerContainer, i: number) => {
                  const containerId = c.ID || c.Names || '';
                  const containerKey = `all-${containerId}-${i}`;
                  const status = (c.Status || c.State || '').toLowerCase();
                  const isRunning = status.startsWith('up') && !status.includes('paused');
                  const isPaused = status.includes('paused');
                  const logsKey = allContainerLogKey(containerId);
                  const isLogsExpanded = expandedLogsKey === logsKey;
                  const isLoadingLogs = loadingContainerLogs === containerId;
                  const actionsKey = `all:${containerKey}`;
                  const isActionsOpen = openActionsKey === actionsKey;
                  return (
                    <div
                      key={c.ID || c.Names || i}
                      className="rounded-xl border border-border/30 bg-bg-secondary/40 overflow-hidden hover:border-accent/30 hover:bg-bg-secondary/65 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between gap-4 p-3.5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0 border border-border/20">
                            <Box size={16} className={isRunning ? "text-success" : "text-text-muted"} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary text-xs truncate flex items-center gap-1.5">
                              {c.Names || c.ID || 'unnamed'}
                              {isRunning && <span className="inline-block w-1.5 h-1.5 bg-success rounded-full animate-pulse" />}
                            </p>
                            <p className="text-[10px] font-mono text-text-secondary truncate mt-0.5">{c.Image || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <div className="relative flex items-center" ref={isActionsOpen ? actionsMenuRef : undefined}>
                            <Tooltip content="Actions" position="top">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenActionsKey((k) => (k === actionsKey ? null : actionsKey)); }}
                                disabled={!!containerAction}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-accent border border-border/20 transition-all duration-150 disabled:opacity-50"
                              >
                                <MoreVertical size={13} />
                                Actions
                              </button>
                            </Tooltip>
                            {isActionsOpen && (
                              <div className="absolute right-0 top-full mt-1.5 py-1 min-w-[150px] rounded-xl border border-border/40 bg-bg-tertiary/95 shadow-2xl backdrop-blur-md z-30 overflow-y-auto flex flex-col p-1 gap-0.5 max-h-[70vh]">
                                {!isRunning && !isPaused && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'start'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!containerAction}>
                                    {containerAction === `${containerKey}-start` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Play size={12} className="text-success" />}
                                    Start
                                  </button>
                                )}
                                {isRunning && (
                                  <>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'stop'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-stop` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Square size={12} className="text-text-muted" />}
                                      Stop
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'restart'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-restart` ? <Loader2 size={12} className="animate-spin text-accent" /> : <RotateCw size={12} className="text-accent" />}
                                      Restart
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'pause'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-pause` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Pause size={12} className="text-warning" />}
                                      Pause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'kill'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 hover:text-error rounded-lg transition-colors animate-pulse-once" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-kill` ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="text-error" />}
                                      Kill
                                    </button>
                                  </>
                                )}
                                {isPaused && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'unpause'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!containerAction}>
                                    {containerAction === `${containerKey}-unpause` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Play size={12} className="text-success" />}
                                    Unpause
                                  </button>
                                )}
                                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'remove'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 hover:text-error rounded-lg transition-colors" disabled={!!containerAction}>
                                  {containerAction === `${containerKey}-remove` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Trash2 size={12} className="text-error" />}
                                  Remove
                                </button>
                                {onOpenTerminalAndRun && (() => {
                                    const containerLabel = c.Names || c.ID || 'container';
                                    const idQ = quoteShellArg(containerId, usesWindowsShell(currentServer));
                                    return (
                                  <>
                                    <div className="border-t border-border/30 my-1" />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it ${idQ} sh`, containerLabel); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                      <Terminal size={12} className="text-text-secondary" />
                                      Shell
                                    </button>
                                    {imageLooksLike(c.Image || '', 'redis') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it ${idQ} redis-cli`, `${containerLabel} · redis`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                        <Database size={12} className="text-text-secondary" />
                                        Connect Redis
                                      </button>
                                    )}
                                    {imageLooksLike(c.Image || '', 'mysql', 'mariadb') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it ${idQ} mysql -u root -p`, `${containerLabel} · mysql`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                        <Database size={12} className="text-text-secondary" />
                                        Connect MySQL
                                      </button>
                                    )}
                                    {imageLooksLike(c.Image || '', 'postgres') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it ${idQ} psql -U postgres`, `${containerLabel} · postgres`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                        <Database size={12} className="text-text-secondary" />
                                        Connect Postgres
                                      </button>
                                    )}
                                  </>
                                    );
                                  })()}
                                <div className="border-t border-border/30 my-1" />
                                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); toggleLogsForContainer(containerId); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                  {isLoadingLogs ? <Loader2 size={12} className="animate-spin text-accent" /> : <FileText size={12} className="text-text-secondary" />}
                                  Logs
                                </button>
                              </div>
                            )}
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                              isRunning
                                ? 'bg-success/8 text-success border-success/15'
                                : 'bg-text-secondary/8 text-text-secondary border-border/20'
                            }`}
                          >
                            {c.Status || c.State || 'unknown'}
                          </span>
                        </div>
                      </div>
                      {isLogsExpanded && (
                        <div className="border-t border-border/30 bg-bg-primary/90">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
                            <span className="text-[10px] font-mono text-text-muted">Logs: {c.Names || c.ID || 'container'}</span>
                            <Tooltip content="Close logs" position="left">
                              <button
                                type="button"
                                onClick={() => toggleLogsForContainer(containerId)}
                                className="p-1 rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary flex items-center justify-center transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </Tooltip>
                          </div>
                          <pre
                            ref={logPreRef}
                            className="p-3 font-mono text-[10px] text-text-primary whitespace-pre-wrap break-words overflow-auto max-h-[280px] min-h-[120px] scrollbar-vs"
                          >
                            {logContent}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {!showAllContainers && activeTab && (
          <>
            {loadingServices ? (
              <div className="flex items-center gap-2 py-8 text-text-secondary text-xs">
                <Loader2 size={16} className="animate-spin shrink-0 text-accent" />
                <span>Loading Compose services…</span>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-mono text-text-muted mb-2 truncate" title={activeTab}>{activeTab}</p>
                {currentServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-text-secondary text-center">
                    <Box size={40} className="mb-3 opacity-30 text-text-muted" />
                    <p className="text-xs font-semibold text-text-primary">No services in this compose project</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentServices.map((s: string) => {
                      const key = logKey(activeTab, s);
                      const isLogsExpanded = expandedLogsKey === key;
                      return (
                        <div
                          key={s}
                          className="rounded-xl border border-border/30 bg-bg-secondary/40 overflow-hidden hover:border-accent/30 hover:bg-bg-secondary/65 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between gap-2 p-3.5">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0 border border-border/20">
                                <Box size={16} className="text-accent" />
                              </div>
                              <p className="font-semibold text-text-primary text-xs truncate">{s}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              <div className="relative flex items-center" ref={openActionsKey === `compose:${key}` ? actionsMenuRef : undefined}>
                                <Tooltip content="Actions" position="top">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setOpenActionsKey((k) => (k === `compose:${key}` ? null : `compose:${key}`)); }}
                                    disabled={!!composeServiceAction}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-accent border border-border/20 transition-all duration-150 disabled:opacity-50"
                                  >
                                    <MoreVertical size={13} />
                                    Actions
                                  </button>
                                </Tooltip>
                                {openActionsKey === `compose:${key}` && (
                                  <div className="absolute right-0 top-full mt-1.5 py-1 min-w-[150px] rounded-xl border border-border/40 bg-bg-tertiary/95 shadow-2xl backdrop-blur-md z-30 overflow-y-auto flex flex-col p-1 gap-0.5 max-h-[70vh]">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'start'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-start` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Play size={12} className="text-success" />}
                                      Start
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'stop'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-stop` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Square size={12} className="text-text-muted" />}
                                      Stop
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'restart'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-restart` ? <Loader2 size={12} className="animate-spin text-accent" /> : <RotateCw size={12} className="text-accent" />}
                                      Restart
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'pause'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-pause` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Pause size={12} className="text-warning" />}
                                      Pause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'unpause'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-unpause` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Play size={12} className="text-success" />}
                                      Unpause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'kill'); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 hover:text-error rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-kill` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Zap size={12} className="text-error" />}
                                      Kill
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceRemove(activeTab, s); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 hover:text-error rounded-lg transition-colors" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-remove` ? <Loader2 size={12} className="animate-spin text-accent" /> : <Trash2 size={12} className="text-error" />}
                                      Remove
                                    </button>
                                    {onOpenTerminalAndRun && (() => {
                                      const win = usesWindowsShell(currentServer);
                                      const pathQ = quoteShellArg(activeTab, win);
                                      const serviceQ = quoteShellArg(s, win);
                                      const composeFlag = isComposeFilePath(activeTab) ? `-f ${pathQ}` : `--project-directory ${pathQ}`;
                                      const execBase = `docker compose ${composeFlag} exec ${serviceQ}`;
                                      const sLower = (s || '').toLowerCase();
                                      return (
                                        <>
                                          <div className="border-t border-border/30 my-1" />
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} sh`, s); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                            <Terminal size={12} className="text-text-secondary" />
                                            Shell
                                          </button>
                                          {sLower.includes('redis') && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} redis-cli`, `${s} · redis`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                              <Database size={12} className="text-text-secondary" />
                                              Connect Redis
                                            </button>
                                          )}
                                          {(sLower.includes('mysql') || sLower.includes('mariadb') || sLower.includes('db')) && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} mysql -u root -p`, `${s} · mysql`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                              <Database size={12} className="text-text-secondary" />
                                              Connect MySQL
                                            </button>
                                          )}
                                          {(sLower.includes('postgres') || sLower.includes('psql')) && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} psql -U postgres`, `${s} · postgres`); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                              <Database size={12} className="text-text-secondary" />
                                              Connect Postgres
                                            </button>
                                          )}
                                        </>
                                      );
                                    })()}
                                    <div className="border-t border-border/30 my-1" />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); toggleLogs(activeTab, s); }} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs text-text-primary hover:bg-bg-primary/65 rounded-lg transition-colors">
                                      <FileText size={12} className="text-text-secondary" />
                                      Logs
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {isLogsExpanded && (
                            <div className="border-t border-border/30 bg-bg-primary/90">
                              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
                                <span className="text-[10px] font-mono text-text-muted">Logs: {s}</span>
                                <Tooltip content="Close logs" position="left">
                                  <button
                                    type="button"
                                    onClick={() => toggleLogs(activeTab, s)}
                                    className="p-1 rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary flex items-center justify-center transition-colors"
                                  >
                                    <X size={13} />
                                  </button>
                                </Tooltip>
                              </div>
                              <pre
                                ref={logPreRef}
                                className="p-3 font-mono text-[10px] text-text-primary whitespace-pre-wrap break-words overflow-auto max-h-[280px] min-h-[120px] scrollbar-vs"
                              >
                                {logContent}
                              </pre>
                            </div>
                          )}
                        </div>
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
        <span>View compose logs in the bottom panel (Logs tab).</span>
        <button
          type="button"
          onClick={onOpenLogs}
          className="text-accent hover:text-accent-hover font-semibold transition-colors ml-1"
        >
          Open logs
        </button>
      </div>
    </div>
  );
}
