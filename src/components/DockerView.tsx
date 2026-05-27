import { useState, useEffect, useRef } from 'react';
import { Box, RefreshCw, Loader2, FileText, RotateCw, X, Play, Square, MoreVertical, Pause, Trash2, Zap, Terminal, Database } from 'lucide-react';
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

function shellEsc(s: string): string {
  return (s || '').replace(/'/g, "'\\''");
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
    const pathEsc = shellEsc(composePath);
    const serviceEsc = shellEsc(service);
    const flag = isComposeFilePath(composePath)
      ? `-f '${pathEsc}'`
      : `--project-directory '${pathEsc}'`;
    const cmd = `docker compose ${flag} ${action} '${serviceEsc}'`;
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
      if (activeTab === TAB_ALL) {
        const res = await window.serverOperator.runCommand({
          connection: currentServer,
          command: 'for id in $(docker ps -q); do docker restart "$id"; done',
          proxy,
        });
        if (!res.ok) setError(res.error || res.stderr || 'Restart all failed');
        else onRefresh?.();
      } else if (activeTab) {
        const pathEsc = shellEsc(activeTab);
        const flag = isComposeFilePath(activeTab) ? `-f '${pathEsc}'` : `--project-directory '${pathEsc}'`;
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
    const pathEsc = shellEsc(composePath);
    const serviceEsc = shellEsc(service);
    const flag = isComposeFilePath(composePath)
      ? `-f '${pathEsc}'`
      : `--project-directory '${pathEsc}'`;
    const cmd = `docker compose ${flag} stop '${serviceEsc}' && docker compose ${flag} rm -f '${serviceEsc}'`;
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
    const idEsc = shellEsc(containerId);
    let cmd: string;
    if (action === 'restart') cmd = `docker restart '${idEsc}'`;
    else if (action === 'remove') cmd = `docker rm -f '${idEsc}'`;
    else if (action === 'unpause') cmd = `docker unpause '${idEsc}'`;
    else cmd = `docker ${action} '${idEsc}'`;
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
    const idEsc = shellEsc(containerId);
    window.serverOperator
      ?.runCommand({
        connection: currentServer,
        command: `docker logs --tail ${LOG_TAIL} '${idEsc}' 2>&1`,
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
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)] p-8 text-center">
        <Box size={48} className="mb-4 opacity-50" />
        <p className="font-medium text-[var(--text-primary)]">Docker view</p>
        <p className="text-sm mt-2 max-w-md">Run the app in Electron to connect to servers and see containers. This URL is for development only.</p>
      </div>
    );
  }

  const showAllContainers = activeTab === TAB_ALL;
  const currentServices = activeTab !== TAB_ALL ? (servicesByPath[activeTab] ?? []) : [];
  const loadingServices = activeTab !== TAB_ALL && loadingServicesForPath === activeTab;

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-0 overflow-x-auto min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setActiveTab(TAB_ALL)}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              showAllContainers
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All containers
          </button>
          {composePaths.map((p) => (
            <Tooltip key={p} content={p} position="bottom">
              <button
                type="button"
                onClick={() => setActiveTab(p)}
                className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors truncate max-w-[180px] ${
                  activeTab === p
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {shortName(p)}
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip content={activeTab === TAB_ALL ? 'Restart all running containers' : 'Restart all services in this compose project'} position="bottom">
            <button
              type="button"
              onClick={runRestartAll}
              disabled={restartAllInProgress || loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {restartAllInProgress ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
              Restart all
            </button>
          </Tooltip>
          <Tooltip content="Refresh status" position="bottom">
            <button
              type="button"
              onClick={() => onRefresh?.()}
              disabled={loading || (activeTab !== TAB_ALL && !!loadingServicesForPath)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {(loading || loadingServices) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {showAllContainers && (
          <>
            {error && (
              <div className="rounded-lg border border-[var(--error)]/50 bg-[var(--error)]/10 text-[var(--error)] px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {!error && containers.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
                <Box size={48} className="mb-4 opacity-50" />
                <p>No containers found. Run docker compose up or add a server with Docker.</p>
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
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-visible hover:border-[var(--accent)]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                            <Box size={20} className="text-[var(--accent)]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)] truncate">{c.Names || c.ID || 'unnamed'}</p>
                            <p className="text-sm text-[var(--text-secondary)] truncate">{c.Image || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <div className="relative flex items-center" ref={isActionsOpen ? actionsMenuRef : undefined}>
                            <Tooltip content="Actions" position="top">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenActionsKey((k) => (k === actionsKey ? null : actionsKey)); }}
                                disabled={!!containerAction}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
                              >
                                <MoreVertical size={14} />
                                Actions
                              </button>
                            </Tooltip>
                            {isActionsOpen && (
                              <div className="absolute right-0 top-full mt-1 py-1 min-w-[130px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg z-20 max-h-[70vh] overflow-y-auto">
                                {!isRunning && !isPaused && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'start'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!containerAction}>
                                    {containerAction === `${containerKey}-start` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                    Start
                                  </button>
                                )}
                                {isRunning && (
                                  <>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'stop'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-stop` ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                                      Stop
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'restart'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-restart` ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                                      Restart
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'pause'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-pause` ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                                      Pause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'kill'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]" disabled={!!containerAction}>
                                      {containerAction === `${containerKey}-kill` ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                      Kill
                                    </button>
                                  </>
                                )}
                                {isPaused && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'unpause'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!containerAction}>
                                    {containerAction === `${containerKey}-unpause` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                    Unpause
                                  </button>
                                )}
                                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runContainerAction(containerId, containerKey, 'remove'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]" disabled={!!containerAction}>
                                  {containerAction === `${containerKey}-remove` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                  Remove
                                </button>
                                {onOpenTerminalAndRun && (() => {
                                    const containerLabel = c.Names || c.ID || 'container';
                                    return (
                                  <>
                                    <div className="border-t border-[var(--border)] my-1" />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it '${shellEsc(containerId)}' sh`, containerLabel); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                      <Terminal size={12} />
                                      Shell
                                    </button>
                                    {imageLooksLike(c.Image || '', 'redis') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it '${shellEsc(containerId)}' redis-cli`, `${containerLabel} · redis`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                        <Database size={12} />
                                        Connect Redis
                                      </button>
                                    )}
                                    {imageLooksLike(c.Image || '', 'mysql', 'mariadb') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it '${shellEsc(containerId)}' mysql -u root -p`, `${containerLabel} · mysql`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                        <Database size={12} />
                                        Connect MySQL
                                      </button>
                                    )}
                                    {imageLooksLike(c.Image || '', 'postgres') && (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`docker exec -it '${shellEsc(containerId)}' psql -U postgres`, `${containerLabel} · postgres`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                        <Database size={12} />
                                        Connect Postgres
                                      </button>
                                    )}
                                  </>
                                    );
                                  })()}
                                <div className="border-t border-[var(--border)] my-1" />
                                <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); toggleLogsForContainer(containerId); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                  {isLoadingLogs ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                                  Logs
                                </button>
                              </div>
                            )}
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                              isRunning
                                ? 'bg-[var(--success)]/20 text-[var(--success)]'
                                : 'bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]'
                            }`}
                          >
                            {c.Status || c.State || 'unknown'}
                          </span>
                        </div>
                      </div>
                      {isLogsExpanded && (
                        <div className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)]">
                            <span className="text-[10px] text-[var(--text-muted)]">Logs: {c.Names || c.ID || 'container'}</span>
                            <Tooltip content="Close logs" position="left">
                              <button
                                type="button"
                                onClick={() => toggleLogsForContainer(containerId)}
                                className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center"
                              >
                                <X size={14} />
                              </button>
                            </Tooltip>
                          </div>
                          <pre
                            ref={logPreRef}
                            className="p-3 font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words overflow-auto max-h-[280px] min-h-[120px]"
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
              <div className="flex items-center gap-2 py-8 text-[var(--text-secondary)]">
                <Loader2 size={20} className="animate-spin shrink-0" />
                <span>Loading services…</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--text-muted)] mb-2 truncate" title={activeTab}>{activeTab}</p>
                {currentServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
                    <Box size={48} className="mb-4 opacity-50" />
                    <p>No services in this compose project.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentServices.map((s: string) => {
                      const key = logKey(activeTab, s);
                      const isLogsExpanded = expandedLogsKey === key;
                      return (
                        <div
                          key={s}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-visible hover:border-[var(--accent)]/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 p-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                                <Box size={20} className="text-[var(--accent)]" />
                              </div>
                              <p className="font-medium text-[var(--text-primary)] truncate">{s}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              <div className="relative flex items-center" ref={openActionsKey === `compose:${key}` ? actionsMenuRef : undefined}>
                                <Tooltip content="Actions" position="top">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setOpenActionsKey((k) => (k === `compose:${key}` ? null : `compose:${key}`)); }}
                                    disabled={!!composeServiceAction}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] disabled:opacity-50"
                                  >
                                    <MoreVertical size={14} />
                                    Actions
                                  </button>
                                </Tooltip>
                                {openActionsKey === `compose:${key}` && (
                                  <div className="absolute right-0 top-full mt-1 py-1 min-w-[130px] rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg z-20 max-h-[70vh] overflow-y-auto">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'start'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-start` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                      Start
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'stop'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-stop` ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                                      Stop
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'restart'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-restart` ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                                      Restart
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'pause'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-pause` ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                                      Pause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'unpause'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-unpause` ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                      Unpause
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceAction(activeTab, s, 'kill'); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-kill` ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                                      Kill
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); runComposeServiceRemove(activeTab, s); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]" disabled={!!composeServiceAction}>
                                      {composeServiceAction === `${key}-remove` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                      Remove
                                    </button>
                                    {onOpenTerminalAndRun && (() => {
                                      const pathEsc = shellEsc(activeTab);
                                      const serviceEsc = shellEsc(s);
                                      const composeFlag = isComposeFilePath(activeTab) ? `-f '${pathEsc}'` : `--project-directory '${pathEsc}'`;
                                      const execBase = `docker compose ${composeFlag} exec '${serviceEsc}'`;
                                      const sLower = (s || '').toLowerCase();
                                      return (
                                        <>
                                          <div className="border-t border-[var(--border)] my-1" />
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} sh`, s); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                            <Terminal size={12} />
                                            Shell
                                          </button>
                                          {sLower.includes('redis') && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} redis-cli`, `${s} · redis`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                              <Database size={12} />
                                              Connect Redis
                                            </button>
                                          )}
                                          {(sLower.includes('mysql') || sLower.includes('mariadb') || sLower.includes('db')) && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} mysql -u root -p`, `${s} · mysql`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                              <Database size={12} />
                                              Connect MySQL
                                            </button>
                                          )}
                                          {(sLower.includes('postgres') || sLower.includes('psql')) && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); onOpenTerminalAndRun(`${execBase} psql -U postgres`, `${s} · postgres`); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                              <Database size={12} />
                                              Connect Postgres
                                            </button>
                                          )}
                                        </>
                                      );
                                    })()}
                                    <div className="border-t border-[var(--border)] my-1" />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpenActionsKey(null); toggleLogs(activeTab, s); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                                      <FileText size={12} />
                                      Logs
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {isLogsExpanded && (
                            <div className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
                              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)]">
                                <span className="text-[10px] text-[var(--text-muted)]">Logs: {s}</span>
                                <Tooltip content="Close logs" position="left">
                                  <button
                                    type="button"
                                    onClick={() => toggleLogs(activeTab, s)}
                                    className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center"
                                  >
                                    <X size={14} />
                                  </button>
                                </Tooltip>
                              </div>
                              <pre
                                ref={logPreRef}
                                className="p-3 font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words overflow-auto max-h-[280px] min-h-[120px]"
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
      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <FileText size={14} />
        <span>View compose logs in the bottom panel (Logs tab).</span>
        <button
          type="button"
          onClick={onOpenLogs}
          className="text-[var(--accent)] hover:underline ml-1"
        >
          Open logs
        </button>
      </div>
    </div>
  );
}
